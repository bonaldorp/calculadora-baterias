// Validação do modelo da calculadora. Uso: node modelo/validar.js   (opção --rapido pula a repetição do sorteio)
// Roda sem instalar nada. Se houver python3 na máquina, compara também com a segunda implementação (mcda.py).
// Cada teste responde a uma pergunta; a explicação de cada um está em VALIDACAO.md.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const M = require(path.join(__dirname, 'model.js'));
const RAPIDO = process.argv.includes('--rapido');
let falhas = 0, n = 0;
const ok = (nome, cond, det) => { n++; if (!cond) falhas++; console.log(`${cond ? 'ok   ' : 'FALHA'}  ${nome}${det ? '  [' + det + ']' : ''}`); };
const perto = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const lugar = (id, o = {}) => M.buildCtx(Object.assign({ agentes: false, chumbo_lr: false, eletrolito: false, rate: 0.08 }, JSON.parse(JSON.stringify(M.PRESETS[id])), o));
const IDS = Object.keys(M.PRESETS);

console.log('\n1. A conta bate com o cálculo feito à mão?');
{ // lítio, 100 kWh úteis, 50 kW, 300 ciclos por ano, 25 °C, taxa de 8% ao ano, 30 anos
  const a = M.asset('Li', 50, 100, 300, { T: 25, dT: 0, costa: false, mttr_mult: { Li: 1 }, leak: { Li: .3 }, p_delay: .05, tariff: .9 }, M.BASE_TECH, 0.08);
  const En = 100 / (0.9 * 0.8), capE = 1100 * En, capP = 500 * 50, capex = capE + capP;             // 138,9 kWh nominais; R$ 177.778
  const anual = 0.015 * capex + (300 * 100 * (1 / 0.9 - 1) + 0.003 * En * 365) * 0.9;              // operação + perdas
  let ANN = 0; for (let t = 1; t <= 30; t++) ANN += Math.pow(1.08, -t);
  const vp = capex + (0.75 * capE + 0.5 * capP) * Math.pow(1.08, -15) + ANN * anual;               // uma troca e a eletrônica no ano 15
  const co2 = 50 * En * 2 / 1000 + 0.04 * (300 * 100 * (1 / 0.9 - 1) + 0.003 * En * 365) * 30 / 1000;
  ok('valor presente de um bloco de lítio', perto(a.pv, vp, 1e-9), `R$ ${Math.round(a.pv)} × R$ ${Math.round(vp)}`);
  ok('carbono do mesmo bloco', perto(a.gwp, co2, 1e-9), `${a.gwp.toFixed(2)} t × ${co2.toFixed(2)} t`);
  ok('vida útil e número de trocas', a.life === 15 && a.nReps === 1);
}

console.log('\n2. O modelo respeita as regras que qualquer conta desse tipo tem de respeitar?');
{ const c = M.effCtx(lugar('quilombo_linha')), t = M.techFor(c);
  let lin = true, r0 = true, fl = true, vp = 0;
  for (const k of M.KS) { const a = M.asset(k, 10, 100, 100, c, t, .08), b = M.asset(k, 20, 200, 100, c, t, .08), z = M.asset(k, 10, 100, 100, c, t, 0);
    for (const x of ['pv', 'nominal', 'recur', 'gwp', 'tox', 'acid']) lin = lin && perto(b[x], 2 * a[x], 1e-9);
    r0 = r0 && perto(z.pv, z.nominal, 1e-9); fl = fl && perto(a.flows.reduce((s, v) => s + v, 0), a.nominal, 1e-9);
    vp = Math.max(vp, Math.abs(a.flows.reduce((s, v, i) => s + v * Math.pow(1.08, -i), 0) / a.pv - 1)); }
  ok('dobrar potência e energia dobra custos e impactos', lin);
  ok('com taxa de desconto zero, valor presente = soma simples', r0);
  ok('a soma do fluxo de caixa ano a ano fecha com o custo total', fl);
  ok('valor presente do fluxo ano a ano fica a menos de 2% do modelo', vp < 0.02, `maior diferença ${(vp * 100).toFixed(1)}%`);
  const dec = v => v.every((x, i) => i === 0 || x <= v[i - 1] + 1e-9);
  ok('vida útil nunca aumenta com a temperatura', M.KS.every(k => dec([15, 20, 25, 30, 35, 40].map(T => M.life(t[k], k, 300, T, 0)))));
  ok('vida útil nunca aumenta com o número de ciclos', M.KS.every(k => dec([10, 100, 300, 365, 730].map(cy => M.life(t[k], k, cy, 25, 0)))));
  ok('oscilação diária de temperatura nunca aumenta a vida útil', M.KS.every(k => dec([0, 3, 7, 12].map(A => M.life(t[k], k, 300, 30, A)))));
  const c0 = Object.assign({}, c, { p_delay: 0 });
  ok('sem atraso na troca, a indisponibilidade é só a de falhas', M.KS.every(k => { const a = M.asset(k, 10, 100, 100, c0, t, .08); return perto(a.U, Math.min(1, a.Ufail), 1e-12); }));
}

