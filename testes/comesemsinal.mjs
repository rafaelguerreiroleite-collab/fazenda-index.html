// COM SINAL E SEM SINAL: O MESMO LANÇAMENTO, O MESMO NÚMERO.
//
// Pedido do dono, em quatro palavras: cálculos, lançamentos, on-line, off-line.
//
// As baterias que existiam cobriam os quatro, mas nunca os quatro JUNTOS:
// · salvamento.mjs confere que nada se PERDE sem sinal — presença, não número;
// · varreduratotal.mjs confere os NÚMEROS — sempre com a nuvem respondendo.
//
// Ninguém conferia se a conta dá o mesmo resultado nos dois estados. E é aí que
// mora o defeito que mais machuca no campo: o dono lança a semana inteira no
// pasto, sem sinal, confere o saldo no celular, e quando a internet volta o
// número MUDA. Nessa hora não há como saber qual dos dois estava certo, e todas
// as decisões tomadas na semana foram tomadas sobre o número errado.
//
// Então a bateria faz o mesmo roteiro DUAS VEZES, com os mesmos valores, nos
// dois estados, e cobra:
//
//   1. os lançamentos nascem em igual número — e no número que o roteiro pediu,
//      contado por fora, sem perguntar ao aplicativo;
//   2. TODO número derivado é idêntico nos dois estados — os três regimes, os
//      saldos por livro, a pagar, a receber, naturezas, categorias, estoque,
//      custo médio, cabeças de gado, GMD, e as cinco exportações inteiras;
//   3. a cópia local do aparelho é a mesma nos dois estados;
//   4. sem sinal, a caixa de saída tem exatamente um registro por gravação;
//   5. quando o sinal volta, a fila esvazia e a NUVEM FICA COM O MESMO ESTADO
//      que receberia se nunca tivesse faltado sinal;
//   6. e nenhum número muda por causa do envio: sincronizar não é recalcular.
//
// O roteiro passa pelas portas de verdade — formulário de animal, pesagem,
// lançamento à vista, a prazo, carnê nos três ritmos, baixa, item de estoque,
// compra parcelada de insumo, consumo, movimento do rebanho, atividade nova,
// correção e exclusão — porque o furo costuma estar numa porta que esqueceu de
// chamar quem grava, não em quem grava.
import { chromium } from 'playwright';
import { servir, placar, fingirHoje } from './apoio.mjs';
import { existsSync } from 'node:fs';

const CHROMIUM = '/opt/pw-browsers/chromium';
const RODADAS = Number(process.env.RODADAS || 8);
const SEMENTE = Number(process.env.SEMENTE_SINAL || 20261014);

