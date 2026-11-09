"""
Modelo de decisão por funções para armazenamento: lítio (LFP), chumbo-ácido e fluxo de vanádio.

Camadas:
 1. Funções: F1 ciclo diário/peak shaving, F2 reserva longa, F3 no-break no ponto de carga.
 2. Ciclo de vida (30 anos): investimento, O&M, reposições, perdas, valor residual.
 3. O que pode dar errado: indisponibilidade (falhas x tempo de reparo com a mão de obra/peças do lugar),
    atraso na reposição, calor, maresia, acidentes (incêndio/vazamento), destino do resíduo.
 4. Multicritério com sorteio de pesos e de premissas (SMAA): probabilidade de cada combinação ser a melhor.
"""
import numpy as np, json, copy

H = 30          # horizonte (anos) — solução permanente
I = 0.08        # taxa real
TARIFF = 0.90   # R$/kWh (perdas e consumo auxiliar)
PCS_LIFE = 15   # troca da eletrônica de potência (lítio e chumbo)
EF_GRID = 0.04  # t CO2/MWh
def pv(t): return (1 + I) ** -t
ANN = sum(pv(t) for t in range(1, H + 1))

TECH = {
 'Li': dict(nome='Lítio (LFP)', cE=1100, cP=500, rte=.90, dod=.90, cyc=6000, cal=15, om=.015, rep=.75,
            gwp=50, aux=.003, lam=1.0, mttr=48, acc=1e-4, acc_cost=3e6, haz_kg=0.7, haz_w=0.2, delay=0.75),
 'Pb': dict(nome='Chumbo-ácido', cE=850, cP=500, rte=.80, dod=.50, cyc=2500, cal=12, om=.010, rep=1.0,
            gwp=40.5, aux=.001, lam=0.3, mttr=24, acc=5e-5, acc_cost=3e5, haz_kg=20.0, haz_w=1.0, delay=0.25),
 'V':  dict(nome='Fluxo de vanádio', cE=1700, cP=3200, rte=.70, dod=.90, cyc=1e9, cal=25, om=.020, rep=0.0,
            gwp=184, aux=.004, lam=2.0, mttr=96, acc=5e-4, acc_cost=5e5, haz_kg=54.0, haz_w=0.3, delay=1.0,
            stack_share=0.4, stack_years=(12, 24), electrolyte_share=0.6, electrolyte_resid=0.5),
}

CTX = {
 'turistica': dict(
   nome='Vila turística conectada', exemplo='Taipus de Fora, Maraú',
   F={'F1': dict(P=300, E=600, cyc=300), 'F2': dict(P=280, E=2000, cyc=5), 'F3': dict(P=30, E=240, cyc=3)},
   T=25, costa=True, mttr_mult={'Li': 1.0, 'Pb': 1.0, 'V': 1.5}, leak={'Li': .30, 'Pb': .05, 'V': .02},
   p_delay=0.05, isolated=False, E_exp=10 * 3.6 * 137, core=0.15,
   w=dict(custo=.30, recorrente=.05, ens=.20, co2=.10, tox=.10, acid=.25)),
 'hospital': dict(
   nome='Hospital regional conectado', exemplo='UTI e centro cirúrgico; equipe de manutenção própria',
   F={'F1': dict(P=200, E=400, cyc=250), 'F2': dict(P=150, E=3600, cyc=4), 'F3': dict(P=100, E=100, cyc=12)},
   T=25, costa=False, mttr_mult={'Li': 1.0, 'Pb': 1.0, 'V': 1.5}, leak={'Li': .30, 'Pb': .05, 'V': .02},
   p_delay=0.05, isolated=False, E_exp=10 * 3.6 * 150, core=0.6,
   w=dict(custo=.20, recorrente=.05, ens=.30, co2=.05, tox=.10, acid=.30)),
 'quilombo_linha': dict(
   nome='Comunidade quilombola em ponta de linha', exemplo='~100 famílias, rede fraca, faltas de até 3–5 dias',
   F={'F1': dict(P=25, E=50, cyc=300), 'F2': dict(P=15, E=290, cyc=5), 'F3': dict(P=5, E=40, cyc=6)},
   T=30, costa=True, mttr_mult={'Li': 5.0, 'Pb': 1.5, 'V': 8.0}, leak={'Li': .40, 'Pb': .30, 'V': .05},
   p_delay=0.5, isolated=False, E_exp=(12 * 3 + 72) * 6, core=0.4,
   w=dict(custo=.20, recorrente=.25, ens=.25, co2=.05, tox=.15, acid=.10)),
 'quilombo_isolado': dict(
   nome='Comunidade quilombola isolada (sem rede)', exemplo='~100 famílias, solar + bateria',
   F={'F1': dict(P=40, E=240, cyc=365), 'F2': dict(P=15, E=290, cyc=10), 'F3': dict(P=5, E=40, cyc=12)},
   T=30, costa=True, mttr_mult={'Li': 5.0, 'Pb': 1.5, 'V': 8.0}, leak={'Li': .40, 'Pb': .30, 'V': .05},
   p_delay=0.5, isolated=True, night_kwh=240 * 365, alpha=0.3, core=0.4,
   w=dict(custo=.20, recorrente=.25, ens=.30, co2=.05, tox=.15, acid=.05)),
}
CRIT = ['custo', 'recorrente', 'ens', 'co2', 'tox', 'acid']
CRIT_NOME = dict(custo='Custo de ciclo de vida', recorrente='Custo recorrente', ens='Energia crítica não suprida',
                 co2='Carbono', tox='Resíduo tóxico em risco', acid='Risco de acidente')
