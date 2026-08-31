// Exportação: o que sai do app tem de ser TUDO o que está dentro dele.
//
// Uma exportação incompleta é o pior tipo de defeito silencioso: o arquivo
// abre, as colunas estão lá, os números batem — e o que falta ninguém procura,
// porque ninguém sabe que faltou. Só se descobre no dia em que o dado é
// preciso e não está: na contabilidade, no financiamento, na restauração
// depois de perder o celular.
//
// Cada conferência aqui compara o arquivo exportado com o que o app REALMENTE
// guarda, campo por campo.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Exportação de dados');

  // Uma fazenda pequena mas com um caso de cada coisa que o app sabe guardar.
  const montar = () => pagina.evaluate(() => {
    animals = [
      { id: 'a1', ident: '101', cat: 'Nelore', entryDate: '2026-01-10', entryWeight: 280,
        manejoData: '2026-03-01', manejoMedicamento: 'Ivermectina', notes: 'lote da esquerda' },
      { id: 'a2', ident: '102', cat: 'Angus', sold: true, soldDate: '2026-06-15',
        soldWeight: 480, soldPrice: 8200.50, linkTrans: 'tv' },
      { id: 'a3', ident: '103', cat: 'Nelore', dead: true, deadDate: '2026-05-02', deadCause: 'cobra' },
      // Animal cadastrado que ainda NÃO foi pesado: existe no rebanho, conta na
      // contagem, e some de qualquer exportação guiada pelas pesagens.
      { id: 'a4', ident: '104', cat: 'Nelore', entryDate: '2026-07-01' }
    ];
    weighings = [
      { id: 'w1', animalId: 'a1', date: '2026-01-10', weight: 280, jejum: false, notes: 'Peso de entrada' },
      { id: 'w2', animalId: 'a1', date: '2026-04-10', weight: 370, jejum: true, notes: '' },
      { id: 'w3', animalId: 'a2', date: '2026-02-01', weight: 400, jejum: false, notes: '' },
      { id: 'w4', animalId: 'a3', date: '2026-02-01', weight: 300, jejum: false, notes: '' }
    ];
    bovT = [
      { id: 'tv', date: '2026-06-15', type: 'entrada', amount: 8200.50, category: 'Venda de gado',
        notes: '102', lock: 'animal' },
      { id: 'tp', date: '2026-03-01', type: 'saida', amount: 1200, category: 'Ração/insumos',
        grupo: 'g1', parcela: 1, parcelas: 3, venc: '2026-04-01', pago: true, pagoEm: '2026-04-03',
        anexos: [{ id: 'ax1', nome: 'nota-racao.pdf', tipo: 'application/pdf', tamanho: 2048 }] }
    ];
    avT = [{ id: 'av1', date: '2026-03-05', type: 'entrada', amount: 30000, category: 'Pagamento Seara' }];
    gerT = [{ id: 'ge1', date: '2026-03-08', type: 'saida', amount: 950.75, category: 'Impostos/Funrural',
      venc: '2026-04-08', pago: false }];
    items = [{ id: 'i1', name: 'Proteinado', unit: 'kg', minQty: 100, carencia: 0, notes: 'galpão' }];
    moves = [
      { id: 'm1', itemId: 'i1', type: 'entrada', date: '2026-03-01', qty: 500, unitCost: 2.40, notes: 'nota 55' },
      { id: 'm2', itemId: 'i1', type: 'saida', date: '2026-03-20', qty: 120, notes: 'cocho 3' }
    ];
    settings.yield = 53;
    anexoCache.set('ax1', 'data:application/pdf;base64,JVBERi0xLjQK');
    render();
  });

  const baixar = acao => pagina.evaluate(async nome => {
    const baixados = [];
    const orig = window.download;
    window.download = (arq, corpo) => baixados.push({ arq, corpo });
    const alvo = document.getElementById(nome);
    // Sem o botão não há o que baixar — é isso que a conferência quer saber.
    if (alvo) alvo.click();
    else if (typeof window[nome] === 'function') window[nome]();
    await new Promise(r => setTimeout(r, 400));
    window.download = orig;
    return baixados[0] || null;
  }, acao);

  await montar();

  // ---------- backup completo ----------
  t.secao('backup completo');
  const backup = await baixar('menu-backup');
  t.conferir('o backup baixa um arquivo', !!backup, backup ? backup.arq : 'nada baixado');
  const b = backup ? JSON.parse(backup.corpo) : {};
  const contem = (nome, esperado, achado) =>
    t.conferir(`o backup leva ${nome}`, achado === esperado, `${achado} de ${esperado}`);
  contem('os animais', 4, (b.animals || []).length);
  contem('as pesagens', 4, (b.weighings || []).length);
  contem('o livro Bovinos', 2, (b.bovT || []).length);
  contem('o livro Aviários', 1, (b.avT || []).length);
  contem('o livro Geral', 1, (b.gerT || []).length);
  contem('os itens de estoque', 1, (b.items || []).length);
  contem('as movimentações de estoque', 2, (b.moves || []).length);
  t.conferir('o backup leva o rendimento de carcaça',
    b.settings && b.settings.yield === 53, JSON.stringify(b.settings));
  // Um animal guarda 15 campos. Bastava um deles ficar de fora para a
  // restauração devolver um rebanho pela metade, sem ninguém notar.
  const a2 = (b.animals || []).find(x => x.id === 'a2') || {};
  t.conferir('o backup leva os dados da venda (data, peso e preço)',
    a2.soldDate === '2026-06-15' && a2.soldWeight === 480 && a2.soldPrice === 8200.50,
    JSON.stringify({ d: a2.soldDate, p: a2.soldWeight, v: a2.soldPrice }));
  const a3 = (b.animals || []).find(x => x.id === 'a3') || {};
  t.conferir('o backup leva a morte (data e causa)',
    a3.deadDate === '2026-05-02' && a3.deadCause === 'cobra',
    JSON.stringify({ d: a3.deadDate, c: a3.deadCause }));
  const a1 = (b.animals || []).find(x => x.id === 'a1') || {};
  t.conferir('o backup leva o manejo sanitário',
    a1.manejoData === '2026-03-01' && a1.manejoMedicamento === 'Ivermectina',
    JSON.stringify({ d: a1.manejoData, m: a1.manejoMedicamento }));
  const tp = (b.bovT || []).find(x => x.id === 'tp') || {};
  t.conferir('o backup leva o carnê (grupo, parcela e vencimento)',
    tp.grupo === 'g1' && tp.parcela === 1 && tp.parcelas === 3 && tp.venc === '2026-04-01',
    JSON.stringify({ g: tp.grupo, p: tp.parcela, n: tp.parcelas, v: tp.venc }));
  t.conferir('o backup leva a data em que a conta foi paga',
    tp.pagoEm === '2026-04-03', String(tp.pagoEm));
  // O ponto: a nota fiscal mora num registro à parte, que o app só busca quando
  // alguém abre a nota. Um backup sem ela devolve um lançamento que diz ter
  // nota anexada e uma nota que não existe em lugar nenhum.
  t.conferir('o backup leva o ARQUIVO da nota fiscal, não só o nome dela',
    !!(b.anexos || []).find(x => x.id === 'ax1' && x.dados),
    `${(b.anexos || []).length} nota(s) no arquivo`);

  // ---------- restaurar devolve tudo ----------
  t.secao('restaurar o backup devolve tudo');
  // A restauração pergunta antes de substituir tudo. Sem responder ao diálogo,
  // ela desiste em silêncio e o teste mediria a desistência, não a restauração.
  const aceitar = async d => { await d.accept(); };
  pagina.on('dialog', aceitar);
  const voltou = await pagina.evaluate(async corpo => {
    animals = []; weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = [];
    anexoCache.clear(); settings.yield = 52;
    const gravados = [];
    const orig = window.upsert, origLote = window.batchWrite;
    window.batchWrite = async ops => { ops.forEach(o => { if (o.obj) gravados.push({ col: o.col, id: o.obj.id }); }); };
    window.upsert = (col, obj) => gravados.push({ col, id: obj.id });
    const arquivo = new File([corpo], 'backup.json', { type: 'application/json' });
    const dt = new DataTransfer(); dt.items.add(arquivo);
    $('restore-input').files = dt.files;
    $('restore-input').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    window.upsert = orig; window.batchWrite = origLote;
    return {
      animais: animals.length, pesagens: weighings.length,
      bov: bovT.length, av: avT.length, ger: gerT.length,
      itens: items.length, movs: moves.length, rend: settings.yield,
      notasGravadas: gravados.filter(g => g.col === 'anexos').length,
      notaNoCache: anexoCache.has('ax1')
    };
  }, backup ? backup.corpo : '{}');
  pagina.removeListener('dialog', aceitar);
  t.conferir('restaura os animais', voltou.animais === 4, String(voltou.animais));
  t.conferir('restaura as pesagens', voltou.pesagens === 4, String(voltou.pesagens));
  t.conferir('restaura os três livros',
    voltou.bov === 2 && voltou.av === 1 && voltou.ger === 1,
    `${voltou.bov}/${voltou.av}/${voltou.ger}`);
  t.conferir('restaura o estoque', voltou.itens === 1 && voltou.movs === 2, `${voltou.itens}/${voltou.movs}`);
  t.conferir('restaura o rendimento de carcaça', voltou.rend === 53, String(voltou.rend));
  t.conferir('restaura o arquivo da nota fiscal',
    voltou.notasGravadas === 1, `${voltou.notasGravadas} nota(s) devolvida(s)`);

  await montar();

  // ---------- CSV de pesagens ----------
  t.secao('CSV de pesagens');
  const pes = await baixar('menu-exp-pes');
  const linhasPes = pes ? pes.corpo.split('\n').filter(Boolean) : [];
  const cabPes = linhasPes[0] || '';
  const corpoPes = linhasPes.slice(1);
  t.conferir('o CSV de pesagens baixa', !!pes, pes ? pes.arq : 'nada');
  t.conferir('traz uma linha por pesagem', corpoPes.length >= 4, `${corpoPes.length} linhas`);
  // Um animal cadastrado e ainda não pesado existe no rebanho e conta na
  // contagem da tela. Se ele não sai em exportação nenhuma, o arquivo mostra
  // um rebanho menor do que o real.
  t.conferir('o animal cadastrado e ainda não pesado também aparece',
    corpoPes.some(l => l.startsWith('104;')), '104 não saiu no arquivo');
  t.conferir('o CSV traz a categoria do animal', /categoria/i.test(cabPes), cabPes);
  t.conferir('o CSV traz o GMD — o número que a fazenda inteira acompanha',
    /gmd/i.test(cabPes), cabPes);
  t.conferir('o CSV traz as arrobas', /arroba/i.test(cabPes), cabPes);
  t.conferir('o CSV diz quando o animal saiu e por quê (venda ou morte)',
    /venda|morte|saida|saída/i.test(cabPes), cabPes);
  t.conferir('a situação continua saindo (rebanho, vendido, morto)',
    /situacao/i.test(cabPes) && corpoPes.some(l => l.includes(';morto;') || l.includes(';morto')), cabPes);
  t.conferir('nenhuma linha do CSV sai com NaN ou undefined',
    !corpoPes.some(l => /NaN|undefined/.test(l)),
    (corpoPes.find(l => /NaN|undefined/.test(l)) || '').slice(0, 90));
  t.conferir('todas as linhas têm o mesmo número de colunas do cabeçalho',
    corpoPes.every(l => l.split(';').length === cabPes.split(';').length),
    `cabeçalho ${cabPes.split(';').length} colunas`);

  // ---------- CSV financeiro ----------
  t.secao('CSV financeiro');
  const fin = await pagina.evaluate(() => {
    const r = {};
    const orig = window.download;
    for (const livro of ['bov', 'av', 'ger']) {
      let pego = null;
      window.download = (arq, corpo) => { pego = { arq, corpo }; };
      exportFin(livro);
      r[livro] = pego;
    }
    window.download = orig;
    return r;
  });
  const cabFin = fin.bov ? fin.bov.corpo.split('\n')[0] : '';
  const linhasFin = fin.bov ? fin.bov.corpo.split('\n').slice(1).filter(Boolean) : [];
  t.conferir('cada livro exporta o seu arquivo',
    !!(fin.bov && fin.av && fin.ger), '');
  t.conferir('o CSV financeiro traz uma linha por lançamento',
    linhasFin.length === 2, `${linhasFin.length} linhas`);
  t.conferir('traz o vencimento e se está pago', /vencimento/.test(cabFin) && /pago/.test(cabFin), cabFin);
  // Regime de caixa: o contador precisa da data em que o dinheiro saiu, não
  // só da data em que a conta venceu.
  t.conferir('traz a DATA em que a conta foi paga, não só "sim"',
    /pago_em|data_pagamento/.test(cabFin), cabFin);
  t.conferir('diz qual lançamento tem nota fiscal anexada',
    /nota|anexo/i.test(cabFin), cabFin);
  t.conferir('diz de onde veio o lançamento gerado por estoque ou venda',
    /origem/i.test(cabFin), cabFin);
  t.conferir('o CSV financeiro não sai com NaN nem undefined',
    !linhasFin.some(l => /NaN|undefined/.test(l)),
    (linhasFin.find(l => /NaN|undefined/.test(l)) || '').slice(0, 90));
  t.conferir('todas as linhas do financeiro têm as colunas do cabeçalho',
    linhasFin.every(l => l.split(';').length === cabFin.split(';').length),
    `cabeçalho ${cabFin.split(';').length} colunas`);

  // ---------- CSV da fazenda inteira ----------
  // "Geral" é o nome do terceiro livro, mas se lê como "tudo". Quem pede o
  // arquivo esperando a fazenda inteira e recebe só os custos da sede acha que
  // a exportação perdeu dados. Tem de existir a que exporta MESMO tudo.
  t.secao('CSV da fazenda inteira');
  const tudo = await baixar('menu-exp-tudo');
  t.conferir('existe exportação da fazenda inteira', !!tudo, tudo ? tudo.arq : 'não existe');
  if (tudo) {
    const linhas = tudo.corpo.split('\n').filter(Boolean);
    const cab = linhas[0];
    const corpo = linhas.slice(1);
    t.conferir('o arquivo tem nome próprio, sem se confundir com o do livro Geral',
      /fazenda-inteira/.test(tudo.arq), tudo.arq);
    t.conferir('traz TODOS os lançamentos dos três livros',
      corpo.length === 4, `${corpo.length} de 4`);
    t.conferir('e uma coluna dizendo de qual atividade é cada um',
      cab.startsWith('atividade;'), cab);
    t.conferir('o lançamento de Bovinos aparece marcado como Bovinos',
      corpo.some(l => l.startsWith('Bovinos;')), corpo.join(' | ').slice(0, 100));
    t.conferir('o de Aviários aparece marcado como Aviários',
      corpo.some(l => l.startsWith('Aviários;')), '');
    t.conferir('o de Geral aparece marcado como Geral',
      corpo.some(l => l.startsWith('Geral;')), '');
    t.conferir('em ordem de data',
      corpo.map(l => l.split(';')[1].split('/').reverse().join('-'))
        .every((d, i, a) => i === 0 || d >= a[i - 1]), corpo.map(l => l.split(';')[1]).join(' '));
    t.conferir('a soma do arquivo é a soma dos três livros',
      Math.round(corpo.reduce((s2, l) => s2
        + Math.round(parseFloat(l.split(';')[3].replace(/\./g, '').replace(',', '.')) * 100), 0))
        === Math.round((8200.50 + 1200 + 30000 + 950.75) * 100),
      corpo.map(l => l.split(';')[3]).join(' + '));
    t.conferir('mesmas colunas do arquivo de um livro só, mais a atividade',
      cab.split(';').length === (fin.bov.corpo.split('\n')[0].split(';').length + 1), cab);
    t.conferir('nenhuma linha com NaN nem undefined',
      !corpo.some(l => /NaN|undefined/.test(l)), '');
  }

  // ---------- CSV de estoque ----------
  // Ração e suplemento são o maior custo do confinamento. Sem exportação, esse
  // gasto só existe dentro do aplicativo.
  t.secao('CSV de estoque');
  const est = await baixar('menu-exp-estoque');
  t.conferir('existe exportação do estoque', !!est, 'não existe');
  if (est) {
    const linhasEst = est.corpo.split('\n').filter(Boolean);
    const cabEst = linhasEst[0];
    t.conferir('traz uma linha por movimentação', linhasEst.length - 1 === 2, `${linhasEst.length - 1}`);
    t.conferir('traz item, tipo, quantidade e custo',
      /item/i.test(cabEst) && /quantidade/i.test(cabEst) && /custo/i.test(cabEst), cabEst);
    t.conferir('traz o total gasto na entrada',
      linhasEst.some(l => l.includes('1.200,00') || l.includes('1200,00')), linhasEst.join(' | ').slice(0, 140));
    t.conferir('o estoque não sai com NaN nem undefined',
      !linhasEst.slice(1).some(l => /NaN|undefined/.test(l)), '');
    t.conferir('todas as linhas do estoque têm as colunas do cabeçalho',
      linhasEst.slice(1).every(l => l.split(';').length === cabEst.split(';').length), cabEst);
  }

  // ---------- o CSV sobrevive a texto sujo ----------
  t.secao('texto que quebraria a planilha');
  const sujo = await pagina.evaluate(() => {
    animals = [{ id: 'sx', ident: 'A;1', cat: 'com "aspas"', notes: 'linha\nquebrada' }];
    weighings = [{ id: 'sw', animalId: 'sx', date: '2026-05-01', weight: 300, notes: 'obs; com ponto e vírgula' }];
    bovT = [{ id: 'sb', date: '2026-05-01', type: 'saida', amount: 10, category: 'Ração; especial', notes: 'a "nota"' }];
    let pego = null;
    const orig = window.download;
    window.download = (arq, corpo) => { pego = corpo; };
    $('menu-exp-pes').click();
    const p = pego;
    exportFin('bov');
    const f = pego;
    window.download = orig;
    // Um campo com ponto e vírgula tem de sair entre aspas, senão a planilha
    // entende como coluna nova e desalinha o arquivo inteiro.
    const contaColunas = txt => {
      const linhas = txt.split('\n').filter(Boolean);
      const n = linhas[0].split(';').length;
      // conta colunas respeitando as aspas
      const cols = l => {
        let c = 1, dentro = false;
        for (const ch of l) { if (ch === '"') dentro = !dentro; else if (ch === ';' && !dentro) c++; }
        return c;
      };
      return linhas.slice(1).every(l => cols(l) === n);
    };
    return { pesAlinhado: contaColunas(p), finAlinhado: contaColunas(f) };
  });
  t.conferir('ponto e vírgula no texto não desalinha o CSV de pesagens', sujo.pesAlinhado === true);
  t.conferir('ponto e vírgula no texto não desalinha o CSV financeiro', sujo.finAlinhado === true);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