// ===== o roteiro, idêntico nos dois estados =====
// Devolve o que ele PEDIU, contado aqui dentro, sem perguntar ao aplicativo.
// É essa contagem que denuncia lançamento que não nasceu e lançamento que
// nasceu duas vezes.
const ROTEIRO = (semente, n) => `(function (N) {
  let _s = ${semente} >>> 0;
  const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const dia = (m, d) => '2026-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const moeda = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Nenhum aviso pode travar o roteiro: duplicidade, carência e carnê inteiro
  // perguntam, e aqui a resposta é sempre sim — o que se está conferindo é a
  // conta, não o aviso (os avisos têm bateria própria).
  window.confirm = function () { return true; };
  window.alert = function () {};
  const sub = f => $(f).dispatchEvent(new Event('submit', { cancelable: true }));
  const marcar = (id, v) => { $(id).checked = v; $(id).dispatchEvent(new Event('change')); };
  const esperado = { trans: 0, animals: 0, weighings: 0, items: 0, moves: 0, rebmov: 0, atividades: 0 };
  const CATS = ['Ração/insumos', 'Mão de obra', 'Benfeitorias', 'Combustível', 'Venda de gado'];
  const nps = [];   // quantas parcelas o carnê do insumo de cada rodada teve
  // Porta que não é tocada é teste que passa sem conferir nada. Esta conta
  // prova que o botão "Pagar" da tela foi encontrado e clicado em toda rodada.
  const portas = { pagarBotao: 0 };

  for (let k = 0; k < N; k++) {
    const mes = 1 + (k % 9);

    // ---- item de estoque ----
    openItem(null);
    $('i-name').value = 'Insumo ' + k; $('i-unit').value = 'kg';
    $('i-min').value = '50'; $('i-carencia').value = '';
    $('i-notes').value = 'roteiro';
    sub('form-item'); closeAllM();
    esperado.items++;
    const item = items.filter(x => x.name === 'Insumo ' + k)[0];

    // ---- compra do insumo, parcelada, lançada no financeiro ----
    const np = ent(2, 4);
    nps.push(np);
    const ritmo = ['mes', '30', 'livre'][k % 3];
    openMove(item.id, 'entrada', null);
    $('m-date').value = dia(mes, 3);
    $('m-qty').value = String(ent(50, 400));
    $('m-cost').value = moeda(ent(150, 900));
    marcar('m-postfin', true);
    marcar('m-prazo', true);
    $('m-venc').value = dia(mes + 1, 10);
    $('m-parcelas').value = String(np);
    $('m-parcelas').dispatchEvent(new Event('input'));
    $('m-ritmo').value = ritmo; $('m-ritmo').dispatchEvent(new Event('change'));
    if (ritmo === 'livre') {
      let at = dia(mes + 1, 10);
      [].slice.call($('m-datas').querySelectorAll('.pd-data')).forEach(function (el) {
        at = (function (s, d) { const p = s.split('-').map(Number);
          const x = new Date(Date.UTC(p[0], p[1] - 1, p[2] + d));
          return x.toISOString().slice(0, 10); })(at, ent(20, 45));
        el.value = at; el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    $('m-notes').value = 'compra ' + k;
    sub('form-move'); closeAllM();
    esperado.moves++; esperado.trans += np;

    // ---- consumo do insumo (não gera dinheiro) ----
    openMove(item.id, 'saida', null);
    $('m-date').value = dia(mes, 20);
    $('m-qty').value = String(ent(5, 40));
    $('m-notes').value = 'consumo ' + k;
    sub('form-move'); closeAllM();
    esperado.moves++;

    // ---- animal, com peso de entrada ----
    openAnimal(null);
    $('an-ident').value = '90' + k;
    $('an-cat').value = 'Garrote'; $('an-raca').value = 'Nelore';
    $('an-entry-date').value = dia(1, 10);
    $('an-entry-weight').value = String(ent(240, 300));
    sub('form-animal'); closeAllM();
    esperado.animals++; esperado.weighings++;
    const bicho = animals.filter(x => x.ident === '90' + k)[0];

    // ---- pesagem ----
    openWeighing(bicho.id, null);
    $('w-date').value = dia(mes + 2, 15);
    $('w-weight').value = String(ent(320, 460));
    $('w-notes').value = 'pesagem ' + k;
    sub('form-weighing'); closeAllM();
    esperado.weighings++;

    // ---- venda do animal: nasce lançamento sozinho ----
    openAnimal(bicho);
    marcar('an-sold', true);
    $('an-sold-date').value = dia(mes + 3, 5);
    $('an-sold-weight').value = String(ent(440, 520));
    $('an-sold-price').value = moeda(ent(600000, 950000));
    sub('form-animal'); closeAllM();
    esperado.trans++;

    // ---- lançamento à vista ----
    openTrans('bov', null);
    marcarRadio('t-type', k % 4 === 0 ? 'entrada' : 'saida', 'saida');
    $('t-date').value = dia(mes, 7);
    $('t-amount').value = moeda(ent(5000, 400000));
    $('t-category').value = CATS[k % CATS.length];
    $('t-notes').value = 'vista ' + k;
    sub('form-transaction'); closeAllM();
    esperado.trans++;

    // ---- lançamento a prazo, uma parcela ----
    openTrans('av', null);
    marcarRadio('t-type', 'saida', 'saida');
    $('t-date').value = dia(mes, 8);
    $('t-amount').value = moeda(ent(9000, 120000));
    $('t-category').value = 'Ração/insumos';
    $('t-notes').value = 'prazo ' + k;
    marcar('t-prazo', true);
    $('t-venc').value = dia(mes + 1, 28);
    sub('form-transaction'); closeAllM();
    esperado.trans++;

    // ---- carnê no livro Geral ----
    const np2 = ent(2, 5);
    openTrans('ger', null);
    marcarRadio('t-type', 'saida', 'saida');
    $('t-date').value = dia(mes, 9);
    $('t-amount').value = moeda(ent(80000, 900000));
    $('t-category').value = 'Benfeitorias';
    $('t-notes').value = 'carne ' + k;
    marcar('t-prazo', true);
    $('t-venc').value = dia(mes + 1, 15);
    $('t-parcelas').value = String(np2);
    $('t-parcelas').dispatchEvent(new Event('input'));
    sub('form-transaction'); closeAllM();
    esperado.trans += np2;

    // ---- baixa de uma parcela do carnê, pelo formulário ----
    const parcela = gerT.filter(x => x.notes === 'carne ' + k).sort((a, b) => a.parcela - b.parcela)[0];
    openTrans('ger', parcela);
    marcar('t-pago', true);
    $('t-pago-em').value = dia(mes + 1, 16);
    sub('form-transaction'); closeAllM();

    // ---- e outra pelo botão "Pagar" do bloco A pagar ----
    // É uma porta DIFERENTE: grava o pagamento, mexe na memória do calendário
    // e desenha de novo. Pela tela, como o dono faz.
    const outra = gerT.filter(x => x.notes === 'carne ' + k && !x.pago)
      .sort((a, b) => a.parcela - b.parcela)[0];
    if (outra) {
      tab = 'fazenda'; render();
      document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
      const botao = document.querySelector('[data-pagar="' + outra.id + '"]');
      if (botao) { botao.click(); portas.pagarBotao++; }
    }

    // ---- movimento do rebanho, com dinheiro ----
    openRebmov(null);
    $('rm-tipo').value = 'compra'; sincronizarRebmov();
    $('rm-date').value = dia(mes, 12);
    $('rm-qtd').value = String(ent(10, 60));
    $('rm-cat').value = 'Bezerro';
    $('rm-peso').value = String(ent(180, 240));
    $('rm-valor').value = moeda(ent(1500000, 4000000));
    marcar('rm-postfin', true);
    $('rm-notes').value = 'lote ' + k;
    sub('form-rebmov'); closeAllM();
    esperado.rebmov++; esperado.trans++;

    // ---- atividade nova e um lançamento dentro dela ----
    openM('modal-atividades');
    $('at-nome').value = 'Lavoura ' + k;
    $('at-criar').click(); closeAllM();
    esperado.atividades++;
    const ativ = atividades.filter(x => x.nome === 'Lavoura ' + k)[0];
    openTrans(ativ.id, null);
    marcarRadio('t-type', 'entrada', 'saida');
    $('t-date').value = dia(mes, 18);
    $('t-amount').value = moeda(ent(100000, 700000));
    $('t-category').value = 'Venda de produção';
    $('t-notes').value = 'ativ ' + k;
    sub('form-transaction'); closeAllM();
    esperado.trans++;

    // ---- correção de valor: não cria nem apaga nada ----
    const corrigir = bovT.filter(x => x.notes === 'vista ' + k)[0];
    openTrans('bov', corrigir);
    $('t-amount').value = moeda(ent(5000, 400000));
    sub('form-transaction'); closeAllM();

    // ---- exclusão: o a prazo dos aviários sai ----
    const apagar = avT.filter(x => x.notes === 'prazo ' + k)[0];
    openTrans('av', apagar);
    $('btn-delete-transaction').click(); closeAllM();
    esperado.trans--;
  }
  // o rendimento de carcaça também é gravação, e ele mexe em arroba, em custo
  // e no relatório: entra no roteiro pela porta dele.
  $('set-yield').value = '53';
  $('set-yield').dispatchEvent(new Event('change'));

  // ---- operações em MASSA ----
  // Estas não passam pelo caminho de uma gravação só: vão em lote, e o lote
  // tem regra PRÓPRIA quando não há sinal (ele só cai na fila ao falhar, para
  // não estourar a memória do aparelho com milhares de registros). É o pedaço
  // do aplicativo onde com sinal e sem sinal mais se afastam por dentro — e
  // por isso o que sai deles tem de ser conferido lado a lado.

  // exclusão em cascata: o item leva as movimentações e as parcelas da compra
  openItem(items[0]);
  $('btn-delete-item').click(); closeAllM();
  esperado.items--; esperado.moves -= 2; esperado.trans -= nps[0];

  // importação de planilha: dois animais novos, uma pesagem cada
  pendingRows = [
    { ident: '7001', date: '2026-08-01', peso: 288 },
    { ident: '7002', date: '2026-08-02', peso: 301 }
  ];
  $('btn-confirm-import').click();
  esperado.animals += 2; esperado.weighings += 2;
  return { conta: esperado, portas: portas };
})(${n})`;

