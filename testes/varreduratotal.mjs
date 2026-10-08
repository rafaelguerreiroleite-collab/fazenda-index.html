// VARREDURA TOTAL: cálculo por cálculo, contra um conferidor independente.
//
// Pedido do dono: varredura em todos os cálculos possíveis — parcelas,
// lançamentos, GMD — sem deixar furos, conferindo cálculo por cálculo até
// encontrar erro.
//
// "Sem furos" só vale se for verificável, e para isso o aplicativo foi
// inventariado função por função. São seis famílias, e esta bateria cobre
// todas, cada uma com uma implementação ESCRITA AQUI, do zero, que nunca
// chama o aplicativo:
//
//   1. motor de parcelas — repartição em centavos, três ritmos, montagem
//   2. família do GMD — do par de pesagens até o mês a mês e os dias-animal
//   3. o que a TELA afirma — a camada onde o último erro de verdade morava
//   4. regimes, períodos e agregação — competência, caixa, vencimento
//   5. arroba, custo, projeção e leitura de número
//   6. caminhos que geram dinheiro sozinhos — venda de animal, estoque,
//      atividades, busca
//
// Por que a família 3 existe: o erro que o dono pegou com a nota fiscal na mão
// (versão 97) não estava em cálculo nenhum. Os dados estavam certos e a tela
// mentia sobre eles — anunciava "2× de R$ 1.446,29" para uma parcela de
// R$ 2.892,57. Nenhuma varredura de função pura pegaria isso, porque todas
// conferem o DADO e nenhuma conferia a AFIRMAÇÃO. Agora uma confere.
//
// Volume por família, ajustável: PARCELAS, GMDS, TELAS, REGIMES, ARROBAS,
// CAMINHOS. A semente sai no cabeçalho e repete qualquer falha.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = {
  parcelas: Number(process.env.PARCELAS || 20000),
  gmds: Number(process.env.GMDS || 2000),
  telas: Number(process.env.TELAS || 150),
  regimes: Number(process.env.REGIMES || 1200),
  arrobas: Number(process.env.ARROBAS || 10000),
  caminhos: Number(process.env.CAMINHOS || 400)
};
// Os ids têm volume próprio: a falha que motivou a família 7 só aparece em
// centenas de milhares, e conferir pouco aqui seria não conferir.
const IDS = Number(process.env.IDS || 300000);
const SEMENTE = Number(process.env.SEMENTE || (Date.now() % 2147483647));

