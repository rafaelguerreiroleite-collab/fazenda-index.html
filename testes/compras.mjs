// ESTOQUE DE GADO, EM CABEÇAS — e ele não pode contar a mesma cabeça duas vezes.
//
// Pedido do dono: "nos bovinos, colocar uma aba de compra para colocar a
// quantidade e a data para saber estoque total de gado, deixando eles
// interligado com venda e mortalidade".
//
// O risco inteiro desta aba está numa frase: o rebanho já era contado UM A UM,
// pelo brinco, e a compra que ele pediu é POR LOTE. Somar os dois sem cuidado
// dá um número errado de um jeito que ninguém percebe — e um número de cabeças
// errado é decisão de venda errada.
//
// A regra que impede isso: a ENTRADA vem do livro de lotes; a SAÍDA vem dos
// dois lados. Venda e morte de animal COM BRINCO saem sozinhas, lidas do
// cadastro. Lançar de novo aqui descontaria a mesma cabeça duas vezes, e a
// tela avisa isso em letra miúda embaixo do saldo.
//
// Esta bateria cobra a conta por todos os lados: cada tipo de movimento, a
// ligação com venda e mortalidade, o animal vendido E morto (que não pode sair
// duas vezes), o saldo negativo, a conferência com o brinco, o dinheiro que
// nasce da compra, e a sobrevivência de tudo isso ao fecha-e-abre.
import { servir, abrirApp, placar } from './apoio.mjs';
import { lerCSV } from './csv.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 900 });
  const avisos = [];
  pagina.on('dialog', d => { avisos.push(d.message().replace(/\s+/g, ' ')); d.accept().catch(() => {}); });
  const t = placar('Estoque de gado, em cabeças');

  const LIMPAR = () => pagina.evaluate(() => {
    db = null;
    LS.s('fjs-ics-auto', false); LS.s('fjs-ics-visto', true);
    animals = []; weighings = []; rebmov = []; bovT = []; avT = []; gerT = [];
    items = []; moves = []; pendentes = [];
    tab = 'bovinos'; seg = 'compras'; render();
  });

  // ---------- 1. a aba existe e nasce explicando ----------
  t.secao('a aba nasce explicando, sem inventar saldo');
  await LIMPAR();
  const vazia = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '101' }, { id: 'a2', ident: '102' }, { id: 'a3', ident: '103' }];
    render();
    return { texto: $('reb-saldo').textContent.replace(/\s+/g, ' ').trim(),
      temBotao: !!$('reb-inicial'), lista: $('reb-lista').innerHTML };
  });
  t.conferir('o segmento Compras existe nos Bovinos',
    await pagina.evaluate(() => !!document.querySelector('[data-seg="compras"]')));
  // Zero cabeças seria uma afirmação FALSA sobre uma fazenda que tem gado.
  t.conferir('sem movimento nenhum, não anuncia "0 cabeças"',
    !/0 cabeça/.test(vazia.texto), vazia.texto.slice(0, 80));
  t.conferir('e explica que aqui se conta por cabeça, não por brinco',
    /cabeça/.test(vazia.texto) && /brinco/.test(vazia.texto), vazia.texto.slice(0, 110));
  t.conferir('oferecendo usar o rebanho já cadastrado como saldo inicial',
    vazia.temBotao === true && /3 animais cadastrados/.test(vazia.texto), vazia.texto.slice(-90));

  // ---------- 2. cada tipo de movimento entra do lado certo ----------
  t.secao('cada movimento entra do lado certo');
  const conta = await pagina.evaluate(() => {
    rebmov = [
      { id: 'm1', tipo: 'inicial', date: '2026-01-01', qtd: 40 },
      { id: 'm2', tipo: 'compra', date: '2026-03-10', qtd: 50 },
      { id: 'm3', tipo: 'compra', date: '2026-06-05', qtd: 12 },
      { id: 'm4', tipo: 'nascimento', date: '2026-07-01', qtd: 4 },
      { id: 'm5', tipo: 'venda', date: '2026-08-20', qtd: 20 },
      { id: 'm6', tipo: 'morte', date: '2026-09-02', qtd: 1 }
    ];
    animals = []; render();
    return saldoRebanho();
  });
  t.conferir('saldo inicial, compras e nascimentos são ENTRADA',
    conta.entradas === 106, `${conta.entradas} (esperado 40+50+12+4 = 106)`);
  t.conferir('vendas e mortes em lote são SAÍDA',
    conta.saidasLote === 21, `${conta.saidasLote} (esperado 20+1 = 21)`);
  t.conferir('e o estoque é a diferença',
    conta.saldo === 85, `${conta.saldo} (esperado 106−21 = 85)`);
  t.conferir('a tela mostra o mesmo número que a conta',
    /85 cabeças/.test(await pagina.evaluate(() => $('reb-saldo').textContent.replace(/\s+/g, ' '))),
    (await pagina.evaluate(() => $('reb-saldo').textContent.replace(/\s+/g, ' '))).slice(0, 60));

  // ---------- 3. INTERLIGADO COM VENDA E MORTALIDADE ----------
  // É o pedido literal do dono, e é onde um erro custaria caro.
  t.secao('interligado com venda e mortalidade');
  const ligado = await pagina.evaluate(() => {
    animals = [
      { id: 'a1', ident: '101' },
      { id: 'a2', ident: '102' },
      { id: 'a3', ident: '103', sold: true, soldDate: '2026-05-01', soldPrice: 9000 },
      { id: 'a4', ident: '104', sold: true, soldDate: '2026-05-02', soldPrice: 8000 },
      { id: 'a5', ident: '105', dead: true, deadDate: '2026-04-02' }
    ];
    render();
    return { R: saldoRebanho(), tela: $('reb-saldo').textContent.replace(/\s+/g, ' ') };
  });
  t.conferir('o animal vendido pela ficha dele sai do estoque sozinho',
    ligado.R.vendidosComBrinco === 2, `${ligado.R.vendidosComBrinco} de 2`);
  t.conferir('o animal morto também',
    ligado.R.mortosComBrinco === 1, `${ligado.R.mortosComBrinco} de 1`);
  t.conferir('o estoque desconta os dois: 85 − 2 − 1 = 82',
    ligado.R.saldo === 82, String(ligado.R.saldo));
  t.conferir('e a tela mostra as duas saídas com nome próprio',
    /Vendidos com brinco/.test(ligado.tela) && /Mortos com brinco/.test(ligado.tela),
    ligado.tela.slice(0, 160));
  // A única coisa que alguém poderia errar: lançar a mesma saída duas vezes.
  t.conferir('a tela avisa para não lançar a mesma saída de novo',
    /duas vezes/.test(ligado.tela), ligado.tela.slice(-120));
  // Vendido E morto é uma cabeça só: somar os dois tiraria duas por um bicho.
  const doisEstados = await pagina.evaluate(() => {
    animals.push({ id: 'a6', ident: '106', sold: true, dead: true,
      soldDate: '2026-06-01', deadDate: '2026-06-02' });
    render();
    const R = saldoRebanho();
    return { R, saidas: R.vendidosComBrinco + R.mortosComBrinco };
  });
  t.conferir('animal vendido E morto desconta uma cabeça só, não duas',
    doisEstados.saidas === 4 && doisEstados.R.saldo === 81,
    `saídas com brinco ${doisEstados.saidas} · saldo ${doisEstados.R.saldo}`);

  // ---------- 4. a conferência com o brinco ----------
  t.secao('a conferência com o brinco');
  const confer = await pagina.evaluate(() => {
    const R = saldoRebanho();
    return { R, nota: $('reb-conferencia').textContent.replace(/\s+/g, ' ') };
  });
  t.conferir('a tela diz quantos estão cadastrados com brinco',
    confer.R.comBrinco === 2 && /Com brinco no rebanho: 2/.test(confer.nota), confer.nota);
  t.conferir('e quantas cabeças ainda não têm ficha individual',
    confer.R.semBrinco === 79 && /sem brinco: 79/.test(confer.nota), confer.nota);
  // O caso que denuncia erro de lançamento: mais ficha do que cabeça.
  const maisFicha = await pagina.evaluate(() => {
    rebmov = [{ id: 'm1', tipo: 'compra', date: '2026-03-10', qtd: 1 }];
    animals = Array.from({ length: 5 }, (_, i) => ({ id: 'x' + i, ident: 'X' + i }));
    render();
    return { R: saldoRebanho(), nota: $('reb-conferencia').textContent.replace(/\s+/g, ' ') };
  });
  t.conferir('havendo mais ficha do que cabeça, a tela denuncia',
    maisFicha.R.semBrinco === -4 && /a mais que cabeça/.test(maisFicha.nota), maisFicha.nota);
  const negativo = await pagina.evaluate(() => {
    rebmov = [{ id: 'm1', tipo: 'compra', date: '2026-03-10', qtd: 2 },
              { id: 'm2', tipo: 'venda', date: '2026-04-10', qtd: 9 }];
    animals = []; render();
    return { R: saldoRebanho(), nota: $('reb-conferencia').textContent.replace(/\s+/g, ' '),
      vermelho: !!document.querySelector('.rs-caixa.rs-negativo') };
  });
  t.conferir('saldo negativo é impossível e aparece como erro, em vermelho',
    negativo.R.saldo === -7 && negativo.vermelho && /negativo/i.test(negativo.nota), negativo.nota);

  // ---------- 5. lançar pelo formulário de verdade ----------
  t.secao('lançar pelo formulário');
  await LIMPAR();
  await pagina.evaluate(() => { openRebmov(null); });
  await pagina.waitForTimeout(120);
  await pagina.selectOption('#rm-tipo', 'compra');
  await pagina.fill('#rm-date', '2026-10-08');
  await pagina.fill('#rm-qtd', '60');
  await pagina.fill('#rm-cat', 'Bezerro');
  await pagina.fill('#rm-peso', '185');
  await pagina.fill('#rm-valor', '144.000');
  await pagina.fill('#rm-notes', 'leilão de outubro');
  const previaValor = await pagina.evaluate(() => $('rm-valor-lido').textContent);
  await pagina.click('#form-rebmov button[type="submit"]');
  await pagina.waitForTimeout(200);
  const lancado = await pagina.evaluate(() => ({
    mov: rebmov.map(m => ({ tipo: m.tipo, qtd: m.qtd, cat: m.cat, peso: m.pesoMedio,
      valor: m.valor, link: !!m.linkTrans, date: m.date })),
    saldo: saldoRebanho().saldo,
    naFila: pendentes.filter(p => p.col === 'rebmov').length,
    lanc: bovT.map(x => ({ amount: x.amount, type: x.type, lock: x.lock, cat: x.category, notes: x.notes }))
  }));
  t.conferir('a prévia do valor mostra o total e o preço por cabeça',
    /144\.000,00/.test(previaValor) && /2\.400,00 por cabeça/.test(previaValor), previaValor);
  t.conferir('a compra entrou com 60 cabeças, categoria e peso médio',
    lancado.mov.length === 1 && lancado.mov[0].qtd === 60
    && lancado.mov[0].cat === 'Bezerro' && lancado.mov[0].peso === 185,
    JSON.stringify(lancado.mov[0]));
  t.conferir('e o estoque passou a ser 60', lancado.saldo === 60, String(lancado.saldo));
  t.conferir('o movimento entrou na fila para subir, como todo o resto',
    lancado.naFila === 1, `${lancado.naFila} na fila`);
  // o dinheiro
  t.conferir('a compra lançou R$ 144.000 no Financeiro dos Bovinos',
    lancado.lanc.length === 1 && lancado.lanc[0].amount === 144000
    && lancado.lanc[0].type === 'saida' && lancado.lanc[0].lock === 'rebanho',
    JSON.stringify(lancado.lanc[0]));
  t.conferir('com a quantidade de cabeças na descrição',
    /60 cabeça/.test(lancado.lanc[0].notes), lancado.lanc[0].notes);

  // ---------- 6. corrigir e excluir ----------
  t.secao('corrigir e excluir');
  const corrigido = await pagina.evaluate(() => {
    const m = rebmov[0];
    openRebmov(m);
    const estado = { tipo: $('rm-tipo').value, qtd: $('rm-qtd').value,
      valor: $('rm-valor').value, postfin: $('rm-postfin').checked };
    $('rm-qtd').value = '58';
    $('rm-valor').value = '139.200';
    $('form-rebmov').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    return { estado, saldo: saldoRebanho().saldo, lanc: bovT.length,
      valor: (bovT[0] || {}).amount, qtd: rebmov[0].qtd };
  });
  t.conferir('reabrir traz o que foi lançado',
    corrigido.estado.tipo === 'compra' && corrigido.estado.qtd === '60'
    && corrigido.estado.postfin === true, JSON.stringify(corrigido.estado));
  t.conferir('corrigir a quantidade corrige o estoque',
    corrigido.qtd === 58 && corrigido.saldo === 58, `${corrigido.qtd} / ${corrigido.saldo}`);
  t.conferir('e corrigir o valor corrige o lançamento, sem criar outro',
    corrigido.lanc === 1 && corrigido.valor === 139200,
    `${corrigido.lanc} lançamento(s) de ${corrigido.valor}`);
  const semFinanceiro = await pagina.evaluate(() => {
    openRebmov(rebmov[0]);
    $('rm-postfin').checked = false;
    $('form-rebmov').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    return { lanc: bovT.length, link: rebmov[0].linkTrans, saldo: saldoRebanho().saldo };
  });
  t.conferir('desmarcar o Financeiro tira o lançamento e mantém as cabeças',
    semFinanceiro.lanc === 0 && !semFinanceiro.link && semFinanceiro.saldo === 58,
    `${semFinanceiro.lanc} lançamento(s) · saldo ${semFinanceiro.saldo}`);
  const excluido = await pagina.evaluate(() => {
    openRebmov(rebmov[0]);
    $('rm-postfin').checked = true;
    $('rm-valor').value = '1.000';
    $('form-rebmov').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    const antes = bovT.length;
    openRebmov(rebmov[0]);
    $('btn-delete-rebmov').click();
    closeAllM();
    return { antes, mov: rebmov.length, lanc: bovT.length, saldo: saldoRebanho().saldo };
  });
  t.conferir('excluir o movimento leva o lançamento dele junto',
    excluido.antes === 1 && excluido.mov === 0 && excluido.lanc === 0,
    `${excluido.mov} movimento(s) · ${excluido.lanc} lançamento(s)`);

  // ---------- 7. o saldo inicial é um só ----------
  t.secao('o saldo inicial é um só');
  const doisIniciais = await pagina.evaluate(() => {
    rebmov = [{ id: 'i1', tipo: 'inicial', date: '2026-01-01', qtd: 30 }];
    openRebmov(null);
    $('rm-tipo').value = 'inicial'; sincronizarRebmov();
    $('rm-date').value = '2026-02-01'; $('rm-qtd').value = '99';
    $('form-rebmov').dispatchEvent(new Event('submit', { cancelable: true }));
    const r = { quantos: rebmov.filter(m => m.tipo === 'inicial').length,
      aviso: $('toast').textContent, aberto: !$('modal-rebmov').hidden };
    closeAllM();
    return r;
  });
  // Dois saldos iniciais seriam duas fazendas somadas, e o número ficaria o
  // dobro sem nada na tela explicando.
  t.conferir('um segundo saldo inicial é recusado', doisIniciais.quantos === 1,
    `${doisIniciais.quantos}`);
  t.conferir('e a tela diz para editar o que já existe',
    /saldo inicial/i.test(doisIniciais.aviso), doisIniciais.aviso);

  // ---------- 8. o formulário muda com o tipo ----------
  t.secao('o formulário acompanha o tipo');
  const porTipo = await pagina.evaluate(() => {
    const ler = tipo => {
      openRebmov(null);
      $('rm-tipo').value = tipo; sincronizarRebmov();
      const r = { dinheiro: $('rm-dinheiro').style.display !== 'none',
        rotulo: $('rm-valor-rot').textContent, ajuda: $('rm-ajuda').textContent };
      closeAllM();
      return r;
    };
    return { compra: ler('compra'), venda: ler('venda'),
      nascimento: ler('nascimento'), morte: ler('morte'), inicial: ler('inicial') };
  });
  t.conferir('compra e venda em lote pedem valor; nascimento e morte não',
    porTipo.compra.dinheiro && porTipo.venda.dinheiro
    && !porTipo.nascimento.dinheiro && !porTipo.morte.dinheiro && !porTipo.inicial.dinheiro,
    JSON.stringify(Object.keys(porTipo).map(k => k + ':' + porTipo[k].dinheiro)));
  t.conferir('a venda em lote fala em valor RECEBIDO, não de compra',
    /recebido/i.test(porTipo.venda.rotulo), porTipo.venda.rotulo);
  t.conferir('e cada tipo explica, em uma linha, o que ele faz',
    Object.keys(porTipo).every(k => porTipo[k].ajuda.length > 20),
    porTipo.venda.ajuda);
  t.conferir('a venda em lote avisa que animal com brinco sai pela ficha dele',
    /brinco/.test(porTipo.venda.ajuda) && /sozinho/.test(porTipo.venda.ajuda),
    porTipo.venda.ajuda);

  // ---------- 9. a venda em lote entra como receita ----------
  t.secao('a venda em lote é receita');
  await LIMPAR();
  const vendaLote = await pagina.evaluate(() => {
    openRebmov(null);
    $('rm-tipo').value = 'venda'; sincronizarRebmov();
    $('rm-date').value = '2026-09-15'; $('rm-qtd').value = '18';
    $('rm-valor').value = '162.000';
    $('form-rebmov').dispatchEvent(new Event('submit', { cancelable: true }));
    closeAllM();
    return { saldo: saldoRebanho().saldo, lanc: bovT.map(x => ({ t: x.type, v: x.amount, c: x.category })) };
  });
  t.conferir('a venda em lote tira cabeças do estoque',
    vendaLote.saldo === -18, String(vendaLote.saldo));
  t.conferir('e lança ENTRADA de dinheiro, não saída',
    vendaLote.lanc.length === 1 && vendaLote.lanc[0].t === 'entrada'
    && vendaLote.lanc[0].v === 162000 && /Venda de gado/.test(vendaLote.lanc[0].c),
    JSON.stringify(vendaLote.lanc[0]));

  // ---------- 10. sobrevive ao fecha-e-abre e sobe para a nuvem ----------
  t.secao('sobrevive ao fecha-e-abre');
  const guardado = await pagina.evaluate(() => {
    rebmov = [
      { id: 'g1', tipo: 'inicial', date: '2026-01-01', qtd: 25, linkTrans: null },
      { id: 'g2', tipo: 'compra', date: '2026-05-01', qtd: 10, linkTrans: null }
    ];
    salvarEspelho(true);
    const esp = JSON.parse(localStorage.getItem('fjs-espelho'));
    // recarrega do espelho, como o aplicativo faz ao abrir
    rebmov = [];
    const ok = carregarEspelho(esp.farm);
    return { ok, n: rebmov.length, saldo: saldoRebanho().saldo,
      noEspelho: (esp.rebmov || []).length };
  });
  t.conferir('o movimento do rebanho vai para a cópia local',
    guardado.noEspelho === 2, `${guardado.noEspelho}`);
  t.conferir('e volta inteiro quando o aplicativo reabre',
    guardado.n === 2 && guardado.saldo === 35, `${guardado.n} movimentos · saldo ${guardado.saldo}`);
  // O backup é assíncrono: ele busca as notas fiscais antes de montar o
  // arquivo. Ler na mesma linha do clique leria um arquivo que ainda não
  // existe — e o conferidor acusaria um defeito que é dele.
  await pagina.evaluate(() => {
    window._pegoBackup = null;
    window._origDownload = window.download;
    window.download = (nome, corpo) => { if (/backup/.test(nome)) window._pegoBackup = corpo; };
    $('menu-backup').click();
  });
  await pagina.waitForFunction(() => window._pegoBackup !== null, { timeout: 10000 });
  const noBackup = await pagina.evaluate(() => {
    window.download = window._origDownload;
    const d = JSON.parse(window._pegoBackup || '{}');
    return { n: (d.rebmov || []).length, versao: d.v };
  });
  t.conferir('o backup leva o movimento do rebanho junto',
    noBackup.n === 2, `${noBackup.n} no arquivo`);
  t.conferir('e a versão do arquivo subiu, para o restaurador saber o que esperar',
    noBackup.versao === 9, String(noBackup.versao));

  // Restaurar é a outra ponta: backup que leva e não devolve não é backup.
  const restaurado = await pagina.evaluate(async () => {
    window.confirm = () => true;
    const backup = { app: 'fazendajs', v: 9, farm: 'demo',
      animals: [], weighings: [], bovT: [], avT: [], gerT: [], items: [], moves: [],
      rebmov: [{ id: 'r1', tipo: 'inicial', date: '2026-01-01', qtd: 77 },
               { id: 'r2', tipo: 'morte', date: '2026-02-01', qtd: 2 }],
      atividades: [], extraT: {}, anexos: [], settings: { yield: 52 } };
    rebmov = [];
    const ev = { target: { files: [new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' })] } };
    const input = $('restore-input');
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 600));
    return { n: rebmov.length, saldo: saldoRebanho().saldo };
  });
  t.conferir('restaurar o backup traz o movimento do rebanho de volta',
    restaurado.n === 2 && restaurado.saldo === 75,
    `${restaurado.n} movimento(s) · saldo ${restaurado.saldo}`);
  // devolve o cenário da exportação
  await pagina.evaluate(() => {
    rebmov = [
      { id: 'g1', tipo: 'inicial', date: '2026-01-01', qtd: 25, linkTrans: null },
      { id: 'g2', tipo: 'compra', date: '2026-05-01', qtd: 10, linkTrans: null }
    ];
    render();
  });

  // ---------- 11. a exportação para conferir ----------
  t.secao('a exportação para conferir');
  const csvMov = await pagina.evaluate(() => {
    let pego = null;
    const orig = window.download;
    window.download = (nome, corpo, m, b, resumo) => { pego = { nome, corpo, resumo }; };
    $('menu-exp-rebmov').click();
    window.download = orig;
    return pego;
  });
  const tabela = lerCSV(csvMov.corpo).filter(l => l.length > 1);
  const cab = tabela[0];
  const col = (l, nome) => l[cab.indexOf(nome)];
  t.conferir('sai um arquivo com uma linha por movimento',
    tabela.length === 3, `${tabela.length - 1} linha(s) para 2 movimentos`);
  t.conferir('em ordem de data, com a data que qualquer planilha ordena',
    cab[0] === 'data_iso' && col(tabela[1], 'data_iso') === '2026-01-01'
    && col(tabela[2], 'data_iso') === '2026-05-01', cab.join(';'));
  t.conferir('com o saldo acumulado, para conferir que não falta linha',
    col(tabela[1], 'saldo_acumulado') === '25' && col(tabela[2], 'saldo_acumulado') === '35',
    `${col(tabela[1], 'saldo_acumulado')} · ${col(tabela[2], 'saldo_acumulado')}`);
  t.conferir('e a tela diz quantos movimentos e qual o estoque',
    /2 movimento\(s\)/.test(csvMov.resumo) && /35 cabeça/.test(csvMov.resumo), csvMov.resumo);

  // ---------- 12. o relatório leva o estoque de gado ----------
  t.secao('o relatório leva o estoque de gado');
  const rel = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '1' }, { id: 'a2', ident: '2' }];
    let pego = null;
    const orig = window.download;
    window.download = (nome, corpo) => { if (/relatorio/.test(nome)) pego = corpo; };
    exportRelatorio('bov');
    window.download = orig;
    return pego;
  });
  const linhasRel = lerCSV(rel).filter(l => l.length > 1).slice(1)
    .map(l => ({ secao: l[0], item: l[1], valor: l[5], detalhe: l[6] }));
  const achaRel = item => linhasRel.find(x => x.item === item) || {};
  t.conferir('o relatório traz o estoque de gado em cabeças',
    achaRel('Estoque de gado (cabeças)').valor === '35',
    achaRel('Estoque de gado (cabeças)').valor);
  t.conferir('e diz quantas cabeças não têm ficha individual',
    achaRel('Cabeças sem brinco').valor === '33', achaRel('Cabeças sem brinco').valor);
  // São números diferentes de propósito: o relatório precisa dizer os dois
  // para que ninguém some um com o outro achando que é o mesmo rebanho.
  t.conferir('sem confundir com a contagem por brinco, que vem separada',
    achaRel('Animais no rebanho').valor === '2'
    && /um a um/.test(achaRel('Animais no rebanho').detalhe),
    `${achaRel('Animais no rebanho').valor} · ${achaRel('Animais no rebanho').detalhe}`);

  // ---------- 13. a lista abre o movimento ----------
  t.secao('tocar no movimento abre ele');
  await pagina.evaluate(() => { tab = 'bovinos'; seg = 'compras'; render(); });
  await pagina.waitForTimeout(150);
  await pagina.click('[data-rebmov="g2"]');
  await pagina.waitForTimeout(200);
  const aberto = await pagina.evaluate(() => ({
    modal: !$('modal-rebmov').hidden, id: $('rm-id').value,
    qtd: $('rm-qtd').value, tipo: $('rm-tipo').value,
    titulo: $('rm-modal-title').textContent
  }));
  t.conferir('a linha do movimento abre o movimento certo',
    aberto.modal && aberto.id === 'g2' && aberto.qtd === '10' && aberto.tipo === 'compra',
    JSON.stringify(aberto));
  t.conferir('como edição do que já existe', /Editar/.test(aberto.titulo), aberto.titulo);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
