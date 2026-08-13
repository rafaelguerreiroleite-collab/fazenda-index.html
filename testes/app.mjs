// Confere o resto do aplicativo: GMD, estoque, períodos, rebanho, financeiro,
// entrada de números em português e o comportamento diante de erros.
import { servir, abrirApp, placar, perto } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Aplicativo');
  const eq = (a, b) => perto(a, b);

  // ---------- números em português ----------
  t.secao('leitura de número digitado em português');
  for (const [txt, esperado] of [['4,50', 4.5], ['0,850', 0.85], ['415,5', 415.5], ['2500,00', 2500],
    ['1.500,00', 1500], ['1.234.567,89', 1234567.89], ['1500', 1500], ['4.50', 4.5],
    ['', NaN], ['abc', NaN], ['12,5,7', NaN], ['-', NaN]]) {
    const obtido = await pagina.evaluate(x => parseNum(x), txt);
    t.conferir(`"${txt}"`, Number.isNaN(esperado) ? Number.isNaN(obtido) : eq(obtido, esperado), '→ ' + obtido);
  }

  // ---------- GMD e datas ----------
  t.secao('GMD e contagem de dias');
  const g = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: 'A' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-01-01', weight: 300 },
                 { id: 'w2', animalId: 'a1', date: '2026-03-02', weight: 360 },
                 { id: 'w3', animalId: 'a1', date: '2026-04-01', weight: 375 }];
    const ws = wOf('a1');
    return { total: gmdTotal(ws), recente: gmdRecent(ws), ordenado: ws.map(w => w.date).join(','),
      bissexto: daysBetween('2024-02-28', '2024-03-01'), comum: daysBetween('2026-02-28', '2026-03-01'),
      ano: daysBetween('2026-01-01', '2027-01-01'), fuso: daysBetween('2026-10-01', '2026-11-01') };
  });
  t.conferir('pesagens ficam em ordem de data', g.ordenado === '2026-01-01,2026-03-02,2026-04-01');
  t.conferir('GMD total = (375−300)/90', eq(g.total, 75 / 90), g.total.toFixed(6));
  t.conferir('GMD recente = (375−360)/30', eq(g.recente, 0.5));
  t.conferir('ano bissexto conta 2 dias', g.bissexto === 2);
  t.conferir('ano comum conta 1 dia', g.comum === 1);
  t.conferir('um ano = 365 dias', g.ano === 365);
  t.conferir('mês com troca de fuso = 31 dias', g.fuso === 31);

  // ---------- estoque ----------
  t.secao('estoque');
  const e = await pagina.evaluate(() => {
    items = [{ id: 'i1', name: 'Sal', unit: 'kg' }];
    moves = [{ id: 'm1', itemId: 'i1', type: 'entrada', date: '2026-01-01', qty: 100, unitCost: 4 },
             { id: 'm2', itemId: 'i1', type: 'entrada', date: '2026-02-01', qty: 50, unitCost: 5 },
             { id: 'm3', itemId: 'i1', type: 'saida', date: '2026-02-10', qty: 30 }];
    return { saldo: qtyOf('i1'), medio: avgCostOf('i1') };
  });
  t.conferir('saldo = 100 + 50 − 30', eq(e.saldo, 120), e.saldo + ' kg');
  t.conferir('custo médio ponderado', eq(e.medio, (100 * 4 + 50 * 5) / 150), 'R$ ' + e.medio.toFixed(4));

  // ---------- filtro de período ----------
  t.secao('filtro de período');
  const per = await pagina.evaluate(() => {
    const z = n => String(n).padStart(2, '0'), iso = (y, m, d) => `${y}-${z(m)}-${z(d)}`;
    const h = new Date(), y = h.getFullYear(), m = h.getMonth() + 1;
    const ant = new Date(y, m - 2, 15);
    return { atual: inPeriod(iso(y, m, 15), 'this-month'),
      anteriorNoAtual: inPeriod(iso(ant.getFullYear(), ant.getMonth() + 1, 15), 'this-month'),
      anterior: inPeriod(iso(ant.getFullYear(), ant.getMonth() + 1, 15), 'last-month'),
      esteAno: inPeriod(iso(y, 1, 1), 'this-year'), anoPassado: inPeriod(iso(y - 1, 6, 15), 'this-year'),
      tudo: inPeriod('1999-01-01', 'all') };
  });
  t.conferir('este mês inclui hoje', per.atual === true);
  t.conferir('este mês exclui o mês anterior', per.anteriorNoAtual === false);
  t.conferir('mês anterior funciona virando o ano', per.anterior === true);
  t.conferir('este ano inclui janeiro', per.esteAno === true);
  t.conferir('este ano exclui o ano passado', per.anoPassado === false);
  t.conferir('todo período inclui tudo', per.tudo === true);

  // ---------- rebanho ----------
  t.secao('estatísticas do rebanho');
  await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '1' }, { id: 'a2', ident: '2' }, { id: 'a3', ident: '3', sold: true }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-01-01', weight: 300 },
                 { id: 'w2', animalId: 'a1', date: '2026-04-01', weight: 390 },
                 { id: 'w3', animalId: 'a2', date: '2026-04-01', weight: 410 },
                 { id: 'w4', animalId: 'a3', date: '2026-04-01', weight: 999 }];
    settings.yield = 52; seg = 'rebanho'; detailAnimal = null; render();
  });
  const st = await pagina.evaluate(() => [...document.querySelectorAll('#bov-stats .stat-value')].map(x => x.textContent));
  t.conferir('conta só os ativos', st[0] === '2', st[0]);
  t.conferir('peso médio ignora vendidos', st[3] === '400 kg', st[3]);
  t.conferir('média em arrobas', st[4] === '13,9 @', st[4]);
  t.conferir('total do rebanho em arrobas', st[5] === '28 @', st[5]);

  // ---------- ordenação ----------
  t.secao('ordenação do rebanho');
  await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '292' }, { id: 'a2', ident: '300' }, { id: 'a3', ident: '9' }, { id: 'a4', ident: '295' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-06-18', weight: 203 },
                 { id: 'w2', animalId: 'a2', date: '2026-06-18', weight: 181 },
                 { id: 'w3', animalId: 'a3', date: '2026-06-18', weight: 350 }];
    render();
  });
  const ordem = async v => { await pagina.selectOption('#bov-sort', v); await pagina.waitForTimeout(60);
    return pagina.evaluate(() => [...document.querySelectorAll('#animal-list .item-title')].map(e => e.textContent).join(',')); };
  t.conferir('brinco crescente é numérico (9 antes de 292)', await ordem('ident-asc') === '9,292,295,300');
  t.conferir('brinco decrescente', await ordem('ident-desc') === '300,295,292,9');
  t.conferir('mais pesado primeiro, sem pesagem por último', await ordem('peso-desc') === '9,292,300,295');
  t.conferir('mais leve primeiro, sem pesagem por último', await ordem('peso-asc') === '300,292,9,295');

  // ---------- financeiro ----------
  t.secao('financeiro');
  await pagina.evaluate(() => {
    bovT = [{ id: 't1', date: '2026-04-01', type: 'entrada', amount: 1000, category: 'Venda de gado' },
            { id: 't2', date: '2026-04-02', type: 'saida', amount: 250.5, category: 'Ração/insumos' },
            { id: 't3', date: '2026-04-03', type: 'saida', amount: 100.25, category: 'Ração/insumos' }];
    seg = 'financeiro'; $('bfin-period').value = 'all'; render();
  });
  const fin = await pagina.evaluate(() => ({
    saldo: document.querySelector('#bfin-balance .bc-value').textContent,
    classe: document.querySelector('#bfin-balance .bc-value').className,
    categorias: [...document.querySelectorAll('#bfin-cats .cb-line')].map(l => l.textContent).join(' | ')
  }));
  t.conferir('saldo = 1000 − 350,75', fin.saldo === 'R$ 649,25', fin.saldo);
  t.conferir('saldo positivo marcado como tal', fin.classe.includes('positive'));
  t.conferir('categoria soma as duas saídas', fin.categorias.includes('350,75'));

  // ---------- avisos de duplicidade ----------
  t.secao('aviso de duplicidade');
  const lancar = async (valor, aceitar) => {
    let msg = null;
    const h = async d => { msg = d.message(); await (aceitar ? d.accept() : d.dismiss()); };
    pagina.once('dialog', h);
    await pagina.evaluate(() => openTrans('bov'));
    await pagina.fill('#t-amount', String(valor));
    await pagina.fill('#t-date', '2026-08-11');
    await pagina.fill('#t-category', 'Ração/insumos');
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(120);
    pagina.removeListener('dialog', h);
    return msg;
  };
  await pagina.evaluate(() => { bovT = []; render(); });
  t.conferir('primeiro lançamento não avisa', await lancar(500, true) === null);
  t.conferir('lançamento igual avisa', /DUPLICIDADE/.test(await lancar(500, true) || ''));
  t.conferir('aceitando, grava', await pagina.evaluate(() => bovT.length) === 2);
  await lancar(500, false);
  t.conferir('cancelando, não grava', await pagina.evaluate(() => bovT.length) === 2);
  t.conferir('valor diferente não avisa', await lancar(777, true) === null);

  // ---------- registro apagado em outro aparelho ----------
  t.secao('registro apagado em outro aparelho durante a edição');
  const conflito = async (nome, preparar, abrir, botao) => {
    await pagina.evaluate(preparar); await pagina.evaluate(abrir); await pagina.waitForTimeout(80);
    await pagina.evaluate(() => { animals = []; weighings = []; bovT = []; items = []; moves = []; });
    const antes = errosJS.length;
    await pagina.click(botao); await pagina.waitForTimeout(120);
    const r = await pagina.evaluate(() => ({ fechou: [...document.querySelectorAll('.modal')].every(m => m.hidden), aviso: $('toast').textContent }));
    t.conferir(nome, errosJS.length === antes && r.fechou && /em outro aparelho/.test(r.aviso), r.aviso);
  };
  await conflito('animal', () => { animals = [{ id: 'a1', ident: 'BR001' }]; render(); }, () => openAnimal(animals[0]), '#form-animal button[type="submit"]');
  await conflito('pesagem', () => { animals = [{ id: 'a1', ident: 'B' }]; weighings = [{ id: 'w1', animalId: 'a1', date: '2026-08-01', weight: 400 }]; render(); }, () => openWeighing('a1', weighings[0]), '#form-weighing button[type="submit"]');
  await conflito('lançamento', () => { bovT = [{ id: 't1', date: '2026-08-01', type: 'saida', amount: 100 }]; render(); }, () => openTrans('bov', bovT[0]), '#form-transaction button[type="submit"]');
  await conflito('item', () => { items = [{ id: 'i1', name: 'Sal', unit: 'kg' }]; render(); }, () => openItem(items[0]), '#form-item button[type="submit"]');
  await conflito('movimentação', () => { items = [{ id: 'i1', name: 'Sal', unit: 'kg' }]; moves = [{ id: 'm1', itemId: 'i1', type: 'entrada', date: '2026-08-01', qty: 10 }]; render(); }, () => openMove('i1', 'entrada', moves[0]), '#form-move button[type="submit"]');

  // ---------- exportação CSV ----------
  t.secao('exportação CSV com dados que quebram planilha');
  const csvTexto = await pagina.evaluate(() => {
    let capturado = null; const orig = window.download; window.download = (n, c) => { capturado = c; };
    animals = [{ id: 'a1', ident: 'BR;001' }, { id: 'a2', ident: 'Aspas"X' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-08-01', weight: 400, notes: 'linha1\nlinha2' },
                 { id: 'w2', animalId: 'a2', date: '2026-08-02', weight: 410, notes: 'com;ponto' }];
    $('menu-exp-pes').click(); window.download = orig; return capturado;
  });
  t.conferir('brinco com ";" entre aspas', csvTexto.includes('"BR;001"'));
  t.conferir('aspas internas duplicadas', csvTexto.includes('"Aspas""X"'));
  t.conferir('observação com quebra de linha entre aspas', csvTexto.includes('"linha1\nlinha2"'));
  t.conferir('observação com ";" entre aspas', csvTexto.includes('"com;ponto"'));

  // ---------- apagar tudo exige confirmação escrita ----------
  t.secao('apagar todos os dados');
  const apagar = async resposta => {
    await pagina.evaluate(() => { window._apagou = false; batchWrite = async () => { window._apagou = true; }; });
    const h = async d => { d.type() === 'confirm' ? await d.accept() : (resposta === null ? await d.dismiss() : await d.accept(resposta)); };
    pagina.on('dialog', h);
    await pagina.evaluate(() => $('menu-clear').click());
    await pagina.waitForTimeout(120); pagina.removeListener('dialog', h);
    return pagina.evaluate(() => window._apagou);
  };
  t.conferir('palavra errada não apaga', await apagar('errado') === false);
  t.conferir('cancelar não apaga', await apagar(null) === false);
  t.conferir('palavra correta apaga', await apagar('APAGAR') === true);

  // ---------- limpeza: manter só quem foi pesado num dia ----------
  // Rebanho de teste: 292 e 293 passaram pela balança em 13/08 e ficam; 294 e
  // 295 não passaram e saem; 296 nunca teve pesagem nenhuma e também sai.
  t.secao('limpeza do rebanho');
  const montarRebanho = () => pagina.evaluate(() => {
    animals = [{ id: 'k1', ident: '292' }, { id: 'k2', ident: '293' }, { id: 'k3', ident: '294' },
               { id: 'k4', ident: '295' }, { id: 'k5', ident: '296' }];
    weighings = [
      { id: 'kw1', animalId: 'k1', date: '2026-06-18', weight: 200 },
      { id: 'kw2', animalId: 'k1', date: '2026-08-13', weight: 255 },
      { id: 'kw3', animalId: 'k2', date: '2026-08-13', weight: 300 },
      { id: 'kw4', animalId: 'k3', date: '2026-06-18', weight: 280 },
      { id: 'kw5', animalId: 'k4', date: '2026-07-01', weight: 310 }
    ];
    window._ops = null; batchWrite = async ops => { window._ops = ops; };
    render(); $('menu-limpeza').click();
  });
  await montarRebanho();
  await pagina.fill('#lm-date', '2026-08-13');
  await pagina.waitForTimeout(120);
  const tela = await pagina.evaluate(() => ({
    numeros: [...document.querySelectorAll('#lm-resumo .lm-num .v')].map(e => e.textContent),
    saem: [...document.querySelectorAll('#lm-listas details')][0].querySelectorAll('.lm-linha .brinco'),
    brincosSaem: [...[...document.querySelectorAll('#lm-listas details')][0].querySelectorAll('.lm-linha .brinco')].map(e => e.textContent),
    brincosFicam: [...[...document.querySelectorAll('#lm-listas details')][1].querySelectorAll('.lm-linha .brinco')].map(e => e.textContent),
    botao: $('lm-confirm').textContent, desabilitado: $('lm-confirm').disabled
  }));
  t.conferir('conta certo quem fica e quem sai', JSON.stringify(tela.numeros) === '["2","3"]', JSON.stringify(tela.numeros));
  t.conferir('lista nominalmente quem vai ser apagado', JSON.stringify(tela.brincosSaem) === '["294","295","296"]', JSON.stringify(tela.brincosSaem));
  t.conferir('e também quem continua', JSON.stringify(tela.brincosFicam) === '["292","293"]', JSON.stringify(tela.brincosFicam));
  t.conferir('o botão diz o tamanho do estrago', /3 animais e 2 pesagens/.test(tela.botao), tela.botao);
  t.conferir('botão liberado quando há o que apagar', tela.desabilitado === false);

  // Data sem pesagem nenhuma apagaria o rebanho inteiro: o botão trava.
  await pagina.fill('#lm-date', '2026-01-01');
  await pagina.waitForTimeout(120);
  t.conferir('data sem pesagem trava o botão', await pagina.evaluate(() => $('lm-confirm').disabled),
    await pagina.evaluate(() => $('lm-confirm').textContent));
  t.conferir('e o botão travado não mostra número de estrago',
    await pagina.evaluate(() => $('lm-confirm').textContent) === 'Confira a data',
    await pagina.evaluate(() => $('lm-confirm').textContent));
  t.conferir('e avisa que ninguém foi pesado nesse dia',
    /Nenhum animal foi pesado/.test(await pagina.evaluate(() => $('lm-resumo').textContent)));

  const limpar = async resposta => {
    await montarRebanho();
    await pagina.fill('#lm-date', '2026-08-13'); await pagina.waitForTimeout(120);
    const h = async d => { d.type() === 'confirm' ? await d.accept() : (resposta === null ? await d.dismiss() : await d.accept(resposta)); };
    pagina.on('dialog', h);
    await pagina.click('#lm-confirm'); await pagina.waitForTimeout(150);
    pagina.removeListener('dialog', h);
    return pagina.evaluate(() => ({
      ops: window._ops, brincos: animals.map(a => a.ident), pesagens: weighings.length
    }));
  };
  let res = await limpar('errado');
  t.conferir('palavra errada não apaga nada', res.ops === null && res.brincos.length === 5, res.brincos.join(','));
  res = await limpar(null);
  t.conferir('cancelar não apaga nada', res.ops === null && res.brincos.length === 5, res.brincos.join(','));

  res = await limpar('APAGAR');
  t.conferir('sobra só quem foi pesado no dia', JSON.stringify(res.brincos) === '["292","293"]', JSON.stringify(res.brincos));
  t.conferir('o histórico de quem ficou é preservado', res.pesagens === 3, res.pesagens + ' pesagem(ns)');
  t.conferir('a pesagem antiga do 292 continua lá',
    await pagina.evaluate(() => weighings.some(w => w.animalId === 'k1' && w.date === '2026-06-18')));
  const apagados = (res.ops || []).map(o => o.col + ':' + o.del);
  t.conferir('manda apagar as 2 pesagens dos que saíram',
    apagados.filter(x => x.startsWith('weighings')).length === 2, apagados.join(' '));
  t.conferir('manda apagar os 3 animais que saíram',
    apagados.filter(x => x.startsWith('animals')).length === 3, apagados.join(' '));
  t.conferir('não manda apagar nada de quem ficou',
    !apagados.some(x => ['animals:k1', 'animals:k2', 'weighings:kw1', 'weighings:kw2', 'weighings:kw3'].includes(x)), apagados.join(' '));
  t.conferir('a cópia local do aparelho também foi atualizada',
    await pagina.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('fjs-espelho') || '{}');
      const an = (e.dados || e).animals || [];
      return an.length === 2;
    }));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
