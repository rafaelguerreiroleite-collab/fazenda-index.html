// TOCAR NA CONTA ABRE O LANÇAMENTO DELA.
//
// Relato do dono, com a tela do "A pagar" na frente: "ao clicar na conta não
// abre ela, caso já queira ver direto a nota e sobre o que é".
//
// A linha da conta cabe em uma linha e meia — categoria e vencimento, com o
// texto cortado no meio ("Bovinos · Sal mineral/su..."). O resto está no
// lançamento: a descrição inteira, a nota fiscal anexada, de qual compra ela
// veio, o valor original do carnê. Nada disso tinha caminho a partir dali.
//
// Para ver a nota de um boleto que vence em três dias era preciso sair do
// bloco, abrir o Financeiro da atividade certa, achar o MESMO lançamento na
// lista e tocar nele — sabendo de antemão de qual atividade ele era, coisa que
// a tela da Fazenda mostra justamente porque ali as três estão misturadas.
//
// Esta bateria cobra as quatro portas (A pagar e A receber, por atividade e na
// Fazenda) e o caso que estraga tudo: o botão de dar baixa mora DENTRO da
// linha clicável, e tocar nele não pode abrir o lançamento por cima.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const avisos = [];
  pagina.on('dialog', d => { avisos.push(d.message().replace(/\s+/g, ' ')); d.accept().catch(() => {}); });
  const t = placar('Tocar na conta abre o lançamento');

  const montar = () => pagina.evaluate(() => {
    LS.s('fjs-ics-auto', false); LS.s('fjs-ics-visto', true);
    atividades = []; extraT = {}; recomputarLivros();
    const hoje = todayISO();
    const daqui = n => somarDias(hoje, n);
    bovT = [
      // a conta com nota fiscal anexada: é a que o dono quer abrir
      { id: 'c1', date: '2026-09-01', type: 'saida', amount: 2892.57,
        category: 'Sal mineral/suplemento', notes: 'carga de setembro, nota 4512',
        venc: daqui(3), anexos: [{ id: 'ax1', nome: 'nf-4512.pdf', tipo: 'application/pdf', tamanho: 900 }] },
      { id: 'c2', date: '2026-09-02', type: 'saida', amount: 3336.46,
        category: 'Sal mineral/suplemento', notes: 'segunda carga', venc: daqui(22) },
      { id: 'c3', date: '2026-09-03', type: 'saida', amount: 28200,
        category: 'Compra de gado (engorda)', notes: 'lote do leilão', venc: daqui(23),
        grupo: 'g1', parcela: 2, parcelas: 4 },
      // a receber, do lado da receita
      { id: 'r1', date: '2026-09-04', type: 'entrada', amount: 61000,
        category: 'Venda de gado', notes: 'boiada do alto', venc: daqui(40) }
    ];
    avT = [{ id: 'a1', date: '2026-09-05', type: 'saida', amount: 1505.78,
      category: 'Seguro', notes: 'parcela do seguro', venc: daqui(24), parcela: 3, parcelas: 8 }];
    gerT = []; items = []; moves = []; animals = []; weighings = [];
    anexoCache.set('ax1', 'data:application/pdf;base64,AAAA');
    definirRegime('competencia');
    ['bfin-period', 'fz-period'].forEach(id => { if ($(id)) { $(id).value = 'all'; guardarPeriodo(id); } });
    salvarEspelho(true);
  });
  await montar();

  const abrirAba = (aba, segmento) => pagina.evaluate(([a, sg]) => {
    closeAllM(); tab = a; if (sg) seg = sg; render();
    document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
  }, [aba, segmento]);

  // ---------- 1. a linha é clicável, nos quatro blocos ----------
  t.secao('a linha da conta é clicável');
  await abrirAba('bovinos', 'financeiro');
  await pagina.waitForTimeout(150);
  const clicaveis = await pagina.evaluate(() => {
    const pega = sel => [...document.querySelectorAll(sel + ' .ap-linha')].map(l => ({
      trans: l.dataset.trans || null, book: l.dataset.book || null,
      texto: l.textContent.replace(/\s+/g, ' ').trim()
    }));
    return { apagar: pega('#bfin-apagar'), areceber: pega('#bfin-areceber') };
  });
  t.conferir('as 3 contas a pagar dos Bovinos apontam para o lançamento delas',
    clicaveis.apagar.length === 3 && clicaveis.apagar.every(l => l.trans && l.book === 'bov'),
    clicaveis.apagar.map(l => l.trans).join(' · '));
  t.conferir('a conta a receber também',
    clicaveis.areceber.length === 1 && clicaveis.areceber[0].trans === 'r1',
    clicaveis.areceber.map(l => l.trans).join(' · '));

  // ---------- 2. tocar abre o lançamento certo ----------
  t.secao('tocar abre o lançamento, com tudo dentro');
  await pagina.click('#bfin-apagar .ap-linha[data-trans="c1"] .ap-quem');
  await pagina.waitForTimeout(250);
  const aberto = await pagina.evaluate(() => ({
    modal: !$('modal-transaction').hidden,
    titulo: $('t-modal-title').textContent,
    id: $('t-id').value,
    valor: $('t-amount').value,
    categoria: $('t-category').value,
    notas: $('t-notes').value,
    venc: $('t-venc').value,
    prazo: $('t-prazo').checked,
    anexos: $('t-anexos').textContent.replace(/\s+/g, ' ').trim()
  }));
  t.conferir('o lançamento abre', aberto.modal === true && aberto.id === 'c1',
    `${aberto.modal} · id ${aberto.id}`);
  t.conferir('como EDIÇÃO do que já existe, não como lançamento novo',
    /Editar/.test(aberto.titulo), aberto.titulo);
  t.conferir('com o valor, a categoria e o vencimento preenchidos',
    aberto.valor === '2892,57' && aberto.categoria === 'Sal mineral/suplemento' && aberto.prazo === true,
    `${aberto.valor} · ${aberto.categoria} · a prazo ${aberto.prazo}`);
  // "sobre o que é": a descrição inteira, que na linha saía cortada.
  t.conferir('e com a descrição INTEIRA, que na linha saía cortada',
    aberto.notas === 'carga de setembro, nota 4512', aberto.notas);
  // "ver direto a nota": o anexo aparece no formulário, a um toque de abrir.
  t.conferir('a nota fiscal anexada está ali, pronta para abrir',
    /nf-4512\.pdf/.test(aberto.anexos), aberto.anexos || 'nenhum anexo na tela');

  // ---------- 3. o botão de baixa não pode abrir o lançamento ----------
  // Ele mora DENTRO da linha clicável. Sem a saída no tratador, tocar em
  // "Pagar" daria baixa E abriria por cima a tela do que acabou de ser pago.
  t.secao('tocar em Pagar dá baixa e não abre nada');
  await pagina.evaluate(() => closeAllM());
  await montar();
  await abrirAba('bovinos', 'financeiro');
  await pagina.waitForTimeout(150);
  await pagina.click('#bfin-apagar .ap-linha[data-trans="c2"] [data-pagar]');
  await pagina.waitForTimeout(300);
  const depoisDaBaixa = await pagina.evaluate(() => ({
    modal: !$('modal-transaction').hidden,
    pago: (bovT.find(x => x.id === 'c2') || {}).pago === true,
    aindaNaLista: !!document.querySelector('#bfin-apagar .ap-linha[data-trans="c2"]')
  }));
  t.conferir('a conta foi marcada como paga', depoisDaBaixa.pago === true);
  t.conferir('e NENHUM lançamento abriu por cima', depoisDaBaixa.modal === false);
  t.conferir('a conta paga sai da lista de a pagar', depoisDaBaixa.aindaNaLista === false);

  // ---------- 4. o clipe da nota fiscal ----------
  // Qual conta já tem o documento e qual não tem é a pergunta de quem vai
  // pagar — e ela se responde sem abrir nada.
  t.secao('o clipe diz quais contas já têm nota');
  await montar();
  await abrirAba('bovinos', 'financeiro');
  await pagina.waitForTimeout(150);
  const clipes = await pagina.evaluate(() => {
    const r = {};
    document.querySelectorAll('#bfin-apagar .ap-linha').forEach(l => {
      r[l.dataset.trans] = !!l.querySelector('.ap-nf');
    });
    return r;
  });
  t.conferir('a conta com nota anexada mostra o clipe', clipes.c1 === true);
  t.conferir('as outras não mostram nada', clipes.c2 === false && clipes.c3 === false,
    JSON.stringify(clipes));

  // ---------- 5. a dica, uma vez por bloco ----------
  t.secao('a tela diz que dá para tocar');
  const dicas = await pagina.evaluate(() => ({
    apagar: ($('bfin-apagar').querySelector('.ap-dica') || {}).textContent || '',
    quantas: $('bfin-apagar').querySelectorAll('.ap-dica').length,
    areceber: ($('bfin-areceber').querySelector('.ap-dica') || {}).textContent || ''
  }));
  t.conferir('o bloco avisa que a conta abre com um toque',
    /Toque na conta/.test(dicas.apagar) && /nota fiscal/.test(dicas.apagar), dicas.apagar);
  t.conferir('uma vez só, no fim do bloco', dicas.quantas === 1, String(dicas.quantas));
  t.conferir('e o bloco de a receber também avisa', /Toque na conta/.test(dicas.areceber), dicas.areceber);

  // ---------- 6. na aba Fazenda, onde as atividades se misturam ----------
  // É a tela do relato: as contas dos três livros juntas. Aqui saber de qual
  // atividade é a conta era obrigatório para ir procurá-la — e é o que a linha
  // clicável tornou desnecessário.
  t.secao('na Fazenda, com as atividades misturadas');
  await abrirAba('fazenda');
  await pagina.waitForTimeout(200);
  const naFazenda = await pagina.evaluate(() => {
    const linhas = [...document.querySelectorAll('#fz-apagar .ap-linha')].map(l => ({
      trans: l.dataset.trans, book: l.dataset.book,
      texto: l.querySelector('.cat').textContent.replace(/\s+/g, ' ').trim()
    }));
    return { linhas, receber: [...document.querySelectorAll('#fz-areceber .ap-linha')]
      .map(l => ({ trans: l.dataset.trans, book: l.dataset.book })) };
  });
  t.conferir('as contas das duas atividades estão lá, cada uma com o seu livro',
    naFazenda.linhas.length === 4
    && naFazenda.linhas.some(l => l.trans === 'c1' && l.book === 'bov')
    && naFazenda.linhas.some(l => l.trans === 'a1' && l.book === 'av'),
    naFazenda.linhas.map(l => `${l.book}/${l.trans}`).join(' · '));
  t.conferir('e a linha agora diz também SOBRE O QUE É, não só a categoria',
    naFazenda.linhas.find(l => l.trans === 'c1').texto.indexOf('carga de setembro') > 0,
    naFazenda.linhas.find(l => l.trans === 'c1').texto);
  t.conferir('a conta a receber da Fazenda também abre',
    naFazenda.receber.length === 1 && naFazenda.receber[0].trans === 'r1'
    && naFazenda.receber[0].book === 'bov',
    JSON.stringify(naFazenda.receber));

  // Abrir pela Fazenda uma conta do AVIÁRIO: é o caso que mais custava, porque
  // exigia descobrir a atividade antes de ir procurar o lançamento.
  await pagina.click('#fz-apagar .ap-linha[data-trans="a1"] .ap-quem');
  await pagina.waitForTimeout(250);
  const doAviario = await pagina.evaluate(() => ({
    modal: !$('modal-transaction').hidden,
    id: $('t-id').value, book: $('t-book').value,
    notas: $('t-notes').value, parcelas: $('t-parcelas').value,
    parcelaTravada: $('t-parcelas').disabled
  }));
  t.conferir('tocando na conta do Aviário pela aba Fazenda, ela abre',
    doAviario.modal === true && doAviario.id === 'a1', `${doAviario.modal} · ${doAviario.id}`);
  t.conferir('já no livro certo, sem ter de descobrir a atividade antes',
    doAviario.book === 'av', doAviario.book);
  t.conferir('com a descrição da parcela do seguro',
    doAviario.notas === 'parcela do seguro', doAviario.notas);
  // Parcela de carnê não se re-parcela por aqui: abrir para VER não pode virar
  // uma porta para refazer o carnê inteiro sem querer.
  t.conferir('e sendo parcela de um carnê, o campo de parcelas vem travado',
    doAviario.parcelaTravada === true);

  // ---------- 7. a conta sumida ----------
  // Dois aparelhos: a conta pode ter sido apagada no outro enquanto esta tela
  // estava aberta. Tocar nela não pode abrir um formulário vazio que, salvo,
  // ressuscitaria o lançamento.
  t.secao('conta que sumiu no outro aparelho');
  await pagina.evaluate(() => closeAllM());
  const sumida = await pagina.evaluate(() => {
    const antes = avT.length;
    avT = avT.filter(x => x.id !== 'a1');
    const linha = document.querySelector('#fz-apagar .ap-linha[data-trans="a1"]');
    if (linha) linha.querySelector('.ap-quem').click();
    return { antes, abriu: !$('modal-transaction').hidden, toast: $('toast').textContent };
  });
  t.conferir('não abre formulário nenhum', sumida.abriu === false);
  // Toque sem resposta nenhuma é indistinguível de aplicativo quebrado — que é
  // exatamente a queixa que trouxe este conserto.
  t.conferir('e a tela DIZ que a conta foi removida, em vez de só não fazer nada',
    /removido em outro aparelho/.test(sumida.toast), sumida.toast || 'nenhum aviso');

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
