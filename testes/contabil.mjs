// Auditoria contábil: todo lançamento, por todo caminho, em todo regime.
//
// A pergunta que esta bateria responde é a de um contador olhando o livro:
// "este número pode ser confiado?". Ela não confere telas isoladas — confere
// as IGUALDADES que precisam valer em qualquer estado dos dados, montando a
// fazenda por todos os caminhos que criam lançamento:
//
//   1. lançamento à vista, entrada e saída
//   2. lançamento a prazo (a pagar) e parcelado
//   3. lançamento a prazo A RECEBER, que é novo
//   4. compra de estoque que vira despesa
//   5. venda de animal que vira receita
//
// E então cobra, sobre o conjunto:
//   - saldo = receitas − custos, sempre;
//   - cada lançamento entra em EXATAMENTE uma natureza, e as naturezas somam
//     o movimento;
//   - a soma por atividade = a soma por categoria = o movimento;
//   - os três regimes nunca contam o mesmo lançamento duas vezes, e nenhum
//     inventa dinheiro que não existe;
//   - a Fazenda é a soma de todos os livros, incluindo as atividades criadas;
//   - dinheiro que ainda não passou pela conta não aparece no caixa, nos dois
//     sentidos.
import { servir, abrirApp, placar } from './apoio.mjs';

