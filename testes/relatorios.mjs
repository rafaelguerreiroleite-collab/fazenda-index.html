// TRÊS RELATÓRIOS PARA AUDITAR: BOVINOS, AVIÁRIOS E A FAZENDA.
//
// Pedido do dono: "para auditar, lembrar de fazer 3 relatórios — bovinos,
// aviários, e fazenda que é o geral".
//
// Auditoria tem uma exigência que relatório de tela não tem: as PARTES têm de
// somar o TODO, e cada parte tem de dizer o que ficou de fora dela. Sem isso,
// quem confere Bovinos e depois a Fazenda acha uma diferença e não sabe se é
// erro do aplicativo ou é recorte do relatório — e vai atrás de um problema
// que não existe, ou deixa passar um que existe.
//
// Esta bateria cobra as quatro coisas que fazem um relatório auditável:
//
//   1. cada um declara o próprio escopo, e o que NÃO entra nele;
//   2. as partes somam o todo, no centavo;
//   3. nada de uma atividade vaza para o relatório da outra;
//   4. o relatório AMARRA no arquivo de lançamentos: o número de lançamentos
//      somados é o número de linhas do arquivo, e "entradas − saídas" é o
//      saldo_acumulado da última linha dele. É por aqui que o auditor liga o
//      resumo ao detalhe sem refazer uma única conta.
import { servir, abrirApp, placar } from './apoio.mjs';
import { lerCSV } from './csv.mjs';