VOLL_C = 100.0  # R$/kWh crítico (para o custo social, só para referência)

def life(p, k, cyc_yr, T):
    if k == 'V': return p['cal']
    f = 2 ** (-(T - 25) / 10) if k == 'Pb' else min(1.0, 2 ** (-(T - 25) / 15.5))   # chumbo: metade a cada +10 °C; lítio: 0,8 a 30 °C
    return min(p['cal'] * f, p['cyc'] * (f if k == 'Pb' else 1) / max(cyc_yr, 1e-9))

def asset(k, P, E_use, cyc_yr, ctx, tech=TECH):
    p = tech[k]; T = ctx['T']
    En = E_use / p['dod']; capE = p['cE'] * En; capP = p['cP'] * P; capex = capE + capP
    L = life(p, k, cyc_yr, T)
    if k == 'V':
        reps = list(p['stack_years']); rep_cost = [p['stack_share'] * capP] * len(reps); pcs = []
        resid = p['electrolyte_resid'] * p['electrolyte_share'] * capE
    else:
        reps = []; t = L
        while t < H - 0.5: reps.append(t); t += L
        rep_cost = [p['rep'] * capE] * len(reps); pcs = [PCS_LIFE]
        last = reps[-1] if reps else 0; rem = max(0, (last + L - H) / L)
        resid = rem * (p['rep'] * capE if reps else capE)
    pcs_cost = 0.5 * capP
    om = p['om'] * capex
    thr = cyc_yr * E_use
    aux = p['aux'] * En * 365 * (1.3 if T > 25 else 1.0)
    loss = thr * (1 / p['rte'] - 1) + aux
    pv_tot = (capex + sum(c * pv(t) for c, t in zip(rep_cost, reps)) + sum(pcs_cost * pv(t) for t in pcs)
              + ANN * (om + loss * TARIFF) - resid * pv(H))
    nominal = capex + sum(rep_cost) + pcs_cost * len(pcs) + H * (om + loss * TARIFF) - resid
    recur = (sum(rep_cost) + pcs_cost * len(pcs) + H * om) / H
    units = 1 + len(reps) if k != 'V' else 1
    gwp = p['gwp'] * En * units / 1000 + EF_GRID * loss * H / 1000
    mass = p['haz_kg'] * En * units
    tox = mass * ctx['leak'][k] * p['haz_w']
    acid_inc = p['acc'] * En / 1000 * H
    # indisponibilidade: falhas x reparo local (+maresia/HVAC na costa, +calor no vanádio) + atraso na reposição
    U_fail = p['lam'] * p['mttr'] * ctx['mttr_mult'][k] / 8760 * (1.3 if (ctx['costa'] and k in ('Li', 'V')) else 1) \
             * (min(2.0, max(1.0, 1 + 0.1 * (T - 25))) if k == 'V' else 1)
    U_delay = ctx['p_delay'] * p['delay'] * len(reps) / H
    return dict(k=k, P=P, E_use=E_use, En=En, capex=capex, capE=capE, capP=capP, life=L, n_reps=len(reps),
                rep_total=sum(rep_cost) + pcs_cost * len(pcs), om=om, loss_kwh=loss, loss_cost_30=H * loss * TARIFF,
                resid=resid, pv=pv_tot, nominal=nominal, recur=recur, gwp=gwp, mass=mass, tox=tox,
                acid_inc=acid_inc, acid_cost=acid_inc * p['acc_cost'], U_fail=U_fail, U_delay=U_delay,
                U=min(1, U_fail + U_delay))

