// Consistência entre os três livros e entre as telas.
//
// A varredura por sorteio confere CONTAS. Esta bateria confere o contrário: o
// que o app FAZ com o dado — para onde ele grava, o que ele apaga junto, para
// onde o botão leva. É aí que mora o erro que nenhum total denuncia, porque a
// soma continua fechando enquanto o dado vai para o lugar errado.
//
// Cada caso aqui nasceu de um defeito encontrado lendo o código, não de uma
// hipótese: o livro Geral entrou depois dos outros dois e ficou de fora de
// vários caminhos que ninguém releu.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Consistência entre livros e telas');

  // Espiona o que o app manda para a nuvem. O banco falso engole tudo em
  // silêncio, então sem isto um "apagar" que não apaga passa despercebido.
  await pagina.evaluate(() => {
    window.__nuvem = { grava: [], apaga: [] };
    const upOrig = window.upsert, rmOrig = window.remove, loteOrig = window.batchWrite;
    window.upsert = (col, obj) => { window.__nuvem.grava.push({ col, id: obj.id }); return upOrig(col, obj); };
    window.remove = (col, id) => { window.__nuvem.apaga.push({ col, id }); return rmOrig(col, id); };
    window.batchWrite = ops => {
      ops.forEach(op => op.del
        ? window.__nuvem.apaga.push({ col: op.col, id: op.del })
        : window.__nuvem.grava.push({ col: op.col, id: op.obj.id }));
      return loteOrig(ops);
    };
    window.__zerar = () => { window.__nuvem = { grava: [], apaga: [] }; };
  });

  const aceitarTudo = async d => { await d.accept(); };
  // O "apagar tudo" pede a palavra num prompt. accept() sem argumento responde
  // vazio — e o teste passaria a impressão de que o app não apagou nada quando
  // na verdade foi o teste que não confirmou.
  const confirmarApagar = async d => { await d.accept(d.type() === 'prompt' ? 'APAGAR' : undefined); };

  // ---------- apagar tudo tem de apagar TUDO ----------
  t.secao('apagar todos os dados');
  pagina.on('dialog', confirmarApagar);
  const apagouTudo = await pagina.evaluate(async () => {
    window.__zerar();
    animals = [{ id: 'an1', ident: '101' }];
    weighings = [{ id: 'w1', animalId: 'an1', date: '2026-08-01', weight: 300 }];
    bovT = [{ id: 'b1', date: '2026-08-01', type: 'saida', amount: 10, category: 'Ração/insumos' }];
    avT = [{ id: 'a1', date: '2026-08-01', type: 'saida', amount: 20, category: 'Energia elétrica' }];
    // O livro Geral e uma nota fiscal anexada: os dois entraram no app depois
    // e são justamente os que ninguém releu ao escrever o "apagar tudo".
    gerT = [{ id: 'g1', date: '2026-08-01', type: 'saida', amount: 30, category: 'Impostos/Funrural',
      anexos: [{ id: 'ax1', nome: 'nota.pdf', tipo: 'application/pdf', tamanho: 1000 }] }];
    items = [{ id: 'it1', name: 'Sal', unit: 'kg' }];
    moves = [{ id: 'mv1', itemId: 'it1', type: 'entrada', date: '2026-08-01', qty: 10 }];
    render();
    $('menu-clear').click();
    await new Promise(r => setTimeout(r, 300));
    const apagados = col => window.__nuvem.apaga.filter(x => x.col === col).length;
    return {
      bovtrans: apagados('bovtrans'), avtrans: apagados('avtrans'), gertrans: apagados('gertrans'),
      anexos: apagados('anexos'), animals: apagados('animals'), items: apagados('items'),
      // e a tela: sem internet o snapshot não volta para limpar nada
      sobrouNaTela: animals.length + weighings.length + bovT.length + avT.length + gerT.length + items.length + moves.length
    };
  });
  pagina.removeListener('dialog', confirmarApagar);
  t.conferir('apagar tudo apaga o livro Bovinos', apagouTudo.bovtrans === 1, String(apagouTudo.bovtrans));
  t.conferir('apagar tudo apaga o livro Aviários', apagouTudo.avtrans === 1, String(apagouTudo.avtrans));
  t.conferir('apagar tudo apaga o livro Geral', apagouTudo.gertrans === 1, String(apagouTudo.gertrans));
  t.conferir('apagar tudo apaga as notas fiscais anexadas', apagouTudo.anexos === 1, String(apagouTudo.anexos));
  t.conferir('apagar tudo limpa a tela na hora, sem depender da nuvem',
    apagouTudo.sobrouNaTela === 0, apagouTudo.sobrouNaTela + ' registro(s) continuaram à vista');

  // ---------- a confirmação de "APAGAR" continua obrigatória ----------
  t.secao('a palavra APAGAR protege os dados');
  const semPalavra = async d => { await (d.type() === 'confirm' ? d.accept() : d.accept('apagar tudo')); };
  pagina.on('dialog', semPalavra);
  const naoApagou = await pagina.evaluate(async () => {
    window.__zerar();
    bovT = [{ id: 'b9', date: '2026-08-01', type: 'saida', amount: 10, category: 'Ração/insumos' }];
    gerT = [{ id: 'g9', date: '2026-08-01', type: 'saida', amount: 10, category: 'Outros' }];
    render();
    $('menu-clear').click();
    await new Promise(r => setTimeout(r, 200));
    return { apagou: window.__nuvem.apaga.length, bov: bovT.length, ger: gerT.length };
  });
  pagina.removeListener('dialog', semPalavra);
  t.conferir('digitar a palavra errada não apaga nada',
    naoApagou.apagou === 0 && naoApagou.bov === 1 && naoApagou.ger === 1,
    `apagou ${naoApagou.apagou} · bov ${naoApagou.bov} · ger ${naoApagou.ger}`);

  // ---------- pagar uma conta grava no livro certo ----------
  t.secao('marcar como pago');
  pagina.on('dialog', aceitarTudo);
  const pagou = await pagina.evaluate(async () => {
    const r = {};
    for (const [livro, col] of [['bov', 'bovtrans'], ['av', 'avtrans'], ['ger', 'gertrans']]) {
      window.__zerar();
      bovT = []; avT = []; gerT = [];
      const conta = { id: 'p-' + livro, date: '2026-08-01', type: 'saida', amount: 500,
        category: 'Energia elétrica', venc: '2026-08-20', pago: false };
      setLivro(livro, [conta]);
      // Clique real no botão "Pagar", com o livro que a tela carimba no botão.
      const div = document.createElement('div');
      div.innerHTML = `<button data-pagar="${conta.id}" data-livro="${livro}">Pagar</button>`;
      document.body.appendChild(div);
      div.querySelector('button').click();
      await new Promise(x => setTimeout(x, 60));
      div.remove();
      r[livro] = {
        marcou: !!conta.pago,
        colunas: window.__nuvem.grava.map(g => g.col),
        certa: window.__nuvem.grava.every(g => g.col === col)
      };
    }
    return r;
  });
  pagina.removeListener('dialog', aceitarTudo);
  for (const livro of ['bov', 'av', 'ger']) {
    t.conferir(`conta de ${livro} marcada como paga fica marcada`, pagou[livro].marcou === true);
    t.conferir(`conta de ${livro} paga é gravada no livro de ${livro}`,
      pagou[livro].certa === true, 'gravou em: ' + pagou[livro].colunas.join(', '));
  }

  // ---------- o lembrete leva para onde a conta aparece ----------
  t.secao('o lembrete não pode levar a uma tela vazia');
  const lembrete = await pagina.evaluate(() => {
    const r = {};
    for (const livro of ['bov', 'av', 'ger']) {
      bovT = []; avT = []; gerT = [];
      const hoje = new Date();
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const venceu = new Date(hoje.getTime() - 3 * 86400000);
      setLivro(livro, [{ id: 'lb-' + livro, date: iso(venceu), type: 'saida', amount: 700,
        category: 'Impostos/Funrural', venc: iso(venceu), pago: false }]);
      localStorage.removeItem('fjs-lembrete-visto');
      tab = 'bovinos'; seg = 'rebanho'; render();
      const apareceu = !$('lembrete').hidden;
      $('lb-ver').click();
      // Onde o "Ver" parou, a conta precisa estar VISÍVEL — não basta trocar de aba
      const texto = document.querySelector('.view.active').innerText;
      r[livro] = { apareceu, aba: tab, achou: texto.includes('700,00') };
    }
    return r;
  });
  for (const livro of ['bov', 'av', 'ger']) {
    t.conferir(`conta vencida de ${livro} aciona o lembrete`, lembrete[livro].apareceu === true);
    t.conferir(`o "Ver" do lembrete de ${livro} para numa tela onde a conta aparece`,
      lembrete[livro].achou === true, 'parou na aba ' + lembrete[livro].aba);
  }

  // ---------- exportar CSV de todos os livros ----------
  t.secao('exportação para o contador');
  const csvs = await pagina.evaluate(() => {
    const baixados = [];
    const orig = window.download;
    window.download = (nome, conteudo) => baixados.push({ nome, conteudo });
    bovT = [{ id: 'cb', date: '2026-08-01', type: 'saida', amount: 11.5, category: 'Ração/insumos' }];
    avT = [{ id: 'ca', date: '2026-08-02', type: 'saida', amount: 22.5, category: 'Energia elétrica' }];
    gerT = [{ id: 'cg', date: '2026-08-03', type: 'saida', amount: 33.5, category: 'Impostos/Funrural' }];
    const r = {};
    for (const livro of ['bov', 'av', 'ger']) {
      baixados.length = 0;
      try { exportFin(livro); } catch (e) { r[livro] = { erro: String(e.message || e) }; continue; }
      r[livro] = baixados[0] ? { nome: baixados[0].nome, corpo: baixados[0].conteudo } : { erro: 'nada baixado' };
    }
    window.download = orig;
    return r;
  });
  t.conferir('CSV de Bovinos traz o lançamento de Bovinos',
    !!(csvs.bov.corpo || '').includes('11,50'), csvs.bov.erro || csvs.bov.nome);
  t.conferir('CSV de Aviários traz o lançamento de Aviários',
    !!(csvs.av.corpo || '').includes('22,50'), csvs.av.erro || csvs.av.nome);
  t.conferir('existe CSV do livro Geral e ele traz o lançamento Geral',
    !!(csvs.ger.corpo || '').includes('33,50'), csvs.ger.erro || csvs.ger.nome);
  t.conferir('cada CSV sai com nome próprio, sem sobrescrever o outro',
    new Set([csvs.bov.nome, csvs.av.nome, csvs.ger.nome].filter(Boolean)).size === 3,
    [csvs.bov.nome, csvs.av.nome, csvs.ger.nome].join(' · '));

  // ---------- nota fiscal não pode ficar órfã na nuvem ----------
  t.secao('nota fiscal segue o lançamento que a carrega');
  pagina.on('dialog', aceitarTudo);
  const anexoItem = await pagina.evaluate(async () => {
    window.__zerar();
    items = [{ id: 'ia', name: 'Proteinado', unit: 'kg' }];
    moves = [{ id: 'ma', itemId: 'ia', type: 'entrada', date: '2026-08-01', qty: 10, unitCost: 5, linkTrans: 'ta' }];
    bovT = [{ id: 'ta', date: '2026-08-01', type: 'saida', amount: 50, category: 'Ração/insumos', lock: 'stock',
      anexos: [{ id: 'ax-item', nome: 'nota.jpg', tipo: 'image/jpeg', tamanho: 900 }] }];
    avT = []; gerT = []; animals = []; weighings = [];
    seg = 'estoque'; detailItem = 'ia'; render();
    openItem(items[0]); $('btn-delete-item').click();
    await new Promise(r => setTimeout(r, 200));
    return { anexosApagados: window.__nuvem.apaga.filter(x => x.col === 'anexos').map(x => x.id) };
  });
  pagina.removeListener('dialog', aceitarTudo);
  t.conferir('apagar o item apaga também a nota fiscal do lançamento vinculado',
    anexoItem.anexosApagados.includes('ax-item'), 'apagou: ' + (anexoItem.anexosApagados.join(', ') || 'nenhuma'));

  pagina.on('dialog', aceitarTudo);
  const anexoMov = await pagina.evaluate(async () => {
    window.__zerar();
    items = [{ id: 'ib', name: 'Sal', unit: 'kg' }];
    moves = [{ id: 'mb', itemId: 'ib', type: 'entrada', date: '2026-08-01', qty: 10, unitCost: 5, linkTrans: 'tb' }];
    bovT = [{ id: 'tb', date: '2026-08-01', type: 'saida', amount: 50, category: 'Ração/insumos', lock: 'stock',
      anexos: [{ id: 'ax-mov', nome: 'nota.jpg', tipo: 'image/jpeg', tamanho: 900 }] }];
    seg = 'estoque'; detailItem = 'ib'; render();
    openMove('ib', 'entrada', moves[0]);
    $('btn-delete-move').click();
    await new Promise(r => setTimeout(r, 200));
    return { anexosApagados: window.__nuvem.apaga.filter(x => x.col === 'anexos').map(x => x.id) };
  });
  pagina.removeListener('dialog', aceitarTudo);
  t.conferir('apagar a movimentação apaga também a nota fiscal do lançamento que ela gerou',
    anexoMov.anexosApagados.includes('ax-mov'), 'apagou: ' + (anexoMov.anexosApagados.join(', ') || 'nenhuma'));

  // ---------- apagar lançamento sempre pergunta ----------
  t.secao('nenhum lançamento some sem perguntar');
  const perguntas = [];
  const contar = async d => { perguntas.push(d.message()); await d.accept(); };
  pagina.on('dialog', contar);
  const semPergunta = await pagina.evaluate(async () => {
    // Última parcela de um carnê: as irmãs já foram apagadas, sobrou uma só.
    // Ela ainda carrega grupo/parcela, e era esse o caso que escapava.
    bovT = [{ id: 'u1', date: '2026-08-01', type: 'saida', amount: 100, category: 'Ração/insumos',
      grupo: 'gz', parcela: 3, parcelas: 3, venc: '2026-10-01', pago: false }];
    avT = []; gerT = []; items = []; moves = []; animals = [];
    seg = 'financeiro'; tab = 'bovinos'; render();
    openTrans('bov', bovT[0]);
    $('btn-delete-transaction').click();
    await new Promise(r => setTimeout(r, 150));
    return { sobrou: bovT.length };
  });
  pagina.removeListener('dialog', contar);
  t.conferir('apagar a última parcela de um carnê pede confirmação',
    perguntas.length >= 1, perguntas.length + ' pergunta(s)');
  t.conferir('e, confirmada, a parcela sai', semPergunta.sobrou === 0, String(semPergunta.sobrou));

  // ---------- a parcela se identifica em todas as listas ----------
  t.secao('parcela identificada em toda tela');
  const rotulos = await pagina.evaluate(() => {
    const carne = n => Array.from({ length: 3 }, (_, i) => ({
      id: 'r' + n + i, date: '2026-08-0' + (i + 1), type: 'saida', amount: 300, category: 'Ração/insumos',
      grupo: 'g' + n, parcela: i + 1, parcelas: 3, venc: '2026-0' + (9 + i) + '-01', pago: false
    }));
    bovT = carne(1); avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    const fin = $('bfin-list').innerText;
    const apagar = $('bfin-apagar').innerText;
    tab = 'fazenda'; $('fz-period').value = 'all'; render();
    const fazenda = $('fz-lista').innerText;
    return {
      financeiro: (fin.match(/1\/3|2\/3|3\/3/g) || []).length,
      apagar: (apagar.match(/1\/3|2\/3|3\/3/g) || []).length,
      fazenda: (fazenda.match(/1\/3|2\/3|3\/3/g) || []).length
    };
  });
  t.conferir('a lista do Financeiro mostra qual parcela é cada linha',
    rotulos.financeiro === 3, rotulos.financeiro + ' de 3');
  t.conferir('a lista de A pagar mostra qual parcela é cada linha',
    rotulos.apagar === 3, rotulos.apagar + ' de 3');
  t.conferir('a lista da Fazenda mostra qual parcela é cada linha',
    rotulos.fazenda === 3, rotulos.fazenda + ' de 3');

  // ---------- nada some entre o que a Fazenda soma e o que ela lista ----------
  t.secao('a Fazenda mostra tudo o que soma');
  const fazendaFecha = await pagina.evaluate(() => {
    bovT = [{ id: 'f1', date: '2026-08-01', type: 'entrada', amount: 1000, category: 'Venda de gado' }];
    avT = [{ id: 'f2', date: '2026-08-02', type: 'saida', amount: 400, category: 'Ração/insumos' }];
    gerT = [{ id: 'f3', date: '2026-08-03', type: 'saida', amount: 250, category: 'Impostos/Funrural' }];
    tab = 'fazenda'; $('fz-period').value = 'all'; render();
    const R = resumoFazenda('all');
    return { n: R.n, linhas: $('fz-lista').querySelectorAll('[data-trans]').length,
      saldo: R.saldo, temGeral: $('fz-lista').innerText.includes('Geral') };
  });
  t.conferir('a Fazenda lista o mesmo número de lançamentos que soma',
    fazendaFecha.linhas === fazendaFecha.n, `${fazendaFecha.linhas} linhas para ${fazendaFecha.n} somados`);
  t.conferir('e o lançamento Geral aparece nomeado na lista', fazendaFecha.temGeral === true);
  t.conferir('o saldo da fazenda soma os três livros',
    Math.abs(fazendaFecha.saldo - 350) < 1e-9, String(fazendaFecha.saldo));

  // ---------- a prévia do curral avisa antes de gravar ----------
  t.secao('prévia da pesagem');
  const previa = await pagina.evaluate(() => {
    animals = [
      { id: 'pv', ident: '500', dead: true, deadDate: '2026-07-01' },
      { id: 'pw', ident: '501', sold: true, soldDate: '2026-07-01' },
      { id: 'px', ident: '502' }
    ];
    weighings = [
      { id: 'wv', animalId: 'pv', date: '2026-06-01', weight: 300 },
      { id: 'ww', animalId: 'pw', date: '2026-06-01', weight: 300 },
      { id: 'wx', animalId: 'px', date: '2026-06-01', weight: 300 }
    ];
    const ler = brinco => {
      $('wm-date').value = '2026-08-01';
      $('wm-ident').value = brinco; $('wm-peso').value = '360';
      atualizarPreviaPesagem();
      return $('wm-previa').innerText;
    };
    return { morto: ler('500'), vendido: ler('501'), ativo: ler('502'), novo: ler('999') };
  });
  t.conferir('a prévia avisa que o brinco está marcado como MORTO',
    /MORTO/.test(previa.morto), previa.morto.replace(/\n/g, ' | '));
  t.conferir('a prévia avisa que o brinco está marcado como VENDIDO',
    /VENDIDO/.test(previa.vendido), previa.vendido.replace(/\n/g, ' | '));
  t.conferir('animal do rebanho não recebe aviso nenhum',
    !/MORTO|VENDIDO/.test(previa.ativo), previa.ativo.replace(/\n/g, ' | '));
  t.conferir('brinco novo continua avisando que será cadastrado',
    /cadastrado/.test(previa.novo), previa.novo.replace(/\n/g, ' | '));
  t.conferir('e a prévia do animal ativo mostra o GMD',
    /kg\/dia/.test(previa.ativo), previa.ativo.replace(/\n/g, ' | '));

  // ---------- zoom na nota fiscal ----------
  // O app desliga o zoom do navegador de propósito. Se o zoom próprio da nota
  // falhar, não existe outro jeito de ler o valor pequeno de uma nota.
  t.secao('zoom na nota fiscal');
  const zoom = await pagina.evaluate(async () => {
    // Uma foto de nota: 1200x900, gerada aqui para não depender de arquivo.
    const cv = document.createElement('canvas');
    cv.width = 1200; cv.height = 900;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, 1200, 900);
    cx.fillStyle = '#000'; cx.font = '40px sans-serif'; cx.fillText('NOTA 1234', 60, 120);
    const dados = cv.toDataURL('image/jpeg', 0.8);
    const anexo = { id: 'zx', nome: 'nota.jpg', tipo: 'image/jpeg', tamanho: 1000 };
    bovT = [{ id: 'zt', date: '2026-08-01', type: 'saida', amount: 100, category: 'Ração/insumos', anexos: [anexo] }];
    avT = []; gerT = [];
    anexoCache.set('zx', dados);

    await abrirAnexo('zx');
    await new Promise(r => setTimeout(r, 200));
    const caixa = $('ax-zoom'), dentro = $('ax-conteudo');
    const r = { montou: !!(caixa && dentro), temImg: !!document.querySelector('#ax-corpo .ax-img') };
    if (!r.montou) return r;

    r.comecaEm100 = $('ax-nivel').textContent;
    r.larguraInicial = dentro.offsetWidth;
    r.caberEscondidoNoInicio = $('ax-ajustar').hidden === true;

    $('ax-mais').click();
    r.depoisDeAmpliar = $('ax-nivel').textContent;
    r.larguraCresceu = dentro.offsetWidth > r.larguraInicial;
    r.rolaHorizontal = caixa.scrollWidth > caixa.clientWidth;
    r.caberApareceu = $('ax-ajustar').hidden === false;

    $('ax-mais').click(); $('ax-mais').click(); $('ax-mais').click();
    $('ax-mais').click(); $('ax-mais').click(); $('ax-mais').click();
    r.teto = $('ax-nivel').textContent;

    $('ax-ajustar').click();
    r.voltouAoAjuste = $('ax-nivel').textContent;
    r.larguraVoltou = dentro.offsetWidth === r.larguraInicial;

    for (let i = 0; i < 8; i++) $('ax-menos').click();
    r.piso = $('ax-nivel').textContent;
    r.naoEncolheAlemDaTela = dentro.offsetWidth === r.larguraInicial;

    // O ponto mirado tem de continuar debaixo do dedo, senão o zoom "foge"
    zoomPara(1);
    const meio = caixa.clientWidth / 2, alturaMeio = caixa.clientHeight / 2;
    const antes = (caixa.scrollLeft + meio) / dentro.offsetWidth;
    zoomPara(3, meio, alturaMeio);
    const depois = (caixa.scrollLeft + meio) / dentro.offsetWidth;
    r.mirouCerto = Math.abs(antes - depois) < 0.02;
    r.semNaN = Number.isFinite(caixa.scrollLeft) && Number.isFinite(caixa.scrollTop);
    zoomPara(1);
    closeAllM();
    return r;
  });
  t.conferir('a nota abre dentro de uma área com zoom', zoom.montou === true);
  t.conferir('e a foto continua aparecendo', zoom.temImg === true);
  t.conferir('começa em 100%', zoom.comecaEm100 === '100%', zoom.comecaEm100);
  t.conferir('o botão "Caber na tela" fica escondido em 100%', zoom.caberEscondidoNoInicio === true);
  t.conferir('ampliar aumenta o nível mostrado', zoom.depoisDeAmpliar === '150%', zoom.depoisDeAmpliar);
  t.conferir('ampliar aumenta a nota de verdade, não só o número', zoom.larguraCresceu === true);
  t.conferir('ampliada, a nota pode ser arrastada para os lados', zoom.rolaHorizontal === true);
  t.conferir('e o botão "Caber na tela" aparece', zoom.caberApareceu === true);
  t.conferir('o zoom tem teto — não amplia sem fim', zoom.teto === '600%', zoom.teto);
  t.conferir('"Caber na tela" volta para 100%', zoom.voltouAoAjuste === '100%', zoom.voltouAoAjuste);
  t.conferir('e devolve a nota ao tamanho da tela', zoom.larguraVoltou === true);
  t.conferir('o zoom tem piso — a nota nunca some de tão pequena', zoom.piso === '100%', zoom.piso);
  t.conferir('e diminuir além do piso não encolhe a nota', zoom.naoEncolheAlemDaTela === true);
  t.conferir('ampliar mantém debaixo do dedo o ponto que estava debaixo do dedo',
    zoom.mirouCerto === true);
  t.conferir('nenhuma conta de rolagem sai NaN', zoom.semNaN === true);

  // ---------- PDF ampliado é REDESENHADO, não esticado ----------
  t.secao('nitidez do PDF ampliado');
  const nitidez = await pagina.evaluate(async () => {
    // PDF minúsculo mas VÁLIDO, com a tabela de posições certa: sem ela o
    // leitor recusa o arquivo e o teste mediria o PDF falso, não a nitidez.
    const cru = (() => {
      const objs = ['<</Type/Catalog/Pages 2 0 R>>',
                    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
                    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<<>>>>'];
      let out = '%PDF-1.4\n';
      const pos = [];
      objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
      pos.forEach(q => { out += String(q).padStart(10, '0') + ' 00000 n \n'; });
      out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
      return out;
    })();
    const pdf = 'data:application/pdf;base64,' + btoa(cru);
    const anexo = { id: 'zp', nome: 'nota.pdf', tipo: 'application/pdf', tamanho: cru.length };
    bovT = [{ id: 'zpt', date: '2026-08-01', type: 'saida', amount: 100, category: 'Ração/insumos', anexos: [anexo] }];
    anexoCache.set('zp', pdf);
    await abrirAnexo('zp');
    for (let i = 0; i < 80 && !document.querySelector('#ax-corpo .ax-pagina'); i++)
      await new Promise(r => setTimeout(r, 100));
    const pag = () => document.querySelector('#ax-corpo .ax-pagina');
    const r = { desenhou: !!pag() };
    if (!r.desenhou) return Object.assign(r, { motivo: ($('ax-paginas') || {}).textContent || '' });
    r.pixelsEm100 = pag().width;
    zoomPara(3);
    // o redesenho é adiado de propósito, para não redesenhar a cada dedada
    await new Promise(x => setTimeout(x, 500));
    for (let i = 0; i < 80 && pag().width === r.pixelsEm100; i++)
      await new Promise(x => setTimeout(x, 100));
    r.pixelsEm300 = pag().width;
    r.continuaUmaPagina = document.querySelectorAll('#ax-corpo .ax-pagina').length;
    zoomPara(1);
    await new Promise(x => setTimeout(x, 700));
    r.pixelsDeVolta = pag().width;
    closeAllM();
    return r;
  });
  t.conferir('o PDF desenha', nitidez.desenhou === true, nitidez.motivo || '');
  t.conferir('ampliado, o PDF é REDESENHADO em mais pixels (não esticado e borrado)',
    nitidez.pixelsEm300 > nitidez.pixelsEm100 * 2,
    `${nitidez.pixelsEm100}px → ${nitidez.pixelsEm300}px`);
  t.conferir('e continua sendo uma página só, sem duplicar ao redesenhar',
    nitidez.continuaUmaPagina === 1, String(nitidez.continuaUmaPagina));
  t.conferir('voltando a 100%, o PDF é redesenhado menor de novo',
    nitidez.pixelsDeVolta < nitidez.pixelsEm300, `${nitidez.pixelsEm300}px → ${nitidez.pixelsDeVolta}px`);

  // ---------- o código da fazenda tem de estar à mão ----------
  // As regras da nuvem não deixam ninguém listar fazendas, de propósito: o
  // código é a senha dos próprios dados. Esquecido, não há recuperação. Então
  // ele precisa estar visível e copiável dentro do próprio app.
  t.secao('código da fazenda');
  const codigo = await pagina.evaluate(async () => {
    const copiados = [];
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
    navigator.clipboard.writeText = async txt => { copiados.push(txt); };
    farm = 'fazendajs-2026';
    $('btn-menu').click();
    const r = {
      mostra: $('menu-farm-info').innerText.includes('fazendajs-2026'),
      temBotao: !!$('mf-copiar'),
      diz: /mesmo/i.test($('menu-farm-info').innerText),
      // o código não pode sair escapado errado nem cortado
      exato: $('mf-copiar') && $('mf-copiar').textContent === 'fazendajs-2026'
    };
    if ($('mf-copiar')) $('mf-copiar').click();
    await new Promise(x => setTimeout(x, 80));
    r.copiou = copiados[0];
    r.avisou = $('toast').textContent;
    closeAllM();
    return r;
  });
  t.conferir('o menu mostra o código da fazenda', codigo.mostra === true);
  t.conferir('e o código sai inteiro, sem cortar nem escapar errado', codigo.exato === true);
  t.conferir('avisa que é o MESMO código em todo aparelho', codigo.diz === true);
  t.conferir('um toque copia o código', codigo.copiou === 'fazendajs-2026', String(codigo.copiou));
  t.conferir('e confirma que copiou', /copiado/i.test(codigo.avisou), codigo.avisou);

  // Código com caractere que quebraria o HTML não pode virar buraco na tela
  const codigoSujo = await pagina.evaluate(() => {
    farm = '<b>x</b>&"1';
    $('btn-menu').click();
    const r = { texto: $('mf-copiar') ? $('mf-copiar').textContent : '',
      semTagInjetada: !$('menu-farm-info').querySelector('b') };
    closeAllM();
    return r;
  });
  t.conferir('código com caractere especial aparece como foi digitado',
    codigoSujo.texto === '<b>x</b>&"1', codigoSujo.texto);
  t.conferir('e não injeta HTML na tela', codigoSujo.semTagInjetada === true);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
