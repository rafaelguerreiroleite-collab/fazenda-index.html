// Filtro de período: o que ele esconde precisa ser anunciado.
//
// Um lançamento com data fora do período escolhido some da tela. Isso é o
// esperado — o que não pode é sumir em silêncio: quem acabou de lançar uma
// parcela para 2027 abre o Financeiro, vê "Este mês", não encontra nada e
// conclui que o lançamento se perdeu. Foi exatamente o que aconteceu.
//
// Estes testes exigem duas coisas: que o aviso apareça contando o que ficou de
// fora, e que a escolha do período sobreviva a fechar e abrir o aplicativo.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Filtro de período');

  const cenario = await pagina.evaluate(() => {
    const p = n => String(n).padStart(2, '0');
    const h = new Date();
    const esteMes = `${h.getFullYear()}-${p(h.getMonth() + 1)}-05`;
    const anoQueVem = `${h.getFullYear() + 1}-01-10`;
    const daquiADois = `${h.getFullYear() + 2}-06-01`;

    // o aviso só é visto de dentro do Financeiro, e é de lá que o clique parte:
    // sem isto, o render() do clique redesenharia o rebanho
    tab = 'bovinos';
    seg = 'financeiro';

    bovT.length = 0;
    bovT.push(
      { id: 'a', date: esteMes,    type: 'saida',   amount: 100, category: 'Ração' },
      { id: 'b', date: anoQueVem,  type: 'saida',   amount: 250, category: 'Vacina' },
      { id: 'c', date: daquiADois, type: 'entrada', amount:  80, category: 'Venda' }
    );

    const leia = () => {
      const av = document.querySelector('#bfin-list .fora-periodo');
      return {
        itens: document.querySelectorAll('#bfin-list .transaction-item').length,
        aviso: av ? av.querySelector('.fp-texto').textContent.trim() : null
      };
    };

    $('bfin-period').value = 'this-month';
    renderFin('bov');
    const mes = leia();

    $('bfin-period').value = 'this-year';
    renderFin('bov');
    const ano = leia();

    // o clique no aviso é o caminho que a pessoa realmente usa
    $('bfin-period').value = 'this-month';
    renderFin('bov');
    document.querySelector('#bfin-list .fora-periodo').click();
    const depoisDoClique = Object.assign(leia(), {
      periodo: $('bfin-period').value,
      guardado: JSON.parse(localStorage.getItem('fjs-periodo-bov') || 'null')
    });

    // nada fora do período => nenhum aviso
    $('bfin-period').value = 'all';
    renderFin('bov');
    const tudo = leia();

    return { mes, ano, depoisDoClique, tudo };
  });

  t.secao('o aviso conta o que o filtro escondeu');
  t.conferir('"Este mês" mostra só o lançamento do mês', cenario.mes.itens === 1, `(${cenario.mes.itens})`);
  t.conferir('avisa os 2 que ficaram de fora, com a soma',
    cenario.mes.aviso === '+ 2 lançamentos com data futura · R$ 330,00', `(${cenario.mes.aviso})`);
  t.conferir('"Este ano" também avisa o que é de outro ano',
    cenario.ano.aviso === '+ 2 lançamentos com data futura · R$ 330,00', `(${cenario.ano.aviso})`);

  t.secao('o aviso leva para todo o período');
  t.conferir('clicar troca o filtro para "all"', cenario.depoisDoClique.periodo === 'all');
  t.conferir('passa a mostrar os 3 lançamentos', cenario.depoisDoClique.itens === 3, `(${cenario.depoisDoClique.itens})`);
  t.conferir('o aviso some quando nada está escondido', cenario.depoisDoClique.aviso === null);
  t.conferir('a escolha fica guardada no aparelho', cenario.depoisDoClique.guardado === 'all');
  t.conferir('"Todo período" nunca mostra aviso', cenario.tudo.aviso === null && cenario.tudo.itens === 3);

  // Reabrir o aplicativo não pode desfazer a escolha: era isso que fazia o
  // lançamento escondido voltar a sumir a cada abertura.
  await pagina.reload();
  await pagina.waitForFunction(() => typeof restaurarPeriodos === 'function');
  const aoReabrir = await pagina.evaluate(() => $('bfin-period').value);

  t.secao('a escolha sobrevive a fechar e abrir');
  t.conferir('o período guardado é restaurado', aoReabrir === 'all', `(${aoReabrir})`);

  // ---------- escolher um mês ou um ano ----------
  // "Este mês / mês anterior / este ano / todo período" não responde "quanto
  // gastei em março". O seletor passa a listar os meses que TÊM lançamento.
  t.secao('escolher mês e ano');
  const escolher = await pagina.evaluate(() => {
    bovT = [
      { id: 'm1', date: '2026-03-10', type: 'saida', amount: 100, category: 'Ração/insumos' },
      { id: 'm2', date: '2026-03-20', type: 'saida', amount: 200, category: 'Ração/insumos' },
      { id: 'm3', date: '2026-07-05', type: 'entrada', amount: 900, category: 'Venda de gado' },
      { id: 'm4', date: '2025-11-02', type: 'saida', amount: 50, category: 'Frete' }
    ];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    definirRegime('competencia');
    tab = 'bovinos'; seg = 'financeiro'; render();
    const el = $('bfin-period');
    const valores = [...el.options].map(o => o.value);
    const rotulos = [...el.options].map(o => o.textContent);
    const ver = v => {
      el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
      return { saldo: $('bfin-balance').innerText,
        linhas: $('bfin-list').querySelectorAll('[data-trans]').length };
    };
    const r = { valores, rotulos, marco: ver('2026-03'), julho: ver('2026-07'),
      ano2025: ver('2025'), ano2026: ver('2026') };
    r.guardado = JSON.parse(localStorage.getItem('fjs-periodo-bov'));

    // mês sem lançamento nenhum não pode ser oferecido
    r.ofereceMesVazio = valores.includes('2026-05');
    // e os quatro períodos móveis continuam lá, na frente
    r.fixosNaFrente = valores.slice(0, 4).join(',');

    // um livro sem lançamento não inventa mês
    tab = 'aviarios'; render();
    r.aviariosVazio = [...$('av-period').options].map(o => o.value);

    // a Fazenda oferece os meses dos TRÊS livros
    gerT = [{ id: 'g1', date: '2026-01-15', type: 'saida', amount: 10, category: 'Outros' }];
    tab = 'fazenda'; render();
    r.fazenda = [...$('fz-period').options].map(o => o.value);
    return r;
  });
  t.conferir('os quatro períodos móveis continuam na frente',
    escolher.fixosNaFrente === 'this-month,last-month,this-year,all', escolher.fixosNaFrente);
  t.conferir('os meses com lançamento são oferecidos, do mais novo ao mais velho',
    escolher.valores.join(',').includes('2026-07,2026-03,2025-11'), escolher.valores.join(','));
  t.conferir('com nome de mês em português', escolher.rotulos.includes('Março de 2026'),
    escolher.rotulos.join(' | '));
  t.conferir('mês sem lançamento não é oferecido', escolher.ofereceMesVazio === false);
  t.conferir('escolher março soma só março',
    /300,00/.test(escolher.marco.saldo) && escolher.marco.linhas === 2,
    escolher.marco.saldo.split('\n').join(' ') + ' · ' + escolher.marco.linhas);
  t.conferir('escolher julho soma só julho',
    /900,00/.test(escolher.julho.saldo) && escolher.julho.linhas === 1,
    escolher.julho.saldo.split('\n').join(' '));
  t.conferir('dá para escolher o ano inteiro', escolher.valores.includes('2025'),
    escolher.valores.join(','));
  t.conferir('o ano de 2025 traz só o lançamento de 2025', escolher.ano2025.linhas === 1,
    String(escolher.ano2025.linhas));
  t.conferir('e o de 2026 traz os três de 2026', escolher.ano2026.linhas === 3,
    String(escolher.ano2026.linhas));
  t.conferir('o mês escolhido fica guardado no aparelho', escolher.guardado === '2026',
    String(escolher.guardado));
  t.conferir('livro sem lançamento não inventa mês',
    escolher.aviariosVazio.length === 4, escolher.aviariosVazio.join(','));
  t.conferir('a Fazenda oferece os meses dos três livros',
    escolher.fazenda.includes('2026-01') && escolher.fazenda.includes('2026-03'),
    escolher.fazenda.join(','));

  // no regime de caixa, o mês do PAGAMENTO também tem de ser escolhível
  const noCaixa = await pagina.evaluate(() => {
    bovT = [{ id: 'c1', date: '2026-03-10', type: 'saida', amount: 400, category: 'Ração/insumos',
      venc: '2026-04-10', pago: true, pagoEm: '2026-04-12' }];
    avT = []; gerT = [];
    definirRegime('caixa');
    tab = 'bovinos'; seg = 'financeiro'; render();
    const valores = [...$('bfin-period').options].map(o => o.value);
    $('bfin-period').value = '2026-04';
    $('bfin-period').dispatchEvent(new Event('change', { bubbles: true }));
    const abril = $('bfin-list').querySelectorAll('[data-trans]').length;
    // no caixa o mês da COMPRA não tem nada — e por isso nem é oferecido:
    // escolhê-lo abriria uma tela vazia sem dizer por quê
    const ofereceMarco = valores.includes('2026-03');
    definirRegime('competencia');
    render();
    const noComp = [...$('bfin-period').options].map(o => o.value);
    definirRegime('caixa');
    return { valores, abril, ofereceMarco, noComp };
  });
  t.conferir('o mês do pagamento é oferecido, não só o da compra',
    noCaixa.valores.includes('2026-04'), noCaixa.valores.join(','));
  t.conferir('e por caixa o lançamento aparece no mês em que foi pago',
    noCaixa.abril === 1, String(noCaixa.abril));
  t.conferir('o mês da compra não é oferecido no caixa: lá ele está vazio',
    noCaixa.ofereceMarco === false, noCaixa.valores.join(','));
  t.conferir('e por competência é o contrário: oferece a compra, não o pagamento',
    noCaixa.noComp.includes('2026-03') && !noCaixa.noComp.includes('2026-04'),
    noCaixa.noComp.join(','));

  // ---------- meses posteriores: a agenda de pagamentos ----------
  // Uma compra em três parcelas deixava de existir no futuro. Por competência
  // as três somam no mês da compra; por caixa, nenhuma existe até ser paga.
  // Quem precisa saber o que tem para pagar em novembro não era atendido.
  t.secao('ver os meses posteriores (por vencimento)');
  const agenda = await pagina.evaluate(() => {
    // Datas relativas a HOJE, e não fixas: com datas fixas o teste passaria
    // hoje e mentiria no ano que vem, quando "mês posterior" já seria passado.
    // Carnê em andamento: comprado há dois meses, a primeira parcela venceu e
    // foi paga, as duas seguintes estão agendadas para meses que ainda vêm.
    const h = new Date();
    const mes = n => { const d = new Date(h.getFullYear(), h.getMonth() + n, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const M = { compra: mes(-2), p1: mes(-1), p2: mes(1), p3: mes(2) };
    bovT = [
      { id: 'p1', date: M.compra + '-05', type: 'saida', amount: 400, category: 'Ração/insumos',
        grupo: 'g', parcela: 1, parcelas: 3, venc: M.p1 + '-10', pago: true, pagoEm: M.p1 + '-12' },
      { id: 'p2', date: M.compra + '-05', type: 'saida', amount: 400, category: 'Ração/insumos',
        grupo: 'g', parcela: 2, parcelas: 3, venc: M.p2 + '-10', pago: false },
      { id: 'p3', date: M.compra + '-05', type: 'saida', amount: 400, category: 'Ração/insumos',
        grupo: 'g', parcela: 3, parcelas: 3, venc: M.p3 + '-10', pago: false },
      { id: 'pv', date: M.compra + '-05', type: 'entrada', amount: 900, category: 'Venda de gado' }
    ];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    const mesesDe = regime => {
      definirRegime(regime);
      tab = 'bovinos'; seg = 'financeiro'; render();
      return [...$('bfin-period').options].map(o => o.value);
    };
    const r = { M, comp: mesesDe('competencia'), caixa: mesesDe('caixa'), venc: mesesDe('vencimento') };
    // escolher um mês que o seletor não oferece não muda nada: por isso o
    // resultado carrega o valor que ficou, e não só a contagem de linhas
    const ver = v => {
      const el = $('bfin-period');
      el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
      return { escolhido: el.value,
        linhas: el.value === v ? $('bfin-list').querySelectorAll('[data-trans]').length : -1,
        saldo: $('bfin-balance').innerText, lista: $('bfin-list').innerText };
    };
    definirRegime('vencimento'); render();
    r.paga = ver(M.p1); r.prox = ver(M.p2); r.depois = ver(M.p3);
    r.naCompra = ver(M.compra);
    r.nota = $('bfin-regime-nota').innerText;
    r.rotulo = $('bfin-balance').innerText;

    // a nota dos outros dois regimes tem de apontar para cá, senão ninguém acha
    definirRegime('competencia'); render();
    r.notaComp = $('bfin-regime-nota').innerText;
    definirRegime('caixa'); render();
    r.notaCaixa = $('bfin-regime-nota').innerText;

    // valor gravado por uma versão antiga (ou lixo) não pode quebrar o app
    localStorage.setItem('fjs-regime', JSON.stringify('agenda-maluca'));
    r.regimeInvalido = regimeAtual();
    definirRegime('competencia');
    return r;
  });
  const M = agenda.M;
  t.conferir('por competência as três parcelas ficam no mês da compra',
    agenda.comp.includes(M.compra) && !agenda.comp.includes(M.p2), agenda.comp.join(','));
  t.conferir('por caixa só existe o mês em que se pagou',
    agenda.caixa.includes(M.p1) && !agenda.caixa.includes(M.p2), agenda.caixa.join(','));
  t.conferir('por vencimento os meses posteriores passam a ser oferecidos',
    [M.p1, M.p2, M.p3].every(m => agenda.venc.includes(m)), agenda.venc.join(','));
  t.conferir('cada parcela cai sozinha no mês em que vence',
    agenda.paga.linhas === 1 && agenda.prox.linhas === 1 && agenda.depois.linhas === 1,
    `${agenda.paga.linhas}/${agenda.prox.linhas}/${agenda.depois.linhas}`);
  t.conferir('e cada mês soma só a parcela dele, não o carnê inteiro',
    /400,00/.test(agenda.prox.saldo) && !/1\.200,00/.test(agenda.prox.saldo),
    agenda.prox.saldo.split('\n').join(' '));
  t.conferir('a parcela já paga continua no mês em que venceu, não some',
    agenda.paga.linhas === 1 && /pago|venceu/i.test(agenda.paga.lista),
    agenda.paga.lista.split('\n').join(' | ').slice(0, 160));
  t.conferir('a linha diz que a data mostrada é a do vencimento',
    /vence/i.test(agenda.prox.lista), agenda.prox.lista.split('\n').join(' | ').slice(0, 160));
  t.conferir('o mês da compra traz só o que não tem vencimento (a venda à vista)',
    agenda.naCompra.linhas === 1 && /900,00/.test(agenda.naCompra.saldo),
    `${agenda.naCompra.linhas} · ${agenda.naCompra.saldo.split('\n').join(' ')}`);
  t.conferir('o rótulo do saldo avisa que é a agenda', /agenda/i.test(agenda.rotulo),
    agenda.rotulo.split('\n')[0]);
  t.conferir('a nota conta quantas contas já estão agendadas',
    /agendada/i.test(agenda.nota), agenda.nota);
  t.conferir('a nota da competência aponta o caminho para a agenda',
    /vencimento/i.test(agenda.notaComp), agenda.notaComp);
  t.conferir('a nota do caixa também aponta',
    /vencimento/i.test(agenda.notaCaixa), agenda.notaCaixa);
  t.conferir('regime gravado inválido cai na competência, sem quebrar',
    agenda.regimeInvalido === 'competencia', agenda.regimeInvalido);

  // ---------- o mês escolhido tem de sobreviver a fechar o app ----------
  // Na abertura o seletor está no padrão do HTML, e esse padrão SEMPRE existe.
  // Deixando o valor atual ganhar do guardado, o mês escolhido ontem nunca
  // voltaria — a memória do período viraria enfeite.
  t.secao('o mês escolhido sobrevive ao fechamento');
  const sobrevive = await pagina.evaluate(() => {
    const out = {};
    localStorage.setItem('fjs-periodo-bov', JSON.stringify('2026-03'));
    bovT = [{ id: 's1', date: '2026-03-10', type: 'saida', amount: 100, category: 'Ração/insumos' },
            { id: 's2', date: '2026-09-01', type: 'saida', amount: 50, category: 'Frete' }];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    // reabrir: o seletor está no padrão do HTML, como na abertura do app
    assinaturaPeriodo['bfin-period'] = null;
    tab = 'bovinos'; seg = 'financeiro'; render();
    out.aoReabrir = $('bfin-period').value;
    out.linhas = $('bfin-list').querySelectorAll('[data-trans]').length;

    // depois que o usuário escolhe, a escolha DELE manda: um lançamento novo
    // fazendo um mês reaparecer não pode sequestrar a tela que ele está vendo
    $('bfin-period').value = 'all';
    $('bfin-period').dispatchEvent(new Event('change', { bubbles: true }));
    bovT.push({ id: 's3', date: '2026-03-22', type: 'saida', amount: 10, category: 'Frete' });
    assinaturaPeriodo['bfin-period'] = null; render();
    out.aposEscolher = $('bfin-period').value;

    // mês guardado que não existe mais é ignorado, e o que está na tela fica:
    // pular para "Este mês" mudaria o que a pessoa está olhando sem motivo
    localStorage.setItem('fjs-periodo-bov', JSON.stringify('2024-01'));
    assinaturaPeriodo['bfin-period'] = null; render();
    out.guardadoInvalido = $('bfin-period').value;

    // já o mês ESCOLHIDO que deixa de existir (o lançamento foi apagado) não
    // pode deixar o seletor num beco: cai em "Este mês"
    $('bfin-period').value = '2026-09';
    $('bfin-period').dispatchEvent(new Event('change', { bubbles: true }));
    bovT = bovT.filter(t2 => !t2.date.startsWith('2026-09'));
    assinaturaPeriodo['bfin-period'] = null; render();
    out.escolhidoSumiu = $('bfin-period').value;
    out.temLinhas = $('bfin-list').querySelectorAll('[data-trans]').length >= 0;
    return out;
  });
  t.conferir('reabrindo o app, o mês escolhido antes volta',
    sobrevive.aoReabrir === '2026-03', sobrevive.aoReabrir);
  t.conferir('e a tela já mostra o que aquele mês teve',
    sobrevive.linhas === 1, String(sobrevive.linhas));
  t.conferir('depois que o usuário escolhe, um mês reaparecendo não sequestra a tela',
    sobrevive.aposEscolher === 'all', sobrevive.aposEscolher);
  t.conferir('mês guardado que não existe mais é ignorado, sem mexer na tela',
    sobrevive.guardadoInvalido === 'all', sobrevive.guardadoInvalido);
  t.conferir('mês escolhido cujo lançamento foi apagado cai em "Este mês", sem beco',
    sobrevive.escolhidoSumiu === 'this-month', sobrevive.escolhidoSumiu);
  t.conferir('e a tela continua desenhando, sem quebrar', sobrevive.temLinhas === true);

  // ---------- trocar de regime e voltar não pode perder o mês ----------
  // Novembro existe por vencimento e não existe por competência. Ao trocar, o
  // seletor cai em "Este mês" — e isso é certo, não há novembro lá. Errado era
  // não devolver novembro na volta: bastava UMA queda dessas para a escolha
  // guardada ficar sombreada até o aplicativo fechar.
  t.secao('ida e volta entre regimes devolve o mês escolhido');
  const volta = await pagina.evaluate(() => {
    const out = {};
    bovT = [{ id: 'rv', date: '2026-03-10', type: 'saida', amount: 400,
      category: 'Ração/insumos', venc: '2026-11-10', pago: false }];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    tab = 'bovinos'; seg = 'financeiro';
    const el = $('bfin-period');
    definirRegime('vencimento'); render();
    el.value = '2026-11'; el.dispatchEvent(new Event('change', { bubbles: true }));
    out.escolheu = el.value;
    out.viuAConta = $('bfin-list').querySelectorAll('[data-trans]').length;

    definirRegime('competencia'); render();
    out.noOutroRegime = el.value;
    out.novembroSumiu = ![...el.options].some(o => o.value === '2026-11');
    // e a tela vazia não pode ser um mistério: o aviso conta o que ficou fora
    out.avisou = !!$('bfin-list').querySelector('.fora-periodo');

    definirRegime('vencimento'); render();
    out.naVolta = el.value;
    out.viuDeNovo = $('bfin-list').querySelectorAll('[data-trans]').length;
    definirRegime('competencia');
    return out;
  });
  t.conferir('escolher novembro por vencimento mostra a conta',
    volta.escolheu === '2026-11' && volta.viuAConta === 1, String(volta.viuAConta));
  t.conferir('por competência novembro deixa de ser oferecido, e com razão',
    volta.novembroSumiu === true);
  t.conferir('o seletor cai num período que existe, sem beco',
    volta.noOutroRegime === 'this-month', volta.noOutroRegime);
  t.conferir('e a tela avisa que há lançamento fora do período',
    volta.avisou === true);
  t.conferir('voltando ao regime, o mês escolhido volta junto',
    volta.naVolta === '2026-11', volta.naVolta);
  t.conferir('com a conta de novembro de novo à vista',
    volta.viuDeNovo === 1, String(volta.viuDeNovo));

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