// ===== o retrato: tudo o que o aplicativo AFIRMA, sem um único id =====
// Os ids nascem do instante e de sorteio, então são diferentes nas duas
// passagens de propósito — comparar id a id não diria nada. O que tem de bater
// é o que o dono lê na tela e o que vai no arquivo.
const RETRATO = `window.retrato = () => {
  const num = v => Number.isFinite(v) ? v.toFixed(2) : '—';
  const REGIMES = ['competencia', 'caixa', 'vencimento'];
  const linhas = LIVROS.flatMap(b => arrLivro(b).map(t => [
    NOME_LIVRO[b], soData(t.date), t.type, num(t.amount), t.category || '',
    ehCarne(t) ? t.parcela + '/' + t.parcelas : '', soData(t.venc),
    t.pago ? 'pago' : 'aberto', soData(t.pagoEm), t.notes || '', t.lock || ''
  ].join('|'))).sort();
  const geral = REGIMES.map(r => {
    const R = resumoFazenda('all', r, '', null);
    return [r, R.n, num(R.receitas), num(R.custos), num(R.saldo), num(R.movimento),
      num(R.aPagarTotal), num(R.aReceberTotal), R.contas.length, R.recebimentos.length,
      Object.keys(R.classes).sort().map(c => c + '=' + num(R.classes[c])).join(','),
      R.atividades.map(a => a.nome + ':' + num(a.entrada) + ':' + num(a.saida) + ':' + a.n).join(','),
      R.categorias.map(c => c[0] + '=' + num(c[1])).join(',')].join('|');
  });
  const porLivro = LIVROS.flatMap(b => REGIMES.map(r => {
    const R = resumoFazenda('all', r, '', [b]);
    return [NOME_LIVRO[b], r, R.n, num(R.receitas), num(R.custos), num(R.saldo),
      num(R.aPagarTotal), num(R.aReceberTotal)].join('|');
  })).sort();
  // os períodos que a tela oferece, e a soma dentro de cada um. Os meses e os
  // anos oferecidos mudam com o regime, e é a mesma lista do seletor.
  const periodos = REGIMES.flatMap(r => {
    const p = periodosComLancamento(LIVROS.flatMap(b => arrLivro(b)), r);
    const todos = ['this-month', 'last-month', 'this-year', 'all']
      .concat(p.meses).concat(p.anos);
    return todos.map(per => {
      const R = resumoFazenda(per, r, '', null);
      return [r, per, R.n, num(R.receitas), num(R.custos), num(R.saldo)].join('|');
    });
  }).sort();
  const estoque = items.map(i => [i.name, i.unit, num(qtyOf(i.id)),
    avgCostOf(i.id) == null ? '—' : num(avgCostOf(i.id)),
    moves.filter(m => m.itemId === i.id).length].join('|')).sort();
  const bichos = animals.map(a => {
    const g = gmdInfo(wOf(a.id));
    return [a.ident, a.cat || '', soData(a.entryDate), num(a.entryWeight),
      a.sold ? 'vendido' : (a.dead ? 'morto' : 'ativo'), num(a.soldPrice),
      wOf(a.id).length, g && Number.isFinite(g.gmd) ? g.gmd.toFixed(4) : '—'].join('|');
  }).sort();
  const reb = (() => { const s = saldoRebanho();
    return ['saldo=' + s.saldo, 'entradas=' + s.entradas, 'saidasLote=' + s.saidasLote,
      'vendidos=' + s.vendidosComBrinco, 'mortos=' + s.mortosComBrinco,
      'comBrinco=' + s.comBrinco, 'semBrinco=' + s.semBrinco].join('|'); })();
  const ge = gmdGeralRebanho();
  const gmd = ['gmd=' + (ge.gmd == null ? '—' : ge.gmd.toFixed(4)), 'kg=' + num(ge.kg),
    'dias=' + ge.dias, 'n=' + ge.n, 'fora=' + ge.fora].join('|');
  // as exportações inteiras, byte a byte: é o arquivo que vai para o contador
  const arquivos = [];
  const origDown = window.download;
  window.download = function (nome, corpo) { arquivos.push(String(corpo)); };
  try {
    exportFinTudo();
    exportRelatorio('bov'); exportRelatorio('av'); exportRelatorio('fazenda');
    $('menu-exp-pes').click(); $('menu-exp-estoque').click(); $('menu-exp-rebmov').click();
  } finally { window.download = origDown; }
  closeAllM();
  return {
    contagem: { trans: LIVROS.reduce((s, b) => s + arrLivro(b).length, 0),
      animals: animals.length, weighings: weighings.length, items: items.length,
      moves: moves.length, rebmov: rebmov.length, atividades: atividades.length },
    linhas, geral, porLivro, periodos, estoque, bichos, reb, gmd,
    rendimento: num(settings.yield),
    // o CSV guarda ids na última coluna: fora, senão a comparação acusaria
    // diferença onde não há nenhuma
    arquivos: arquivos.map(a => a.replace(/[a-z0-9]{10,}/g, 'ID'))
  };
}`;

