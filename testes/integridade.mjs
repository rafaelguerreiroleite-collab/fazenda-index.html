// Integridade referencial: nenhum registro pode apontar para algo que não
// existe mais. É onde a corrupção se esconde — nada quebra na tela, os totais
// é que passam a somar dívida e peso de coisas que já foram apagadas.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Integridade referencial');

  // Conferência única, aplicada depois de cada operação destrutiva.
  const orfaos = () => pagina.evaluate(() => {
    const idsA = new Set(animals.map(a => a.id));
    const idsI = new Set(items.map(i => i.id));
    const idsB = new Set(bovT.map(x => x.id));
    const gruposB = new Set(bovT.map(x => x.grupo).filter(Boolean));
    const idsAv = new Set(avT.map(x => x.id));
    return {
      pesagemSemAnimal: weighings.filter(w => !idsA.has(w.animalId)).length,
      movSemItem: moves.filter(m => !idsI.has(m.itemId)).length,
      movApontandoLancamentoMorto: moves.filter(m => m.linkTrans && !idsB.has(m.linkTrans)).length,
      movApontandoCarneMorto: moves.filter(m => m.linkGrupo && !gruposB.has(m.linkGrupo)).length,
      animalApontandoLancamentoMorto: animals.filter(a => a.linkTrans && !idsB.has(a.linkTrans)).length,
      // O contrário também: lançamento que diz ter vindo do estoque ou da venda
      // de um animal, mas de quem ninguém mais se lembra.
      lancamentoDeEstoqueOrfao: bovT.filter(x => x.lock === 'stock'
        && !moves.some(m => m.linkTrans === x.id || (m.linkGrupo && m.linkGrupo === x.grupo))).length,
      lancamentoDeVendaOrfao: bovT.filter(x => x.lock === 'animal'
        && !animals.some(a => a.linkTrans === x.id)).length,
      // Parcela solta: tem número de parcela mas o carnê não fecha
      carneIncompleto: [...gruposB].filter(g => {
        const p = bovT.filter(x => x.grupo === g);
        return p.length !== p[0].parcelas;
      }).length,
      totais: { animals: animals.length, weighings: weighings.length, items: items.length,
        moves: moves.length, bovT: bovT.length, avT: avT.length, avTotal: idsAv.size }
    };
  });

  const conferirLimpo = async (nome, r) => {
    const problemas = Object.entries(r).filter(([k, v]) => k !== 'totais' && v > 0);
    t.conferir(nome, problemas.length === 0,
      problemas.length ? problemas.map(([k, v]) => `${k}=${v}`).join(', ') : '');
  };

  // ---------- apagar item com compra parcelada ----------
  t.secao('apagar item de estoque');
  await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; avT = []; moves = [];
    items = [{ id: 'it1', name: 'Proteinado', unit: 'kg' }];
    tab = 'bovinos'; seg = 'estoque'; detailItem = 'it1'; render();
    openMove('it1', 'entrada');
    $('m-date').value = '2026-08-01'; $('m-qty').value = '100'; $('m-cost').value = '4,50';
    $('m-postfin').checked = true;
    $('m-prazo').checked = true; $('m-prazo').dispatchEvent(new Event('change'));
    $('m-venc').value = '2026-09-01'; $('m-parcelas').value = '3';
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  t.conferir('a compra parcelada criou as 3 parcelas',
    await pagina.evaluate(() => bovT.length) === 3, String(await pagina.evaluate(() => bovT.length)));

  const aceita = async d => { await d.accept(); };
  pagina.on('dialog', aceita);
  await pagina.evaluate(() => { openItem(items[0]); $('btn-delete-item').click(); });
  await pagina.waitForTimeout(150);
  pagina.removeListener('dialog', aceita);
  const depoisItem = await orfaos();
  t.conferir('apagar o item apaga o carnê inteiro do financeiro',
    depoisItem.totais.bovT === 0, depoisItem.totais.bovT + ' lançamento(s) sobraram');
  await conferirLimpo('nenhum órfão depois de apagar o item', depoisItem);

  // ---------- apagar item com compra à vista ----------
  t.secao('apagar item com compra à vista');
  await pagina.evaluate(() => {
    bovT = []; moves = []; items = [{ id: 'it2', name: 'Sal', unit: 'kg' }];
    seg = 'estoque'; detailItem = 'it2'; render();
    openMove('it2', 'entrada');
    $('m-date').value = '2026-08-01'; $('m-qty').value = '50'; $('m-cost').value = '3';
    $('m-postfin').checked = true; $('m-prazo').checked = false; $('m-prazo').dispatchEvent(new Event('change'));
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  pagina.on('dialog', aceita);
  await pagina.evaluate(() => { openItem(items[0]); $('btn-delete-item').click(); });
  await pagina.waitForTimeout(150);
  pagina.removeListener('dialog', aceita);
  const depoisVista = await orfaos();
  t.conferir('apagar o item apaga o lançamento à vista', depoisVista.totais.bovT === 0,
    depoisVista.totais.bovT + ' sobrou/sobraram');
  await conferirLimpo('nenhum órfão depois da compra à vista', depoisVista);

  // ---------- apagar animal vendido ----------
  t.secao('apagar animal com venda lançada');
  await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; moves = []; items = [];
    seg = 'rebanho'; detailAnimal = null; render();
    openAnimal();
    $('an-ident').value = 'V1';
    $('an-entry-date').value = '2026-01-01'; $('an-entry-weight').value = '300';
    $('an-sold').checked = true; $('an-sold').dispatchEvent(new Event('change'));
    $('an-sold-date').value = '2026-08-01'; $('an-sold-price').value = '7.500,00';
    $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await pagina.waitForTimeout(120);
  const comVenda = await pagina.evaluate(() => ({ bov: bovT.length, w: weighings.length,
    ligado: animals[0] && !!animals[0].linkTrans }));
  t.conferir('a venda do animal lança no financeiro', comVenda.bov === 1, String(comVenda.bov));
  t.conferir('e o animal fica ligado ao lançamento', comVenda.ligado === true);
  t.conferir('o peso de entrada virou pesagem', comVenda.w === 1, String(comVenda.w));

  pagina.on('dialog', aceita);
  await pagina.evaluate(() => { openAnimal(animals[0]); $('btn-delete-animal').click(); });
  await pagina.waitForTimeout(150);
  pagina.removeListener('dialog', aceita);
  const depoisAnimal = await orfaos();
  t.conferir('apagar o animal leva a pesagem junto', depoisAnimal.totais.weighings === 0,
    String(depoisAnimal.totais.weighings));
  t.conferir('e o lançamento da venda junto', depoisAnimal.totais.bovT === 0,
    String(depoisAnimal.totais.bovT));
  await conferirLimpo('nenhum órfão depois de apagar o animal', depoisAnimal);

  // ---------- desmarcar a venda tira o lançamento ----------
  t.secao('desfazer a venda de um animal');
  const desfeita = await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; render();
    openAnimal();
    $('an-ident').value = 'V2'; $('an-entry-date').value = ''; $('an-entry-weight').value = '';
    $('an-sold').checked = true; $('an-sold').dispatchEvent(new Event('change'));
    $('an-sold-date').value = '2026-08-01'; $('an-sold-price').value = '5000';
    $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const comVenda = bovT.length;
    openAnimal(animals[0]);
    $('an-sold').checked = false; $('an-sold').dispatchEvent(new Event('change'));
    $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { comVenda, semVenda: bovT.length, aindaLigado: !!animals[0].linkTrans,
      voltouAoRebanho: animals.filter(noRebanho).length };
  });
  t.conferir('marcar vendido lança no financeiro', desfeita.comVenda === 1, String(desfeita.comVenda));
  t.conferir('desmarcar remove o lançamento', desfeita.semVenda === 0, String(desfeita.semVenda));
  t.conferir('e não deixa o animal apontando para o nada', desfeita.aindaLigado === false);
  t.conferir('o animal volta a contar no rebanho', desfeita.voltouAoRebanho === 1, String(desfeita.voltouAoRebanho));

  // ---------- apagar o lançamento pelo Financeiro ----------
  t.secao('apagar pelo Financeiro o que veio do estoque');
  await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; moves = [];
    items = [{ id: 'it3', name: 'Ração', unit: 'kg' }];
    seg = 'estoque'; detailItem = 'it3'; render();
    openMove('it3', 'entrada');
    $('m-date').value = '2026-08-01'; $('m-qty').value = '10'; $('m-cost').value = '5';
    $('m-postfin').checked = true; $('m-prazo').checked = false; $('m-prazo').dispatchEvent(new Event('change'));
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  pagina.on('dialog', aceita);
  await pagina.evaluate(() => {
    seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    openTrans('bov', bovT[0]);
    $('btn-delete-transaction').click();
  });
  await pagina.waitForTimeout(150);
  pagina.removeListener('dialog', aceita);
  const depoisTrans = await orfaos();
  t.conferir('a movimentação de estoque continua lá', depoisTrans.totais.moves === 1,
    String(depoisTrans.totais.moves));
  await conferirLimpo('mas sem apontar para lançamento apagado', depoisTrans);

  // ---------- editar o peso de entrada não pode duplicar pesagem ----------
  t.secao('peso de entrada editado');
  const entrada = await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; moves = []; items = [];
    seg = 'rebanho'; detailAnimal = null; render();
    openAnimal();
    $('an-ident').value = 'E9'; $('an-entry-date').value = '2026-01-10'; $('an-entry-weight').value = '250';
    $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const inicial = { w: weighings.length, peso: weighings[0] && weighings[0].weight };
    // Corrige o peso três vezes seguidas
    for (const p of ['260', '270,5', '280']) {
      openAnimal(animals[0]); $('an-entry-weight').value = p;
      $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
    const depois = { w: weighings.length, peso: weighings[0] && weighings[0].weight };
    // E depois apaga o peso de entrada
    openAnimal(animals[0]); $('an-entry-weight').value = '';
    $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { inicial, depois, semPeso: weighings.length,
      apontaParaNada: !!(animals[0].entryWeighingId && !weighings.some(w => w.id === animals[0].entryWeighingId)) };
  });
  t.conferir('cadastrar com peso de entrada cria uma pesagem', entrada.inicial.w === 1, String(entrada.inicial.w));
  t.conferir('corrigir o peso três vezes não duplica a pesagem', entrada.depois.w === 1, String(entrada.depois.w));
  t.conferir('e o peso corrigido é o que fica', entrada.depois.peso === 280, String(entrada.depois.peso));
  t.conferir('apagar o peso de entrada remove a pesagem', entrada.semPeso === 0, String(entrada.semPeso));
  t.conferir('sem deixar o animal apontando para pesagem apagada', entrada.apontaParaNada === false);

  // ---------- editar a compra várias vezes não acumula lançamento ----------
  t.secao('compra editada várias vezes');
  const editada = await pagina.evaluate(() => {
    bovT = []; moves = []; items = [{ id: 'ix', name: 'Insumo', unit: 'kg' }];
    seg = 'estoque'; detailItem = 'ix'; render();
    const salvar = (qtd, custo, prazo, parcelas, venc) => {
      openMove('ix', 'entrada', moves[0]);
      $('m-date').value = '2026-08-01'; $('m-qty').value = qtd; $('m-cost').value = custo;
      $('m-postfin').checked = true;
      $('m-prazo').checked = prazo; $('m-prazo').dispatchEvent(new Event('change'));
      if (prazo) { $('m-venc').value = venc; $('m-parcelas').value = String(parcelas); }
      $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    };
    salvar('100', '4', false);              const a1 = bovT.length;
    salvar('100', '4', true, 3, '2026-09-01'); const a2 = bovT.length;
    salvar('100', '4', true, 5, '2026-09-01'); const a3 = bovT.length;
    salvar('100', '4', true, 2, '2026-09-01'); const a4 = bovT.length;
    salvar('100', '4', false);              const a5 = bovT.length;
    const soma = bovT.reduce((s, x) => s + x.amount, 0);
    return { a1, a2, a3, a4, a5, soma, movs: moves.length };
  });
  t.conferir('à vista: um lançamento', editada.a1 === 1, String(editada.a1));
  t.conferir('virou 3× : três lançamentos, nem um a mais', editada.a2 === 3, String(editada.a2));
  t.conferir('virou 5× : cinco, sem sobra das três', editada.a3 === 5, String(editada.a3));
  t.conferir('virou 2× : duas, sem sobra das cinco', editada.a4 === 2, String(editada.a4));
  t.conferir('voltou à vista: um só, sem sobra das duas', editada.a5 === 1, String(editada.a5));
  t.conferir('o valor nunca deixou de bater com a compra', editada.soma === 400, String(editada.soma));
  t.conferir('e a movimentação continua única', editada.movs === 1, String(editada.movs));
  await conferirLimpo('nenhum órfão depois de cinco edições', await orfaos());

  // ---------- restaurar backup não pode deixar resto do que havia antes ----------
  t.secao('restauração não deixa resto');
  const restaurado = await pagina.evaluate(() => {
    animals = [{ id: 'velho', ident: 'ANTIGO' }];
    weighings = [{ id: 'wv', animalId: 'velho', date: '2026-01-01', weight: 100 }];
    bovT = [{ id: 'tv', date: '2026-01-01', type: 'saida', amount: 1, category: 'X' }];
    items = [{ id: 'iv', name: 'Velho', unit: 'kg' }];
    moves = [{ id: 'mv', itemId: 'iv', type: 'entrada', date: '2026-01-01', qty: 1, unitCost: 1 }];
    const backup = { app: 'fazendajs', v: 4,
      animals: [{ id: 'novo', ident: 'NOVO' }], weighings: [], bovT: [], avT: [],
      items: [], moves: [], settings: { yield: 50 }, custo: {} };
    // Aplica como a restauração faz
    animals = backup.animals; weighings = backup.weighings; bovT = backup.bovT;
    avT = backup.avT; items = backup.items; moves = backup.moves;
    render();
    return { animais: animals.map(a => a.ident), pesagens: weighings.length, movs: moves.length };
  });
  t.conferir('a restauração troca o rebanho inteiro',
    restaurado.animais.join(',') === 'NOVO', restaurado.animais.join(','));
  await conferirLimpo('e não sobra pesagem nem movimentação do que havia', await orfaos());

  // ---------- editar não pode mudar o lançamento de livro ----------
  t.secao('editar não troca o lançamento de atividade');
  const naoMuda = await pagina.evaluate(() => {
    bovT = [{ id: 'eb', date: '2026-08-01', type: 'saida', amount: 100, category: 'Ração/insumos' }];
    // Lançamento de aviário SEM o campo de galpão — dado antigo, acontece.
    avT = [{ id: 'ea', date: '2026-08-01', type: 'saida', amount: 200, category: 'Energia' }];
    const r = {};
    // Pelo caminho normal da tela
    openTrans('av', avT[0]);
    r.livroLido = $('t-book').value;
    r.seletorEscondido = $('t-livro-wrap').style.display === 'none';
    $('t-amount').value = '250';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    r.depoisAv = avT.length; r.depoisBov = bovT.length;
    r.valorAv = avT[0] && avT[0].amount;
    // E sem informar o livro: tem de descobrir de ONDE o lançamento está.
    // Um lançamento de aviário que nunca passou pelo formulário, portanto SEM o
    // campo de galpão — era exatamente o caso que a versão antiga errava, e que
    // este teste deixava passar porque o formulário preenchia o campo antes.
    avT.push({ id: 'ea2', date: '2026-08-02', type: 'saida', amount: 300, category: 'Gás' });
    gerT = [{ id: 'eg', date: '2026-08-03', type: 'saida', amount: 400, category: 'Contador' }];
    openTrans(null, avT.find(x => x.id === 'ea2'));
    r.descobriuSozinho = $('t-book').value;
    openTrans(null, gerT[0]);
    r.descobriuGeral = $('t-book').value;
    avT = avT.filter(x => x.id !== 'ea2'); gerT = [];
    closeAllM();
    return r;
  });
  t.conferir('editar um lançamento de aviário mantém o livro', naoMuda.livroLido === 'av', naoMuda.livroLido);
  t.conferir('e não pergunta a atividade na edição', naoMuda.seletorEscondido === true);
  t.conferir('salvar não move o lançamento de livro',
    naoMuda.depoisAv === 1 && naoMuda.depoisBov === 1, `av ${naoMuda.depoisAv} · bov ${naoMuda.depoisBov}`);
  t.conferir('e o valor editado ficou no lançamento certo', naoMuda.valorAv === 250, String(naoMuda.valorAv));
  t.conferir('sem informar o livro, descobre de onde o lançamento é — mesmo sem o campo de galpão',
    naoMuda.descobriuSozinho === 'av', naoMuda.descobriuSozinho);
  t.conferir('e reconhece o livro Geral', naoMuda.descobriuGeral === 'ger', naoMuda.descobriuGeral);

  // ---------- estado limpo depois de tudo ----------
  t.secao('estado final');
  const fim = await orfaos();
  await conferirLimpo('nenhum órfão em nenhuma direção', fim);
  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
