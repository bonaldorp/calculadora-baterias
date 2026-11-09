// Modelo por funções + ciclo de vida + risco + multicritério (port do mcda.py)
const H = 30, PCS_LIFE = 15, EF_GRID = 0.04;
const BASE_TECH = {
  Li: { nome: 'Lítio (LFP)', cE: 1100, cP: 500, rte: .90, dod: .90, cyc: 6000, cal: 15, om: .015, rep: .75, gwp: 50, aux: .003, lam: 1.0, mttr: 48, acc: 1e-4, acc_cost: 3e6, haz_kg: 0.7, haz_w: 0.2, delay: 0.75 },
  Pb: { nome: 'Chumbo-ácido', cE: 850, cP: 500, rte: .80, dod: .50, cyc: 2500, cal: 12, om: .010, rep: 1.0, gwp: 40.5, aux: .001, lam: 0.3, mttr: 24, acc: 5e-5, acc_cost: 3e5, haz_kg: 20.0, haz_w: 1.0, delay: 0.25 },
  V:  { nome: 'Fluxo de vanádio', cE: 1700, cP: 3200, rte: .70, dod: .90, cyc: 1e9, cal: 25, om: .020, rep: 0.0, gwp: 184, aux: .004, lam: 2.0, mttr: 96, acc: 5e-4, acc_cost: 5e5, haz_kg: 54.0, haz_w: 0.3, delay: 1.0, stack_share: 0.4, stack_years: [12, 24], electrolyte_share: 0.6, electrolyte_resid: 0.5 },
};
const CRIT = ['custo', 'recorrente', 'ens', 'co2', 'tox', 'acid'];
const KS = ['Li', 'Pb', 'V'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function techFor(ctx) {
  const t = clone(BASE_TECH);
  if (ctx.eletrolito) { t.V.cE = 1100; t.V.electrolyte_resid = 0.9; t.V.gwp = 61; }
  return t;
}
function effCtx(ctx) {
  const c = clone(ctx);
  if (c.agentes) { for (const k of KS) c.mttr_mult[k] = Math.min(c.mttr_mult[k], 1.5); c.p_delay = Math.min(c.p_delay, 0.15); }
  if (c.chumbo_lr) c.leak.Pb = 0.05;
  return c;
}

function life(p, k, cyc, T) {
  if (k === 'V') return p.cal;
  const f = k === 'Pb' ? Math.pow(2, -(T - 25) / 10) : Math.min(1, Math.pow(2, -(T - 25) / 15.5)); // chumbo: metade a cada +10 °C; lítio: 0,8 a 30 °C, 0,64 a 35 °C
  return Math.min(p.cal * f, p.cyc * (k === 'Pb' ? f : 1) / Math.max(cyc, 1e-9));
}

function asset(k, P, Euse, cyc, ctx, tech, I) {
  const p = tech[k], T = ctx.T, pv = t => Math.pow(1 + I, -t);
  let ANN = 0; for (let t = 1; t <= H; t++) ANN += pv(t);
  const En = Euse / p.dod, capE = p.cE * En, capP = p.cP * P, capex = capE + capP;
  const L = life(p, k, cyc, T);
  let reps = [], repCost = [], pcs = [], resid;
  if (k === 'V') {
    reps = p.stack_years.slice(); repCost = reps.map(() => p.stack_share * capP);
    resid = p.electrolyte_resid * p.electrolyte_share * capE;
  } else {
    let t = L; while (t < H - 0.5) { reps.push(t); t += L; }
    repCost = reps.map(() => p.rep * capE); pcs = [PCS_LIFE];
    const last = reps.length ? reps[reps.length - 1] : 0, rem = Math.max(0, (last + L - H) / L);
    resid = rem * (reps.length ? p.rep * capE : capE);
  }
  const pcsCost = 0.5 * capP, om = p.om * capex, thr = cyc * Euse;
  const aux = p.aux * En * 365 * (T > 25 ? 1.3 : 1.0);
  const loss = thr * (1 / p.rte - 1) + aux;
  const sumRep = repCost.reduce((a, b) => a + b, 0);
  const pvTot = capex + reps.reduce((s, t, i) => s + repCost[i] * pv(t), 0) + pcs.reduce((s, t) => s + pcsCost * pv(t), 0)
    + ANN * (om + loss * ctx.tariff) - resid * pv(H);
  const nominal = capex + sumRep + pcsCost * pcs.length + H * (om + loss * ctx.tariff) - resid;
  const recur = (sumRep + pcsCost * pcs.length + H * om) / H;
  const units = k === 'V' ? 1 : 1 + reps.length;
  const gwp = p.gwp * En * units / 1000 + EF_GRID * loss * H / 1000;
  const mass = p.haz_kg * En * units;
  const tox = mass * ctx.leak[k] * p.haz_w;
  const accCost = p.acc * En / 1000 * H * p.acc_cost;
  const Ufail = p.lam * p.mttr * ctx.mttr_mult[k] / 8760 * ((ctx.costa && (k === 'Li' || k === 'V')) ? 1.3 : 1) * (k === 'V' ? Math.min(2, Math.max(1, 1 + 0.1 * (T - 25))) : 1); // vanádio: +50% a 30 °C, +100% a 35 °C
  const Udelay = ctx.p_delay * p.delay * reps.length / H;
  return { k, P, Euse, En, capex, life: L, nReps: reps.length, pv: pvTot, nominal, recur, gwp, mass, tox, acid: accCost,
    Ufail, Udelay, U: Math.min(1, Ufail + Udelay), mult: nominal / capex, ann: ANN };
}

function portfolio(ctx, f1, f2, f3, sep, tech, I) {
  const F = ctx.F; const assets = []; let U1, U2, shared;
  if (f1 === f2 && !sep) {
    const P = Math.max(F.F1.P, F.F2.P), E = F.F1.E + F.F2.E;
    const cyc = (F.F1.cyc * F.F1.E + F.F2.cyc * F.F2.E) / E;
    const a = asset(f1, P, E, cyc, ctx, tech, I); assets.push(['F1+F2', a]); U1 = U2 = a.U; shared = true;
  } else {
    const a1 = asset(f1, F.F1.P, F.F1.E, F.F1.cyc, ctx, tech, I), a2 = asset(f2, F.F2.P, F.F2.E, F.F2.cyc, ctx, tech, I);
    assets.push(['F1', a1], ['F2', a2]); U1 = a1.U; U2 = a2.U; shared = false;
  }
  const a3 = asset(f3, F.F3.P, F.F3.E, F.F3.cyc, ctx, tech, I); assets.push(['F3', a3]);
  const sum = key => assets.reduce((s, [, a]) => s + a[key], 0);
  const core = ctx.core; let ens, ensNc;
  if (ctx.isolated) {
    const both = shared ? U1 : U1 * U2;
    ens = ctx.alpha * ctx.night_kwh * both * ((1 - core) + core * a3.U); ensNc = (1 - ctx.alpha) * ctx.night_kwh * U1;
  } else { ens = ctx.E_exp * U2 * ((1 - core) + core * a3.U); ensNc = 0; }
  const capex = sum('capex'), nominal = sum('nominal');
  return { combo: [f1, f2, f3, sep], assets, custo: sum('pv'), recorrente: sum('recur'), ens, ensNc, co2: sum('gwp'),
    tox: sum('tox'), acid: sum('acid'), capex, nominal, mult: nominal / capex, mass: sum('mass') };
}

function allPortfolios(ctx, tech, I) {
  const out = [];
  for (const f1 of KS) for (const f2 of KS) for (const f3 of ['Li', 'Pb']) {
    out.push(portfolio(ctx, f1, f2, f3, false, tech, I));
    if (f1 === f2) out.push(portfolio(ctx, f1, f2, f3, true, tech, I));
  }
  return out;
}

function scores(P, w) {
  const mx = CRIT.map(c => Math.max(...P.map(p => p[c])) || 1);
  return P.map(p => CRIT.reduce((s, c, i) => s + w[c] * p[c] / mx[i], 0));
}

// RNG + Dirichlet
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(r, a) {
  if (a < 1) return gamma(r, a + 1) * Math.pow(r(), 1 / a);
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function dirichlet(r, alpha) { const g = alpha.map(a => gamma(r, a)); const s = g.reduce((a, b) => a + b, 0); return g.map(x => x / s); }

function perturb(tech, r) {
  const t = clone(tech), U = (a, b) => a + (b - a) * r();
  t.Li.cE *= U(.8, 1.25); t.Pb.cE *= U(.85, 1.2); t.V.cE *= U(.65, 1.1); t.V.cP *= U(.8, 1.2);
  for (const k of KS) { t[k].lam *= U(.5, 2); t[k].mttr *= U(.5, 2); t[k].acc *= U(.3, 3); t[k].delay *= U(.5, 2); }
  return t;
}

function smaa(ctxRaw, opts = {}) {
  const ctx = effCtx(ctxRaw), tech = techFor(ctxRaw), I = ctxRaw.rate;
  const nP = opts.nP ?? 40, nW = opts.nW ?? 200, conc = opts.conc ?? 15, r = rng(opts.seed ?? 7);
  const base = allPortfolios(ctx, tech, I); const wins = new Array(base.length).fill(0);
  const w0 = CRIT.map(c => ctxRaw.w[c]);
  for (let i = 0; i < nP; i++) {
    const P = allPortfolios(ctx, perturb(tech, r), I);
    const mx = CRIT.map(c => Math.max(...P.map(p => p[c])) || 1);
    const N = P.map(p => CRIT.map((c, j) => p[c] / mx[j]));
    for (let j = 0; j < nW; j++) {
      const W = dirichlet(r, w0.map(x => x * conc + 0.3));
      let best = 0, bs = Infinity;
      for (let q = 0; q < N.length; q++) { let s = 0; for (let c = 0; c < W.length; c++) s += W[c] * N[q][c]; if (s < bs) { bs = s; best = q; } }
      wins[best]++;
    }
  }
  const tot = wins.reduce((a, b) => a + b, 0);
  const wObj = {}; CRIT.forEach(c => wObj[c] = ctxRaw.w[c]);
  return { base, prob: wins.map(x => x / tot), score: scores(base, wObj), ctx, tech };
}

const NOMEK = { Li: 'lítio', Pb: 'chumbo', V: 'vanádio' };
function label(c) {
  const [f1, f2, f3, sep] = c;
  if (f1 === f2 && !sep) return `${cap(NOMEK[f1])} faz ciclo e reserva · no-break de ${NOMEK[f3]}`;
  if (f1 === f2) return `${cap(NOMEK[f1])} em dois blocos independentes · no-break de ${NOMEK[f3]}`;
  return `Ciclo de ${NOMEK[f1]} · reserva de ${NOMEK[f2]} · no-break de ${NOMEK[f3]}`;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const PRESETS = {
  turistica: { nome: 'Vila turística conectada', desc: 'Ponta de alimentador numa península turística (Taipus de Fora, Maraú): pousadas, frio do pescado e bombeamento. Técnico a poucas horas, distribuidora paga as trocas.', F: { F1: { P: 300, E: 600, cyc: 300 }, F2: { P: 280, E: 2000, cyc: 5 }, F3: { P: 30, E: 240, cyc: 3 } },
    T: 25, costa: true, longe: false, comunidade_paga: false, isolated: false, horas_falta: 36, carga_critica: 137, night_kwh_dia: 0, alpha: 0.3, core: 0.15, familias: 2000,
    w: { custo: .30, recorrente: .05, ens: .20, co2: .10, tox: .10, acid: .25 } },
  hospital: { nome: 'Hospital regional conectado', desc: 'UTI e centro cirúrgico com equipe de manutenção própria. O risco de incêndio dentro do prédio pesa muito.', F: { F1: { P: 200, E: 400, cyc: 250 }, F2: { P: 150, E: 3600, cyc: 4 }, F3: { P: 100, E: 100, cyc: 12 } },
    T: 25, costa: false, longe: false, comunidade_paga: false, isolated: false, horas_falta: 36, carga_critica: 150, night_kwh_dia: 0, alpha: 0.3, core: 0.6, familias: 0,
    w: { custo: .20, recorrente: .05, ens: .30, co2: .05, tox: .10, acid: .30 } },
  quilombo_linha: { nome: 'Comunidade quilombola em ponta de linha', desc: '~100 famílias com rede fraca e faltas de até 3–5 dias. Técnico longe, comunidade paga as trocas. Pesos devem sair da consulta prévia.', F: { F1: { P: 25, E: 50, cyc: 300 }, F2: { P: 15, E: 290, cyc: 5 }, F3: { P: 5, E: 40, cyc: 6 } },
    T: 30, costa: true, longe: true, comunidade_paga: true, isolated: false, horas_falta: 108, carga_critica: 6, night_kwh_dia: 0, alpha: 0.3, core: 0.4, familias: 100,
    w: { custo: .20, recorrente: .25, ens: .25, co2: .05, tox: .15, acid: .10 } },
  quilombo_isolado: { nome: 'Comunidade quilombola isolada (sem rede)', desc: '~100 famílias com solar e bateria, como Barra Velha e Peso, na Resex de Canavieiras. Técnico longe, comunidade paga as trocas.', F: { F1: { P: 40, E: 240, cyc: 365 }, F2: { P: 15, E: 290, cyc: 10 }, F3: { P: 5, E: 40, cyc: 12 } },
    T: 30, costa: true, longe: true, comunidade_paga: true, isolated: true, horas_falta: 0, carga_critica: 0, night_kwh_dia: 240, alpha: 0.3, core: 0.4, familias: 100,
    w: { custo: .20, recorrente: .25, ens: .30, co2: .05, tox: .15, acid: .05 } },
  pequena_cidade: { nome: 'Pequeno centro urbano', desc: 'Sede municipal de ~20 mil habitantes: hospital, água, telecom e prefeitura como carga crítica. Técnico na região, distribuidora paga as trocas, contêiner climatizado.',
    F: { F1: { P: 1000, E: 2000, cyc: 300 }, F2: { P: 500, E: 6000, cyc: 4 }, F3: { P: 100, E: 400, cyc: 6 } },
    T: 25, costa: false, longe: false, comunidade_paga: false, isolated: false, horas_falta: 20, carga_critica: 300, night_kwh_dia: 0, alpha: 0.3, core: 0.3, familias: 6000,
    w: { custo: .35, recorrente: .05, ens: .20, co2: .10, tox: .10, acid: .20 } },
  sertaneja: { nome: 'Comunidade sertaneja em ponta de linha', desc: 'Semiárido, ~60 famílias no fim de uma linha rural longa. Bomba do poço, posto e refrigeração de leite e vacinas são a carga crítica. Abrigo quente (35 °C), técnico longe, comunidade paga as trocas.',
    F: { F1: { P: 30, E: 60, cyc: 300 }, F2: { P: 15, E: 200, cyc: 5 }, F3: { P: 5, E: 30, cyc: 6 } },
    T: 35, costa: false, longe: true, comunidade_paga: true, isolated: false, horas_falta: 48, carga_critica: 8, night_kwh_dia: 0, alpha: 0.3, core: 0.5, familias: 60,
    w: { custo: .20, recorrente: .25, ens: .30, co2: .05, tox: .10, acid: .10 } },
  indigena: { nome: 'Aldeia indígena isolada (sem rede)', desc: '~40 famílias sem rede: UBS indígena, escola, rádio e bomba d\'água como carga crítica. Técnico longe, comunidade paga as trocas. Pesos devem sair da consulta livre, prévia e informada (Convenção 169 da OIT).',
    F: { F1: { P: 20, E: 100, cyc: 365 }, F2: { P: 8, E: 150, cyc: 10 }, F3: { P: 3, E: 24, cyc: 12 } },
    T: 30, costa: false, longe: true, comunidade_paga: true, isolated: true, horas_falta: 0, carga_critica: 0, night_kwh_dia: 100, alpha: 0.3, core: 0.4, familias: 40,
    w: { custo: .15, recorrente: .25, ens: .25, co2: .05, tox: .20, acid: .10 } },
  ilha: { nome: 'Comunidade de ilha ou ribeirinha (sem rede)', desc: '~50 famílias de pesca sem rede, como nas ilhas da Baía de Camamu: frio do pescado, posto e água como carga crítica. Maresia, técnico longe, comunidade paga as trocas.',
    F: { F1: { P: 25, E: 130, cyc: 365 }, F2: { P: 10, E: 180, cyc: 10 }, F3: { P: 4, E: 30, cyc: 12 } },
    T: 30, costa: true, longe: true, comunidade_paga: true, isolated: true, horas_falta: 0, carga_critica: 0, night_kwh_dia: 130, alpha: 0.35, core: 0.4, familias: 50,
    w: { custo: .20, recorrente: .25, ens: .30, co2: .05, tox: .15, acid: .05 } },
};

// converte as escolhas da tela no contexto do modelo
function buildCtx(s) {
  return {
    F: s.F, T: s.T, costa: s.costa, isolated: s.isolated, core: s.core, alpha: s.alpha,
    E_exp: s.horas_falta * s.carga_critica, night_kwh: s.night_kwh_dia * 365,
    mttr_mult: s.longe ? { Li: 5, Pb: 1.5, V: 8 } : { Li: 1, Pb: 1, V: 1.5 },
    leak: s.longe ? { Li: .40, Pb: .30, V: .05 } : { Li: .30, Pb: .05, V: .02 },
    p_delay: s.comunidade_paga ? 0.5 : 0.05, agentes: s.agentes, chumbo_lr: s.chumbo_lr, eletrolito: s.eletrolito,
    rate: s.rate, tariff: 0.90, w: s.w,
  };
}

if (typeof module !== 'undefined') module.exports = { BASE_TECH, PRESETS, buildCtx, smaa, label, asset, effCtx, techFor, KS, CRIT };