// Estado FINAL da nuvem, não a sequência de escritas. Com sinal, corrigir um
// lançamento manda duas escritas; sem sinal, a fila junta as duas numa só —
// e as duas coisas estão certas. O que tem de bater é o que a nuvem GUARDA
// no fim, porque é isso que o outro aparelho vai ler.
const ESTADO_NUVEM = `window.estadoNuvem = () => {
  const regs = JSON.parse(localStorage.getItem('teste-nuvem') || '[]');
  const mapa = new Map();
  // Os documentos das coleções são gravados por SUBSTITUIÇÃO: a última
  // gravação é o que fica. O documento da fazenda — rendimento de carcaça,
  // lista de atividades, parâmetros de custo — é o único gravado com MERGE,
  // um pedacinho por vez, e ali o estado final é a soma dos pedaços. Tratar
  // ele como substituição faria esta conferência acusar diferença onde não
  // há: com sinal chegam vários pedaços, sem sinal a fila junta tudo num só.
  regs.forEach(r => {
    const ehFazenda = r.caminho.split('/').length < 3;
    if (r.del) { mapa.delete(r.caminho); return; }
    mapa.set(r.caminho, ehFazenda
      ? Object.assign({}, mapa.get(r.caminho) || {}, r.obj)
      : r.obj);
  });
  const IDS = ['id', 'linkTrans', 'linkGrupo', 'grupo', 'entryWeighingId', 'animalId', 'itemId'];
  // Os ids nascem do instante e de sorteio: são diferentes nas duas passagens
  // de propósito, e em QUALQUER profundidade — a lista de atividades que vai
  // no documento da fazenda leva um id dentro de cada item.
  const limpa = v => {
    if (Array.isArray(v)) return v.map(limpa);
    if (v && typeof v === 'object') {
      const c = {};
      Object.keys(v).sort().forEach(k => { if (IDS.indexOf(k) < 0) c[k] = limpa(v[k]); });
      return c;
    }
    return typeof v === 'number' ? Number(v.toFixed(4)) : v;
  };
  const canon = o => JSON.stringify(limpa(o || {}));
  const saida = [];
  mapa.forEach((obj, caminho) => {
    const p = caminho.split('/');
    const col = p.length < 3 ? '_fazenda' : p[p.length - 2];
    saida.push((col.indexOf('at_') === 0 ? 'at_*' : col) + ' ' + canon(obj));
  });
  return saida.sort();
}`;

