// Blocos que abrem e fecham, e a altura da tela.
//
// A tela cresceu por empilhamento. Medido num iPhone (390×844) com uma fazenda
// de 60 animais e dois anos de lançamentos, a lista de animais começava a
// 1147 px e a de lançamentos da Fazenda a 1997 px — duas telas de rolagem de
// resumo antes do conteúdo, e o conteúdo é o que a pessoa veio ver.
//
// A regra que este arquivo protege: fechado NÃO é escondido. O número que
// importa continua na linha do cabeçalho, o detalhe está a um toque, e nada
// abre nem fecha sozinho. Um bloco fechado e mudo seria só informação perdida.
import { servir, abrirApp, placar } from './apoio.mjs';

// Uma fazenda de tamanho realista: é com ela que a altura importa.
const MONTAR = () => {
  const p = n => String(n).padStart(2, '0');
  animals = Array.from({ length: 60 }, (_, i) => ({ id: 'a' + i, ident: 'BR' + p(i + 1),
    cat: i % 3 ? 'Novilho' : 'Novilha', entryDate: '2025-06-01', entryWeight: 260 + i % 40 }));
  weighings = [];
  ['2025-08-15', '2025-11-20', '2026-02-18', '2026-05-22', '2026-09-10'].forEach((d, k) => {
    animals.forEach((a, i) => weighings.push({ id: 'w' + k + '_' + i, animalId: a.id,
      date: d, weight: 280 + k * 45 + (i % 30) }));
  });
  const cats = ['Ração/insumos', 'Vacina', 'Frete', 'Energia elétrica', 'Mão de obra',
    'Benfeitorias', 'Combustível'];
  bovT = Array.from({ length: 120 }, (_, i) => Object.assign({
    id: 't' + i, date: `2026-0${1 + i % 9}-1${i % 9}`, type: i % 8 ? 'saida' : 'entrada',
    amount: 50 + (i * 37) % 3000, category: cats[i % 7], notes: 'nota ' + i
  }, i % 9 === 0 ? { venc: `2026-1${i % 3}-1${i % 9}`, pago: false } : {}));
  avT = bovT.slice(0, 40).map((t, i) => Object.assign({}, t, { id: 'av' + i }));
  gerT = bovT.slice(0, 20).map((t, i) => Object.assign({}, t, { id: 'g' + i }));
  items = []; moves = []; settings.yield = 52;
  $('bov-gmd-sim').value = '0,700'; LS.s('fjs-gmd-sim', '0,700');
  definirRegime('competencia');
  ['bfin-period', 'av-period', 'fz-period'].forEach(id => { $(id).value = 'this-year'; guardarPeriodo(id); });
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Layout e blocos dobráveis');

  const alt = await pagina.evaluate(`(${MONTAR.toString()})();
    (function () {
      const medir = (view, ids) => {
        const topo = $(view).getBoundingClientRect().top + window.scrollY;
        const r = {};
        ids.forEach(id => {
          const el = $(id);
          r[id] = (!el || el.hidden) ? -1
            : Math.round(el.getBoundingClientRect().top + window.scrollY - topo);
        });
        return r;
      };
      const out = {};
      tab = 'bovinos'; seg = 'rebanho'; render();
      out.rebanho = medir('bov-rebanho', ['animal-list']);
      seg = 'financeiro'; render();
      out.financeiro = medir('bov-fin', ['bfin-list']);
      tab = 'fazenda'; render();
      out.fazenda = medir('view-fazenda', ['fz-lista']);
      out.tela = window.innerHeight;
      return out;
    })()`);

  t.secao('o conteúdo cabe na primeira tela');
  // Uma tela de iPhone tem 844 px, e o cabeçalho e as abas comem uns 140.
  // Passar disso é obrigar a rolar antes de ver o primeiro registro.
  t.conferir('a lista de animais começa na primeira tela',
    alt.rebanho['animal-list'] >= 0 && alt.rebanho['animal-list'] < 700,
    `${alt.rebanho['animal-list']}px (era 1147)`);
  t.conferir('a lista do Financeiro também',
    alt.financeiro['bfin-list'] < 700, `${alt.financeiro['bfin-list']}px (era 1299)`);
  // A Fazenda carrega um bloco a mais que as outras duas telas desde que
  // existe recebimento a prazo: "A pagar" e "A receber", lado a lado na mesma
  // coluna. São duas linhas recolhidas, 28 px, e é informação que a pessoa
  // veio ver — mas é espaço, e o limite reconhece isso em vez de fingir que
  // nada mudou. O ganho que importa continua lá: de 1997 px para menos de 760.
  t.conferir('e a da Fazenda, que era a pior',
    alt.fazenda['fz-lista'] < 760, `${alt.fazenda['fz-lista']}px (era 1997)`);

  t.secao('fechado não é mudo');
  const cab = await pagina.evaluate(`(function () {
    const out = {};
    const ler = id => {
      const d = document.querySelector('#' + id + ' details[data-dobra], details#' + id);
      if (!d) return null;
      // A prova de que está recolhido é a altura do PRÓPRIO bloco, não a do
      // corpo: o navegador mantém o corpo no layout mesmo fechado, e medir ele
      // daria "não recolheu" para uma tela que visivelmente recolheu.
      const altFechado = d.offsetHeight;
      d.open = true;
      const altAberto = d.offsetHeight;
      d.open = false;
      return { fechado: !d.open, cab: d.querySelector('.dobra-cab').innerText.replace(/\\n/g, ' | '),
        temSeta: !!d.querySelector('.dobra-seta'),
        altFechado, altAberto,
        recolheu: altFechado < 80 && altAberto > altFechado };
    };
    tab = 'bovinos'; seg = 'rebanho'; render();
    out.est = ler('bov-est-dobra');
    out.gmdPes = ler('bov-gmd-pes');
    out.gmdMes = ler('bov-gmd-mes');
    seg = 'financeiro'; render();
    out.apagar = ler('bfin-apagar');
    out.cats = ler('bfin-cats');
    tab = 'fazenda'; render();
    out.fzAtiv = ler('fz-atividades');
    out.fzApagar = ler('fz-apagar');
    return out;
  })()`);
  const blocos = [['estimativa', cab.est], ['GMD do rebanho', cab.gmdPes],
    ['GMD mês a mês', cab.gmdMes], ['A pagar', cab.apagar], ['categorias', cab.cats],
    ['atividades', cab.fzAtiv], ['A pagar da Fazenda', cab.fzApagar]];
  t.conferir('todos os blocos existem e nascem fechados',
    blocos.every(([, b]) => b && b.fechado), blocos.map(([n, b]) => n + ':' + (b ? b.fechado : 'sumiu')).join(' '));
  t.conferir('todos têm seta, para se ver que abrem',
    blocos.every(([, b]) => b && b.temSeta), '');
  t.conferir('fechado o bloco é só o cabeçalho, e abrir faz ele crescer',
    blocos.every(([, b]) => b && b.recolheu),
    blocos.map(([n, b]) => `${n} ${b ? b.altFechado + '→' + b.altAberto : '?'}`).join(' · '));
  // A informação não pode sumir junto com o corpo: é isso que separa
  // "recolher" de "esconder".
  t.conferir('a estimativa mostra o total em arroba no cabeçalho',
    /@/.test(cab.est.cab), cab.est.cab);
  t.conferir('o GMD do rebanho mostra o número no cabeçalho',
    /\d,\d{3}/.test(cab.gmdPes.cab), cab.gmdPes.cab);
  t.conferir('o mês a mês mostra os dois últimos meses',
    /\/\d{2}/.test(cab.gmdMes.cab), cab.gmdMes.cab);
  t.conferir('o A pagar mostra quanto se deve e quantas contas',
    /R\$/.test(cab.apagar.cab) && /conta\(s\)/.test(cab.apagar.cab), cab.apagar.cab);
  t.conferir('as categorias mostram a maior',
    /maior:/.test(cab.cats.cab), cab.cats.cab);
  t.conferir('as atividades mostram o saldo de cada uma',
    /Bovinos/.test(cab.fzAtiv.cab) && /Aviários/.test(cab.fzAtiv.cab), cab.fzAtiv.cab);

  t.secao('vencida se anuncia mesmo com o bloco fechado');
  const venc = await pagina.evaluate(`(function () {
    const hoje = todayISO();
    const menos = n => { const d = new Date(hoje + 'T12:00'); d.setDate(d.getDate() - n);
      const p = x => String(x).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
    bovT = [{ id: 'v1', date: '2026-01-01', type: 'saida', amount: 1000,
      category: 'Ração/insumos', venc: menos(5), pago: false }];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    const cab = document.querySelector('#bfin-apagar .dobra-cab');
    return { texto: cab.innerText.replace(/\\n/g, ' | '),
      emAlerta: !!cab.querySelector('.dc-num.dc-alerta') };
  })()`);
  t.conferir('o cabeçalho fechado conta a vencida', /1 vencida/.test(venc.texto), venc.texto);
  t.conferir('e o valor fica em vermelho', venc.emAlerta === true);

  t.secao('abrir e fechar fica guardado');
  const lembra = await pagina.evaluate(`(function () {
    const out = {};
    tab = 'bovinos'; seg = 'financeiro'; render();
    const d = document.querySelector('#bfin-apagar details[data-dobra]');
    out.antes = d.open;
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
    out.guardou = JSON.parse(localStorage.getItem('fjs-dobra-apagar-bov'));
    render();
    out.continuaAberto = document.querySelector('#bfin-apagar details[data-dobra]').open;
    // e fechar de novo volta a valer
    const d2 = document.querySelector('#bfin-apagar details[data-dobra]');
    d2.open = false;
    d2.dispatchEvent(new Event('toggle'));
    render();
    out.continuaFechado = !document.querySelector('#bfin-apagar details[data-dobra]').open;
    localStorage.removeItem('fjs-dobra-apagar-bov');
    return out;
  })()`);
  t.conferir('começa fechado', lembra.antes === false);
  t.conferir('abrir fica gravado no aparelho', lembra.guardou === true, String(lembra.guardou));
  // Redesenhar a tela não pode fechar o bloco na mão de quem acabou de abrir.
  t.conferir('e o bloco continua aberto depois de a tela se redesenhar',
    lembra.continuaAberto === true);
  t.conferir('fechar também fica valendo', lembra.continuaFechado === true);

  t.secao('nada foi escondido, só recolhido');
  const tudo = await pagina.evaluate(`(${MONTAR.toString()})();
    (function () {
      const out = {};
      tab = 'fazenda'; render();
      document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
      out.apagarLinhas = document.querySelectorAll('#fz-apagar .ap-linha').length;
      out.temPagar = !!document.querySelector('#fz-apagar .ap-pagar');
      out.categorias = document.querySelectorAll('#fz-cats .cb-row').length;
      out.atividades = document.querySelectorAll('#fz-atividades .fz-card').length;
      tab = 'bovinos'; seg = 'rebanho'; render();
      document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
      out.mesLinhas = document.querySelectorAll('#bov-gmd-mes .gm-linha').length;
      out.pesLinhas = document.querySelectorAll('#bov-gmd-pes .gm-linha').length;
      out.geral = !!document.querySelector('#bov-gmd-geral .gg-val');
      out.campoGmd = !!$('bov-gmd-sim') && $('bov-gmd-sim').value !== '';
      return out;
    })()`);
  t.conferir('abrindo, as contas a pagar estão todas lá com o botão Pagar',
    tudo.apagarLinhas > 0 && tudo.temPagar, String(tudo.apagarLinhas));
  t.conferir('as categorias continuam inteiras', tudo.categorias > 0, String(tudo.categorias));
  t.conferir('as atividades também', tudo.atividades === 3, String(tudo.atividades));
  t.conferir('o mês a mês continua com as linhas dele', tudo.mesLinhas > 0, String(tudo.mesLinhas));
  t.conferir('o GMD entre pesagens também', tudo.pesLinhas > 0, String(tudo.pesLinhas));
  t.conferir('e o número geral continua dentro', tudo.geral === true);
  // O campo de digitação é feito em HTML de propósito: montado pelo JS, seria
  // recriado a cada desenho e perderia o foco no meio da conta.
  t.conferir('o campo de GMD sobrevive aos redesenhos', tudo.campoGmd === true);

  // ---------- a linha de segmentos não cabe, e isso precisa aparecer ----------
  // Seis segmentos não cabem em 390 px: "Financeiro" e "Custos" ficavam fora da
  // tela sem nenhuma pista de que existiam, e quem nunca arrastou aquela linha
  // não sabia que as duas telas existiam.
  t.secao('a linha de segmentos avisa que continua');
  const seg = await pagina.evaluate(`(function () {
    animals = [{ id: 'a1', ident: 'BR01' }]; weighings = [];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    const f = $('bov-segs'), env = $('bov-segs-wrap');
    const dentro = () => {
      const a = f.querySelector('.seg.active');
      return a.offsetLeft >= f.scrollLeft - 1
        && a.offsetLeft + a.offsetWidth <= f.scrollLeft + f.clientWidth + 1;
    };
    const out = {};
    tab = 'bovinos'; seg = 'rebanho'; render();
    out.naoCabe = f.scrollWidth > f.clientWidth;
    out.sombraNoInicio = env.classList.contains('tem-mais');
    out.primeiroVisivel = dentro();
    // escolher o último segmento traz ele para a tela
    seg = 'custos'; render();
    out.ultimoVisivel = dentro();
    out.rolou = f.scrollLeft > 0;
    out.sombraNoFim = env.classList.contains('tem-mais');
    // e voltar ao primeiro traz de volta
    seg = 'rebanho'; render();
    out.voltouVisivel = dentro();
    out.sombraDeVolta = env.classList.contains('tem-mais');
    // arrastar à mão e redesenhar não pode puxar a linha de volta
    seg = 'rebanho'; render();
    f.scrollLeft = 80;
    render();
    out.respeitaArrasto = f.scrollLeft === 80;
    return out;
  })()`);
  t.conferir('seis segmentos não cabem na largura do celular', seg.naoCabe === true);
  t.conferir('e a sombra avisa que há mais para o lado', seg.sombraNoInicio === true);
  t.conferir('o primeiro segmento começa visível', seg.primeiroVisivel === true);
  // Sem isto, tocar em Custos deixava a tela trocar sem nenhum segmento aceso
  // à vista — parecia que o toque não tinha funcionado.
  t.conferir('escolher o último traz ele para a tela',
    seg.ultimoVisivel === true && seg.rolou === true);
  t.conferir('e no fim da linha a sombra some, em vez de prometer o que não há',
    seg.sombraNoFim === false);
  t.conferir('voltar ao primeiro traz a linha de volta', seg.voltouVisivel === true);
  t.conferir('e a sombra volta com ela', seg.sombraDeVolta === true);
  // Rolar a cada desenho brigaria com quem acabou de arrastar a linha para
  // olhar o que tem adiante.
  t.conferir('redesenhar não puxa a linha da mão de quem a arrastou',
    seg.respeitaArrasto === true);

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