const cent = txt => Math.round(parseFloat(String(txt).replace(/\./g, '').replace(',', '.')) * 100);

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Três relatórios para auditar');

  // Uma fazenda com as três atividades fixas, uma criada pelo dono, contas a
  // pagar e a receber dos dois lados, rebanho, estoque e carnê.
  await pagina.evaluate(() => {
    atividades = [{ id: 'soja', nome: 'Soja 2026' }];
    extraT = {}; recomputarLivros();
    bovT = [
      { id: 'b1', date: '2026-03-15', type: 'saida', amount: 1250.5, category: 'Ração/insumos' },
      { id: 'b2', date: '2026-01-10', type: 'entrada', amount: 98000, category: 'Venda de gado' },
      { id: 'b3', date: '2026-02-20', type: 'saida', amount: 1000, category: 'Medicamentos/vacinas', venc: '2026-03-20' },
      { id: 'b4', date: '2026-06-01', type: 'entrada', amount: 30000, category: 'Venda de gado', venc: '2026-11-10' }
    ];
    avT = [
      { id: 'a1', date: '2026-03-01', type: 'entrada', amount: 42000, category: 'Pagamento Seara' },
      { id: 'a2', date: '2026-04-02', type: 'saida', amount: 1830.9, category: 'Gás', venc: '2026-05-02' }
    ];
    gerT = [{ id: 'g1', date: '2026-02-01', type: 'saida', amount: 700, category: 'Contador/serviços' }];
    extraT.soja = [{ id: 's1', date: '2026-04-10', type: 'saida', amount: 5000, category: 'Soja' }];
    items = [{ id: 'i1', name: 'Proteinado', unit: 'kg' }];
    moves = [{ id: 'm1', itemId: 'i1', date: '2026-04-01', type: 'entrada', qty: 1000, unitCost: 3 }];
    animals = [{ id: 'an1', ident: '101', cat: 'Boi', entryDate: '2026-01-05', entryWeight: 300 }];
    weighings = [{ id: 'w1', animalId: 'an1', date: '2026-01-05', weight: 300, jejum: false },
                 { id: 'w2', animalId: 'an1', date: '2026-04-01', weight: 450, jejum: false }];
    render();
  });

  // Pega os três relatórios e os três arquivos de lançamentos, sem baixar nada.
  const tudo = await pagina.evaluate(() => {
    const pego = {};
    const real = window.download;
    window.download = (nome, corpo, m, b, resumo) => { pego[nome] = { nome, corpo, resumo }; };
    exportRelatorio('bov'); exportRelatorio('av'); exportRelatorio('fazenda');
    const rel = Object.assign({}, pego);
    Object.keys(pego).forEach(k => delete pego[k]);
    exportFin('bov'); exportFin('av'); exportFinTudo();
    const fin = Object.assign({}, pego);
    window.download = real;
    return { rel: Object.values(rel), fin: Object.values(fin) };
  });
  const rel = nome => tudo.rel.find(r => r.nome.indexOf('relatorio-' + nome + '-') === 0);
  const bov = rel('bovinos'), av = rel('aviarios'), fz = rel('fazenda');

  // Lê a tabela secao;item;valor;detalhe de um relatório.
  const ler = r => lerCSV(r.corpo).slice(1).filter(l => l.length > 1)
    .map(p2 => ({ secao: p2[0], item: p2[1], valor: p2[2], detalhe: p2[3] || '' }));
  const val = (linhas, secao, item) => {
    const l = linhas.find(x => x.secao === secao && x.item === item);
    return l ? l.valor : null;
  };
  const Lbov = ler(bov), Lav = ler(av), Lfz = ler(fz);

  // ---------- 1. os três existem, cada um com o seu arquivo ----------
  t.secao('os três relatórios');
  t.conferir('saem três arquivos, um por relatório', tudo.rel.length === 3,
    tudo.rel.map(r => r.nome).join(' · '));
  t.conferir('cada um com nome próprio, sem sobrescrever o outro',
    !!bov && !!av && !!fz && new Set(tudo.rel.map(r => r.nome)).size === 3,
    tudo.rel.map(r => r.nome).join(' · '));
  t.conferir('o nome diz de qual atividade é e em que dia saiu',
    /^relatorio-bovinos-fazendajs-\d{4}-\d{2}-\d{2}\.csv$/.test(bov.nome), bov.nome);
  t.conferir('todos com as mesmas quatro colunas',
    [bov, av, fz].every(r => r.corpo.split('\n')[0] === 'secao;item;valor;detalhe'),
    bov.corpo.split('\n')[0]);

  // ---------- 2. cada um declara o próprio escopo ----------
  // É a primeira coisa que um auditor precisa: saber o que está olhando.
  t.secao('cada um declara o que entra e o que fica de fora');
  t.conferir('o de Bovinos diz que o escopo é Bovinos',
    val(Lbov, 'Relatório', 'Escopo') === 'Bovinos', val(Lbov, 'Relatório', 'Escopo'));
  t.conferir('e diz nominalmente o que NÃO entra nele',
    /Aviários/.test(val(Lbov, 'Relatório', 'O que NÃO entra') || '')
    && /Geral/.test(val(Lbov, 'Relatório', 'O que NÃO entra') || '')
    && /Soja 2026/.test(val(Lbov, 'Relatório', 'O que NÃO entra') || ''),
    val(Lbov, 'Relatório', 'O que NÃO entra'));
  t.conferir('o de Aviários diz que o escopo é Aviários',
    val(Lav, 'Relatório', 'Escopo') === 'Aviários', val(Lav, 'Relatório', 'Escopo'));
  t.conferir('o da Fazenda diz que entra tudo, e soma as atividades pelo nome',
    val(Lfz, 'Relatório', 'O que entra') === 'tudo'
    && /Bovinos \+ Aviários \+ Geral \+ Soja 2026/.test(
      (Lfz.find(x => x.secao === 'Relatório' && x.item === 'Escopo') || {}).detalhe || ''),
    (Lfz.find(x => x.secao === 'Relatório' && x.item === 'Escopo') || {}).detalhe);
  t.conferir('todos dizem o dia e a versão do aplicativo que os gerou',
    [Lbov, Lav, Lfz].every(L => /^\d{2}\/\d{2}\/\d{4}$/.test(val(L, 'Relatório', 'Gerado em') || '')
      && /versão \d+/.test((L.find(x => x.item === 'Gerado em') || {}).detalhe || '')),
    val(Lbov, 'Relatório', 'Gerado em'));

  // ---------- 3. AS PARTES SOMAM O TODO ----------
  // A conta que o auditor faz primeiro. Se não fechar, nada do resto importa.
  t.secao('as partes somam o todo');
  const geralSozinho = await pagina.evaluate(() => {
    const r = resumoFazenda('all', undefined, undefined, ['ger']);
    const so = resumoFazenda('all', undefined, undefined, ['soja']);
    return { ger: { rec: Math.round(r.receitas * 100), cus: Math.round(r.custos * 100), n: r.n },
      soja: { rec: Math.round(so.receitas * 100), cus: Math.round(so.custos * 100), n: so.n } };
  });
  const recBov = cent(val(Lbov, 'Resumo', 'Receitas')), cusBov = cent(val(Lbov, 'Resumo', 'Custos'));
  const recAv = cent(val(Lav, 'Resumo', 'Receitas')), cusAv = cent(val(Lav, 'Resumo', 'Custos'));
  const recFz = cent(val(Lfz, 'Resumo', 'Receitas')), cusFz = cent(val(Lfz, 'Resumo', 'Custos'));
  t.conferir('receitas: Bovinos + Aviários + Geral + Soja = Fazenda, no centavo',
    recBov + recAv + geralSozinho.ger.rec + geralSozinho.soja.rec === recFz,
    `${recBov} + ${recAv} + ${geralSozinho.ger.rec} + ${geralSozinho.soja.rec} = ${recBov + recAv + geralSozinho.ger.rec + geralSozinho.soja.rec} · Fazenda ${recFz}`);
  t.conferir('custos: idem, no centavo',
    cusBov + cusAv + geralSozinho.ger.cus + geralSozinho.soja.cus === cusFz,
    `somado ${cusBov + cusAv + geralSozinho.ger.cus + geralSozinho.soja.cus} · Fazenda ${cusFz}`);
  const nBov = Number(val(Lbov, 'Conferência', 'Lançamentos somados'));
  const nAv = Number(val(Lav, 'Conferência', 'Lançamentos somados'));
  const nFz = Number(val(Lfz, 'Conferência', 'Lançamentos somados'));
  t.conferir('e a contagem de lançamentos também fecha',
    nBov + nAv + geralSozinho.ger.n + geralSozinho.soja.n === nFz,
    `${nBov} + ${nAv} + ${geralSozinho.ger.n} + ${geralSozinho.soja.n} · Fazenda ${nFz}`);
  t.conferir('o saldo de cada relatório é receitas menos custos',
    cent(val(Lbov, 'Resumo', 'Saldo')) === recBov - cusBov
    && cent(val(Lav, 'Resumo', 'Saldo')) === recAv - cusAv
    && cent(val(Lfz, 'Resumo', 'Saldo')) === recFz - cusFz);
  // A pagar e a receber também são por atividade: somar a conta do aviário no
  // relatório dos bovinos faria o gado parecer mais endividado do que é.
  t.conferir('o a pagar de cada um é só o da atividade dele',
    cent(val(Lbov, 'Resumo', 'A pagar em aberto')) === 100000
    && cent(val(Lav, 'Resumo', 'A pagar em aberto')) === 183090
    && cent(val(Lfz, 'Resumo', 'A pagar em aberto')) === 283090,
    `bov ${val(Lbov, 'Resumo', 'A pagar em aberto')} · av ${val(Lav, 'Resumo', 'A pagar em aberto')} · fz ${val(Lfz, 'Resumo', 'A pagar em aberto')}`);
  // O a receber não aparecia em relatório nenhum: auditar só o que se deve, sem
  // o que se tem para receber, dá o retrato pela metade — e o mais pessimista.
  t.conferir('o a receber aparece, e também por atividade',
    cent(val(Lbov, 'Resumo', 'A receber em aberto')) === 3000000
    && cent(val(Lav, 'Resumo', 'A receber em aberto')) === 0,
    `bov ${val(Lbov, 'Resumo', 'A receber em aberto')} · av ${val(Lav, 'Resumo', 'A receber em aberto')}`);
  t.conferir('com a conta a receber listada uma por uma',
    Lbov.some(x => x.secao === 'A receber' && /Venda de gado/.test(x.item)),
    Lbov.filter(x => x.secao === 'A receber').map(x => x.item).join(' | ') || 'nenhuma linha');

  // ---------- 4. nada vaza de uma atividade para a outra ----------
  t.secao('nada vaza de uma atividade para a outra');
  t.conferir('o relatório de Bovinos não traz categoria dos aviários',
    !Lbov.some(x => x.secao === 'Categoria' && /Seara|Gás/.test(x.item)),
    Lbov.filter(x => x.secao === 'Categoria').map(x => x.item).join(' | '));
  t.conferir('nem o contador do Geral, nem a semente da Soja',
    !Lbov.some(x => x.secao === 'Categoria' && /Contador|Soja/.test(x.item)));
  t.conferir('o de Aviários não traz nada dos bovinos',
    !Lav.some(x => x.secao === 'Categoria' && /gado|Ração|Medicamentos/.test(x.item)),
    Lav.filter(x => x.secao === 'Categoria').map(x => x.item).join(' | '));
  t.conferir('as contas a pagar de cada relatório são só da atividade dele',
    Lbov.filter(x => x.secao === 'A pagar').every(x => /^Bovinos ·/.test(x.item))
    && Lav.filter(x => x.secao === 'A pagar').every(x => /^Aviários ·/.test(x.item)),
    Lbov.filter(x => x.secao === 'A pagar').map(x => x.item).join(' | '));
  t.conferir('e o da Fazenda traz as duas, com o nome da atividade na frente',
    Lfz.filter(x => x.secao === 'A pagar').some(x => /^Bovinos ·/.test(x.item))
    && Lfz.filter(x => x.secao === 'A pagar').some(x => /^Aviários ·/.test(x.item)),
    Lfz.filter(x => x.secao === 'A pagar').map(x => x.item).join(' | '));

  // ---------- 5. rebanho, GMD e estoque só onde fazem sentido ----------
  t.secao('rebanho, GMD e estoque');
  t.conferir('o de Bovinos traz o rebanho',
    Lbov.some(x => x.secao === 'Rebanho' && x.item === 'Animais no rebanho'));
  t.conferir('traz o GMD do rebanho e o GMD mês a mês',
    Lbov.some(x => x.secao === 'GMD do rebanho') && Lbov.some(x => x.secao === 'GMD mês a mês'));
  t.conferir('e traz o estoque, com custo médio',
    Lbov.some(x => x.secao === 'Estoque' && x.item === 'Proteinado'
      && /custo médio/.test(x.detalhe)),
    (Lbov.find(x => x.secao === 'Estoque') || {}).detalhe);
  // Omitir em silêncio faria parecer que faltou dado no arquivo.
  t.conferir('o de Aviários não traz rebanho nem estoque',
    !Lav.some(x => x.secao === 'Rebanho') && !Lav.some(x => x.secao === 'Estoque')
    && !Lav.some(x => x.secao === 'GMD do rebanho'));
  t.conferir('mas DIZ que não traz, e por quê',
    Lav.some(x => /Não entram neste relatório/.test(x.item) && /Bovinos/.test(x.detalhe)),
    (Lav.find(x => /Não entram/.test(x.item)) || {}).detalhe || 'não diz nada');
  t.conferir('o da Fazenda traz o rebanho e o estoque',
    Lfz.some(x => x.secao === 'Rebanho') && Lfz.some(x => x.secao === 'Estoque'));
  t.conferir('o rebanho do relatório é o mesmo da tela',
    Number(val(Lbov, 'Rebanho', 'Animais no rebanho'))
      === await pagina.evaluate(() => animals.filter(noRebanho).length),
    val(Lbov, 'Rebanho', 'Animais no rebanho'));

  // ---------- 6. as duas visões do dinheiro ----------
  t.secao('competência e caixa, lado a lado');
  t.conferir('todos trazem o caixa, separado do resultado por competência',
    [Lbov, Lav, Lfz].every(L => L.some(x => x.secao === 'Caixa' && x.item === 'Saldo de caixa')));
  t.conferir('e o caixa do Bovinos ignora o que ainda não foi pago nem recebido',
    cent(val(Lbov, 'Caixa', 'Receitas recebidas')) === 9800000
    && cent(val(Lbov, 'Caixa', 'Custos pagos')) === 125050,
    `recebido ${val(Lbov, 'Caixa', 'Receitas recebidas')} · pago ${val(Lbov, 'Caixa', 'Custos pagos')}`);
  t.conferir('dizendo quanto falta pagar e quanto falta receber',
    cent(val(Lbov, 'Caixa', 'Ainda não pago')) === 100000
    && cent(val(Lbov, 'Caixa', 'Ainda não recebido')) === 3000000,
    `${val(Lbov, 'Caixa', 'Ainda não pago')} · ${val(Lbov, 'Caixa', 'Ainda não recebido')}`);
  t.conferir('a quebra por atividade sai no consolidado',
    Lfz.filter(x => x.secao === 'Atividade').length === 4,
    Lfz.filter(x => x.secao === 'Atividade').map(x => x.item).join(' | '));
  // Num relatório de uma atividade só, a quebra seria uma linha repetindo o
  // resumo — e linha repetida em relatório de auditoria é convite a erro.
  t.conferir('e não sai no de uma atividade só, onde seria o resumo repetido',
    Lbov.filter(x => x.secao === 'Atividade').length === 0);
  t.conferir('as três naturezas saem sempre, inclusive em zero',
    [Lbov, Lav, Lfz].every(L =>
      ['Receita', 'Custeio', 'Investimento'].every(c => val(L, 'Natureza', c) !== null)),
    ['Receita', 'Custeio', 'Investimento'].map(c => val(Lav, 'Natureza', c)).join(' · '));
  t.conferir('e somam o movimento do período, sem sobra nem falta',
    [[Lbov, recBov, cusBov], [Lav, recAv, cusAv], [Lfz, recFz, cusFz]].every(([L, rc, cs]) =>
      cent(val(L, 'Natureza', 'Receita')) + cent(val(L, 'Natureza', 'Custeio'))
      + cent(val(L, 'Natureza', 'Investimento')) === rc + cs),
    `fazenda: naturezas ${cent(val(Lfz, 'Natureza', 'Receita')) + cent(val(Lfz, 'Natureza', 'Custeio')) + cent(val(Lfz, 'Natureza', 'Investimento'))} · movimento ${recFz + cusFz}`);

  // ---------- 7. O RELATÓRIO AMARRA NO ARQUIVO DE LANÇAMENTOS ----------
  // O fecho da auditoria: o resumo tem de encostar no detalhe sem refazer
  // conta. O relatório diz o nome do arquivo, quantas linhas ele tem de ter, e
  // qual é o saldo da última linha dele.
  t.secao('o relatório amarra no arquivo de lançamentos');
  const fin = nome => tudo.fin.find(f => f.nome.indexOf('financeiro-' + nome) === 0);
  const pares = [['bovinos', Lbov, bov], ['aviarios', Lav, av], ['fazenda-inteira', Lfz, fz]];
  pares.forEach(([arq, L, r]) => {
    const apontado = val(L, 'Relatório', 'Arquivo de lançamentos correspondente');
    t.conferir(`o relatório de ${arq} aponta o arquivo certo`,
      !!fin(arq) && apontado === fin(arq).nome, `aponta ${apontado} · existe ${fin(arq) && fin(arq).nome}`);
  });
  pares.forEach(([arq, L]) => {
    const f = fin(arq);
    if (!f) return;
    const linhas = f.corpo.split('\n').filter(Boolean);
    const cab = linhas[0].split(';');
    const corpo = linhas.slice(1);
    const nDito = Number(val(L, 'Conferência', 'Lançamentos somados'));
    t.conferir(`${arq}: o número de lançamentos do relatório é o de linhas do arquivo`,
      corpo.length === nDito, `relatório ${nDito} · arquivo ${corpo.length}`);
    const ultimo = corpo[corpo.length - 1];
    const saldoArq = ultimo
      ? Math.round(parseFloat(ultimo.split(';')[cab.indexOf('saldo_acumulado')]) * 100) : 0;
    t.conferir(`${arq}: "entradas − saídas" do relatório é o saldo acumulado da última linha`,
      cent(val(L, 'Conferência', 'Entradas − saídas')) === saldoArq,
      `relatório ${val(L, 'Conferência', 'Entradas − saídas')} · arquivo ${(saldoArq / 100).toFixed(2)}`);
    const somaEnt = corpo.filter(l => l.split(';')[cab.indexOf('tipo')] === 'entrada')
      .reduce((a, l) => a + Math.round(parseFloat(l.split(';')[cab.indexOf('valor_numero')]) * 100), 0);
    const somaSai = corpo.filter(l => l.split(';')[cab.indexOf('tipo')] === 'saida')
      .reduce((a, l) => a + Math.round(parseFloat(l.split(';')[cab.indexOf('valor_numero')]) * 100), 0);
    t.conferir(`${arq}: as somas do relatório são as somas do arquivo, no centavo`,
      cent(val(L, 'Conferência', 'Soma das entradas')) === somaEnt
      && cent(val(L, 'Conferência', 'Soma das saídas')) === somaSai,
      `relatório +${val(L, 'Conferência', 'Soma das entradas')}/−${val(L, 'Conferência', 'Soma das saídas')}`
      + ` · arquivo +${(somaEnt / 100).toFixed(2)}/−${(somaSai / 100).toFixed(2)}`);
  });

  // ---------- 8. o filtro da tela não entra no relatório ----------
  t.secao('o filtro da tela não entra no relatório');
  const filtrado = await pagina.evaluate(() => {
    definirRegime('caixa');
    ['bfin-period', 'av-period', 'fz-period'].forEach(id => {
      if ($(id)) { $(id).value = '2026-03'; guardarPeriodo(id); }
    });
    if ($('fz-busca')) $('fz-busca').value = 'nada que exista';
    render();
    let pego = null;
    const real = window.download;
    window.download = (nome, corpo) => { pego = corpo; };
    exportRelatorio('fazenda');
    window.download = real;
    return pego;
  });
  const Lfiltrado = ler({ corpo: filtrado });
  t.conferir('o relatório sai com todos os lançamentos, mesmo com a tela filtrada',
    Number(val(Lfiltrado, 'Conferência', 'Lançamentos somados')) === nFz,
    `${val(Lfiltrado, 'Conferência', 'Lançamentos somados')} de ${nFz}`);
  t.conferir('e diz que não houve filtro de mês nem de busca',
    /sem filtro/.test((Lfiltrado.find(x => x.item === 'Período') || {}).detalhe || ''),
    (Lfiltrado.find(x => x.item === 'Período') || {}).detalhe);
  await pagina.evaluate(() => {
    definirRegime('competencia');
    ['bfin-period', 'av-period', 'fz-period'].forEach(id => {
      if ($(id)) { $(id).value = 'all'; guardarPeriodo(id); }
    });
    if ($('fz-busca')) $('fz-busca').value = '';
    render();
  });

  // ---------- 9. a tela diz o que saiu ----------
  t.secao('a tela diz o que saiu');
  t.conferir('o resumo de cada relatório traz o escopo e a contagem',
    /^Bovinos · 4 lançamento/.test(bov.resumo || '') && /^Aviários · 2 lançamento/.test(av.resumo || '')
    && /^Fazenda inteira · 8 lançamento/.test(fz.resumo || ''),
    [bov.resumo, av.resumo, fz.resumo].join(' | '));
  t.conferir('com as receitas e os custos, para conferir antes de abrir',
    [bov, av, fz].every(r => /receitas R\$/.test(r.resumo || '') && /custos R\$/.test(r.resumo || '')),
    bov.resumo);

  // ---------- 10. os três itens no menu ----------
  t.secao('o menu oferece os três');
  const noMenu = await pagina.evaluate(() => {
    closeAllM(); $('btn-menu').click();
    const ler2 = id => { const el = $(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
    const r = ['menu-rel-bov', 'menu-rel-av', 'menu-exp-relatorio'].map(ler2);
    closeAllM();
    return r;
  });
  t.conferir('há um item para Bovinos, um para Aviários e um para a Fazenda',
    noMenu.every(Boolean) && /Bovinos/.test(noMenu[0]) && /Aviários/.test(noMenu[1])
    && /FAZENDA/.test(noMenu[2]), noMenu.join(' | '));
  t.conferir('e o da Fazenda diz que é o geral, tudo somado',
    /geral/i.test(noMenu[2]) && /tudo somado/i.test(noMenu[2]), noMenu[2]);

  // ---------- 11. fazenda sem lançamento ----------
  t.secao('fazenda sem lançamento');
  const vazios = await pagina.evaluate(() => {
    bovT = []; avT = []; gerT = []; extraT = { soja: [] }; recomputarLivros();
    animals = []; weighings = []; items = []; moves = [];
    const pego = {};
    const real = window.download;
    window.download = (nome, corpo, m, b, resumo) => { pego[nome] = { corpo, resumo }; };
    exportRelatorio('bov'); exportRelatorio('av'); exportRelatorio('fazenda');
    window.download = real;
    return Object.values(pego).map(x => x.corpo);
  });
  t.conferir('os três saem com cabeçalho e com o escopo declarado',
    vazios.every(c => c.split('\n')[0] === 'secao;item;valor;detalhe' && /Escopo/.test(c)),
    vazios.map(c => c.split('\n').length + ' linhas').join(' · '));
  t.conferir('com zero lançamento e saldo zero, sem NaN nem traço no lugar do número',
    vazios.every(c => {
      const L = ler({ corpo: c });
      return val(L, 'Conferência', 'Lançamentos somados') === '0'
        && cent(val(L, 'Resumo', 'Saldo')) === 0;
    }), vazios.map(c => val(ler({ corpo: c }), 'Resumo', 'Saldo')).join(' · '));
  t.conferir('e nenhum NaN nem undefined em nenhum dos três',
    !vazios.some(c => /NaN|undefined/.test(c)),
    (vazios.find(c => /NaN|undefined/.test(c)) || '').slice(0, 80));

  // ---------- 12. nome da fazenda com ponto-e-vírgula dentro ----------
  // Categoria "Ração; insumos", item "Milho; moído", atividade "Soja; Trigo" —
  // tudo que o dono pode escrever. O campo tem de sair entre aspas (CSV
  // correto), e a planilha tem de continuar vendo quatro colunas.
  t.secao('nome com ponto-e-vírgula dentro');
  const comPontoEVirgula = await pagina.evaluate(() => {
    atividades = [{ id: 'sj', nome: 'Soja; Trigo' }]; extraT = {}; recomputarLivros();
    bovT = [{ id: 'b1', date: '2026-03-15', type: 'saida', amount: 1250.5,
      category: 'Ração; insumos', venc: '2026-04-01' }];
    avT = []; gerT = []; extraT.sj = [{ id: 's1', date: '2026-04-10', type: 'saida', amount: 5000, category: 'Soja' }];
    items = [{ id: 'i1', name: 'Milho; moído', unit: 'kg' }];
    moves = [{ id: 'm1', itemId: 'i1', date: '2026-04-01', type: 'entrada', qty: 10, unitCost: 2 }];
    animals = []; weighings = []; render();
    let pego = null;
    const real = window.download;
    window.download = (nome, corpo) => { pego = corpo; };
    exportRelatorio('fazenda');
    window.download = real;
    return pego;
  });
  const reg = lerCSV(comPontoEVirgula).filter(l => l.length > 1);
  t.conferir('a planilha continua vendo quatro colunas em todas as linhas',
    reg.every(l => l.length === 4),
    JSON.stringify((reg.find(l => l.length !== 4) || []).slice(0, 5)));
  const Lpv = reg.slice(1).map(p2 => ({ secao: p2[0], item: p2[1], valor: p2[2], detalhe: p2[3] || '' }));
  t.conferir('a categoria com ponto-e-vírgula sai inteira, sem partir ao meio',
    Lpv.some(x => x.secao === 'Categoria' && x.item === 'Ração; insumos (saída)'),
    Lpv.filter(x => x.secao === 'Categoria').map(x => x.item).join(' | '));
  t.conferir('o item de estoque também',
    Lpv.some(x => x.secao === 'Estoque' && x.item === 'Milho; moído'),
    Lpv.filter(x => x.secao === 'Estoque').map(x => x.item).join(' | '));
  t.conferir('e a atividade também, no escopo e na quebra por atividade',
    /Soja; Trigo/.test((Lpv.find(x => x.item === 'Escopo') || {}).detalhe || '')
    && Lpv.some(x => x.secao === 'Atividade' && x.item === 'Soja; Trigo'),
    (Lpv.find(x => x.item === 'Escopo') || {}).detalhe);
  t.conferir('a conta a pagar com a categoria dentro sai certa',
    Lpv.some(x => x.secao === 'A pagar' && x.item === 'Bovinos · Ração; insumos'),
    Lpv.filter(x => x.secao === 'A pagar').map(x => x.item).join(' | '));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