console.log('\n3. A bateria da aba de emergência está do tamanho certo?');
{ const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), pega = re => { const m = html.match(re); if (!m) throw new Error('não achei no index.html: ' + re); return m[0]; };
  const { LOAD_SHAPE, SUN_SHAPE, egSim, egNeed } = new Function(pega(/const LOAD_SHAPE = .*\n/) + pega(/const SUN_SHAPE = .*\n/) + pega(/function egSim[\s\S]*?\n}\n/) + pega(/function egNeed[\s\S]*?\n}\n/) + 'return {LOAD_SHAPE,SUN_SHAPE,egSim,egNeed};')();
  // segundo método, independente: maior déficit acumulado (pico sequente), o mesmo usado para dimensionar reservatórios
  const seq = (prof, sun, days) => { const H = Math.round(days * 24); let d = 0, mx = 0; for (let t = 0; t < H; t++) { const h = (18 + t) % 24, x = prof[h] - sun[h]; d = Math.max(0, d + (x > 0 ? x : x * 0.9)); mx = Math.max(mx, d); } return mx; };
  let pior = 0, casos = 0, justo = true, semSol = true, mono = true;
  for (const dia of [50, 800, 5000]) for (const plano of [0, .5, 1]) for (const sf of [0, .2, .6, 1, 2]) { let ant = 0;
    for (const D of [0.5, 1, 3, 7, 14]) { const prof = LOAD_SHAPE.map(s => dia * (plano / 24 + (1 - plano) * s)), sun = SUN_SHAPE.map(s => s * dia * sf), H = Math.round(D * 24);
      const a = egNeed(prof, sun, D), b = seq(prof, sun, D); casos++; pior = Math.max(pior, Math.abs(a - b) / Math.max(b, 1e-9));
      justo = justo && egSim(prof, sun, a * 1.0001, H).empty === Infinity && egSim(prof, sun, a * 0.999, H).empty !== Infinity;
      if (sf === 0 && D >= 1) semSol = semSol && perto(a, dia * D, 1e-6);
      mono = mono && a >= ant - 1e-6; ant = a; } }
  ok(`dois métodos de cálculo dão a mesma bateria em ${casos} cenários`, pior < 1e-6, `maior diferença ${pior.toExponential(1)}`);
  ok('a bateria calculada atravessa os dias pedidos, e 0,1% a menos não atravessa', justo);
  ok('sem solar, a bateria é igual ao consumo dos dias pedidos', semSol);
  ok('mais dias sem rede nunca pedem bateria menor', mono);
}

console.log('\n4. As duas implementações (JavaScript e Python) dão o mesmo número?');
{ const itens = []; for (const id of IDS) { const c = M.effCtx(lugar(id)), t = M.techFor(c);
    for (const f of ['F1', 'F2', 'F3']) for (const k of M.KS) { const a = M.asset(k, c.F[f].P, c.F[f].E, c.F[f].cyc, c, t, 0.08);
      itens.push({ k, P: c.F[f].P, E: c.F[f].E, cyc: c.F[f].cyc, ctx: { T: c.T, dT: c.dT, costa: !!c.costa, mttr_mult: c.mttr_mult, leak: c.leak, p_delay: c.p_delay }, js: { pv: a.pv, nominal: a.nominal, recur: a.recur, gwp: a.gwp, tox: a.tox, life: a.life, U: a.U, capex: a.capex } }); } }
  const py = `import json,sys,importlib.util\nspec=importlib.util.spec_from_file_location('mcda',sys.argv[1]);m=importlib.util.module_from_spec(spec);sys.argv=['x'];\ntry: spec.loader.exec_module(m)\nexcept SystemExit: pass\nw=0\nfor it in json.load(sys.stdin):\n    p=m.asset(it['k'],it['P'],it['E'],it['cyc'],it['ctx'])\n    for x,v in it['js'].items(): w=max(w,abs(p[x]-v)/max(abs(v),1e-12))\nprint(w)`;
  let r; try { r = cp.spawnSync('python3', ['-c', py, path.join(__dirname, 'mcda.py')], { input: JSON.stringify(itens), encoding: 'utf8' }); } catch (e) { r = null; }
  if (!r || r.status !== 0 || !(parseFloat(r.stdout) >= 0)) console.log('pulado  python3 (com numpy) não disponível nesta máquina');
  else ok(`${itens.length} blocos de bateria nos oito lugares: custo, vida, carbono, resíduo e indisponibilidade`, parseFloat(r.stdout) < 1e-9, `maior diferença ${parseFloat(r.stdout).toExponential(1)}`);
}

console.log('\n5. O resultado publicado se repete?');
{ // valores de referência da versão 5.7 (2.500 conjuntos de premissas × 8 de pesos): primeira opção e % das simulações
  const REF = { turistica: ['Li,Li,Li,false', 62], hospital: ['Li,Li,Li,false', 44], quilombo_linha: ['Li,Li,Li,false', 81], quilombo_isolado: ['Li,V,Li,false', 59],
    pequena_cidade: ['Li,Li,Li,false', 72], sertaneja: ['Li,Li,Li,false', 67], indigena: ['Li,V,Li,false', 66], ilha: ['Li,V,Li,false', 60] };
  for (const id of IDS) { const r = M.smaa(lugar(id), {}), i = r.prob.indexOf(Math.max(...r.prob)), combo = r.base[i].combo.join(','), p = r.prob[i] * 100;
    ok(`${M.PRESETS[id].nome}: mesma primeira opção e % a até 2 pontos da referência`, combo === REF[id][0] && Math.abs(p - REF[id][1]) <= 2, `${p.toFixed(1)}% × ${REF[id][1]}%`);
    if (RAPIDO) continue;
    const ps = [11, 23, 101, 999, 4242].map(s => { const q = M.smaa(lugar(id), { seed: s }); return [q.prob.indexOf(Math.max(...q.prob)) === i, q.prob[i] * 100]; });
    const dmax = Math.max(...ps.map(x => Math.abs(x[1] - p)));
    ok('   repetindo o sorteio com outras cinco sementes: mesma primeira opção e variação de até 3 pontos', ps.every(x => x[0]) && dmax <= 3, `variação máxima ${dmax.toFixed(1)} ponto(s)`); }
}

console.log(`\n${n - falhas} de ${n} testes passaram.${falhas ? ' HÁ FALHAS: não publique antes de entender cada uma.' : ''}\n`);
process.exit(falhas ? 1 : 0);