const CENARIO = () => {
  bovT = []; avT = []; gerT = []; extraT = {}; atividades = [];
  animals = []; weighings = []; items = []; moves = []; pendentes = [];
  recomputarLivros();
  aplicarAtividades([{ id: 'atSoja', nome: 'Soja' }]);
  LS.s('fjs-ics-auto', false);

  bovT = [
    // à vista, nos dois sentidos
    { id: 'b1', date: '2026-03-05', type: 'entrada', amount: 12000, category: 'Venda de gado' },
    { id: 'b2', date: '2026-03-06', type: 'saida', amount: 1500, category: 'Ração/insumos' },
    // a pagar, ainda devendo
    { id: 'b3', date: '2026-03-10', type: 'saida', amount: 900, category: 'Frete',
      venc: '2026-04-10', pago: false },
    // a pagar, já quitada em outro mês
    { id: 'b4', date: '2026-03-12', type: 'saida', amount: 600, category: 'Vacina',
      venc: '2026-04-12', pago: true, pagoEm: '2026-05-02' },
    // parcelada em 3, uma paga
    { id: 'b5', date: '2026-03-20', type: 'saida', amount: 1000, category: 'Equipamentos',
      venc: '2026-04-20', pago: true, pagoEm: '2026-04-20', grupo: 'g1', parcela: 1, parcelas: 3 },
    { id: 'b6', date: '2026-03-20', type: 'saida', amount: 1000, category: 'Equipamentos',
      venc: '2026-05-20', pago: false, grupo: 'g1', parcela: 2, parcelas: 3 },
    { id: 'b7', date: '2026-03-20', type: 'saida', amount: 1000, category: 'Equipamentos',
      venc: '2026-06-20', pago: false, grupo: 'g1', parcela: 3, parcelas: 3 },
    // A RECEBER: boi entregue em março, dinheiro previsto para maio
    { id: 'b8', date: '2026-03-25', type: 'entrada', amount: 8000, category: 'Venda de gado',
      venc: '2026-05-25', pago: false },
    // recebimento já caído, em outro mês que o da venda
    { id: 'b9', date: '2026-03-26', type: 'entrada', amount: 4000, category: 'Venda de gado',
      venc: '2026-04-26', pago: true, pagoEm: '2026-04-30' }
  ];
  avT = [{ id: 'v1', date: '2026-03-08', type: 'entrada', amount: 5000, category: 'Pagamento Seara' },
         { id: 'v2', date: '2026-03-09', type: 'saida', amount: 700, category: 'Gás' }];
  gerT = [{ id: 'g1x', date: '2026-03-02', type: 'saida', amount: 2200, category: 'Contador/serviços' }];
  extraT.atSoja = [{ id: 's1', date: '2026-03-15', type: 'entrada', amount: 30000, category: 'Soja' },
                   { id: 's2', date: '2026-03-16', type: 'saida', amount: 9000, category: 'Soja' }];
  definirRegime('competencia');
  ['bfin-period', 'av-period', 'fz-period'].forEach(id => { $(id).value = 'all'; guardarPeriodo(id); });
  tab = 'fazenda'; render();
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Auditoria contábil');
  pagina.on('dialog', d => d.accept());
  await pagina.evaluate(`(${CENARIO.toString()})()`);

  // ---------- as igualdades do livro ----------
  t.secao('as igualdades que sempre têm de valer');
  const inv = await pagina.evaluate(() => {
    const out = {};
    ['competencia', 'caixa', 'vencimento'].forEach(reg => {
      const R = resumoFazenda('all', reg, '');
      const todos = LIVROS.flatMap(b => arrLivro(b))
        .filter(x => { const d = dataDoRegime(x, reg); return d && inPeriod(d, 'all'); });
      const somaTipo = tp => todos.filter(x => x.type === tp).reduce((a, x) => a + x.amount, 0);
      out[reg] = {
        n: R.n, nEsperado: todos.length,
        saldoFecha: Math.abs(R.saldo - (R.receitas - R.custos)) < 1e-9,
        receitas: R.receitas, custos: R.custos,
        receitasConferem: Math.abs(R.receitas - somaTipo('entrada')) < 1e-9,
        custosConferem: Math.abs(R.custos - somaTipo('saida')) < 1e-9,
        // Natureza: cada lançamento cai em uma só, e elas somam o movimento.
        naturezas: Object.values(R.classes).reduce((a, v) => a + v, 0),
        movimento: R.movimento,
        naturezasValidas: Object.keys(R.classes).every(c => ['Receita', 'Custeio', 'Investimento'].includes(c)),
        // Atividade: a soma das atividades é o saldo.
        atividadesFecham: Math.abs(R.atividades.reduce((a, x) => a + x.entrada - x.saida, 0) - R.saldo) < 1e-9,
        // Categoria: a soma de todas as categorias é o movimento.
        categoriasFecham: Math.abs(R.categorias.reduce((a, c) => a + c[1], 0) - R.movimento) < 1e-9,
        semNaN: [R.receitas, R.custos, R.saldo, R.movimento].every(Number.isFinite)
      };
    });
    return out;
  });
  ['competencia', 'caixa', 'vencimento'].forEach(reg => {
    const r = inv[reg];
    t.conferir(`${reg}: saldo = receitas − custos`, r.saldoFecha);
    t.conferir(`${reg}: conta exatamente os lançamentos do período`,
      r.n === r.nEsperado, `${r.n} vs ${r.nEsperado}`);
    t.conferir(`${reg}: receitas e custos somam o que as linhas somam`,
      r.receitasConferem && r.custosConferem, `${r.receitas} / ${r.custos}`);
    t.conferir(`${reg}: as naturezas somam o movimento, sem sobra`,
      Math.abs(r.naturezas - r.movimento) < 1e-9, `${r.naturezas} vs ${r.movimento}`);
    t.conferir(`${reg}: nenhuma natureza fora de Receita/Custeio/Investimento`, r.naturezasValidas);
    t.conferir(`${reg}: a soma das atividades é o saldo`, r.atividadesFecham);
    t.conferir(`${reg}: a soma das categorias é o movimento`, r.categoriasFecham);
    t.conferir(`${reg}: nenhum número quebrado`, r.semNaN);
  });

  // ---------- o que cada regime enxerga ----------
  // Três perguntas diferentes sobre os MESMOS lançamentos. Se dois regimes
  // dessem o mesmo número aqui, um dos dois não estaria fazendo nada.
  t.secao('cada regime responde a sua pergunta');
  const regs = await pagina.evaluate(() => {
    const ver = reg => { const R = resumoFazenda('all', reg, ''); return { r: R.receitas, c: R.custos }; };
    return { comp: ver('competencia'), caixa: ver('caixa'), venc: ver('vencimento') };
  });
  // Competência: tudo no dia do fato. Receitas 12000+8000+4000+5000+30000 = 59000
  t.conferir('competência vê o fato, inclusive o que ainda não foi recebido',
    regs.comp.r === 59000, String(regs.comp.r));
  // Caixa: sai o que ainda não passou pela conta — o a receber de 8000 e as
  // duas parcelas em aberto e o frete.
  t.conferir('caixa NÃO vê a venda que ainda não foi paga',
    regs.caixa.r === 59000 - 8000, String(regs.caixa.r));
  t.conferir('caixa não vê as contas ainda não pagas',
    regs.caixa.c === regs.comp.c - 900 - 1000 - 1000,
    `${regs.caixa.c} vs ${regs.comp.c}`);
  t.conferir('vencimento vê tudo, porque olha o compromisso',
    regs.venc.r === regs.comp.r && regs.venc.c === regs.comp.c,
    `${regs.venc.r}/${regs.venc.c}`);

  // ---------- a receber ----------
  t.secao('recebimento futuro');
  const rec = await pagina.evaluate(() => {
    const R = resumoFazenda('all', 'competencia', '');
    const umaVenda = bovT.find(x => x.id === 'b8');
    return {
      quantos: R.recebimentos.length,
      total: R.aReceberTotal,
      ehReceber: aReceber(umaVenda),
      naoEhPagar: !emAberto(umaVenda),
      // Um recebimento não pode aparecer no bloco de contas a pagar.
      semMistura: R.contas.every(x => x.t.type === 'saida'),
      recebimentoSoEntrada: R.recebimentos.every(x => x.t.type === 'entrada'),
      // O que ainda não caiu não está no caixa.
      foraDoCaixa: dataDoRegime(umaVenda, 'caixa') === null,
      // Mas está no vencimento, na data prevista.
      noVencimento: dataDoRegime(umaVenda, 'vencimento') === '2026-05-25',
      // E recebido fora do mês da venda, o caixa usa o dia em que caiu.
      caixaUsaODiaQueCaiu: dataDoRegime(bovT.find(x => x.id === 'b9'), 'caixa') === '2026-04-30'
    };
  });
  t.conferir('a venda a prazo vira um "a receber"', rec.ehReceber && rec.naoEhPagar);
  t.conferir('o bloco A receber traz só ela', rec.quantos === 1 && rec.total === 8000,
    `${rec.quantos} · ${rec.total}`);
  t.conferir('a pagar e a receber não se misturam',
    rec.semMistura && rec.recebimentoSoEntrada);
  t.conferir('o que ainda não caiu fica fora do caixa', rec.foraDoCaixa);
  t.conferir('mas aparece no regime de vencimento, na data prevista', rec.noVencimento);
  t.conferir('recebido fora do mês, o caixa usa o dia em que o dinheiro caiu',
    rec.caixaUsaODiaQueCaiu);

  // ---------- lançar a receber pelo formulário ----------
  t.secao('lançar um recebimento futuro pelo formulário');
  const pelaTela = await pagina.evaluate(() => {
    openTrans('bov');
    document.querySelector('input[name="t-type"][value="entrada"]').checked = true;
    document.querySelector('input[name="t-type"][value="entrada"]').dispatchEvent(new Event('change'));
    return { prazoVisivel: $('t-prazo-box').style.display !== 'none',
      rotuloPrazo: $('t-prazo-rot').textContent,
      rotuloVenc: $('t-venc-rot').textContent,
      rotuloPago: $('t-pago-rot').textContent };
  });
  t.conferir('o campo de prazo aparece também na entrada', pelaTela.prazoVisivel);
  // Palavras erradas levam a preencher o campo certo com a intenção errada.
  t.conferir('e fala de receber, não de pagar',
    /receber depois/.test(pelaTela.rotuloPrazo) && /recebimento/.test(pelaTela.rotuloVenc)
    && /recebi/i.test(pelaTela.rotuloPago),
    `${pelaTela.rotuloPrazo} · ${pelaTela.rotuloVenc} · ${pelaTela.rotuloPago}`);

  await pagina.evaluate(() => {
    $('t-date').value = '2026-07-01';
    $('t-amount').value = '15000';
    $('t-category').value = 'Venda de gado';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-08-01';
    $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => closeAllM());
  const salvo = await pagina.evaluate(() => {
    const novas = bovT.filter(x => x.date === '2026-07-01');
    return { n: novas.length, soma: novas.reduce((a, x) => a + x.amount, 0),
      todasEntrada: novas.every(x => x.type === 'entrada'),
      todasAReceber: novas.every(aReceber),
      nenhumaNoCaixa: novas.every(x => dataDoRegime(x, 'caixa') === null),
      vencs: novas.slice().sort((a, b) => a.parcela - b.parcela).map(x => x.venc) };
  });
  t.conferir('venda em 3× cria 3 recebimentos', salvo.n === 3 && salvo.todasEntrada,
    `${salvo.n} registros`);
  t.conferir('somando exatamente o valor da venda', salvo.soma === 15000, String(salvo.soma));
  t.conferir('todos como a receber, nenhum no caixa ainda',
    salvo.todasAReceber && salvo.nenhumaNoCaixa);
  t.conferir('com as previsões mês a mês',
    salvo.vencs.join(',') === '2026-08-01,2026-09-01,2026-10-01', salvo.vencs.join(','));

  // Dar baixa num recebimento põe o dinheiro no caixa, no dia de hoje.
  const baixa = await pagina.evaluate(() => {
    const alvo = bovT.filter(x => x.date === '2026-07-01').sort((a, b) => a.parcela - b.parcela)[0];
    const antes = resumoFazenda('all', 'caixa', '').receitas;
    alvo.pago = true; alvo.pagoEm = todayISO();
    const depois = resumoFazenda('all', 'caixa', '').receitas;
    return { antes, depois, valor: alvo.amount, aindaAReceber: aReceber(alvo) };
  });
  t.conferir('dar baixa joga exatamente aquele valor no caixa',
    Math.abs((baixa.depois - baixa.antes) - baixa.valor) < 1e-9,
    `${baixa.antes} → ${baixa.depois} (parcela ${baixa.valor})`);
  t.conferir('e ela sai da lista de a receber', baixa.aindaAReceber === false);

  // ---------- os outros caminhos de lançamento ----------
  // Compra de estoque e venda de animal criam lançamento sem passar pelo
  // formulário financeiro. O total da fazenda tem de enxergá-los igual.
  t.secao('lançamentos criados por outras telas');
  const outros = await pagina.evaluate(() => {
    const antes = resumoFazenda('all', 'competencia', '');
    // venda de animal
    animals = [{ id: 'an1', ident: 'BR100', cat: 'Boi', sold: true, soldDate: '2026-06-01',
      soldWeight: 480, soldPrice: 9000 }];
    syncAnimalSaleTrans(animals[0]);
    const comVenda = resumoFazenda('all', 'competencia', '');
    const gerado = bovT.filter(x => x.lock === 'animal');
    return { antes: antes.receitas, depois: comVenda.receitas,
      gerados: gerado.length, valor: gerado[0] && gerado[0].amount,
      ehEntrada: gerado[0] && gerado[0].type === 'entrada',
      // O lançamento gerado não pode nascer duplicado ao chamar de novo.
      duplicou: (() => { syncAnimalSaleTrans(animals[0]);
        return bovT.filter(x => x.lock === 'animal').length; })() };
  });
  t.conferir('a venda do animal vira uma receita', outros.gerados === 1 && outros.ehEntrada);
  t.conferir('com o valor da venda', outros.valor === 9000, String(outros.valor));
  t.conferir('e o total da fazenda sobe exatamente isso',
    Math.abs((outros.depois - outros.antes) - 9000) < 1e-9,
    `${outros.antes} → ${outros.depois}`);
  t.conferir('salvar o animal de novo não duplica o lançamento',
    outros.duplicou === 1, String(outros.duplicou));

  // ---------- a Fazenda é a soma de todos os livros ----------
  t.secao('a Fazenda é a soma de todos os livros');
  const soma = await pagina.evaluate(() => {
    const R = resumoFazenda('all', 'competencia', '');
    const porLivro = LIVROS.map(b => {
      const l = arrLivro(b);
      return { nome: NOME_LIVRO[b],
        e: l.filter(x => x.type === 'entrada').reduce((a, x) => a + x.amount, 0),
        sd: l.filter(x => x.type === 'saida').reduce((a, x) => a + x.amount, 0) };
    });
    return { receitas: R.receitas, custos: R.custos,
      somaE: porLivro.reduce((a, x) => a + x.e, 0),
      somaS: porLivro.reduce((a, x) => a + x.sd, 0),
      nAtividades: R.atividades.length, nLivros: LIVROS.length,
      // a atividade criada precisa estar lá dentro
      temSoja: R.atividades.some(x => x.nome === 'Soja' && x.entrada === 30000) };
  });
  t.conferir('receitas da Fazenda = soma de todos os livros',
    Math.abs(soma.receitas - soma.somaE) < 1e-9, `${soma.receitas} vs ${soma.somaE}`);
  t.conferir('custos da Fazenda = soma de todos os livros',
    Math.abs(soma.custos - soma.somaS) < 1e-9, `${soma.custos} vs ${soma.somaS}`);
  t.conferir('nenhum livro fica de fora do resumo por atividade',
    soma.nAtividades === soma.nLivros, `${soma.nAtividades} vs ${soma.nLivros}`);
  t.conferir('inclusive a atividade criada pela pessoa', soma.temSoja);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
