// Confere as contas da aba Custos contra uma segunda implementação escrita
// à parte, em milhares de cenários sorteados, e checa invariantes que só se
// mantêm se as fórmulas estiverem corretas.
import { servir, abrirApp, placar, perto } from './apoio.mjs';

const DIAS_MES = 365 / 12;

// Implementação de referência — independente da do aplicativo de propósito.
function referencia(P) {
  const num = x => typeof x === 'number' && isFinite(x);
  const rendOk = v => num(v) && v > 0 && v <= 100;
  const rend = rendOk(P.rend) ? P.rend : 52;
  const rC = rendOk(P.rendCompra) ? P.rendCompra : rend;
  const rV = rendOk(P.rendVenda) ? P.rendVenda : rend;
  const arroba = (kg, r) => kg * r / 1500;
  const pesos = [P.pesoCompra, P.pesoVenda].filter(x => num(x) && x > 0);
  const pesoMedio = pesos.length ? pesos.reduce((a, c) => a + c, 0) / pesos.length : null;
  const pct = num(P.salPct) && P.salPct >= 0 ? P.salPct : 0.3;
  const salKgDia = pesoMedio === null ? null : pesoMedio * pct / 100;
  const salDia = salKgDia !== null && num(P.salPreco) ? salKgDia * P.salPreco : 0;
  const sanDia = num(P.sanidade) ? P.sanidade / DIAS_MES : 0;
  const moDia = num(P.mo) ? P.mo / DIAS_MES : 0;
  const terraDia = num(P.terra) ? P.terra / DIAS_MES : 0;
  const custoDia = salDia + sanDia + moDia + terraDia;
  const pc = P.pesoCompra, pv = P.pesoVenda, g = P.gmd;
  const engordaValida = num(pc) && pc > 0 && num(pv) && pv > pc && num(g) && g > 0;
  let arrobaDia = null;
  if (num(g) && g > 0) {
    arrobaDia = engordaValida ? (arroba(pv, rV) - arroba(pc, rC)) / ((pv - pc) / g) : g * rend / 1500;
  }
  const R = {
    rend, rendCompra: rC, rendVenda: rV, salPct: pct, pesoMedio, salKgDia, salDia, sanDia, moDia,
    terraDia, custoDia, arrobaDia,
    custoArroba: arrobaDia > 0 && custoDia > 0 ? custoDia / arrobaDia : null,
    sim: null
  };
  if (!engordaValida) return R;
  const dias = (pv - pc) / g, meses = dias / DIAS_MES, custoPeriodo = custoDia * dias;
  const aC = arroba(pc, rC), aV = arroba(pv, rV), aP = aV - aC;
  const temCompra = num(P.valorCompra) && P.valorCompra >= 0;
  const temPreco = num(P.precoArroba) && P.precoArroba > 0;
  const investido = temCompra ? P.valorCompra + custoPeriodo : null;
  const receita = temPreco ? aV * P.precoArroba : null;
  const resultado = investido !== null && receita !== null ? receita - investido : null;
  const margem = resultado !== null && investido > 0 ? resultado / investido * 100 : null;
  R.sim = {
    ganhoKg: pv - pc, dias, meses, custoPeriodo, arrobasCompra: aC, arrobasVenda: aV,
    arrobasProduzidas: aP, rendCompra: rC, rendVenda: rV, investido, receita, resultado, margem,
    valorKgCompra: temCompra ? P.valorCompra / pc : null,
    valorKgVenda: receita !== null ? receita / pv : null,
    retornoMensal: margem !== null && meses > 0 ? margem / meses : null,
    lucroMensal: resultado !== null && meses > 0 ? resultado / meses : null,
    precoArrobaCompra: temCompra && aC > 0 ? P.valorCompra / aC : null,
    custoArrobaProduzida: aP > 0 ? custoPeriodo / aP : null,
    lucroArrobaProduzida: resultado !== null && aP > 0 ? resultado / aP : null,
    lucroArrobaVendida: resultado !== null && aV > 0 ? resultado / aV : null
  };
  return R;
}

const CAMPOS_CUSTO = ['rend', 'rendCompra', 'rendVenda', 'salPct', 'pesoMedio', 'salKgDia', 'salDia',
  'sanDia', 'moDia', 'terraDia', 'custoDia', 'arrobaDia', 'custoArroba'];
const CAMPOS_SIM = ['ganhoKg', 'dias', 'meses', 'custoPeriodo', 'arrobasCompra', 'arrobasVenda',
  'arrobasProduzidas', 'rendCompra', 'rendVenda', 'investido', 'receita', 'resultado', 'margem',
  'valorKgCompra', 'valorKgVenda', 'retornoMensal', 'lucroMensal', 'precoArrobaCompra',
  'custoArrobaProduzida', 'lucroArrobaProduzida', 'lucroArrobaVendida'];