const difere = (a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) return '';
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${a.length} contra ${b.length} linhas`;
    for (let i = 0; i < a.length; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
        return `linha ${i + 1}: com sinal «${String(a[i]).slice(0, 110)}» · sem sinal «${String(b[i]).slice(0, 110)}»`;
      }
    }
  }
  return `com sinal «${A.slice(0, 120)}» · sem sinal «${B.slice(0, 120)}»`;
};

export default async function () {
  const s = await servir();
  const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: 'pt-BR', serviceWorkers: 'block' });
  await fingirHoje(ctx);
  const pagina = await ctx.newPage();
  const errosJS = [];
  pagina.on('pageerror', e => errosJS.push(e.message));
  pagina.on('dialog', d => d.accept().catch(() => {}));
  const t = placar(`Com sinal e sem sinal: o mesmo lançamento, o mesmo número (${RODADAS} rodadas · semente ${SEMENTE})`);

  await pagina.route('**/*', r =>
    ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());

  // A nuvem de mentira anota TUDO o que recebe — caminho e conteúdo — para que
  // o estado dela possa ser comparado nos dois estados. Quando a bandeira está
  // em 0, nem o SDK existe: é o aparelho no pasto.
  await pagina.addInitScript(() => {
    localStorage.setItem('fjs-fbconfig', JSON.stringify({ apiKey: 'x', projectId: 'p', authDomain: 'a', appId: '1' }));
    localStorage.setItem('fjs-farm', JSON.stringify('demo'));
    localStorage.setItem('fjs-ics-auto', JSON.stringify(false));
    localStorage.setItem('fjs-ics-visto', JSON.stringify(true));
    if (localStorage.getItem('teste-online') !== '1') return;
    const anotar = (caminho, obj, del) => {
      const r = JSON.parse(localStorage.getItem('teste-nuvem') || '[]');
      r.push({ caminho, obj: obj || null, del: !!del });
      localStorage.setItem('teste-nuvem', JSON.stringify(r));
    };
    // Dois botões para a nuvem de mentira: DEMORAR para confirmar o lote e
    // RECUSAR a gravação de um registro só. Juntos, eles reproduzem o estado
    // mais escorregadio do campo — o lote subindo enquanto o dedo continua
    // trabalhando, com o sinal ainda ruim para a gravação nova.
    window.__atraso = 0;
    window.__recusar = false;
    const espera = ms => new Promise(ok => setTimeout(ok, ms));
    const ref = caminho => ({
      _caminho: caminho,
      collection: n => ref(caminho + '/' + n),
      doc: i => ref(caminho + '/' + i),
      set: async o => {
        if (window.__recusar) throw new Error('sem sinal');
        anotar(caminho, o, false);
      },
      delete: async () => {
        if (window.__recusar) throw new Error('sem sinal');
        anotar(caminho, null, true);
      },
      onSnapshot: () => () => {}
    });
    const banco = {
      collection: n => ref(n), enablePersistence: async () => {},
      batch: () => ({
        set(r, o) { anotar(r._caminho, o, false); },
        delete(r) { anotar(r._caminho, null, true); },
        commit: async () => { if (window.__atraso) await espera(window.__atraso); }
      })
    };
    window.firebase = {
      initializeApp() {}, firestore: () => banco,
      auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: 'teste' }), 10); }, signInAnonymously: async () => ({}) })
    };
  });

  const abrir = async comInternet => {
    await pagina.goto(s.url + '/index.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await pagina.evaluate(v => localStorage.setItem('teste-online', v), comInternet ? '1' : '0');
    await pagina.goto(s.url + '/index.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction(() => typeof window.render === 'function', { timeout: 15000 });
    await pagina.evaluate(RETRATO);
    await pagina.evaluate(ESTADO_NUVEM);
    await pagina.waitForTimeout(200);
  };
  const zerar = () => pagina.evaluate(() => {
    localStorage.removeItem('teste-nuvem');
    animals = []; weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = [];
    rebmov = []; atividades = []; extraT = {}; pendentes = []; guardarFila();
    recomputarLivros(); salvarEspelho(true); render();
  });
  const espelho = () => pagina.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('fjs-espelho') || '{}');
    return JSON.stringify(e).replace(/[a-z0-9]{10,}/g, 'ID');
  });

  // ---------------- passagem 1: COM SINAL ----------------
  t.secao('com sinal: a nuvem responde a cada gravação');
  await abrir(true);
  t.conferir('a nuvem está no ar', await pagina.evaluate(() => !!db));
  await zerar();
  const pedidoOn = await pagina.evaluate(ROTEIRO(SEMENTE, RODADAS));
  await pagina.waitForTimeout(400);
  const retOn = await pagina.evaluate(() => retrato());
  const espOn = await espelho();
  const nuvemOn = await pagina.evaluate(() => estadoNuvem());
  const filaOn = await pagina.evaluate(() => pendentes.length);

  t.conferir('nasceu exatamente o número de lançamentos que o roteiro pediu',
    retOn.contagem.trans === pedidoOn.conta.trans, `${retOn.contagem.trans} contra ${pedidoOn.conta.trans}`);
  Object.keys(pedidoOn.conta).filter(k => k !== 'trans').forEach(k => {
    t.conferir(`e o número de registros de ${k} também`,
      retOn.contagem[k] === pedidoOn.conta[k], `${retOn.contagem[k]} contra ${pedidoOn.conta[k]}`);
  });
  t.conferir('o botão Pagar da tela foi achado e tocado em toda rodada',
    pedidoOn.portas.pagarBotao === RODADAS, `${pedidoOn.portas.pagarBotao} de ${RODADAS}`);
  t.conferir('com sinal, a caixa de saída fica vazia: tudo foi confirmado',
    filaOn === 0, `${filaOn} na fila`);
  t.conferir('a nuvem recebeu os registros', nuvemOn.length > 0, String(nuvemOn.length));

  // ---------------- passagem 2: SEM SINAL ----------------
  t.secao('sem sinal: o mesmo roteiro, no aparelho sozinho');
  await abrir(false);
  t.conferir('nuvem nenhuma, como o pasto sem linha', await pagina.evaluate(() => db === null));
  await zerar();
  const pedidoOff = await pagina.evaluate(ROTEIRO(SEMENTE, RODADAS));
  await pagina.waitForTimeout(400);
  const retOff = await pagina.evaluate(() => retrato());
  const espOff = await espelho();
  const filaOff = await pagina.evaluate(() => pendentes.map(p => ({ col: p.col, del: !!p.del })));

  t.conferir('sem sinal nasce o mesmo número de lançamentos que o roteiro pediu',
    retOff.contagem.trans === pedidoOff.conta.trans, `${retOff.contagem.trans} contra ${pedidoOff.conta.trans}`);
  t.conferir('e sem sinal o botão Pagar também foi achado e tocado',
    pedidoOff.portas.pagarBotao === RODADAS, `${pedidoOff.portas.pagarBotao} de ${RODADAS}`);
  t.conferir('e o roteiro pediu o mesmo nos dois estados',
    JSON.stringify(pedidoOn) === JSON.stringify(pedidoOff), difere(pedidoOn, pedidoOff));

  // ---------------- o que importa: os números batem? ----------------
  t.secao('cálculos: com sinal e sem sinal têm de dar o MESMO número');
  t.conferir('a contagem de todo registro é a mesma',
    JSON.stringify(retOn.contagem) === JSON.stringify(retOff.contagem), difere(retOn.contagem, retOff.contagem));
  t.conferir('lançamento por lançamento: data, valor, categoria, parcela, vencimento e baixa',
    JSON.stringify(retOn.linhas) === JSON.stringify(retOff.linhas), difere(retOn.linhas, retOff.linhas));
  t.conferir('o resumo da fazenda nos três regimes — receitas, custos, saldo, a pagar, a receber',
    JSON.stringify(retOn.geral) === JSON.stringify(retOff.geral), difere(retOn.geral, retOff.geral));
  t.conferir('o resumo de cada livro, nos três regimes',
    JSON.stringify(retOn.porLivro) === JSON.stringify(retOff.porLivro), difere(retOn.porLivro, retOff.porLivro));
  t.conferir('os períodos oferecidos e a soma dentro de cada um',
    JSON.stringify(retOn.periodos) === JSON.stringify(retOff.periodos), difere(retOn.periodos, retOff.periodos));
  t.conferir('o estoque: saldo e custo médio de cada insumo',
    JSON.stringify(retOn.estoque) === JSON.stringify(retOff.estoque), difere(retOn.estoque, retOff.estoque));
  t.conferir('cada animal: entrada, venda, pesagens e GMD',
    JSON.stringify(retOn.bichos) === JSON.stringify(retOff.bichos), difere(retOn.bichos, retOff.bichos));
  t.conferir('o estoque de gado em cabeças', retOn.reb === retOff.reb, difere(retOn.reb, retOff.reb));
  t.conferir('o GMD do rebanho', retOn.gmd === retOff.gmd, difere(retOn.gmd, retOff.gmd));
  t.conferir('o rendimento de carcaça', retOn.rendimento === retOff.rendimento, difere(retOn.rendimento, retOff.rendimento));
  const nomes = ['financeiro completo', 'relatório dos bovinos', 'relatório dos aviários',
    'relatório da fazenda', 'pesagens', 'estoque', 'rebanho em cabeças'];
  retOn.arquivos.forEach((a, i) => {
    t.conferir(`a exportação do ${nomes[i] || i} sai igual, linha por linha`,
      a === retOff.arquivos[i], difere(String(a).split('\n'), String(retOff.arquivos[i] || '').split('\n')));
  });
  t.conferir('a cópia local do aparelho é a mesma nos dois estados', espOn === espOff,
    difere(espOn.split(',{'), espOff.split(',{')));

  // ---------------- a caixa de saída ----------------
  t.secao('lançamentos: a caixa de saída guarda tudo, uma vez cada');
  const soma = (arr, f) => arr.filter(f).length;
  t.conferir('a fila tem uma gravação para cada lançamento que ficou',
    soma(filaOff, p => /trans$|^at_/.test(p.col) && !p.del) === retOff.contagem.trans,
    `${soma(filaOff, p => /trans$|^at_/.test(p.col) && !p.del)} na fila contra ${retOff.contagem.trans} na tela`);
  t.conferir('e uma para cada animal, pesagem, item, movimentação e movimento do rebanho',
    soma(filaOff, p => p.col === 'animals' && !p.del) === retOff.contagem.animals
    && soma(filaOff, p => p.col === 'weighings' && !p.del) === retOff.contagem.weighings
    && soma(filaOff, p => p.col === 'items' && !p.del) === retOff.contagem.items
    && soma(filaOff, p => p.col === 'moves' && !p.del) === retOff.contagem.moves
    && soma(filaOff, p => p.col === 'rebmov' && !p.del) === retOff.contagem.rebmov,
    JSON.stringify(filaOff.filter(p => !p.del)
      .reduce((a, p) => (a[p.col] = (a[p.col] || 0) + 1, a), {})));
  t.conferir('a exclusão também está na fila, como remoção',
    soma(filaOff, p => p.del) >= RODADAS, `${soma(filaOff, p => p.del)} remoções para ${RODADAS} exclusões`);

  // ---------------- fecha e abre ainda sem sinal ----------------
  t.secao('fecha e abre o aplicativo, ainda sem sinal');
  await abrir(false);
  const retReabre = await pagina.evaluate(() => retrato());
  t.conferir('reabrindo sem sinal, nenhum número mudou',
    JSON.stringify(retReabre.linhas) === JSON.stringify(retOff.linhas), difere(retReabre.linhas, retOff.linhas));
  t.conferir('e os resumos continuam os mesmos',
    JSON.stringify(retReabre.geral) === JSON.stringify(retOff.geral), difere(retReabre.geral, retOff.geral));
  const filaViva = await pagina.evaluate(() => pendentes.length);
  t.conferir('a caixa de saída sobreviveu ao fecha e abre', filaViva === filaOff.length,
    `${filaViva} contra ${filaOff.length}`);

  // ---------------- o servidor fala primeiro, e não sabe de nada -----------
  // A chegada em casa depois de uma semana no pasto. O aparelho tem a semana
  // inteira na caixa de saída; o servidor responde com o que ELE tem, que é o
  // de antes da semana. O snapshot é a verdade DO SERVIDOR, e ele não sabe do
  // que está na fila — aplicado cru, apagava da tela tudo o que foi lançado
  // sem sinal. O rebanho já era conferido aqui; o DINHEIRO nunca foi.
  t.secao('o servidor responde antes de a fila subir, e não sabe de nada');
  const depoisDoSnap = await pagina.evaluate(() => {
    const cols = ['animals', 'weighings', 'bovtrans', 'avtrans', 'gertrans',
      'items', 'moves', 'rebmov'].concat(atividades.map(a => 'at_' + a.id));
    // o servidor manda a fazenda VAZIA: é o que ele tem, a semana não subiu
    cols.forEach(c => aplicarSnapshot(c, [], { fromCache: false }));
    aplicarFazenda({});
    return retrato();
  });
  t.conferir('nenhum lançamento desapareceu da tela',
    depoisDoSnap.contagem.trans === retOff.contagem.trans,
    `${depoisDoSnap.contagem.trans} contra ${retOff.contagem.trans}`);
  t.conferir('nem um animal, pesagem, item, movimentação ou movimento do rebanho',
    JSON.stringify(depoisDoSnap.contagem) === JSON.stringify(retOff.contagem),
    difere(retOff.contagem, depoisDoSnap.contagem));
  t.conferir('lançamento por lançamento, tudo continua igual',
    JSON.stringify(depoisDoSnap.linhas) === JSON.stringify(retOff.linhas),
    difere(retOff.linhas, depoisDoSnap.linhas));
  t.conferir('e os resumos dos três regimes não mudaram',
    JSON.stringify(depoisDoSnap.geral) === JSON.stringify(retOff.geral),
    difere(retOff.geral, depoisDoSnap.geral));
  t.conferir('o rendimento de carcaça também resistiu ao snapshot',
    depoisDoSnap.rendimento === retOff.rendimento, difere(retOff.rendimento, depoisDoSnap.rendimento));

  // ---------------- o sinal volta ----------------
  t.secao('o sinal volta: a fila sobe e a nuvem fica igual');
  await pagina.evaluate(() => localStorage.setItem('teste-online', '1'));
  await pagina.goto(s.url + '/index.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await pagina.waitForFunction(() => typeof window.render === 'function', { timeout: 15000 });
  await pagina.evaluate(RETRATO);
  await pagina.evaluate(ESTADO_NUVEM);
  await pagina.waitForTimeout(300);
  // A nuvem de mentira não devolve snapshot: o que está na tela veio da cópia
  // local, que é exatamente o caso do aparelho que volta a ter sinal. E a fila
  // sobe SOZINHA — ninguém no curral vai tocar em botão nenhum para isso.
  let subiuSozinha = false;
  try {
    await pagina.waitForFunction(() => pendentes.length === 0, { timeout: 8000 });
    subiuSozinha = true;
  } catch (e) { /* não subiu sozinha: a cobrança abaixo diz isso */ }
  t.conferir('a fila sobe sozinha quando o sinal volta, sem ninguém pedir', subiuSozinha,
    `${await pagina.evaluate(() => pendentes.length)} ainda na fila`);
  // de novo, de propósito: reenviar o que já subiu não pode estragar nada
  await pagina.evaluate(() => enviarPendentes());
  await pagina.waitForTimeout(500);
  const filaDepois = await pagina.evaluate(() => pendentes.length);
  const nuvemDepois = await pagina.evaluate(() => estadoNuvem());
  const retDepois = await pagina.evaluate(() => retrato());

  t.conferir('a caixa de saída esvaziou', filaDepois === 0, `${filaDepois} ficaram`);
  t.conferir('a nuvem ficou com o MESMO estado que teria se nunca faltasse sinal',
    JSON.stringify(nuvemDepois) === JSON.stringify(nuvemOn), difere(nuvemOn, nuvemDepois));
  t.conferir('e sincronizar não mexeu em número nenhum na tela',
    JSON.stringify(retDepois.linhas) === JSON.stringify(retOff.linhas), difere(retOff.linhas, retDepois.linhas));
  t.conferir('nem nos resumos',
    JSON.stringify(retDepois.geral) === JSON.stringify(retOff.geral), difere(retOff.geral, retDepois.geral));
  t.conferir('nem nas exportações',
    JSON.stringify(retDepois.arquivos) === JSON.stringify(retOff.arquivos),
    difere(retOff.arquivos, retDepois.arquivos));

  // ---------------- o dedo continua trabalhando enquanto o lote sobe --------
  // O estado mais escorregadio de todos, e o único que nenhuma bateria olhava.
  // O aplicativo afirma, num comentário, que a confirmação de um envio antigo
  // não leva embora a correção feita durante ele. Se essa promessa falhar, a
  // tela fica certa, o aparelho fica certo, e a NUVEM GUARDA O VALOR VELHO
  // para sempre — e o outro aparelho lê o valor velho sem nada denunciando.
  t.secao('o sinal volta e o dedo continua trabalhando');
  await abrir(true);
  await zerar();
  // o lançamento nasce sem sinal e fica na fila
  const alvo = await pagina.evaluate(() => {
    const guardado = db; db = null;
    openTrans('bov', null);
    marcarRadio('t-type', 'saida', 'saida');
    $('t-date').value = '2026-05-10';
    $('t-amount').value = '1.000,00';
    $('t-category').value = 'Ração/insumos';
    $('t-notes').value = 'durante o envio';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    db = guardado;
    const t0 = bovT.filter(x => x.notes === 'durante o envio')[0];
    return { id: t0.id, valor: t0.amount, fila: pendentes.length };
  });
  t.conferir('o lançamento feito sem sinal está na fila, com o valor digitado',
    alvo.fila === 1 && alvo.valor === 1000, `${alvo.fila} na fila · R$ ${alvo.valor}`);

  // o lote começa a subir devagar; a correção acontece no meio, e a gravação
  // dela não alcança a nuvem (sinal ainda ruim)
  const meio = await pagina.evaluate(async id => {
    localStorage.removeItem('teste-nuvem');
    window.__atraso = 700;
    const subindo = enviarPendentes();       // de propósito sem esperar
    await new Promise(ok => setTimeout(ok, 80));
    window.__recusar = true;
    openTrans('bov', bovT.filter(x => x.id === id)[0]);
    $('t-amount').value = '2.500,00';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    await subindo;
    await new Promise(ok => setTimeout(ok, 200));
    const op = pendentes.filter(p => p.col === 'bovtrans' && p.id === id)[0];
    return { naTela: bovT.filter(x => x.id === id)[0].amount,
      fila: pendentes.length, naFila: op && op.obj ? op.obj.amount : null };
  }, alvo.id);
  t.conferir('a tela fica com o valor corrigido', meio.naTela === 2500, `R$ ${meio.naTela}`);
  t.conferir('a correção feita durante o envio NÃO foi levada pela confirmação do envio antigo',
    meio.naFila === 2500, meio.naFila === null ? 'a correção saiu da fila e nunca subiria' : `fila com R$ ${meio.naFila}`);
  t.conferir('e nada mais ficou na fila além dela', meio.fila === 1, `${meio.fila} na fila`);

  const fim = await pagina.evaluate(async () => {
    window.__recusar = false; window.__atraso = 0;
    await enviarPendentes();
    await new Promise(ok => setTimeout(ok, 150));
    return { fila: pendentes.length, nuvem: estadoNuvem() };
  });
  t.conferir('com o sinal firme, a fila esvazia', fim.fila === 0, `${fim.fila} ficaram`);
  t.conferir('e a nuvem termina com o valor CORRIGIDO, não com o velho',
    fim.nuvem.some(l => l.indexOf('"amount":2500') >= 0)
    && !fim.nuvem.some(l => l.indexOf('"amount":1000') >= 0),
    fim.nuvem.filter(l => l.indexOf('amount') >= 0).join(' || ').slice(0, 200));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