// Ferramentas que vão para dentro da página. Ficam numa string porque precisam
// ser as MESMAS em todas as famílias, e porque nenhuma delas pode usar uma
// função do aplicativo — é esse o ponto da bateria inteira.
const APOIO = semente => `
  let _s = ${semente} >>> 0;
  const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const dec = (lo, hi, c) => Math.round((lo + rnd() * (hi - lo)) * 10 ** c) / 10 ** c;
  const iso = d => d.toISOString().slice(0, 10);
  const maisD = (str, n) => { const [y, m, d] = str.split('-').map(Number);
    return iso(new Date(Date.UTC(y, m - 1, d + n))); };
  const maisM = (str, k) => { const [y, m, d] = str.split('-').map(Number);
    const u = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(y, m - 1 + k, Math.min(d, u)))); };
  const diasEntre = (x, y) => Math.round((new Date(y + 'T12:00') - new Date(x + 'T12:00')) / 86400000);
  const repartir = (c, n) => { const b = Math.floor(c / n), r = c - b * n;
    return Array.from({ length: n }, (_, i) => b + (i < r ? 1 : 0)); };
  const cent = v => Math.round(v * 100);
  const perto = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-9 : e);
  const dataQualquer = () => \`2026-\${String(ent(1,12)).padStart(2,'0')}-\${String(ent(1,28)).padStart(2,'0')}\`;
  const falhas = {};
  const regra = (nome, ok, caso) => {
    if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
  };
  const limpar = () => {
    bovT = []; avT = []; gerT = []; atividades = []; extraT = {}; recomputarLivros();
    animals = []; weighings = []; items = []; moves = []; pendentes = [];
    anexosForm = []; anexosRemover = [];
    LS.s('fjs-ics-auto', false); LS.s('fjs-ics-visto', true);
  };
`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const total = Object.values(QTD).reduce((a, b) => a + b, 0) + IDS;
  const t = placar(`Varredura total: cálculo por cálculo (${total.toLocaleString('pt-BR')} sorteios · semente ${SEMENTE})`);
  // Cada família devolve { regra: caso-que-falhou-ou-null }. Uma conferência
  // por regra, com o primeiro contraexemplo no detalhe — é ele que permite ir
  // atrás do erro sem reproduzir a corrida inteira.
  const marcar = (fam, res, n) => {
    Object.entries(res).forEach(([nome, caso]) => {
      t.conferir(nome, caso === null, caso == null ? `${n.toLocaleString('pt-BR')} sorteios` : caso);
    });
  };

  // ================= 1. MOTOR DE PARCELAS =================
  t.secao(`1. motor de parcelas (${QTD.parcelas.toLocaleString('pt-BR')} carnês sorteados)`);
  const f1 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE)}
    for (let k = 0; k < N; k++) {
      const c = ent(1, 50000000), total = c / 100, n = ent(1, 36);
      const venc = dataQualquer();
      const ritmo = ['mes', '30', 'livre'][ent(0, 2)];
      // --- repartição em centavos ---
      const vs = parcelasDe(total, n);
      const meu = repartir(c, n);
      const emCent = vs.map(v => Math.round(v * 100));
      regra('a soma das parcelas é o total da compra, no centavo',
        emCent.reduce((x, y) => x + y, 0) === c, total + ' em ' + n + 'x');
      regra('o número de parcelas é o pedido', vs.length === n, n + ' vs ' + vs.length);
      regra('a repartição dos centavos é a mesma do conferidor de fora',
        emCent.join() === meu.join(), total + '/' + n + ': ' + emCent.slice(0, 4));
      regra('nenhuma parcela sai negativa', emCent.every(x => x >= 0), total + '/' + n);
      regra('a diferença entre a maior e a menor parcela nunca passa de um centavo',
        Math.max.apply(null, emCent) - Math.min.apply(null, emCent) <= 1, total + '/' + n);
      // --- datas, nos três ritmos ---
      let datas = null, esperado;
      if (ritmo === 'livre') {
        datas = {}; esperado = [venc]; let at = venc;
        for (let i = 1; i < n; i++) { at = maisD(at, ent(1, 120)); datas[i] = at; esperado.push(at); }
      } else if (ritmo === '30') esperado = Array.from({ length: n }, (_, i) => maisD(venc, 30 * i));
      else esperado = Array.from({ length: n }, (_, i) => maisM(venc, i));
      const vencs = vencimentosDe(venc, n, ritmo, datas);
      regra('as datas das parcelas saem onde o ritmo manda',
        vencs.join() === esperado.join(), ritmo + ' de ' + venc + ' x' + n + ': ' + vencs.slice(0, 3));
      regra('a primeira parcela é sempre o 1º vencimento do formulário',
        vencs[0] === venc, vencs[0] + ' vs ' + venc);
      regra('nenhuma data sai malformada',
        vencs.every(v => /^\\d{4}-\\d{2}-\\d{2}$/.test(v)), String(vencs[0]));
      regra('as datas nunca andam para trás',
        vencs.every((v, i) => i === 0 || v >= vencs[i - 1]), vencs.slice(0, 3).join(' '));
      // --- montagem ---
      const base = { date: venc, type: 'saida', amount: total, category: 'X', notes: 'n' };
      const partes = montarParcelas({ base, total, venc, n, grupo: 'g', ritmo, datas });
      regra('o carnê montado soma o total',
        partes.reduce((x, p) => x + Math.round(p.amount * 100), 0) === c, total + '/' + n);
      regra('cada parcela sai numerada em ordem',
        partes.every((p, i) => p.parcela === i + 1 && p.parcelas === n), String(n));
      regra('cada parcela leva a data do ritmo escolhido',
        partes.every((p, i) => p.venc === esperado[i]), ritmo);
      regra('nenhuma parcela nasce paga',
        partes.every(p => p.pago === false && p.pagoEm === null), '');
      regra('cada parcela nasce com identidade própria',
        new Set(partes.map(p => p.id)).size === n, String(n));
      regra('todas as parcelas pertencem ao mesmo carnê',
        partes.every(p => p.grupo === 'g'), '');
      // --- ritmo reconhecido ao reabrir ---
      if (n > 1 && ritmo !== 'livre') {
        const det = ritmoDetectado(esperado);
        regra('o ritmo de um carnê existente é reconhecido ao reabrir',
          det === ritmo || (ritmo === '30' && det === 'mes') || (ritmo === 'mes' && det === '30'),
          'montou ' + ritmo + ', detectou ' + det);
      }
      // --- recusa do que não dá para cobrar ---
      if (ritmo === 'livre' && n > 1) {
        regra('datas escolhidas em ordem são aceitas',
          !erroDasDatas(venc, n, 'livre', datas), String(erroDasDatas(venc, n, 'livre', datas)));
        const faltando = Object.assign({}, datas); delete faltando[1];
        regra('parcela sem data é recusada antes de salvar',
          !!erroDasDatas(venc, n, 'livre', faltando), String(n));
        const fora = Object.assign({}, datas); fora[1] = maisD(venc, -1);
        regra('parcela que vence antes da anterior é recusada',
          !!erroDasDatas(venc, n, 'livre', fora), String(n));
      }
    }
    return falhas;
  })(${QTD.parcelas})`);
  marcar('parcelas', f1, QTD.parcelas);

  // ================= 2. FAMÍLIA DO GMD =================
  t.secao(`2. família do GMD (${QTD.gmds.toLocaleString('pt-BR')} rebanhos sorteados)`);
  const f2 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 7)}
    const diasPorMesMeu = (ini, fim) => {
      const out = {}; let c = ini;
      while (c < fim) { c = maisD(c, 1); const m = c.slice(0, 7); out[m] = (out[m] || 0) + 1; }
      return out;
    };
    for (let k = 0; k < N; k++) {
      limpar();
      const nA = ent(1, 6);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        animals.push({ id, ident: 'B' + i });
        let data = dataQualquer(), peso = ent(150, 500);
        for (let j = 0; j < ent(0, 5); j++) {
          weighings.push({ id: 'w' + i + '_' + j, animalId: id, date: data, weight: peso, jejum: rnd() < 0.2 });
          data = maisD(data, ent(0, 70));   // zero também: mesma data, caso limite
          peso += ent(-20, 60);
        }
      }
      // --- wOf ---
      for (const an of animals) {
        const ws = wOf(an.id);
        const meu = weighings.filter(w => w.animalId === an.id).slice()
          .sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
        regra('as pesagens de um animal saem em ordem de data e só dele',
          ws.length === meu.length && ws.every((w, i) => w.animalId === an.id && w.date === meu[i].date),
          an.id);
      }
      // --- gmd de um animal ---
      for (const an of animals) {
        const ws = wOf(an.id);
        const tot = gmdTotal(ws);
        if (ws.length < 2) regra('sem duas pesagens não existe GMD', tot === null, String(ws.length));
        else {
          const d = diasEntre(ws[0].date, ws[ws.length - 1].date);
          const esp = d > 0 ? (ws[ws.length - 1].weight - ws[0].weight) / d : null;
          regra('o GMD total é ganho dividido por dias, da primeira à última',
            esp === null ? tot === null : perto(tot, esp), tot + ' vs ' + esp);
        }
        if (ws.length >= 2) {
          const d = diasEntre(ws[ws.length - 2].date, ws[ws.length - 1].date);
          const esp = d > 0 ? (ws[ws.length - 1].weight - ws[ws.length - 2].weight) / d : null;
          const rec = gmdRecent(ws);
          regra('o GMD recente usa só as duas últimas pesagens',
            esp === null ? rec === null : perto(rec, esp), rec + ' vs ' + esp);
          const info = gmdInfo(ws);
          regra('a marca de jejum misturado compara a primeira com a última',
            info.misto === (!!ws[0].jejum !== !!ws[ws.length - 1].jejum), String(info.misto));
          regra('o GMD informado é o mesmo GMD total',
            (info.gmd === null) === (tot === null) && (info.gmd === null || perto(info.gmd, tot)), '');
        }
      }
      // --- dias por mês ---
      const ws0 = animals.length ? wOf(animals[0].id) : [];
      if (ws0.length >= 2) {
        const ini = ws0[0].date, fim = ws0[ws0.length - 1].date, d = diasEntre(ini, fim);
        if (d > 0) {
          const app = diasPorMes(ini, fim), meu = diasPorMesMeu(ini, fim);
          regra('os dias repartidos por mês somam o intervalo inteiro',
            Object.values(app).reduce((x, y) => x + y, 0) === d, ini + '..' + fim);
          regra('e cada mês fica com exatamente os dias que são dele',
            JSON.stringify(app) === JSON.stringify(meu), ini + '..' + fim + ': ' + JSON.stringify(app));
        }
      }
      // --- conta na mão do rebanho inteiro ---
      let kgM = 0, diasM = 0, nM = 0, foraM = 0, kgInt = 0, diasInt = 0, intM = 0, mistM = 0;
      for (const an of animals) {
        const ws = wOf(an.id);
        if (ws.length >= 2) {
          const p = ws[0], u = ws[ws.length - 1], d = diasEntre(p.date, u.date);
          if (d > 0) {
            if (!!p.jejum !== !!u.jejum) foraM++;
            else { kgM += u.weight - p.weight; diasM += d; nM++; }
          }
        }
        for (let i = 1; i < ws.length; i++) {
          const d = diasEntre(ws[i - 1].date, ws[i].date);
          if (!(d > 0)) continue;
          intM++;
          if (!!ws[i - 1].jejum !== !!ws[i].jejum) { mistM++; continue; }
          kgInt += ws[i].weight - ws[i - 1].weight; diasInt += d;
        }
      }
      const ge = gmdGeralRebanho();
      regra('o GMD do rebanho conta os animais com duas pesagens comparáveis',
        ge.n === nM && ge.fora === foraM, ge.n + '/' + ge.fora + ' vs ' + nM + '/' + foraM);
      regra('com os quilos e os dias-animal da conta feita à mão',
        perto(ge.kg, kgM, 1e-9) && ge.dias === diasM, ge.kg + '/' + ge.dias + ' vs ' + kgM + '/' + diasM);
      regra('e o GMD do rebanho é quilo total sobre dia-animal total',
        (ge.gmd === null) === (diasM === 0) && (ge.gmd === null || perto(ge.gmd, kgM / diasM)), String(ge.gmd));
      // --- mês a mês ---
      const gm = gmdPorMes();
      regra('o mês a mês conta os mesmos intervalos e descarta os mesmos mistos',
        gm.intervalos === intM && gm.misturados === mistM,
        gm.intervalos + '/' + gm.misturados + ' vs ' + intM + '/' + mistM);
      regra('e reparte sem perder nem inventar quilo',
        perto(gm.meses.reduce((x, m) => x + m.kg, 0), kgInt, 1e-6),
        gm.meses.reduce((x, m) => x + m.kg, 0) + ' vs ' + kgInt);
      regra('nem dia-animal',
        perto(gm.meses.reduce((x, m) => x + m.dias, 0), diasInt, 1e-9), '');
      regra('nenhum mês sai com dia zero ou GMD impossível',
        gm.meses.every(m => m.dias > 0 && Number.isFinite(m.gmd)), '');
      // --- entre pesagens ---
      const ep = gmdEntrePesagens();
      regra('o GMD entre pesagens conta os mesmos intervalos',
        ep.intervalos === intM && ep.misturados === mistM, '');
      regra('e conserva quilo e dia-animal',
        perto(ep.linhas.reduce((x, l) => x + l.kg, 0), kgInt, 1e-6)
        && ep.linhas.reduce((x, l) => x + l.dias, 0) === diasInt, '');
      const rod = rodadasDePesagem();
      regra('as rodadas de pesagem nunca se sobrepõem',
        rod.every((r, i) => i === 0 || r.ini > rod[i - 1].fim), '');
      regra('e nenhuma data de pesagem fica fora de uma rodada',
        [...new Set(weighings.map(w => w.date))].every(d => rodadaDe(rod, d) >= 0), '');
    }
    return falhas;
  })(${QTD.gmds})`);
  marcar('gmd', f2, QTD.gmds);

  // ================= 3. O QUE A TELA AFIRMA =================
  t.secao(`3. o que a tela afirma sobre o carnê (${QTD.telas.toLocaleString('pt-BR')} carnês, parcela por parcela)`);
  const f3 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 13)}
    const brCurto = i => { const p = i.split('-'); return p[2] + '/' + p[1] + '/' + p[0].slice(2); };
    for (let k = 0; k < N; k++) {
      limpar();
      const c = ent(100, 90000000), total = c / 100, n = ent(2, 12);
      const venc = dataQualquer();
      const ritmo = ['mes', '30', 'livre'][ent(0, 2)];
      const ehEntrada = rnd() < 0.3;
      openTrans('bov', null);
      document.querySelector('input[name="t-type"][value="' + (ehEntrada ? 'entrada' : 'saida') + '"]').checked = true;
      $('t-date').value = '2026-01-05';
      $('t-amount').value = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('t-category').value = 'Ração/insumos';
      $('t-notes').value = 'varre' + k;
      $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
      $('t-venc').value = venc;
      $('t-parcelas').value = String(n); $('t-parcelas').dispatchEvent(new Event('input'));
      $('t-ritmo').value = ritmo; $('t-ritmo').dispatchEvent(new Event('change'));
      if (ritmo === 'livre') {
        let at = venc;
        $('t-datas').querySelectorAll('.pd-data').forEach(el => {
          at = maisD(at, ent(1, 90)); el.value = at;
          // "change" de propósito: é o evento que a caixa de data do iPhone
          // dispara, e a prévia tem de acompanhar ele também.
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      const previa = $('t-parcelas-nota').textContent.replace(/\\s+/g, ' ').trim();
      $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true }));
      closeAllM();
      const partes = bovT.filter(x => x.notes === 'varre' + k).sort((x, y) => x.parcela - y.parcela);
      if (partes.length !== n) { regra('o formulário cria o carnê pedido', false, partes.length + ' vs ' + n); continue; }
      regra('o formulário cria o carnê pedido', true, '');
      regra('a prévia promete o valor de parcela que vai ser criado',
        previa.indexOf(fmtRS(partes[0].amount)) >= 0, previa + ' | criou ' + fmtRS(partes[0].amount));
      if (n <= 6) {
        regra('e promete exatamente as datas que vão ser criadas',
          partes.every(p => previa.indexOf(brCurto(p.venc)) >= 0),
          previa + ' | ' + partes.map(p => brCurto(p.venc)).join(' '));
      }
      // uma parcela paga, para conferir o estado na tela
      partes[ent(0, n - 1)].pago = true;
      for (let i = 0; i < n; i++) {
        const p = partes[i];
        openTrans('bov', p);
        const vAmount = $('t-amount').value, vLido = $('t-amount-lido').textContent;
        const vParc = $('t-parcelas').value, vNota = $('t-parcelas-nota').textContent.trim();
        const vCtx = $('t-context').textContent.replace(/\\s+/g, ' ').trim();
        const vVenc = $('t-venc').value, vPago = $('t-pago').checked;
        const vRot = $('t-venc-rot').textContent;
        const fichas = [].slice.call($('t-context').querySelectorAll('.tc-parc'));
        closeAllM();
        regra('o campo de valor mostra o valor DESTA parcela',
          Math.round(parseNum(vAmount) * 100) === Math.round(p.amount * 100), vAmount + ' vs ' + p.amount);
        regra('a leitura embaixo do campo confere com ele',
          vLido.indexOf(fmtRS(p.amount)) >= 0, vLido + ' vs ' + fmtRS(p.amount));
        // o erro da versão 97, em uma linha
        regra('NENHUMA prévia divide de novo uma parcela que já existe', vNota === '', vNota);
        regra('o campo de parcelas mostra o número real do carnê',
          vParc === String(n), vParc + ' vs ' + n);
        regra('o vencimento mostrado é o desta parcela', vVenc === p.venc, vVenc + ' vs ' + p.venc);
        regra('e se chama vencimento DESTA parcela, não o primeiro',
          vRot.indexOf('desta parcela') >= 0, vRot);
        regra('a marca de pago reflete o estado da parcela', vPago === !!p.pago, vPago + ' vs ' + !!p.pago);
        regra('o alto da tela diz qual parcela é',
          vCtx.indexOf('Parcela ' + p.parcela + ' de ' + n) >= 0, vCtx.slice(0, 60));
        regra('e diz o total da compra',
          vCtx.indexOf(fmtRS(total)) >= 0, vCtx.slice(0, 70) + ' | ' + fmtRS(total));
        regra('com uma ficha por parcela do carnê', fichas.length === n, fichas.length + ' vs ' + n);
        regra('cada ficha com a data da parcela dela',
          fichas.every((f, j) => f.textContent.indexOf(brCurto(partes[j].venc)) >= 0), '');
        regra('as pagas marcadas como pagas',
          fichas.every((f, j) => f.classList.contains('tc-paga') === !!partes[j].pago), '');
        regra('e só a parcela aberta marcada como esta',
          fichas.every((f, j) => f.classList.contains('tc-esta') === (j === i)), '');
        regra('nenhum número impossível na tela do lançamento',
          !/NaN|undefined|Infinity/.test(vCtx + vNota + vLido), vCtx.slice(0, 60));
      }
      // --- o que a LISTA diz sobre as mesmas parcelas ---
      tab = 'bovinos'; seg = 'financeiro'; render();
      document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
      const abertas = partes.filter(p => !p.pago && !ehEntrada);
      const linhas = [].slice.call(document.querySelectorAll('#bfin-apagar .ap-linha[data-trans]'));
      regra('a lista de a pagar tem uma linha por parcela em aberto',
        linhas.length === abertas.length, linhas.length + ' vs ' + abertas.length);
      regra('cada linha com o valor, o número da parcela e a data dela',
        linhas.every(l => {
          const p = partes.filter(x => x.id === l.dataset.trans)[0];
          if (!p) return false;
          const txt = l.textContent.replace(/\\s+/g, ' ');
          return txt.indexOf(fmtRS(p.amount)) >= 0 && txt.indexOf(p.parcela + '/' + p.parcelas) >= 0
            && txt.indexOf(brCurto(p.venc)) >= 0;
        }), (linhas[0] || {}).textContent);
      if (abertas.length) {
        const cab = document.querySelector('#bfin-apagar .dc-num');
        const somaAberta = abertas.reduce((x, p) => x + Math.round(p.amount * 100), 0);
        regra('e o cabeçalho do bloco soma exatamente as parcelas em aberto',
          !!cab && Math.round(parseNum(cab.textContent.replace('R$', '')) * 100) === somaAberta,
          (cab || {}).textContent + ' vs ' + somaAberta);
      }
    }
    return falhas;
  })(${QTD.telas})`);
  marcar('tela', f3, QTD.telas);

  // ================= 4. REGIMES, PERÍODOS E AGREGAÇÃO =================
  t.secao(`4. regimes, períodos e agregação (${QTD.regimes.toLocaleString('pt-BR')} fazendas sorteadas)`);
  const f4 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 29)}
    const CATS = ['Ração/insumos', 'Benfeitorias', 'Equipamentos', 'Mão de obra', 'Venda de gado', 'Outros'];
    const INVEST = ['Benfeitorias', 'Equipamentos', 'Compra de reprodutores'];
    for (let k = 0; k < N; k++) {
      limpar();
      atividades = [{ id: 'sj', nome: 'Soja' }]; extraT = { sj: [] }; recomputarLivros();
      const livros = ['bov', 'av', 'ger', 'sj'];
      const todos = [];
      for (let i = 0; i < ent(0, 14); i++) {
        const b = livros[ent(0, 3)];
        const data = dataQualquer();
        const temVenc = rnd() < 0.5;
        const venc = temVenc ? maisD(data, ent(1, 200)) : null;
        const pago = temVenc && rnd() < 0.5;
        const t2 = { id: 'x' + i, date: data, type: rnd() < 0.35 ? 'entrada' : 'saida',
          amount: ent(1, 5000000) / 100, category: CATS[ent(0, CATS.length - 1)],
          venc: venc, pago: pago, pagoEm: pago && rnd() < 0.7 ? maisD(venc, ent(-5, 20)) : null, notes: '' };
        arrLivro(b).push(t2); todos.push({ t: t2, b: b });
      }
      for (const x of todos) {
        const t2 = x.t;
        regra('entrada é sempre Receita; saída é Custeio salvo as de patrimônio',
          classOf(t2.category, t2.type) === (t2.type === 'entrada' ? 'Receita'
            : (INVEST.indexOf(t2.category) >= 0 ? 'Investimento' : 'Custeio')),
          t2.category + '/' + t2.type);
        regra('pendente é ter vencimento e não estar liquidado',
          pendente(t2) === (!!t2.venc && !t2.pago), t2.venc + '/' + t2.pago);
        regra('a pagar é pendente de saída; a receber é pendente de entrada',
          emAberto(t2) === (!!t2.venc && !t2.pago && t2.type === 'saida')
          && aReceber(t2) === (!!t2.venc && !t2.pago && t2.type === 'entrada'), '');
        regra('por competência vale a data do lançamento',
          dataDoRegime(t2, 'competencia') === t2.date, '');
        regra('por vencimento vale a data de vencer, ou a do lançamento quando é à vista',
          dataDoRegime(t2, 'vencimento') === (t2.venc || t2.date), '');
        regra('por caixa, o que não foi liquidado não existe; o resto vale o dia em que passou',
          dataDoRegime(t2, 'caixa') === ((t2.venc && !t2.pago) ? null : (t2.venc ? (t2.pagoEm || t2.venc) : t2.date)), '');
        const mes = t2.date.slice(0, 7), ano = t2.date.slice(0, 4);
        regra('o filtro de mês e de ano compara em texto, sem fuso',
          inPeriod(t2.date, 'all') && inPeriod(t2.date, mes) && inPeriod(t2.date, ano)
          && !inPeriod(null, mes), t2.date);
      }
      const regimes = ['competencia', 'caixa', 'vencimento'];
      const periodos = ['all', '2026-05', '2026'];
      for (let ri = 0; ri < regimes.length; ri++) {
        for (let pi = 0; pi < periodos.length; pi++) {
          const regime = regimes[ri], periodo = periodos[pi];
          const R = resumoFazenda(periodo, regime, '', null);
          const dentro = todos.filter(x => {
            const d = dataDoRegime(x.t, regime);
            return d && inPeriod(d, periodo);
          });
          const rec = dentro.filter(x => x.t.type === 'entrada').reduce((s2, x) => s2 + cent(x.t.amount), 0);
          const cus = dentro.filter(x => x.t.type === 'saida').reduce((s2, x) => s2 + cent(x.t.amount), 0);
          regra('o resumo soma exatamente o que o regime e o período deixam entrar',
            cent(R.receitas) === rec && cent(R.custos) === cus && R.n === dentro.length,
            regime + '/' + periodo + ': ' + cent(R.receitas) + '/' + cent(R.custos) + ' vs ' + rec + '/' + cus);
          regra('o saldo é entradas menos saídas e o movimento é a soma das duas',
            cent(R.saldo) === rec - cus && cent(R.movimento) === rec + cus, regime + '/' + periodo);
          regra('as três naturezas somam o movimento, sem sobra nem falta',
            ['Receita', 'Custeio', 'Investimento'].reduce((s2, c2) => s2 + cent(R.classes[c2] || 0), 0) === rec + cus,
            regime + '/' + periodo);
          regra('as atividades somam o total',
            R.atividades.reduce((s2, x) => s2 + cent(x.entrada), 0) === rec
            && R.atividades.reduce((s2, x) => s2 + cent(x.saida), 0) === cus, regime + '/' + periodo);
          regra('as categorias somam o movimento',
            R.categorias.reduce((s2, par) => s2 + cent(par[1]), 0) === rec + cus, regime + '/' + periodo);
        }
      }
      const R0 = resumoFazenda('all', 'competencia', '', null);
      const ap = todos.filter(x => x.t.venc && !x.t.pago && x.t.type === 'saida');
      const ar = todos.filter(x => x.t.venc && !x.t.pago && x.t.type === 'entrada');
      regra('as contas a pagar e a receber são as que ficaram em aberto',
        R0.contas.length === ap.length && R0.recebimentos.length === ar.length,
        R0.contas.length + '/' + R0.recebimentos.length + ' vs ' + ap.length + '/' + ar.length);
      regra('e os totais delas batem no centavo',
        cent(R0.aPagarTotal) === ap.reduce((s2, x) => s2 + cent(x.t.amount), 0)
        && cent(R0.aReceberTotal) === ar.reduce((s2, x) => s2 + cent(x.t.amount), 0), '');
      regra('as contas saem em ordem de vencimento',
        R0.contas.every((c2, i) => i === 0 || c2.t.venc >= R0.contas[i - 1].t.venc), '');
      // a soma dos escopos é o escopo inteiro
      const partes2 = LIVROS.map(b => resumoFazenda('all', 'competencia', '', [b]));
      regra('o resultado da fazenda é a soma do resultado de cada atividade',
        partes2.reduce((s2, r) => s2 + cent(r.custos), 0) === cent(R0.custos)
        && partes2.reduce((s2, r) => s2 + cent(r.receitas), 0) === cent(R0.receitas)
        && partes2.reduce((s2, r) => s2 + r.n, 0) === R0.n, '');
    }
    return falhas;
  })(${QTD.regimes})`);
  marcar('regimes', f4, QTD.regimes);

  // ================= 5. ARROBA, CUSTO, PROJEÇÃO E NÚMERO =================
  t.secao(`5. arroba, custo, projeção e leitura de número (${QTD.arrobas.toLocaleString('pt-BR')} sorteios)`);
  const f5 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 31)}
    for (let k = 0; k < N; k++) {
      const kg = dec(1, 2000, 1), rend = dec(30, 70, 1);
      regra('a arroba é peso vezes rendimento dividido por quinze',
        perto(arrobasDe(kg, rend), kg * (rend / 100) / 15), kg + '/' + rend);
      const geral = dec(40, 60, 0);
      const vals = [null, undefined, NaN, 0, -5, 101, 52];
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        const r = rendimentosDe({ rendCompra: v, rendVenda: v }, geral);
        const esp = (Number.isFinite(v) && v > 0 && v <= 100) ? v : geral;
        regra('rendimento inválido cai no geral, em vez de virar zero',
          r.rendCompra === esp && r.rendVenda === esp, v + ' com geral ' + geral);
      }
      // preço da arroba: razão de totais, nunca média de razões
      limpar();
      settings.yield = geral;
      custoParams = Object.assign({}, CUSTO_VAZIO);
      let somaR = 0, somaArr = 0, naConta = 0, fora = 0;
      for (let i = 0; i < ent(0, 5); i++) {
        const vendido = rnd() < 0.8, morto = !vendido && rnd() < 0.3;
        const comPeso = rnd() < 0.7, comPreco = rnd() < 0.8;
        const an = { id: 'a' + i, ident: 'B' + i, sold: vendido, dead: morto,
          soldWeight: comPeso ? dec(200, 700, 1) : null, soldPrice: comPreco ? dec(100, 20000, 2) : null };
        animals.push(an);
        if (an.sold && !an.dead) {
          if (comPeso && comPreco) { naConta++; somaR += an.soldPrice; somaArr += an.soldWeight * (geral / 100) / 15; }
          else fora++;
        }
      }
      const pa = precoArrobaVenda();
      regra('só entra na média da arroba a venda que tem peso E preço',
        pa.n === naConta && pa.foraDaConta === fora, pa.n + '/' + pa.foraDaConta + ' vs ' + naConta + '/' + fora);
      regra('o preço da arroba é o total recebido sobre o total de arrobas',
        perto(pa.total, somaR, 1e-6) && perto(pa.arrobas, somaArr, 1e-6)
        && ((pa.porArroba === null) === !(somaArr > 0))
        && (pa.porArroba === null || perto(pa.porArroba, somaR / somaArr, 1e-6)),
        pa.porArroba + ' vs ' + (somaArr > 0 ? somaR / somaArr : null));
      // projeção
      limpar();
      const ani = { id: 'p1' }; animals.push(ani);
      const base = dec(150, 600, 1), dataU = dataQualquer();
      weighings.push({ id: 'w1', animalId: 'p1', date: dataU, weight: base, jejum: false });
      const gmdSim = dec(0.1, 2.5, 3);
      const offs = [-10, 0, 1, 37, 200];
      for (let i = 0; i < offs.length; i++) {
        const pr = projetar(ani, gmdSim, maisD(dataU, offs[i]));
        const diasEsp = Math.max(0, offs[i]);
        regra('a projeção parte da última pesagem e nunca anda para trás',
          !!pr && pr.dias === diasEsp && perto(pr.peso, base + gmdSim * diasEsp, 1e-6)
          && pr.base === base && perto(pr.ganho, pr.peso - base),
          'offset ' + offs[i] + ': ' + JSON.stringify(pr));
      }
      regra('sem GMD informado não há projeção', projetar(ani, NaN, dataU) === null, '');
      weighings = [];
      regra('sem pesagem não há projeção', projetar(ani, 1, dataU) === null, '');
      // custo da arroba
      custoParams = Object.assign({}, CUSTO_VAZIO, {
        gmd: dec(0.2, 2, 3), salPct: dec(0, 1, 2), salPreco: dec(0.5, 10, 2),
        sanidade: dec(0, 200, 2), mo: dec(0, 500, 2), terra: dec(0, 800, 2),
        rend: dec(40, 60, 0), pesoCompra: dec(150, 400, 0), pesoVenda: dec(401, 700, 0),
        precoArroba: dec(200, 400, 2) });
      const c = calcCusto();
      regra('o custo do dia é a soma das quatro parcelas dele',
        perto(c.custoDia, c.salDia + c.sanDia + c.moDia + c.terraDia), String(c.custoDia));
      regra('o custo da arroba é custo do dia sobre arroba do dia',
        c.custoArroba == null || perto(c.custoArroba, c.custoDia / c.arrobaDia), String(c.custoArroba));
      regra('o peso médio é a média das duas pontas',
        perto(c.pesoMedio, (custoParams.pesoCompra + custoParams.pesoVenda) / 2), String(c.pesoMedio));
      regra('nenhum número do custo sai impossível',
        [c.custoDia, c.arrobaDia, c.custoArroba].every(v => v == null || Number.isFinite(v)), JSON.stringify(c));
      const sim = calcSimulacao(c);
      regra('nenhum número da simulação sai impossível',
        !sim || Object.keys(sim).every(key => typeof sim[key] !== 'number' || Number.isFinite(sim[key])),
        JSON.stringify(sim));
      // correção de valor lido mil vezes menor
      const v2 = dec(0.01, 999.999, 3), mil = vezesMil(v2);
      regra('multiplicar por mil não deixa centavo torto',
        perto(mil, Math.round(v2 * 100000) / 100) && Math.abs(mil * 100 - Math.round(mil * 100)) < 1e-9,
        v2 + ' -> ' + mil);
      // número digitado
      const num = dec(-99999, 99999, 2);
      regra('número escrito e lido de volta é o mesmo número',
        perto(parseNum(numParaCampo(num)), num), num + ' -> ' + numParaCampo(num));
    }
    return falhas;
  })(${QTD.arrobas})`);
  marcar('arroba', f5, QTD.arrobas);

  // ================= 6. CAMINHOS QUE GERAM DINHEIRO SOZINHOS =================
  t.secao(`6. venda de animal, estoque, busca e atividades (${QTD.caminhos.toLocaleString('pt-BR')} rodadas)`);
  const f6 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 37)}
    window.confirm = function () { return true; };
    const PALAVRAS = ['milho', 'farelo', 'vacina', 'frete'];
    for (let k = 0; k < N; k++) {
      limpar();
      // --- venda de animal vira lançamento, e só um ---
      const preco = dec(500, 30000, 2);
      const an = { id: 'v1', ident: 'V1', cat: 'Boi' };
      animals.push(an);
      openAnimal(an);
      $('an-sold').checked = true; $('an-sold').dispatchEvent(new Event('change'));
      $('an-sold-date').value = '2026-05-20';
      $('an-sold-weight').value = String(dec(300, 600, 1));
      $('an-sold-price').value = preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('form-animal').dispatchEvent(new Event('submit', { cancelable: true }));
      closeAllM();
      const g = bovT.filter(x => x.lock === 'animal');
      regra('vender um animal com preço gera UM lançamento de entrada',
        g.length === 1 && g[0].type === 'entrada' && cent(g[0].amount) === cent(preco)
        && g[0].date === '2026-05-20', g.length + ' / ' + (g[0] || {}).amount + ' vs ' + preco);
      regra('e o animal guarda o vínculo com ele',
        (animals.filter(x => x.id === 'v1')[0] || {}).linkTrans === (g[0] || {}).id, '');
      const novo = dec(500, 30000, 2);
      openAnimal(animals.filter(x => x.id === 'v1')[0]);
      $('an-sold-price').value = novo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('form-animal').dispatchEvent(new Event('submit', { cancelable: true }));
      closeAllM();
      const g2 = bovT.filter(x => x.lock === 'animal');
      regra('corrigir o preço da venda corrige o lançamento, sem criar outro',
        g2.length === 1 && cent(g2[0].amount) === cent(novo), g2.length + ' / ' + (g2[0] || {}).amount);
      openAnimal(animals.filter(x => x.id === 'v1')[0]);
      $('an-sold').checked = false; $('an-sold').dispatchEvent(new Event('change'));
      $('form-animal').dispatchEvent(new Event('submit', { cancelable: true }));
      closeAllM();
      regra('desmarcar a venda tira o lançamento e o vínculo',
        !bovT.some(x => x.lock === 'animal')
        && !(animals.filter(x => x.id === 'v1')[0] || {}).linkTrans, '');

      // --- estoque ---
      limpar();
      items.push({ id: 'i1', name: 'X', unit: 'kg' });
      let saldo = 0, qComp = 0, vComp = 0;
      for (let i = 0; i < ent(0, 8); i++) {
        const tipo = rnd() < 0.6 ? 'entrada' : 'saida';
        const q = ent(1, 1000), comCusto = tipo === 'entrada' && rnd() < 0.8;
        const unitCost = comCusto ? ent(1, 20000) / 100 : undefined;
        moves.push({ id: 'm' + i, itemId: 'i1', date: '2026-03-0' + ((i % 9) + 1), type: tipo, qty: q, unitCost: unitCost });
        saldo += tipo === 'entrada' ? q : -q;
        if (comCusto) { qComp += q; vComp += q * unitCost; }
      }
      regra('o saldo do estoque é entradas menos saídas',
        perto(qtyOf('i1'), saldo), qtyOf('i1') + ' vs ' + saldo);
      const med = avgCostOf('i1'), medEsp = qComp ? vComp / qComp : null;
      regra('o custo médio é valor comprado sobre quantidade comprada',
        (med === null) === (medEsp === null) && (med === null || perto(med, medEsp)), med + ' vs ' + medEsp);

      // --- busca aplicada aos totais ---
      limpar();
      const todos = [];
      for (let i = 0; i < ent(2, 12); i++) {
        const b = ['bov', 'av', 'ger'][ent(0, 2)];
        const t2 = { id: 'b' + i, date: dataQualquer(), type: rnd() < 0.4 ? 'entrada' : 'saida',
          amount: dec(10, 20000, 2), category: 'Outros', notes: PALAVRAS[ent(0, 3)], venc: null, pago: false };
        arrLivro(b).push(t2); todos.push({ t: t2, b: b });
      }
      const termo = PALAVRAS[ent(0, 3)];
      const R = resumoFazenda('all', 'competencia', termo, null);
      const dentro = todos.filter(x => casaBusca(x.t, termo, NOME_LIVRO[x.b]));
      regra('a busca filtra o resumo pelos lançamentos que casam com ela',
        R.n === dentro.length
        && cent(R.receitas) === dentro.filter(x => x.t.type === 'entrada').reduce((s2, x) => s2 + cent(x.t.amount), 0)
        && cent(R.custos) === dentro.filter(x => x.t.type === 'saida').reduce((s2, x) => s2 + cent(x.t.amount), 0),
        termo + ': ' + R.n + ' vs ' + dentro.length);
      regra('busca vazia devolve a fazenda inteira',
        resumoFazenda('all', 'competencia', '', null).n === todos.length, '');

      // --- atividades criadas pelo dono ---
      limpar();
      atividades = [{ id: 'sj', nome: 'Soja' }, { id: 'tg', nome: 'Trigo' }];
      extraT = { sj: [], tg: [] }; recomputarLivros();
      regra('as atividades entram na lista de livros, na ordem',
        LIVROS.join() === 'bov,av,ger,sj,tg', LIVROS.join());
      regra('e cada uma tem a coleção própria na nuvem',
        colLivro('sj') === 'at_sj' && colLivro('tg') === 'at_tg', colLivro('sj'));
      let somaSj = 0;
      const nSj = ent(1, 6);
      for (let i = 0; i < nSj; i++) {
        const v = dec(10, 9000, 2);
        extraT.sj.push({ id: 's' + i, date: '2026-04-1' + (i % 9), type: 'saida', amount: v,
          category: 'Soja', venc: null, pago: false, notes: '' });
        somaSj += cent(v);
      }
      const Rt = resumoFazenda('all', 'competencia', '', null);
      const linhaSj = Rt.atividades.filter(x => x.nome === 'Soja')[0];
      regra('o resumo traz a atividade criada, com a soma dela',
        !!linhaSj && cent(linhaSj.saida) === somaSj, (linhaSj || {}).saida + ' vs ' + somaSj / 100);
      const Rso = resumoFazenda('all', 'competencia', '', ['sj']);
      regra('e o escopo de uma atividade só traz ela',
        cent(Rso.custos) === somaSj && Rso.n === nSj, cent(Rso.custos) + ' vs ' + somaSj);
    }
    return falhas;
  })(${QTD.caminhos})`);
  marcar('caminhos', f6, QTD.caminhos);

  // ================= 7. IDENTIDADE DOS REGISTROS =================
  // Esta família nasceu de um furo que só apareceu em 200.000 carnês: num de
  // vinte parcelas, DUAS nasceram com o mesmo id. O gerador antigo era carimbo
  // de tempo mais cinco caracteres de Math.random, e um lote de mil ids no
  // mesmo milissegundo tinha 0,9% de chance de conter dois iguais — que é
  // exatamente o que importar uma planilha de 500 pesagens faz.
  //
  // Id repetido não dá erro em lugar nenhum: a gravação é por id, então o
  // segundo registro sobrescreve o primeiro na nuvem e a pesagem some sem
  // rastro. Por isso a regra aqui é absoluta, e o volume é alto de propósito.
  t.secao(`7. identidade dos registros (${IDS.toLocaleString('pt-BR')} ids gerados)`);
  const f7 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 41)}
    const vistos = new Set();
    let repetido = '';
    for (let i = 0; i < N; i++) {
      const u = uid();
      if (vistos.has(u) && !repetido) repetido = u;
      vistos.add(u);
    }
    regra('nenhum id se repete, em nenhum volume', repetido === '', repetido);
    regra('o id sai sempre com corpo suficiente para separar registros',
      uid().length >= 16, String(uid()));
    // O lote apertado é o caso real: importação de planilha e restauração
    // criam centenas de registros no mesmo milissegundo.
    let loteRepetido = '';
    for (let r = 0; r < 200; r++) {
      const lote = new Set();
      for (let i = 0; i < 1000; i++) {
        const u = uid();
        if (lote.has(u) && !loteRepetido) loteRepetido = u;
        lote.add(u);
      }
    }
    regra('nem dentro de um lote de mil criados no mesmo instante',
      loteRepetido === '', loteRepetido);
    // E o carnê, que é o lote mais comum do dia a dia.
    let carneRepetido = '';
    for (let r = 0; r < 2000; r++) {
      const n = ent(2, 36);
      const partes = montarParcelas({ base: { date: '2026-01-01', type: 'saida', amount: 1000,
        category: 'X', notes: '' }, total: 1000, venc: '2026-02-01', n: n, grupo: 'g', ritmo: 'mes' });
      if (new Set(partes.map(p => p.id)).size !== n && !carneRepetido) carneRepetido = 'carnê de ' + n;
    }
    regra('nem entre as parcelas de um mesmo carnê', carneRepetido === '', carneRepetido);
    return falhas;
  })(${IDS})`);
  marcar('ids', f7, IDS);

  t.conferir('nenhum erro de JavaScript em toda a varredura',
    errosJS.length === 0, errosJS.slice(0, 3).join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
