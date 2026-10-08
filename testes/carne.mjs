// A PARCELA SABE QUE É PARCELA, E CARREGA A NOTA DA COMPRA.
//
// Relato do dono: "no lançamento, quando for parcelado, também inserir a nota
// nas parcelas; do jeito que está não dá para saber que é parcela".
//
// Eram duas faltas, e as duas só apareceram depois que a conta passou a abrir
// com um toque — antes, ninguém chegava nesta tela a partir do "A pagar".
//
//   1. A NOTA ficava só na primeira parcela. E com razão: o arquivo pesa, e
//      uma cópia por prestação encheria o aparelho. Só que o dono abre a
//      parcela 3/8 que vence esta semana e não há nota nenhuma ali — a compra
//      tem documento e a parcela não tem como alcançá-lo.
//
//   2. DENTRO do lançamento não havia nada dizendo que aquilo era parcela. A
//      lista de fora mostra "3/8"; abrindo, a informação sumia. Pior: o campo
//      "Em quantas vezes" mostrava 1, cinzento — a tela dizia que não era
//      parcelado justamente quando era.
//
// Esta bateria cobra as duas, e o que elas põem em risco: a nota passou a ser
// referenciada por várias parcelas, então apagar UMA não pode levar o arquivo
// que as outras ainda apontam.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const avisos = [];
  pagina.on('dialog', d => { avisos.push(d.message().replace(/\s+/g, ' ')); d.accept().catch(() => {}); });
  const t = placar('A parcela sabe que é parcela');

  // Sem nuvem de propósito: é assim que dá para VER o que foi escrito e o que
  // foi apagado, porque tudo fica na fila em vez de subir e sumir dela. E é o
  // estado real de quem lança no curral.
  const LIMPAR = () => pagina.evaluate(() => {
    db = null;
    LS.s('fjs-ics-auto', false); LS.s('fjs-ics-visto', true);
    bovT = []; avT = []; gerT = []; atividades = []; extraT = {}; recomputarLivros();
    animals = []; weighings = []; items = []; moves = []; pendentes = [];
    anexosForm = []; anexosRemover = []; anexoCache.clear();
    definirRegime('competencia');
    if ($('bfin-period')) { $('bfin-period').value = 'all'; guardarPeriodo('bfin-period'); }
    tab = 'bovinos'; seg = 'financeiro'; render();
  });

  // Lança um carnê de 4× com nota fiscal anexada, pelo formulário de verdade.
  const lancarCarne = async () => {
    await pagina.evaluate(() => {
      openTrans('bov', null);
      anexosForm = [{ id: 'ax-nf', novo: true, nome: 'nf-4512.pdf',
        tipo: 'application/pdf', tamanho: 90000 }];
      anexoCache.set('ax-nf', 'data:application/pdf;base64,AAAA');
      renderAnexosForm();
      $('t-date').value = '2026-09-01';
      $('t-amount').value = '12.000';
      $('t-category').value = 'Compra de gado (engorda)';
      $('t-notes').value = 'lote do leilão de setembro';
      $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
      $('t-venc').value = '2026-10-10';
      $('t-parcelas').value = '4'; $('t-parcelas').dispatchEvent(new Event('input'));
    });
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => closeAllM());
    return pagina.evaluate(() => bovT.filter(x => x.grupo)
      .sort((a, b) => a.parcela - b.parcela).map(x => ({ id: x.id, parcela: x.parcela,
        parcelas: x.parcelas, venc: x.venc, valor: x.amount,
        anexos: (x.anexos || []).map(a => a.id) })));
  };

  await LIMPAR();
  const carne = await lancarCarne();

  // ---------- 1. a nota em todas as parcelas ----------
  t.secao('a nota da compra vale para o carnê inteiro');
  t.conferir('o carnê nasceu com 4 parcelas', carne.length === 4, `${carne.length} parcela(s)`);
  t.conferir('TODAS as 4 apontam para a nota fiscal',
    carne.every(p => p.anexos.join() === 'ax-nf'),
    carne.map(p => `${p.parcela}/${p.parcelas}: ${p.anexos.join() || 'sem nota'}`).join(' · '));
  // O que se repete é a referência; o arquivo continua sendo UM registro.
  const naNuvem = await pagina.evaluate(() =>
    pendentes.filter(p => p.col === 'anexos').map(p => p.id));
  t.conferir('mas o ARQUIVO é um só — a referência é que se repete',
    naNuvem.length === 1 && naNuvem[0] === 'ax-nf',
    `${naNuvem.length} registro(s) de anexo: ${naNuvem.join(' · ')}`);
  t.conferir('e o valor não se repete: as 4 somam a compra',
    Math.abs(carne.reduce((a, p) => a + p.valor, 0) - 12000) < 1e-9,
    'R$ ' + carne.reduce((a, p) => a + p.valor, 0).toFixed(2));

  // ---------- 2. o clipe aparece em todas as contas do carnê ----------
  t.secao('o clipe aparece em todas as parcelas');
  await pagina.evaluate(() => { render(); document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; }); });
  await pagina.waitForTimeout(150);
  const clipes = await pagina.evaluate(() =>
    [...document.querySelectorAll('#bfin-apagar .ap-linha')].map(l => ({
      trans: l.dataset.trans, clipe: !!l.querySelector('.ap-nf') })));
  t.conferir('as 4 contas a pagar mostram o clipe da nota',
    clipes.length === 4 && clipes.every(c => c.clipe),
    clipes.map(c => `${c.trans}:${c.clipe ? '📎' : '—'}`).join(' · '));

  // ---------- 3. abrindo a parcela do meio ----------
  t.secao('abrindo a parcela 3 de 4');
  const terceira = carne[2];
  await pagina.evaluate(id => {
    const t2 = bovT.find(x => x.id === id);
    openTrans('bov', t2);
  }, terceira.id);
  await pagina.waitForTimeout(200);
  const aberta = await pagina.evaluate(() => ({
    contexto: $('t-context').textContent.replace(/\s+/g, ' ').trim(),
    escondido: $('t-context').hidden,
    parcelas: $('t-parcelas').value,
    travado: $('t-parcelas').disabled,
    anexos: $('t-anexos').textContent.replace(/\s+/g, ' ').trim(),
    notaAx: $('t-anexo-nota').textContent,
    marcada: ($('t-context').querySelector('.tc-esta') || {}).textContent || '',
    quantasParcelasNaTela: $('t-context').querySelectorAll('.tc-parc').length
  }));
  t.conferir('a tela diz, em destaque, que é a parcela 3 de 4',
    aberta.escondido === false && /Parcela 3 de 4/.test(aberta.contexto), aberta.contexto);
  t.conferir('e diz quanto foi a compra inteira',
    /12\.000,00/.test(aberta.contexto), aberta.contexto);
  // O campo mostrava 1 — dizia que não era parcelado bem quando era.
  t.conferir('"em quantas vezes" mostra 4, e não 1',
    aberta.parcelas === '4', aberta.parcelas);
  t.conferir('travado, porque parcela criada não se re-parcela', aberta.travado === true);
  t.conferir('o carnê inteiro aparece, parcela por parcela',
    aberta.quantasParcelasNaTela === 4, `${aberta.quantasParcelasNaTela} de 4`);
  t.conferir('com ESTA marcada entre as outras',
    /3\/4/.test(aberta.marcada), aberta.marcada || 'nenhuma marcada');
  // O que o dono foi ver ali: a nota.
  t.conferir('e a nota fiscal da compra está aqui, na parcela do meio',
    /nf-4512\.pdf/.test(aberta.anexos), aberta.anexos || 'nenhuma nota na tela');
  t.conferir('com o aviso de que ela vale para as 4, para não anexar quatro vezes',
    /vale para as 4 parcelas/.test(aberta.notaAx), aberta.notaAx);

  // ---------- 4. a parcela paga aparece como paga ----------
  t.secao('o estado de cada parcela');
  await pagina.evaluate(() => closeAllM());
  await pagina.evaluate(id => {
    const t2 = bovT.find(x => x.id === id);
    t2.pago = true; t2.pagoEm = todayISO();
    upsert('bovtrans', t2); render();
  }, carne[0].id);
  await pagina.evaluate(id => openTrans('bov', bovT.find(x => x.id === id)), carne[2].id);
  await pagina.waitForTimeout(200);
  const comPaga = await pagina.evaluate(() =>
    [...$('t-context').querySelectorAll('.tc-parc')].map(x => ({
      texto: x.textContent.trim(), paga: x.classList.contains('tc-paga'),
      esta: x.classList.contains('tc-esta') })));
  t.conferir('a parcela já paga aparece marcada como paga',
    comPaga[0].paga === true && /paga/.test(comPaga[0].texto), comPaga.map(x => x.texto).join(' · '));
  t.conferir('as que ainda devem, não',
    comPaga.slice(1).every(x => !x.paga), comPaga.map(x => `${x.texto}:${x.paga}`).join(' · '));

  // ---------- 5. apagar UMA parcela não leva a nota das outras ----------
  // É o risco que a mudança cria: a mesma nota agora é apontada por quatro
  // registros. Apagando um, o arquivo não pode ir junto.
  t.secao('apagar uma parcela não apaga a nota das outras');
  await pagina.evaluate(() => closeAllM());
  await pagina.evaluate(id => {
    // Cancelar no aviso = apagar só esta parcela.
    window.confirm = () => false;
    openTrans('bov', bovT.find(x => x.id === id));
  }, carne[1].id);
  await pagina.waitForTimeout(120);
  await pagina.click('#btn-delete-transaction');
  await pagina.waitForTimeout(250);
  const depoisDeApagarUma = await pagina.evaluate(() => ({
    quantas: bovT.filter(x => x.grupo).length,
    aindaComNota: bovT.filter(x => (x.anexos || []).some(a => a.id === 'ax-nf')).length,
    notaApagada: pendentes.some(p => p.col === 'anexos' && p.id === 'ax-nf' && p.del === true)
  }));
  t.conferir('sobraram 3 parcelas', depoisDeApagarUma.quantas === 3, `${depoisDeApagarUma.quantas}`);
  t.conferir('as 3 continuam apontando a nota', depoisDeApagarUma.aindaComNota === 3,
    String(depoisDeApagarUma.aindaComNota));
  t.conferir('e o ARQUIVO da nota NÃO foi apagado',
    depoisDeApagarUma.notaApagada === false,
    depoisDeApagarUma.notaApagada ? 'apagou a nota das outras parcelas' : 'intacto');

  // ---------- 6. apagar o carnê inteiro leva a nota ----------
  // O espelho do anterior: saindo a última referência, o arquivo tem de sair,
  // senão fica na nuvem sem dono, ocupando espaço e sem tela que o abra.
  t.secao('apagar o carnê inteiro leva a nota junto');
  await pagina.evaluate(() => {
    window.confirm = () => true;   // OK = apaga a compra inteira
    const alvo = bovT.find(x => x.grupo);
    openTrans('bov', alvo);
  });
  await pagina.waitForTimeout(120);
  await pagina.click('#btn-delete-transaction');
  await pagina.waitForTimeout(250);
  const depoisDeTudo = await pagina.evaluate(() => ({
    sobrou: bovT.filter(x => x.grupo).length,
    notaApagada: pendentes.some(p => p.col === 'anexos' && p.id === 'ax-nf' && p.del === true)
  }));
  t.conferir('o carnê inteiro saiu', depoisDeTudo.sobrou === 0, String(depoisDeTudo.sobrou));
  t.conferir('e a nota foi apagada junto, sem ficar órfã na nuvem',
    depoisDeTudo.notaApagada === true,
    depoisDeTudo.notaApagada ? 'apagada' : 'ficou na nuvem sem dono');

  // ---------- 7. lançamento simples não ganha carnê nenhum ----------
  t.secao('lançamento sem parcela continua simples');
  await LIMPAR();
  await pagina.evaluate(() => {
    openTrans('bov', null);
    $('t-date').value = '2026-09-05'; $('t-amount').value = '480,25';
    $('t-category').value = 'Combustível'; $('t-notes').value = 'diesel';
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => closeAllM());
  const simples = await pagina.evaluate(() => {
    const t2 = bovT.find(x => x.notes === 'diesel');
    openTrans('bov', t2);
    const r = { escondido: $('t-context').hidden, parcelas: $('t-parcelas').value,
      travado: $('t-parcelas').disabled, nota: $('t-anexo-nota').textContent };
    closeAllM();
    return r;
  });
  t.conferir('não mostra aviso de carnê nenhum', simples.escondido === true);
  t.conferir('o campo de parcelas volta a 1 e destravado',
    simples.parcelas === '1' && simples.travado === false,
    `${simples.parcelas} · travado ${simples.travado}`);
  t.conferir('e o aviso da nota volta ao normal',
    /reduzida no aparelho/.test(simples.nota), simples.nota);

  // ---------- 8. anexar depois, por uma parcela qualquer ----------
  t.secao('anexar a nota depois, por qualquer parcela');
  await LIMPAR();
  const carne2 = await pagina.evaluate(() => {
    openTrans('bov', null);
    $('t-date').value = '2026-09-10'; $('t-amount').value = '3.000';
    $('t-category').value = 'Ração/insumos'; $('t-notes').value = 'sem nota ainda';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-10-10';
    $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    return bovT.filter(x => x.grupo).sort((a, b) => a.parcela - b.parcela).map(x => x.id);
  });
  t.conferir('carnê de 3 sem nota nenhuma', carne2.length === 3, String(carne2.length));
  const espalhou = await pagina.evaluate(ids => {
    // Anexa pela ÚLTIMA parcela: a nota tem de chegar às outras duas também.
    openTrans('bov', bovT.find(x => x.id === ids[2]));
    anexosForm = [{ id: 'ax-tarde', novo: true, nome: 'nf-tardia.jpg',
      tipo: 'image/jpeg', tamanho: 50000 }];
    anexoCache.set('ax-tarde', 'data:image/jpeg;base64,AAAA');
    renderAnexosForm();
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    return ids.map(id => ((bovT.find(x => x.id === id) || {}).anexos || []).map(a => a.id).join());
  }, carne2);
  t.conferir('anexando pela 3ª parcela, as três passam a ter a nota',
    espalhou.every(x => x === 'ax-tarde'), espalhou.join(' · '));

  // ---------- 9. tirar a nota tira do carnê inteiro ----------
  // A nota é da COMPRA, não da prestação: tirar de uma e deixar nas outras
  // deixaria o carnê contando duas histórias sobre o mesmo documento.
  t.secao('tirar a nota tira do carnê inteiro');
  const tirou = await pagina.evaluate(ids => {
    openTrans('bov', bovT.find(x => x.id === ids[0]));
    anexosRemover = ['ax-tarde'];
    anexosForm = [];
    renderAnexosForm();
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    return { refs: ids.map(id => ((bovT.find(x => x.id === id) || {}).anexos || []).length),
      arquivoApagado: pendentes.some(p => p.col === 'anexos' && p.id === 'ax-tarde' && p.del === true) };
  }, carne2);
  t.conferir('nenhuma das três parcelas anuncia mais a nota',
    tirou.refs.every(n => n === 0), tirou.refs.join(' · '));
  t.conferir('e o arquivo foi apagado, já que ninguém mais aponta para ele',
    tirou.arquivoApagado === true, tirou.arquivoApagado ? 'apagado' : 'ficou órfão');

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
