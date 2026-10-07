// A EXPORTAÇÃO DO FINANCEIRO SAI INTEIRA, EM ORDEM DE DATA.
//
// Relato do dono: "exportação dos dados não está saindo todos os dados;
// verificar da melhor forma para ter todos os dados em ordem de datas, parte
// financeira".
//
// Arquivo que falta linha é pior do que arquivo nenhum: ele é levado ao
// contador e ao banco com cara de completo. E "falta linha" tem várias causas
// possíveis, todas invisíveis de dentro do app:
//
//   · o arquivo sai filtrado pelo que está na TELA — período, regime, busca —
//     sem dizer que filtrou;
//   · as atividades criadas pela fazenda ficam de fora dos arquivos;
//   · dois arquivos saem com o MESMO nome e um sobrescreve o outro na pasta
//     (era o caso: toda atividade virava "financeiro-bovinos");
//   · uma descrição com ponto-e-vírgula, aspas ou quebra de linha desalinha as
//     colunas e a planilha engole as linhas seguintes;
//   · a ordem de data se perde na mão de quem abre, porque dd/mm/aaaa é texto
//     e planilha em inglês lê como mês/dia.
//
// Esta bateria fecha cada uma dessas portas comparando o arquivo com o que
// está salvo, registro por registro, e somando o dinheiro no centavo.
import { servir, abrirApp, placar } from './apoio.mjs';
import { lerCSV } from './csv.mjs';

