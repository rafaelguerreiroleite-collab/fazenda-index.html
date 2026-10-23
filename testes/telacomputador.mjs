// A MESMA TELA NO CELULAR, OUTRA TELA NO COMPUTADOR.
//
// Pedido do dono: deixar do jeito que está para o celular e, quando abrir no
// computador, a tela ficar própria para computador.
//
// A promessa tem duas metades, e a primeira é a que importa: NO CELULAR NADA
// MUDA. O aplicativo é usado no curral, com uma mão, de bota e sol na tela —
// uma "melhoria" que mexesse ali seria um prejuízo. Por isso tudo o que é de
// computador vive dentro de uma regra que só existe acima de 900 px: abaixo
// disso o navegador nem lê esse bloco.
//
// Esta bateria cobra as duas metades:
//
//   · a 390 px (iPhone), cada medida continua sendo a medida de antes —
//     coluna de 480 px, lista de uma coluna, cartões três a três;
//   · a 1440 px (monitor), a tela usa o espaço: coluna larga, lista em duas
//     colunas, os seis cartões numa linha, os sete segmentos visíveis sem
//     arrastar para o lado;
//   · nos dois, e em toda tela do aplicativo, NADA transborda para os lados.
//     Rolagem horizontal é o defeito clássico de tela adaptada, e é o que faz
//     um botão ficar inalcançável sem ninguém entender por quê.
import { servir, abrirApp, placar } from './apoio.mjs';

const TELAS = [
  ['rebanho', () => { tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; }],
  ['ficha do animal', () => { tab = 'bovinos'; seg = 'rebanho'; detailAnimal = 'a1'; }],
  ['compras', () => { tab = 'bovinos'; seg = 'compras'; }],
  ['vendidas', () => { tab = 'bovinos'; seg = 'vendidas'; }],
  ['mortalidade', () => { tab = 'bovinos'; seg = 'mortes'; }],
  ['estoque', () => { tab = 'bovinos'; seg = 'estoque'; detailItem = null; }],
  ['financeiro', () => { tab = 'bovinos'; seg = 'financeiro'; }],
  ['custos', () => { tab = 'bovinos'; seg = 'custos'; }],
  ['aviários', () => { tab = 'aviarios'; }],
  ['fazenda', () => { tab = 'fazenda'; }]
];

const MONTAR = () => {
  animals = []; weighings = []; bovT = []; avT = []; gerT = [];
  items = []; moves = []; rebmov = [];
  for (let i = 1; i <= 14; i++) {
    animals.push({ id: 'a' + i, ident: '70' + i, cat: 'Novilha', raca: 'Nelore' });
    weighings.push({ id: 'v' + i, animalId: 'a' + i, date: '2026-07-10', weight: 240 + i, jejum: false });
    if (i <= 12) weighings.push({ id: 'h' + i, animalId: 'a' + i, date: '2026-10-19', weight: 300 + i, jejum: false });
  }
  animals[12].sold = true; animals[12].soldDate = '2026-09-10'; animals[12].soldPrice = 7200;
  animals[13].dead = true; animals[13].deadDate = '2026-09-12'; animals[13].deadCause = 'Cobra';
  bovT = [
    { id: 't1', date: '2026-10-01', type: 'saida', amount: 1250.5, category: 'Ração/insumos', notes: 'milho' },
    { id: 't2', date: '2026-10-05', type: 'entrada', amount: 18000, category: 'Venda de gado' },
    { id: 't3', date: '2026-10-08', type: 'saida', amount: 800, category: 'Sanidade', venc: '2026-11-10', pago: false }
  ];
  avT = [{ id: 'g1', date: '2026-10-02', type: 'entrada', amount: 9000, category: 'Pagamento Seara', aviary: '5' }];
  items = [{ id: 'i1', name: 'Proteinado', unit: 'kg' }];
  moves = [{ id: 'm1', itemId: 'i1', type: 'entrada', date: '2026-09-01', qty: 500, unitCost: 3.2 }];
  rebmov = [{ id: 'r1', tipo: 'compra', date: '2026-08-01', qtd: 40, cat: 'Bezerro', valor: 60000 }];
  recomputarLivros();
};

