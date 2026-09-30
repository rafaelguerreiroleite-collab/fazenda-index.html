// Atividades criadas pela pessoa — soja, leite, maquinário.
//
// Uma atividade nova é um LIVRO DE DINHEIRO novo, e livro de dinheiro é onde
// erro custa caro: lançamento que cai no livro errado soma no lugar errado e
// ninguém percebe olhando a tela. O que este arquivo cobra é sempre a mesma
// pergunta em situações diferentes — o dinheiro de uma atividade fica na
// atividade dela, e o total da Fazenda continua sendo a soma de todos.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Atividades da fazenda');
  pagina.on('dialog', d => d.accept());

  // ---------- criar ----------
  t.secao('criar uma atividade');
  const criou = await pagina.evaluate(() => {
    atividades = []; extraT = {}; recomputarLivros();
    bovT = []; avT = []; gerT = []; animals = []; weighings = [];
    $('menu-atividades').click();
    $('at-nome').value = 'Soja';
    $('at-criar').click();
    const a = atividades[0];
    return { n: atividades.length, nome: a && a.nome, id: a && a.id,
      noLivros: LIVROS.indexOf(a && a.id) >= 0,
      nomeLivro: NOME_LIVRO[a && a.id],
      colecao: colLivro(a && a.id),
      listaVazia: Array.isArray(arrLivro(a && a.id)) && arrLivro(a.id).length === 0 };
  });
  t.conferir('a atividade é criada', criou.n === 1 && criou.nome === 'Soja');
  t.conferir('e entra na lista de livros', criou.noLivros && criou.nomeLivro === 'Soja');
  t.conferir('com uma coleção própria, derivada do id — não do nome',
    criou.colecao === 'at_' + criou.id, criou.colecao);
  t.conferir('e começa sem lançamento nenhum', criou.listaVazia);

  // ---------- nomes que não podem entrar ----------
  t.secao('nome recusado');
  const nomes = await pagina.evaluate(() => ({
    vazio: !!nomeAtividadeValido('   ', null),
    repetido: !!nomeAtividadeValido('soja', null),          // sem acento e sem maiúscula
    fixo: !!nomeAtividadeValido('Bovinos', null),
    fixoSemAcento: !!nomeAtividadeValido('aviarios', null), // "Aviários" sem acento
    comprido: !!nomeAtividadeValido('x'.repeat(41), null),
    bom: !nomeAtividadeValido('Leite', null),
     propriaNaEdicao: !nomeAtividadeValido('Soja', atividades[0].id)
  }));
  t.conferir('nome vazio não passa', nomes.vazio);
  t.conferir('nome repetido não passa, mesmo com outra caixa', nomes.repetido);
  t.conferir('nome de atividade fixa não passa', nomes.fixo);
  t.conferir('nem a fixa escrita sem acento', nomes.fixoSemAcento);
  t.conferir('nome comprido demais não passa', nomes.comprido);
  t.conferir('nome livre passa', nomes.bom);
  t.conferir('renomear para o próprio nome não é "repetido"', nomes.propriaNaEdicao);

  // ---------- o dinheiro fica no livro certo ----------
  t.secao('o dinheiro fica onde foi lançado');
  const dinheiro = await pagina.evaluate(() => {
    const id = atividades[0].id;
    bovT = [{ id: 'b1', date: '2026-03-10', type: 'saida', amount: 100, category: 'Ração/insumos' }];
    avT = [{ id: 'v1', date: '2026-03-10', type: 'saida', amount: 10, category: 'Gás' }];
    gerT = [{ id: 'g1', date: '2026-03-10', type: 'saida', amount: 1, category: 'Outros' }];
    extraT[id] = [
      { id: 's1', date: '2026-03-11', type: 'entrada', amount: 5000, category: 'Outros' },
      { id: 's2', date: '2026-03-12', type: 'saida', amount: 1200, category: 'Combustível' }
    ];
    definirRegime('competencia');
    $('fz-period').value = 'all'; guardarPeriodo('fz-period');
    tab = 'fazenda'; render();
    const R = resumoFazenda('all', 'competencia', '');
    const daSoja = R.atividades.find(x => x.nome === 'Soja');
    return {
      soja: arrLivro(id).length, bov: arrLivro('bov').length,
      receitas: R.receitas, custos: R.custos,
      sojaEntrada: daSoja && daSoja.entrada, sojaSaida: daSoja && daSoja.saida,
      nAtividades: R.atividades.length,
      // A soma das atividades tem de fechar com o total: se uma ficasse de
      // fora, o saldo da Fazenda mentiria e nada na tela acusaria.
      fecha: Math.abs(R.atividades.reduce((x, a) => x + a.entrada - a.saida, 0) - R.saldo) < 1e-9,
      naLista: $('fz-lista').innerText.indexOf('Soja') >= 0
    };
  });
  t.conferir('os lançamentos da Soja ficam na Soja', dinheiro.soja === 2);
  t.conferir('e não vazam para Bovinos', dinheiro.bov === 1, String(dinheiro.bov));
  t.conferir('a Fazenda soma a atividade nova',
    dinheiro.receitas === 5000 && dinheiro.custos === 1311,
    `receitas ${dinheiro.receitas} · custos ${dinheiro.custos}`);
  t.conferir('a Soja aparece no resumo por atividade',
    dinheiro.sojaEntrada === 5000 && dinheiro.sojaSaida === 1200);
  t.conferir('são quatro atividades no resumo', dinheiro.nAtividades === 4);
  t.conferir('a soma das atividades fecha com o saldo', dinheiro.fecha);
  t.conferir('e a lista da Fazenda mostra o nome dela', dinheiro.naLista);

  // ---------- renomear não perde dinheiro ----------
  t.secao('renomear');
  const renomeou = await pagina.evaluate(() => {
    const id = atividades[0].id;
    atividades = atividades.map(x => x.id === id ? { id: x.id, nome: 'Soja irrigada' } : x);
    recomputarLivros();
    return { id, mesmoId: atividades[0].id === id, nome: NOME_LIVRO[id],
      lancs: arrLivro(id).length, colecao: colLivro(id) === 'at_' + id };
  });
  t.conferir('o nome muda', renomeou.nome === 'Soja irrigada');
  t.conferir('o id não muda, e o financeiro fica',
    renomeou.mesmoId && renomeou.lancs === 2 && renomeou.colecao);

  // ---------- espelho local ----------
  t.secao('sobrevive a fechar e abrir o aplicativo');
  const espelho = await pagina.evaluate(() => {
    const id = atividades[0].id;
    salvarEspelho(true);
    // Como se o aplicativo tivesse sido fechado e aberto de novo
    atividades = []; extraT = {}; recomputarLivros();
    bovT = []; avT = []; gerT = [];
    const achou = carregarEspelho(farm);
    return { achou, n: atividades.length, nome: atividades[0] && atividades[0].nome,
      lancs: arrLivro(id).length, soma: arrLivro(id).reduce((s, x) => s + x.amount, 0) };
  });
  t.conferir('a atividade volta do espelho local',
    espelho.achou && espelho.n === 1 && espelho.nome === 'Soja irrigada');
  t.conferir('com os lançamentos dela', espelho.lancs === 2 && espelho.soma === 6200);

  // ---------- backup ----------
  t.secao('backup e restauração');
  await pagina.evaluate(() => {
    window.__bk = null; window.__dl = window.download;
    window.download = (n, c) => { window.__bk = c; };
    $('menu-backup').click();
  });
  await pagina.waitForTimeout(500);
  const bk = await pagina.evaluate(() => { window.download = window.__dl; return window.__bk; });
  const dados = JSON.parse(bk);
  const idSoja = dados.atividades[0].id;
  t.conferir('o backup leva a lista de atividades',
    dados.atividades.length === 1 && dados.atividades[0].nome === 'Soja irrigada');
  t.conferir('e os lançamentos de cada uma',
    (dados.extraT[idSoja] || []).length === 2,
    String((dados.extraT[idSoja] || []).length));

  const restaurou = await pagina.evaluate(d => {
    atividades = []; extraT = {}; recomputarLivros();
    bovT = []; avT = []; gerT = [];
    // O mesmo caminho que a restauração usa
    aplicarAtividades(d.atividades);
    Object.keys(d.extraT || {}).forEach(id => { if (ehExtra(id)) extraT[id] = d.extraT[id] || []; });
    const id = atividades[0].id;
    return { n: atividades.length, lancs: arrLivro(id).length,
      soma: arrLivro(id).reduce((s, x) => s + x.amount, 0) };
  }, dados);
  t.conferir('restaurar traz a atividade de volta inteira',
    restaurou.n === 1 && restaurou.lancs === 2 && restaurou.soma === 6200);

  // ---------- o que a nuvem manda ----------
  t.secao('lista vinda de outro aparelho');
  const nuvem = await pagina.evaluate(() => {
    // Uma atividade com o id de um livro fixo sequestraria os lançamentos dele.
    const mudou = aplicarAtividades([{ id: 'bov', nome: 'Falsa' }, { id: 'atX', nome: 'Leite' }]);
    return { mudou, ids: atividades.map(a => a.id), nomeBov: NOME_LIVRO.bov,
      bovIntacto: arrLivro('bov') === bovT,
      // Reaplicar a mesma lista não pode dizer que mudou: cada "mudou" manda
      // reassinar as coleções, e reassinar em laço derrubaria a sincronização.
      denovo: aplicarAtividades([{ id: 'bov', nome: 'Falsa' }, { id: 'atX', nome: 'Leite' }]) };
  });
  t.conferir('atividade com id de livro fixo é descartada',
    nuvem.ids.length === 1 && nuvem.ids[0] === 'atX', nuvem.ids.join(','));
  t.conferir('e Bovinos continua sendo Bovinos',
    nuvem.nomeBov === 'Bovinos' && nuvem.bovIntacto);
  t.conferir('a mesma lista de novo não pede para reassinar', nuvem.denovo === false);

  // ---------- o seletor do lançamento ----------
  t.secao('escolher a atividade no lançamento');
  const seletor = await pagina.evaluate(() => {
    aplicarAtividades([{ id: 'atX', nome: 'Leite' }]);
    tab = 'fazenda'; render();
    openTrans('ger');
    const opts = [...$('t-livro').options].map(o => o.value + ':' + o.textContent);
    $('t-livro').value = 'atX'; sincronizarLivroTrans();
    const lista = $('t-category').getAttribute('list');
    closeAllM();
    return { opts, lista };
  });
  t.conferir('a atividade criada aparece no seletor',
    seletor.opts.some(o => o === 'atX:Leite'), seletor.opts.join(' | '));
  t.conferir('as três fixas continuam lá',
    ['bov', 'av', 'ger'].every(b => seletor.opts.some(o => o.indexOf(b + ':') === 0)));
  t.conferir('e ela usa a lista de categorias genérica',
    seletor.lista === 'cats-geral', seletor.lista);

  // ---------- lançar de verdade pelo formulário ----------
  t.secao('lançamento salvo pelo formulário');
  await pagina.evaluate(() => {
    // Sem nuvem de propósito: assim a operação FICA na fila e dá para conferir
    // em qual coleção ela ia parar. Com a nuvem respondendo, a confirmação
    // apaga a linha da fila antes de qualquer conferência.
    window.__db = db; db = null;
    extraT.atX = []; pendentes = []; openTrans('ger');
    $('t-livro').value = 'atX'; sincronizarLivroTrans();
    $('t-date').value = '2026-04-01';
    $('t-amount').value = '350';
    $('t-category').value = 'Combustível';
    document.querySelector('input[name="t-type"][value="saida"]').checked = true;
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(200);
  const salvou = await pagina.evaluate(() => ({
    naAtividade: (extraT.atX || []).length,
    valor: (extraT.atX || [])[0] && extraT.atX[0].amount,
    naFila: pendentes.filter(p => p.col === 'at_atX').length,
    bov: bovT.length
  }));
  t.conferir('o lançamento vai para a atividade escolhida',
    salvou.naAtividade === 1 && salvou.valor === 350,
    `${salvou.naAtividade} lançamento(s)`);
  t.conferir('e não para Bovinos', salvou.bov === 0, String(salvou.bov));
  t.conferir('sem sinal, a fila guarda na coleção da atividade',
    salvou.naFila === 1, String(salvou.naFila));
  await pagina.evaluate(() => { db = window.__db; pendentes = []; });

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