const cent = v => Math.round(parseFloat(v) * 100);

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Exportação do financeiro, inteira e em ordem de data');

  // Uma fazenda com tudo o que existe, inclusive o que estraga arquivo:
  // atividade criada pelo dono, carnê, compra de estoque, venda de animal,
  // nota fiscal anexada, e descrições com ponto-e-vírgula, aspas e quebra de
  // linha dentro.
  const montado = await pagina.evaluate(() => {
    atividades = [{ id: 'soja', nome: 'Soja 2026' }, { id: 'trigo', nome: 'Trigo & Aveia' }];
    extraT = {}; recomputarLivros();
    bovT = [
      { id: 'b1', date: '2026-03-15', type: 'saida', amount: 1250.5, category: 'Ração/insumos', notes: 'milho; farelo' },
      { id: 'b2', date: '2026-01-10', type: 'entrada', amount: 98000, category: 'Venda de gado', notes: 'boiada "do alto"' },
      { id: 'b3', date: '2026-02-20', type: 'saida', amount: 1000, category: 'Medicamentos/vacinas', grupo: 'g1', parcela: 1, parcelas: 3, venc: '2026-03-20' },
      { id: 'b4', date: '2026-02-20', type: 'saida', amount: 1000, category: 'Medicamentos/vacinas', grupo: 'g1', parcela: 2, parcelas: 3, venc: '2026-04-20' },
      { id: 'b5', date: '2026-02-20', type: 'saida', amount: 1000, category: 'Medicamentos/vacinas', grupo: 'g1', parcela: 3, parcelas: 3, venc: '2026-05-20', pago: true, pagoEm: '2026-05-18' },
      { id: 'b6', date: '2026-04-01', type: 'saida', amount: 3000, category: 'Ração/insumos', lock: 'stock', notes: 'Proteinado\nduas linhas', anexos: [{ id: 'ax1', nome: 'nf-123.pdf' }] },
      { id: 'b7', date: '2026-05-05', type: 'entrada', amount: 9800, category: 'Venda de gado', lock: 'animal', notes: '101' },
      { id: 'b8', date: '2026-12-28', type: 'saida', amount: 480.25, category: 'Combustível', notes: 'fim do ano' },
      { id: 'b9', date: '2025-11-02', type: 'saida', amount: 220, category: 'Frete', notes: 'ano passado' }
    ];
    avT = [{ id: 'a1', date: '2026-03-01', type: 'entrada', amount: 42000, category: 'Pagamento Seara', notes: 'lote 7' },
           { id: 'a2', date: '2026-06-11', type: 'saida', amount: 1830.9, category: 'Gás', notes: '' }];
    gerT = [{ id: 'gg1', date: '2026-02-01', type: 'saida', amount: 700, category: 'Contador/serviços' },
            { id: 'gg2', date: '2026-07-07', type: 'saida', amount: 15000, category: 'Trigo', notes: 'semente' }];
    extraT.soja = [{ id: 's1', date: '2026-04-10', type: 'saida', amount: 5000, category: 'Soja', notes: 'semente' },
                   { id: 's2', date: '2026-09-30', type: 'entrada', amount: 61000, category: 'Soja', notes: 'colheita' }];
    extraT.trigo = [{ id: 'tr1', date: '2026-08-15', type: 'saida', amount: 2750.75, category: 'Trigo', notes: 'adubo' }];
    items = [{ id: 'i1', name: 'Proteinado', unit: 'kg' }];
    moves = [{ id: 'm1', itemId: 'i1', date: '2026-04-01', type: 'entrada', qty: 1000, unitCost: 3, notes: 'compra', linkTrans: 'b6' }];
    animals = [{ id: 'an1', ident: '101', cat: 'Boi', sold: true, soldDate: '2026-05-05', soldPrice: 9800, linkTrans: 'b7' }];
    weighings = [];
    render(); salvarEspelho(true);
    return LIVROS.map(b => ({ b, nome: NOME_LIVRO[b], n: arrLivro(b).length }));
  });
  const totalEsperado = montado.reduce((a, x) => a + x.n, 0);

  // Pega o arquivo que o aplicativo geraria, sem baixar nada.
  const pegar = (chamada, arg) => pagina.evaluate(([c, a]) => {
    let pego = null;
    const orig = window.download;
    window.download = (arq, corpo, mime, bom, resumo) => { pego = { arq, corpo, resumo }; };
    if (c === 'tudo') exportFinTudo(); else exportFin(a);
    window.download = orig;
    return pego;
  }, [chamada, arg]);

  // ---------- 1. a fazenda inteira ----------
  t.secao('o arquivo da fazenda inteira');
  const tudo = await pegar('tudo');
  const tabela = lerCSV(tudo.corpo);
  const cab = tabela[0];
  const linhas = tabela.slice(1).filter(l => l.length > 1);
  const col = (l, nome) => l[cab.indexOf(nome)];
  t.conferir(`traz uma linha para cada um dos ${totalEsperado} lançamentos`,
    linhas.length === totalEsperado, `${linhas.length} de ${totalEsperado}`);
  const ids = linhas.map(l => col(l, 'id'));
  const naBase = await pagina.evaluate(() => LIVROS.flatMap(b => arrLivro(b).map(x => x.id)));
  const faltando = naBase.filter(id => !ids.includes(id));
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  t.conferir('nenhum lançamento faltando', faltando.length === 0, faltando.join(' · '));
  t.conferir('nenhum lançamento repetido', repetidos.length === 0, repetidos.join(' · '));
  t.conferir('e nenhuma linha que não exista na fazenda',
    ids.every(id => naBase.includes(id)), ids.filter(id => !naBase.includes(id)).join(' · '));

  t.secao('as atividades criadas pela fazenda');
  const atividadesNoArquivo = new Set(linhas.map(l => col(l, 'atividade')));
  t.conferir('Soja 2026 está no arquivo', atividadesNoArquivo.has('Soja 2026'),
    [...atividadesNoArquivo].join(' · '));
  t.conferir('Trigo & Aveia também', atividadesNoArquivo.has('Trigo & Aveia'));
  t.conferir('e as três atividades fixas',
    ['Bovinos', 'Aviários', 'Geral'].every(x => atividadesNoArquivo.has(x)));
  const porAtividade = {};
  linhas.forEach(l => { const a = col(l, 'atividade'); porAtividade[a] = (porAtividade[a] || 0) + 1; });
  const contagemErrada = montado.filter(x => (porAtividade[x.nome] || 0) !== x.n);
  t.conferir('cada atividade com o número exato de lançamentos dela',
    contagemErrada.length === 0,
    contagemErrada.map(x => `${x.nome}: ${porAtividade[x.nome] || 0} de ${x.n}`).join(' | '));

  t.secao('em ordem de data');
  const isos = linhas.map(l => col(l, 'data_iso'));
  t.conferir('a ordem é crescente pela data do lançamento',
    isos.every((d, i) => i === 0 || d >= isos[i - 1]), isos.join(' '));
  t.conferir('a primeira coluna é a data em aaaa-mm-dd, que ordena igual em qualquer planilha',
    cab[0] === 'data_iso' && isos.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), cab[0]);
  t.conferir('e a data em português vem junto, para ler',
    linhas.every(l => /^\d{2}\/\d{2}\/\d{4}$/.test(col(l, 'data'))), col(linhas[0], 'data'));
  // Ano anterior e dezembro no mesmo arquivo: é o teste de que a ordem é por
  // data de verdade, e não por ordem de digitação.
  t.conferir('lançamento do ano passado vem primeiro e o de dezembro por último',
    isos[0] === '2025-11-02' && isos[isos.length - 1] === '2026-12-28',
    `${isos[0]} … ${isos[isos.length - 1]}`);
  // Mesmo dia: a ordem não pode ser indefinida, senão dois arquivos do mesmo
  // mês não dão para comparar.
  const deNovo = lerCSV((await pegar('tudo')).corpo).slice(1).filter(l => l.length > 1);
  t.conferir('o mesmo arquivo sai igual duas vezes, linha por linha',
    deNovo.map(l => l.join('|')).join('\n') === linhas.map(l => l.join('|')).join('\n'));
  t.conferir('as parcelas do carnê saem em ordem de parcela',
    linhas.filter(l => col(l, 'parcela')).map(l => col(l, 'parcela')).join(' ') === '1/3 2/3 3/3',
    linhas.filter(l => col(l, 'parcela')).map(l => col(l, 'parcela')).join(' '));

  t.secao('o dinheiro');
  const somaArquivo = linhas.reduce((a, l) => a + cent(col(l, 'valor_numero')), 0);
  const somaBase = await pagina.evaluate(() =>
    LIVROS.flatMap(b => arrLivro(b)).reduce((a, x) => a + Math.round(x.amount * 100), 0));
  t.conferir('a soma dos valores do arquivo é a soma da fazenda, no centavo',
    somaArquivo === somaBase, `arquivo ${somaArquivo} · fazenda ${somaBase}`);
  const valorErrado = linhas.filter(l => {
    const n = cent(col(l, 'valor_numero'));
    const emPortugues = Math.round(parseFloat(col(l, 'valor').replace(/\./g, '').replace(',', '.')) * 100);
    return n !== emPortugues;
  });
  t.conferir('o valor em português e o valor para planilha dizem o mesmo número',
    valorErrado.length === 0, valorErrado.map(l => col(l, 'id')).join(' · '));
  // O saldo acumulado é o conferidor embutido: se faltar linha, ele não fecha.
  const saldoFinal = cent(col(linhas[linhas.length - 1], 'saldo_acumulado'));
  const saldoBase = await pagina.evaluate(() =>
    LIVROS.flatMap(b => arrLivro(b)).reduce((a, x) =>
      a + (x.type === 'entrada' ? 1 : -1) * Math.round(x.amount * 100), 0));
  t.conferir('o saldo acumulado da última linha é o saldo da fazenda',
    saldoFinal === saldoBase, `arquivo ${saldoFinal} · fazenda ${saldoBase}`);
  let correndo = 0;
  const saldoTorto = linhas.filter(l => {
    correndo += (col(l, 'tipo') === 'entrada' ? 1 : -1) * cent(col(l, 'valor_numero'));
    return cent(col(l, 'saldo_acumulado')) !== correndo;
  });
  t.conferir('e ele fecha linha por linha, do começo ao fim',
    saldoTorto.length === 0, saldoTorto.map(l => col(l, 'id')).join(' · '));

  t.secao('o que estraga arquivo');
  t.conferir('todas as linhas têm o mesmo número de colunas do cabeçalho',
    linhas.every(l => l.length === cab.length),
    (linhas.find(l => l.length !== cab.length) || []).join('|').slice(0, 90));
  t.conferir('descrição com ponto-e-vírgula não desalinha as colunas',
    col(linhas.find(l => col(l, 'id') === 'b1'), 'descricao') === 'milho; farelo',
    col(linhas.find(l => col(l, 'id') === 'b1'), 'descricao'));
  t.conferir('descrição com aspas sai com as aspas',
    col(linhas.find(l => col(l, 'id') === 'b2'), 'descricao') === 'boiada "do alto"',
    col(linhas.find(l => col(l, 'id') === 'b2'), 'descricao'));
  // A quebra de linha vira " · " de propósito: dentro do campo ela é CSV
  // válido, mas parte o registro em duas linhas no arquivo, e aí "uma linha por
  // lançamento" deixa de valer — importador simples lê o pedaço de baixo como
  // lançamento novo, e o arquivo passa a ter linha que a fazenda não tem.
  t.conferir('descrição com quebra de linha não parte o lançamento em dois',
    col(linhas.find(l => col(l, 'id') === 'b6'), 'descricao') === 'Proteinado · duas linhas',
    JSON.stringify(col(linhas.find(l => col(l, 'id') === 'b6'), 'descricao')));
  t.conferir('e o arquivo tem exatamente uma linha física por lançamento',
    tudo.corpo.split('\n').filter(Boolean).length === totalEsperado + 1,
    `${tudo.corpo.split('\n').filter(Boolean).length} linha(s) para ${totalEsperado} lançamentos`);
  t.conferir('nome de atividade com & sai inteiro',
    linhas.some(l => col(l, 'atividade') === 'Trigo & Aveia'));
  t.conferir('nenhum NaN, undefined nem null no arquivo',
    !/NaN|undefined|null/.test(tudo.corpo), (tudo.corpo.match(/.{0,40}(NaN|undefined|null).{0,20}/) || [''])[0]);

  t.secao('as colunas que o contador precisa');
  ['data_iso', 'data', 'atividade', 'tipo', 'valor', 'valor_numero', 'saldo_acumulado',
   'categoria', 'classificacao', 'parcela', 'vencimento', 'venc_iso', 'pago', 'pago_em',
   'nota_fiscal', 'origem', 'descricao', 'id'].forEach(c => {
    t.conferir(`coluna "${c}"`, cab.includes(c), cab.join(';'));
  });
  const paga = linhas.find(l => col(l, 'id') === 'b5');
  t.conferir('a conta paga traz a data em que foi paga, não só "sim"',
    col(paga, 'pago') === 'sim' && col(paga, 'pago_em') === '18/05/2026'
    && col(paga, 'venc_iso') === '2026-05-20',
    `${col(paga, 'pago')} · ${col(paga, 'pago_em')}`);
  t.conferir('o lançamento com nota fiscal diz o nome do arquivo dela',
    col(linhas.find(l => col(l, 'id') === 'b6'), 'nota_fiscal') === 'nf-123.pdf');
  t.conferir('e diz o que foi gerado por estoque e por venda de animal',
    col(linhas.find(l => col(l, 'id') === 'b6'), 'origem') === 'compra de estoque'
    && col(linhas.find(l => col(l, 'id') === 'b7'), 'origem') === 'venda de animal');

  // ---------- 2. O FILTRO DA TELA NÃO PODE ENTRAR NO ARQUIVO ----------
  // A causa mais provável de "não saiu tudo": a tela está num mês, num regime,
  // com uma busca digitada — e o arquivo sai do tamanho da tela, calado.
  t.secao('o filtro da tela não entra no arquivo');
  const comFiltro = await pagina.evaluate(() => {
    definirRegime('caixa');
    $('bfin-period').value = '2026-03'; guardarPeriodo('bfin-period');
    $('bfin-busca').value = 'milho';
    if ($('fz-period')) { $('fz-period').value = '2026-03'; guardarPeriodo('fz-period'); }
    tab = 'bovinos'; seg = 'financeiro'; render();
    return { naTela: document.querySelectorAll('#bfin-list .transaction-item').length };
  });
  const filtrado = await pegar('tudo');
  const linhasFiltrado = lerCSV(filtrado.corpo).slice(1).filter(l => l.length > 1);
  t.conferir('a tela de fato está filtrada (uma linha à vista)',
    comFiltro.naTela < totalEsperado, `${comFiltro.naTela} na tela`);
  t.conferir('mas o arquivo sai com TODOS os lançamentos, do mesmo jeito',
    linhasFiltrado.length === totalEsperado, `${linhasFiltrado.length} de ${totalEsperado}`);
  const bovFiltrado = await pegar('fin', 'bov');
  t.conferir('e o arquivo de um livro só também ignora o filtro',
    lerCSV(bovFiltrado.corpo).slice(1).filter(l => l.length > 1).length === 9,
    `${lerCSV(bovFiltrado.corpo).slice(1).filter(l => l.length > 1).length} de 9`);
  await pagina.evaluate(() => {
    definirRegime('competencia');
    $('bfin-period').value = 'all'; guardarPeriodo('bfin-period');
    $('bfin-busca').value = ''; render();
  });

  // ---------- 3. um arquivo por atividade, com nome próprio ----------
  // Era aqui o furo de verdade: toda atividade virava "financeiro-bovinos".
  // Exportar a Soja depois dos Bovinos dava dois arquivos com o MESMO nome —
  // um sobrescrevia o outro na pasta, e o que sobrava parecia ter perdido
  // quase todos os lançamentos.
  t.secao('um arquivo por atividade, cada um com o seu nome');
  const porLivro = {};
  for (const x of montado) porLivro[x.b] = await pegar('fin', x.b);
  const nomes = Object.values(porLivro).map(p => p.arq);
  t.conferir('nenhum arquivo com nome repetido',
    new Set(nomes).size === nomes.length, nomes.join(' · '));
  t.conferir('o nome do arquivo diz de qual atividade ele é',
    /soja-2026/.test(porLivro.soja.arq) && /trigo-aveia/.test(porLivro.trigo.arq),
    `${porLivro.soja.arq} · ${porLivro.trigo.arq}`);
  const semAcentoNoNome = nomes.every(a => /^[a-z0-9.-]+$/.test(a));
  t.conferir('sem acento, espaço nem símbolo que atrapalhe o aparelho',
    semAcentoNoNome, nomes.join(' · '));
  const erradas = montado.filter(x =>
    lerCSV(porLivro[x.b].corpo).slice(1).filter(l => l.length > 1).length !== x.n);
  t.conferir('cada arquivo com o número exato de lançamentos da atividade',
    erradas.length === 0,
    erradas.map(x => `${x.nome}: ${lerCSV(porLivro[x.b].corpo).slice(1).filter(l => l.length > 1).length} de ${x.n}`).join(' | '));
  // Os arquivos por atividade somados têm de dar o da fazenda inteira: é a
  // prova de que nenhum lançamento mora fora de todos eles.
  const somaDosPedacos = montado.reduce((a, x) =>
    a + lerCSV(porLivro[x.b].corpo).slice(1).filter(l => l.length > 1)
      .reduce((b, l) => b + cent(l[cab.indexOf('valor_numero')]), 0), 0);
  t.conferir('os arquivos por atividade somados dão a fazenda inteira',
    somaDosPedacos === somaBase, `pedaços ${somaDosPedacos} · fazenda ${somaBase}`);
  t.conferir('e todos têm o mesmo cabeçalho, para poder juntar num só',
    new Set([tudo.corpo.split('\n')[0], ...Object.values(porLivro).map(p => p.corpo.split('\n')[0])]).size === 1);

  t.secao('o menu oferece cada atividade');
  const noMenu = await pagina.evaluate(() => {
    closeAllM(); $('btn-menu').click();
    const itens = [...document.querySelectorAll('[data-exp-livro]')].map(b => ({
      livro: b.dataset.expLivro, texto: b.textContent.replace(/\s+/g, ' ').trim() }));
    closeAllM();
    return itens;
  });
  t.conferir('há um item de exportação para cada atividade criada',
    noMenu.length === 2 && noMenu.some(i => i.livro === 'soja') && noMenu.some(i => i.livro === 'trigo'),
    noMenu.map(i => i.texto).join(' | '));
  t.conferir('com o nome da atividade e quantos lançamentos ela tem',
    /Soja 2026/.test(noMenu.find(i => i.livro === 'soja').texto)
    && /2$/.test(noMenu.find(i => i.livro === 'soja').texto),
    noMenu.find(i => i.livro === 'soja').texto);

  t.secao('a tela diz o que saiu no arquivo');
  // No iPhone instalado o arquivo não "baixa": aparece uma tela com o nome
  // dele. Só o nome não responde "saiu tudo?".
  t.conferir('o resumo traz quantos lançamentos foram',
    new RegExp('\\b' + totalEsperado + ' lançamento\\(s\\)').test(tudo.resumo || ''),
    tudo.resumo || 'sem resumo');
  t.conferir('e de que dia a que dia',
    /02\/11\/2025 a 28\/12\/2026/.test(tudo.resumo || ''), tudo.resumo || '');
  t.conferir('e quanto somam as entradas e as saídas',
    /entradas R\$/.test(tudo.resumo || '') && /saídas R\$/.test(tudo.resumo || ''), tudo.resumo || '');

  t.secao('fazenda vazia');
  // Arquivo com só o cabeçalho é a resposta certa para fazenda sem lançamento:
  // arquivo sem cabeçalho nenhum pareceria defeito.
  const vazio = await pagina.evaluate(() => {
    bovT = []; avT = []; gerT = []; extraT = { soja: [], trigo: [] }; recomputarLivros();
    let pego = null;
    const orig = window.download;
    window.download = (arq, corpo, mime, bom, resumo) => { pego = { corpo, resumo }; };
    exportFinTudo();
    window.download = orig;
    return pego;
  });
  t.conferir('sai o cabeçalho, sem nenhuma linha', lerCSV(vazio.corpo).length === 1,
    `${lerCSV(vazio.corpo).length} linha(s)`);
  t.conferir('e a tela diz que não havia lançamento nenhum',
    /0 lançamento/.test(vazio.resumo || ''), vazio.resumo || '');

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