// O que a tela MEDE, lido do navegador e não do arquivo de estilo: é a medida
// que vale, depois de todas as regras aplicadas.
const MEDIR = `(function () {
  const px = v => Math.round(parseFloat(v) || 0);
  const est = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  const colunas = sel => {
    const v = est(sel, 'gridTemplateColumns');
    return v && v !== 'none' ? v.split(' ').length : 0;
  };
  const main = document.querySelector('main');
  return {
    larguraJanela: window.innerWidth,
    maxMain: px(getComputedStyle(main).maxWidth),
    larguraMain: Math.round(main.getBoundingClientRect().width),
    colunasLista: colunas('.list'),
    colunasCartoes: colunas('.stats-row'),
    colunasFiltro: colunas('.filter-row.one'),
    maxModal: px(est('.modal-content', 'maxWidth')),
    rolagemLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    segsRolam: (() => { const e = document.getElementById('bov-segs');
      return e ? e.scrollWidth - e.clientWidth : 0; })(),
    fab: (() => { const f = document.querySelector('.fab');
      if (!f) return null; const r = f.getBoundingClientRect();
      return { esq: Math.round(r.left), dir: Math.round(r.right), topo: Math.round(r.top) }; })(),
    fichasTapadas: (() => {
      const f = document.querySelector('.fab');
      if (!f) return 0;
      const r = f.getBoundingClientRect();
      return [].slice.call(document.querySelectorAll('.list > *')).filter(e => {
        const c = e.getBoundingClientRect();
        return c.right > r.left && c.left < r.right && c.bottom > r.top && c.top < r.bottom;
      }).length;
    })()
  };
})()`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('A mesma tela no celular, outra tela no computador');

  const medirEm = async (largura, altura) => {
    await pagina.setViewportSize({ width: largura, height: altura });
    await pagina.evaluate(`(${MONTAR.toString()})(); tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();`);
    await pagina.waitForTimeout(200);
    return pagina.evaluate(MEDIR);
  };

  // ---------- o celular, que não pode mudar ----------
  t.secao('no celular, cada medida continua a mesma');
  const cel = await medirEm(390, 844);
  t.conferir('a coluna continua com 480 px de largura máxima',
    cel.maxMain === 480, `${cel.maxMain}px`);
  t.conferir('a lista continua de uma coluna só',
    cel.colunasLista <= 1, `${cel.colunasLista} colunas`);
  t.conferir('os cartões do topo continuam três a três',
    cel.colunasCartoes === 3, `${cel.colunasCartoes} colunas`);
  t.conferir('período e regime continuam um embaixo do outro',
    cel.colunasFiltro === 1, `${cel.colunasFiltro} colunas`);
  t.conferir('a janela do formulário continua com 480 px',
    cel.maxModal === 480, `${cel.maxModal}px`);
  t.conferir('o botão + continua no canto da tela',
    cel.fab && cel.fab.dir >= 370 && cel.fab.dir <= 390, JSON.stringify(cel.fab));
  t.conferir('e nada transborda para os lados',
    cel.rolagemLateral <= 0, `${cel.rolagemLateral}px sobrando`);

  // ---------- a fronteira ----------
  // A regra vale de 900 px para cima. Um pixel abaixo disso é celular grande
  // ou tablet em pé, e tem de continuar sendo tratado como tal.
  t.secao('a fronteira entre um jeito e outro');
  const quase = await medirEm(899, 900);
  t.conferir('a 899 px ainda é a tela do celular',
    quase.maxMain === 480 && quase.colunasLista <= 1,
    `${quase.maxMain}px · ${quase.colunasLista} colunas`);
  const virou = await medirEm(900, 900);
  t.conferir('a 900 px já é a tela do computador',
    virou.maxMain > 480 && virou.colunasLista === 2,
    `${virou.maxMain}px · ${virou.colunasLista} colunas`);

  // ---------- o computador ----------
  t.secao('no computador, a tela usa o espaço');
  const pc = await medirEm(1440, 900);
  t.conferir('a coluna fica larga', pc.maxMain === 1024, `${pc.maxMain}px`);
  t.conferir('a lista vira duas colunas: o dobro de fichas por tela',
    pc.colunasLista === 2, `${pc.colunasLista} colunas`);
  t.conferir('os seis cartões cabem numa linha só',
    pc.colunasCartoes === 6, `${pc.colunasCartoes} colunas`);
  t.conferir('período e regime ficam lado a lado',
    pc.colunasFiltro === 2, `${pc.colunasFiltro} colunas`);
  t.conferir('a janela do formulário fica mais larga',
    pc.maxModal === 544, `${pc.maxModal}px`);
  t.conferir('os sete segmentos cabem sem arrastar para o lado',
    pc.segsRolam <= 0, `${pc.segsRolam}px escondidos`);
  t.conferir('o botão + sai de cima da lista',
    pc.fichasTapadas === 0, `${pc.fichasTapadas} ficha(s) tapada(s)`);
  t.conferir('e continua dentro da janela',
    pc.fab && pc.fab.dir <= 1440 && pc.fab.esq > 1024, JSON.stringify(pc.fab));

  // ---------- toda tela, nas duas larguras, sem transbordar ----------
  t.secao('nenhuma tela transborda, nem no celular nem no computador');
  for (const [largura, altura, onde] of [[390, 844, 'celular'], [1024, 800, 'notebook'], [1440, 900, 'monitor']]) {
    await pagina.setViewportSize({ width: largura, height: altura });
    for (const [nome, prep] of TELAS) {
      const r = await pagina.evaluate(`(${MONTAR.toString()})(); (${prep.toString()})(); render();
        (function () {
          document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
          const doc = document.documentElement;
          // Transbordar DENTRO de uma tira que rola de lado de propósito não é
          // defeito: a linha dos segmentos é assim desde sempre, com a sombra
          // avisando que há mais para o lado. O que não pode é o elemento
          // escapar de um pai que NÃO rola — aí ele fica mesmo inalcançável.
          const dentroDeTiraQueRola = e => {
            for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
              const o = getComputedStyle(p).overflowX;
              if (o === 'auto' || o === 'scroll') return true;
            }
            return false;
          };
          const largos = [].slice.call(document.querySelectorAll('main *')).filter(e => {
            const c = e.getBoundingClientRect();
            if (!(c.width > 0)) return false;
            if (!(c.right > window.innerWidth + 1 || c.left < -1)) return false;
            return !dentroDeTiraQueRola(e);
          }).slice(0, 3).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().right));
          return { sobra: doc.scrollWidth - doc.clientWidth, largos: largos };
        })()`);
      t.conferir(`${onde} · ${nome}: nada passa da largura da tela`,
        r.sobra <= 0 && r.largos.length === 0,
        `${r.sobra}px de sobra${r.largos.length ? ' · ' + r.largos.join(' | ') : ''}`);
    }
  }

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