def portfolio(ctx, f1, f2, f3, sep=False, tech=TECH):
    F = ctx['F']; assets = []
    if f1 == f2 and not sep:
        P = max(F['F1']['P'], F['F2']['P']); E = F['F1']['E'] + F['F2']['E']
        cyc = (F['F1']['cyc'] * F['F1']['E'] + F['F2']['cyc'] * F['F2']['E']) / E
        a = asset(f1, P, E, cyc, ctx, tech); assets.append(('F1+F2', a)); U1 = U2 = a['U']; shared = True
    else:
        a1 = asset(f1, F['F1']['P'], F['F1']['E'], F['F1']['cyc'], ctx, tech)
        a2 = asset(f2, F['F2']['P'], F['F2']['E'], F['F2']['cyc'], ctx, tech)
        assets += [('F1', a1), ('F2', a2)]; U1, U2 = a1['U'], a2['U']; shared = False
    a3 = asset(f3, F['F3']['P'], F['F3']['E'], F['F3']['cyc'], ctx, tech); assets.append(('F3', a3)); U3 = a3['U']
    tot = {c: sum(a[c] for _, a in assets) for c in
           ['pv', 'nominal', 'recur', 'capex', 'gwp', 'tox', 'mass', 'acid_inc', 'acid_cost', 'rep_total', 'om', 'loss_cost_30']}
    core = ctx['core']
    if ctx['isolated']:
        al = ctx['alpha']; N = ctx['night_kwh']
        both = U1 if shared else U1 * U2
        ens = al * N * both * ((1 - core) + core * U3); ens_nc = (1 - al) * N * U1
    else:
        ens = ctx['E_exp'] * U2 * ((1 - core) + core * U3); ens_nc = 0.0
    tot.update(ens=ens, ens_nc=ens_nc, custo=tot['pv'], co2=tot['gwp'], acid=tot['acid_cost'], recorrente=tot['recur'],
               social=tot['pv'] + ANN * (ens * VOLL_C + ens_nc * 8.29) + tot['acid_cost'] * ANN / H,
               capex_share=tot['capex'] / tot['nominal'])
    return dict(combo=(f1, f2, f3, sep), assets=assets, **tot)

def all_portfolios(ctx, tech=TECH):
    out = []
    for f1 in tech:
        for f2 in tech:
            for f3 in ('Li', 'Pb'):
                out.append(portfolio(ctx, f1, f2, f3, False, tech))
                if f1 == f2: out.append(portfolio(ctx, f1, f2, f3, True, tech))
    return out

def matrix(P): return np.array([[p[c] for c in CRIT] for p in P], float)

def score(M, w):
    N = M / np.where(M.max(0) > 0, M.max(0), 1)        # razão ao pior (0 = ideal, 1 = pior do conjunto)
    return N @ np.array([w[c] for c in CRIT])

def perturb(rng):
    t = copy.deepcopy(TECH)
    t['Li']['cE'] *= rng.uniform(.8, 1.25); t['Pb']['cE'] *= rng.uniform(.85, 1.2)
    t['V']['cE'] *= rng.uniform(.65, 1.1); t['V']['cP'] *= rng.uniform(.8, 1.2)
    for k in t:
        t[k]['lam'] *= rng.uniform(.5, 2); t[k]['mttr'] *= rng.uniform(.5, 2)
        t[k]['acc'] *= rng.uniform(.3, 3); t[k]['delay'] *= rng.uniform(.5, 2)
    return t

def smaa(ctx, n_w=400, n_p=60, conc=15, seed=7, params=True):
    """Probabilidade de cada combinação ser a melhor, sorteando pesos (Dirichlet em torno do contexto) e premissas."""
    rng = np.random.default_rng(seed); base = all_portfolios(ctx); wins = np.zeros(len(base))
    w0 = np.array([ctx['w'][c] for c in CRIT])
    for _ in range(n_p if params else 1):
        P = all_portfolios(ctx, perturb(rng)) if params else base
        M = matrix(P); N = M / np.where(M.max(0) > 0, M.max(0), 1)
        W = rng.dirichlet(w0 * conc + 0.3, n_w)
        best = (N @ W.T).argmin(0); wins += np.bincount(best, minlength=len(P))
    return base, wins / wins.sum()

NOME = {'Li': 'lítio', 'Pb': 'chumbo', 'V': 'vanádio'}
def label(c):
    f1, f2, f3, sep = c
    if f1 == f2 and not sep: return f"{NOME[f1].capitalize()} faz ciclo e reserva · no-break de {NOME[f3]}"
    if f1 == f2: return f"{NOME[f1].capitalize()} em dois blocos independentes · no-break de {NOME[f3]}"
    return f"Ciclo de {NOME[f1]} · reserva de {NOME[f2]} · no-break de {NOME[f3]}"

if __name__ == '__main__':
    res = {}
    for key, ctx in CTX.items():
        base, prob = smaa(ctx)
        _, prob_w = smaa(ctx, params=False, n_w=20000)
        s = score(matrix(base), ctx['w']); order = np.argsort(-prob)
        print('\n==', ctx['nome'])
        for i in order[:6]:
            p = base[i]
            print(f"{label(p['combo']):62s} P(melhor) {prob[i]:.2f} (só pesos {prob_w[i]:.2f}) score {s[i]:.3f} | VPL {p['pv']/1e6:5.2f} capex {p['capex']/1e6:5.2f} "
                  f"recur {p['recur']/1e3:5.1f}k ENS {p['ens']:7.1f} CO2 {p['co2']:5.0f} tox {p['tox']:7.0f} acid {p['acid']/1e3:6.1f}k capex/total {p['capex_share']:.2f}")
        res[key] = dict(prob=prob.tolist(), prob_w=prob_w.tolist(), score=s.tolist(),
                        P=[{k: v for k, v in p.items() if k != 'assets'} | {'label': label(p['combo']),
                            'assets': [(f, a) for f, a in p['assets']]} for p in base])
    json.dump(res, open('res.json', 'w'), default=float, ensure_ascii=False)