const N = Number(process.env.CENARIOS || 5000);

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Cálculos da aba Custos (${N} cenários sorteados)`);
  await pagina.evaluate(() => { seg = 'custos'; });

  const entre = (a, b) => a + Math.random() * (b - a);
  const talvez = (v, pr = 0.85) => Math.random() < pr ? v : null;
  const casos = [];
  for (let i = 0; i < N; i++) casos.push({
    gmd: talvez(+entre(0.1, 1.6).toFixed(3), 0.9),
    salPct: talvez(+entre(0, 1.2).toFixed(3)),
    salPreco: talvez(+entre(0.5, 20).toFixed(2)),
    sanidade: talvez(+entre(0, 80).toFixed(2)),
    mo: talvez(+entre(0, 200).toFixed(2)),
    terra: talvez(+entre(0, 300).toFixed(2)),
    rend: talvez(+entre(35, 70).toFixed(1), 0.6),
    pesoCompra: talvez(+entre(120, 400).toFixed(1), 0.9),
    pesoVenda: talvez(+entre(100, 700).toFixed(1), 0.9),
    valorCompra: talvez(+entre(0, 9000).toFixed(2)),
    precoArroba: talvez(+entre(0, 600).toFixed(2)),
    rendCompra: talvez(+entre(30, 75).toFixed(1), 0.4),
    rendVenda: talvez(+entre(30, 75).toFixed(1), 0.4)
  });

  const doApp = await pagina.evaluate(cs => cs.map(P => {
    custoParams = Object.assign({}, CUSTO_VAZIO, P);
    const c = calcCusto();
    return { c, sim: calcSimulacao(c) };
  }), casos);

  let divergencias = 0, nulosDiferentes = 0, primeira = null;
  for (let i = 0; i < casos.length; i++) {
    const ref = referencia(casos[i]), app = doApp[i];
    for (const k of CAMPOS_CUSTO) if (!perto(app.c[k], ref[k])) {
      divergencias++; primeira ||= { i, k, app: app.c[k], ref: ref[k], caso: casos[i] };
    }
    if ((app.sim === null) !== (ref.sim === null)) {
      nulosDiferentes++; primeira ||= { i, k: 'simulação nula?', app: app.sim, ref: ref.sim, caso: casos[i] };
    } else if (app.sim && ref.sim) {
      for (const k of CAMPOS_SIM) if (!perto(app.sim[k], ref.sim[k])) {
        divergencias++; primeira ||= { i, k, app: app.sim[k], ref: ref.sim[k], caso: casos[i] };
      }
    }
  }
  t.secao(`${CAMPOS_CUSTO.length + CAMPOS_SIM.length} fórmulas contra a implementação de referência`);
  t.conferir('nenhuma divergência de valor', divergencias === 0, divergencias ? JSON.stringify(primeira).slice(0, 300) : '');
  t.conferir('nenhuma divergência sobre quando não calcular', nulosDiferentes === 0);

  // Invariantes: relações que precisam valer sempre, qualquer que seja a entrada.
  let violacoes = 0; const exemplos = [];
  for (let i = 0; i < casos.length; i++) {
    const { c, sim } = doApp[i]; if (!sim) continue;
    const vale = (nome, ok) => { if (!ok) { violacoes++; if (exemplos.length < 3) exemplos.push(`${nome} (caso ${i})`); } };
    const ap = (a, b) => perto(a, b, 1e-8);
    if (sim.resultado !== null) vale('resultado = receita − investido', ap(sim.resultado, sim.receita - sim.investido));
    if (sim.lucroArrobaProduzida !== null) vale('lucro/@produzida × @produzidas = resultado', ap(sim.lucroArrobaProduzida * sim.arrobasProduzidas, sim.resultado));
    if (sim.lucroArrobaVendida !== null) vale('lucro/@vendida × @vendidas = resultado', ap(sim.lucroArrobaVendida * sim.arrobasVenda, sim.resultado));
    if (sim.retornoMensal !== null) vale('retorno mensal × meses = margem', ap(sim.retornoMensal * sim.meses, sim.margem));
    if (sim.lucroMensal !== null) vale('lucro mensal × meses = resultado', ap(sim.lucroMensal * sim.meses, sim.resultado));
    vale('custo do período = custo/dia × dias', ap(sim.custoPeriodo, c.custoDia * sim.dias));
    vale('@produzidas = @venda − @compra', ap(sim.arrobasProduzidas, sim.arrobasVenda - sim.arrobasCompra));
    if (c.custoArroba !== null && sim.custoArrobaProduzida !== null)
      vale('custo da @ do topo = o da simulação', ap(c.custoArroba, sim.custoArrobaProduzida));
    vale('sem lucro por @ quando não se produz @', !(sim.arrobasProduzidas <= 0 && sim.lucroArrobaProduzida !== null));
    vale('custo da @ nunca negativo', !(c.custoArroba !== null && c.custoArroba < 0));
    vale('dias de engorda sempre positivos', sim.dias > 0);
    // O consumo pela média dos pesos tem de igualar a soma dia a dia do consumo real
    if (c.salKgDia !== null && c.pesoMedio !== null) {
      const P = casos[i]; let soma = 0; const passos = 500, dt = sim.dias / passos;
      for (let k = 0; k < passos; k++) soma += (P.pesoCompra + P.gmd * (k + 0.5) * dt) * (c.salPct / 100) * dt;
      vale('sal pela média = sal somado dia a dia', Math.abs(c.salKgDia * sim.dias - soma) <= 1e-6 * Math.max(1, soma));
    }
  }
  t.secao('invariantes matemáticas');
  t.conferir('nenhuma violação', violacoes === 0, violacoes ? exemplos.join(', ') : '');

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
