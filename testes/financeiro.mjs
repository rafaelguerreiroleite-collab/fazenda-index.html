// Varredura do lançamento financeiro — à vista e a prazo.
//
// A varredura de propriedades confere as CONTAS (parcelasDe, contasAPagar,
// resumoFazenda). Esta aqui confere o CAMINHO: o que sai do formulário e fica
// gravado, e se as quatro telas que mostram esse dinheiro contam a mesma
// história — Financeiro, A pagar, Fazenda e o CSV do contador.
//
// Cada rodada preenche o formulário de verdade, com valores sorteados, e depois
// exige que tudo feche ao centavo. Um erro aqui não aparece como tela quebrada:
// aparece como um saldo que está errado e ninguém desconfia.
import { servir, abrirApp, placar } from './apoio.mjs';

const N = Number(process.env.FINANCEIRO || 400);
const SEMENTE = Number(process.env.SEMENTE || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Lançamento financeiro (${N.toLocaleString('pt-BR')} rodadas · semente ${SEMENTE})`);

  // ---------- as rodadas sorteadas ----------
  const bruto = await pagina.evaluate(async ({ N, SEMENTE }) => {
    let semente = SEMENTE;
    const sorte = () => (semente = (semente * 48271) % 2147483647) / 2147483647;
    const entre = (a, b) => a + sorte() * (b - a);
    const inteiro = (a, b) => Math.floor(entre(a, b + 1));
    const umDe = arr => arr[inteiro(0, arr.length - 1)];
    const p2 = x => String(x).padStart(2, '0');
    const dataSorteada = () => `2026-${p2(inteiro(1, 12))}-${p2(inteiro(1, 28))}`;
    const centavos = v => Math.round(v * 100);

    const falhas = [];
    const conta = {};
    const regra = (nome, passou, detalhe) => {
      conta[nome] = conta[nome] || { ok: 0, falhou: 0, exemplo: '' };
      if (passou) conta[nome].ok++;
      else { conta[nome].falhou++; if (!conta[nome].exemplo) conta[nome].exemplo = String(detalhe); }
    };

    const CATS = ['Ração/insumos', 'Medicamentos/vacinas', 'Energia elétrica', 'Frete',
      'Equipamentos', 'Venda de gado', 'Pagamento Seara', 'Impostos/Funrural', ''];

    for (let i = 0; i < N; i++) {
      // Estado limpo a cada rodada: o que se mede é ESTE lançamento.
      animals = []; weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = [];
      anexosForm = []; anexosRemover = [];

      const livro = umDe(['bov', 'av', 'ger']);
      const tipo = umDe(['entrada', 'saida']);
      const valor = Math.round(entre(1, 500000) * 100) / 100;
      const data = dataSorteada();
      const cat = umDe(CATS);
      const querPrazo = sorte() < 0.55;
      const nPedido = querPrazo ? inteiro(1, 12) : 1;
      const venc = dataSorteada();
      // Só saída a prazo gera carnê. Entrada a prazo não existe no app, e o
      // formulário tem de recusar sozinho — não pode depender de o usuário
      // não tentar.
      const prazoVale = tipo === 'saida' && querPrazo;
      const nEsperado = prazoVale ? nPedido : 1;

      openTrans(livro);
      document.querySelector(`input[name="t-type"][value="${tipo}"]`).checked = true;
      document.querySelector(`input[name="t-type"][value="${tipo}"]`)
        .dispatchEvent(new Event('change', { bubbles: true }));
      $('t-date').value = data;
      $('t-amount').value = String(valor).replace('.', ',');
      $('t-category').value = cat;
      $('t-prazo').checked = querPrazo;
      $('t-prazo').dispatchEvent(new Event('change', { bubbles: true }));
      $('t-venc').value = venc;
      $('t-parcelas').value = String(nPedido);
      previewParcelas();
      const previa = $('t-parcelas-nota').textContent;
      $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

      const linhas = arrLivro(livro);
      const outros = ['bov', 'av', 'ger'].filter(b => b !== livro)
        .reduce((s2, b) => s2 + arrLivro(b).length, 0);
      const ctx = `${tipo} ${valor} em ${nPedido}× · livro ${livro} · ${data}`;

      regra('o lançamento sai com o número de parcelas pedido',
        linhas.length === nEsperado, `${ctx}: saíram ${linhas.length}, esperado ${nEsperado}`);
      regra('o lançamento não vaza para outro livro', outros === 0, ctx);
      if (linhas.length !== nEsperado) continue;

      // ---- soma exata, em centavos: float não pode comer nem sobrar um centavo
      const somaCent = linhas.reduce((s2, x) => s2 + centavos(x.amount), 0);
      regra('as parcelas somam exatamente o valor digitado',
        somaCent === centavos(valor), `${ctx}: ${somaCent} vs ${centavos(valor)} centavos`);
      regra('nenhuma parcela sai zerada ou negativa',
        linhas.every(x => x.amount > 0), ctx);
      regra('nenhum valor gravado sai NaN',
        linhas.every(x => Number.isFinite(x.amount)), ctx);
      regra('cada parcela é um número exato de centavos',
        linhas.every(x => x.amount === Math.round(x.amount * 100) / 100), ctx);
      regra('as parcelas diferem no máximo um centavo entre si',
        Math.max(...linhas.map(x => centavos(x.amount))) - Math.min(...linhas.map(x => centavos(x.amount))) <= 1, ctx);

      // ---- a despesa inteira fica no dia da compra
      regra('toda parcela carrega a data do lançamento',
        linhas.every(x => x.date === data), ctx);
      regra('o tipo gravado é o que foi escolhido',
        linhas.every(x => x.type === tipo), ctx);
      regra('a categoria gravada é a que foi digitada',
        linhas.every(x => (x.category || '') === cat), ctx);

      // ---- vencimentos
      if (prazoVale) {
        regra('a prazo: toda parcela tem vencimento',
          linhas.every(x => !!x.venc), ctx);
        regra('a prazo: o primeiro vencimento é o escolhido',
          linhas.some(x => x.venc === venc), `${ctx}: venc ${venc}`);
        regra('a prazo: nenhuma parcela nasce paga',
          linhas.every(x => !x.pago), ctx);
        // Uma parcela só é uma conta com vencimento, não um carnê: não recebe
        // numeração, e a lista não escreve "1/1" em cima dela.
        if (nEsperado === 1) {
          regra('a prazo em 1× é conta com vencimento, não carnê',
            !linhas[0].grupo && !(linhas[0].parcelas > 1), ctx);
          regra('a prazo em 1× não ganha rótulo de parcela',
            rotuloParcela(linhas[0]) === '', `${ctx}: "${rotuloParcela(linhas[0])}"`);
        }
        if (nEsperado > 1) {
          const ordenadas = linhas.slice().sort((a, b) => a.parcela - b.parcela);
          regra('a prazo: as parcelas são numeradas de 1 até N sem buraco',
            ordenadas.every((x, k) => x.parcela === k + 1 && x.parcelas === nEsperado), ctx);
          regra('a prazo: cada vencimento é depois do anterior',
            ordenadas.every((x, k) => k === 0 || x.venc > ordenadas[k - 1].venc), ctx);
          regra('a prazo: as parcelas de uma compra ficam no mesmo carnê',
            new Set(linhas.map(x => x.grupo)).size === 1 && linhas.every(x => !!x.grupo), ctx);
          regra('a prazo: a prévia mostrada anuncia o número certo de parcelas',
            previa.startsWith(nEsperado + '×'), `${ctx}: prévia "${previa}"`);
        }
      } else {
        regra('à vista: nada de vencimento', linhas.every(x => !x.venc), ctx);
        regra('à vista: não entra em A pagar', contasAPagar(linhas).length === 0, ctx);
        regra('à vista: não vira carnê', linhas.every(x => !x.grupo), ctx);
      }
      regra('entrada de dinheiro nunca vira a prazo',
        tipo === 'saida' || linhas.every(x => !x.venc), ctx);

      // ---- as telas têm de contar a mesma história
      const emAberto = contasAPagar(linhas);
      regra('A pagar soma o que está em aberto neste livro',
        Math.abs(emAberto.reduce((s2, x) => s2 + x.amount, 0)
          - linhas.filter(x => x.venc && !x.pago && x.type === 'saida').reduce((s2, x) => s2 + x.amount, 0)) < 1e-9, ctx);

      const R = resumoFazenda('all');
      const receitaEsperada = tipo === 'entrada' ? valor : 0;
      const custoEsperado = tipo === 'saida' ? valor : 0;
      regra('a Fazenda soma a receita deste lançamento',
        Math.abs(centavos(R.receitas) - centavos(receitaEsperada)) <= 1, `${ctx}: ${R.receitas}`);
      regra('a Fazenda soma o custo deste lançamento',
        Math.abs(centavos(R.custos) - centavos(custoEsperado)) <= 1, `${ctx}: ${R.custos}`);
      regra('a Fazenda conta todas as parcelas como lançamentos',
        R.n === nEsperado, `${ctx}: ${R.n}`);
      regra('a Fazenda joga o valor na atividade certa',
        Math.abs(R.atividades.find(a => a.nome === NOME_LIVRO[livro]).saldo
          - (tipo === 'entrada' ? valor : -valor)) < 0.011, ctx);
      regra('as outras duas atividades ficam zeradas',
        R.atividades.filter(a => a.nome !== NOME_LIVRO[livro]).every(a => a.saldo === 0), ctx);
      regra('as categorias da Fazenda somam o movimento',
        Math.abs(R.categorias.reduce((s2, [, v]) => s2 + v, 0) - R.movimento) < 0.011, ctx);
      regra('a Fazenda não produz nenhum NaN',
        [R.receitas, R.custos, R.saldo, R.movimento, R.aPagarTotal].every(Number.isFinite), ctx);

      // ---- a tela desenhada tem de bater com a conta
      if (livro !== 'ger') {
        tab = livro === 'av' ? 'aviarios' : 'bovinos';
        if (livro === 'bov') seg = 'financeiro';
        $(livro === 'av' ? 'av-period' : 'bfin-period').value = 'all';
        render();
        const lista = $(livro === 'av' ? 'av-list' : 'bfin-list');
        regra('o Financeiro desenha uma linha por parcela',
          lista.querySelectorAll('[data-trans]').length === nEsperado,
          `${ctx}: ${lista.querySelectorAll('[data-trans]').length}`);
        const saldoTxt = $(livro === 'av' ? 'av-balance' : 'bfin-balance').innerText;
        regra('o saldo desenhado nunca sai NaN', !/NaN|Infinity/.test(saldoTxt), `${ctx}: ${saldoTxt}`);
      }
      tab = 'fazenda'; $('fz-period').value = 'all'; render();
      regra('a Fazenda desenha uma linha por parcela',
        $('fz-lista').querySelectorAll('[data-trans]').length === nEsperado, ctx);
      regra('nenhuma tela da Fazenda escreve NaN',
        !/NaN|Infinity/.test($('view-fazenda').innerText), ctx);

      // ---- pagar uma parcela não pode mexer no total do período
      if (prazoVale && linhas.length) {
        const antesCusto = resumoFazenda('all').custos;
        const alvo = linhas[0];
        alvo.pago = true; alvo.pagoEm = data;
        const depois = resumoFazenda('all');
        regra('marcar uma parcela como paga não muda o custo do período',
          Math.abs(centavos(depois.custos) - centavos(antesCusto)) === 0, ctx);
        regra('marcar como paga tira a parcela de A pagar',
          !contasAPagar(arrLivro(livro)).some(x => x.id === alvo.id), ctx);
        regra('e o A pagar cai exatamente o valor daquela parcela',
          Math.abs(centavos(depois.aPagarTotal + alvo.amount)
            - centavos(linhas.reduce((s2, x) => s2 + (x.type === 'saida' && x.venc ? x.amount : 0), 0))) <= 1, ctx);
      }

      // ---- o CSV do contador tem de somar igual à tela
      if (sorte() < 0.15) {
        const baixados = [];
        const orig = window.download;
        window.download = (nome, corpo) => baixados.push(corpo);
        exportFin(livro);
        window.download = orig;
        const corpo = baixados[0] || '';
        const linhasCsv = corpo.split('\n').slice(1).filter(Boolean);
        regra('o CSV traz uma linha por parcela',
          linhasCsv.length === nEsperado, `${ctx}: ${linhasCsv.length}`);
        const somaCsv = linhasCsv.reduce((s2, l) => {
          const col = l.split(';')[2] || '0';
          return s2 + Math.round(parseFloat(col.replace(/\./g, '').replace(',', '.')) * 100);
        }, 0);
        regra('o CSV soma o mesmo que a tela',
          somaCsv === centavos(valor), `${ctx}: CSV ${somaCsv} vs ${centavos(valor)}`);
      }
    }
    return { conta, falhas };
  }, { N, SEMENTE });

  const nomes = Object.keys(bruto.conta);
  t.secao(`${nomes.length} regras conferidas em ${N.toLocaleString('pt-BR')} rodadas`);
  for (const nome of nomes) {
    const r = bruto.conta[nome];
    t.conferir(nome, r.falhou === 0, r.falhou ? `${r.falhou} falha(s) — ex.: ${r.exemplo}` : '');
  }

  // ---------- casos fixos: o que o sorteio não alcança ----------
  t.secao('editar um lançamento');
  const editar = await pagina.evaluate(() => {
    bovT = []; avT = []; gerT = []; anexosForm = []; anexosRemover = [];
    // Lança à vista
    openTrans('bov');
    $('t-date').value = '2026-05-10'; $('t-amount').value = '900';
    $('t-category').value = 'Ração/insumos';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const r = { criou: bovT.length };

    // Agora edita esse lançamento pedindo 3 parcelas. A prévia promete "3×";
    // o que ficar gravado tem de cumprir a promessa.
    openTrans('bov', bovT[0]);
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change', { bubbles: true }));
    $('t-venc').value = '2026-06-10';
    $('t-parcelas').value = '3';
    previewParcelas();
    r.previaPrometeu = $('t-parcelas-nota').textContent;
    r.campoLiberado = $('t-parcelas').disabled === false;
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    r.linhasDepois = bovT.length;
    r.somaDepois = bovT.reduce((s, x) => s + x.amount, 0);
    r.emAberto = contasAPagar(bovT).length;
    return r;
  });
  t.conferir('lançar à vista cria um lançamento', editar.criou === 1, String(editar.criou));
  t.conferir('editando, o campo de parcelas fica disponível', editar.campoLiberado === true);
  t.conferir('e a prévia promete 3 parcelas', editar.previaPrometeu.startsWith('3×'), editar.previaPrometeu);
  t.conferir('editar pedindo 3 parcelas GERA as 3 parcelas',
    editar.linhasDepois === 3, `ficaram ${editar.linhasDepois}`);
  t.conferir('e as 3 parcelas somam o valor original',
    Math.abs(editar.somaDepois - 900) < 1e-9, String(editar.somaDepois));
  t.conferir('e as 3 entram em A pagar', editar.emAberto === 3, String(editar.emAberto));

  t.secao('lançamento gerado por estoque ou venda não se reparcela por aqui');
  const travado = await pagina.evaluate(() => {
    // Um lançamento com "lock": ele é o reflexo de uma compra de estoque.
    // Parcelar por aqui deixaria a compra apontando para uma parcela só.
    bovT = [{ id: 'lk', date: '2026-05-10', type: 'saida', amount: 600,
      category: 'Ração/insumos', lock: 'stock' }];
    moves = [{ id: 'mk', itemId: 'ik', type: 'entrada', date: '2026-05-10', qty: 10, unitCost: 60, linkTrans: 'lk' }];
    items = [{ id: 'ik', name: 'Sal', unit: 'kg' }];
    anexosForm = []; anexosRemover = [];
    openTrans('bov', bovT[0]);
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change', { bubbles: true }));
    $('t-venc').value = '2026-06-10'; $('t-parcelas').value = '3';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return {
      linhas: bovT.length,
      avisou: $('toast').textContent,
      vinculoIntacto: moves[0].linkTrans === 'lk' && bovT.some(x => x.id === 'lk')
    };
  });
  t.conferir('não parcela em silêncio um lançamento gerado pelo estoque',
    travado.linhas === 1, `ficaram ${travado.linhas}`);
  t.conferir('e diz onde parcelar', /movimenta/i.test(travado.avisou), travado.avisou);
  t.conferir('o vínculo com a compra fica intacto', travado.vinculoIntacto === true);

  t.secao('reparcelar mantém a nota fiscal anexada');
  const comNota = await pagina.evaluate(() => {
    bovT = [{ id: 'nf', date: '2026-05-10', type: 'saida', amount: 300, category: 'Equipamentos',
      anexos: [{ id: 'ax-nf', nome: 'nota.pdf', tipo: 'application/pdf', tamanho: 500 }] }];
    moves = []; items = [];
    anexosForm = []; anexosRemover = [];
    openTrans('bov', bovT[0]);
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change', { bubbles: true }));
    $('t-venc').value = '2026-06-10'; $('t-parcelas').value = '3';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const primeira = bovT.find(x => x.id === 'nf');
    return {
      linhas: bovT.length,
      guardouId: !!primeira,
      ehAPrimeira: primeira && primeira.parcela === 1,
      temNota: primeira && (primeira.anexos || []).length === 1,
      // a nota é da compra inteira: não pode ser copiada em cada parcela
      semDuplicar: bovT.filter(x => (x.anexos || []).length).length === 1,
      soma: bovT.reduce((s, x) => s + x.amount, 0)
    };
  });
  t.conferir('reparcelar cria as 3 parcelas', comNota.linhas === 3, String(comNota.linhas));
  t.conferir('o lançamento guarda a identidade na parcela 1', comNota.guardouId === true);
  t.conferir('e ela é mesmo a parcela 1', comNota.ehAPrimeira === true);
  t.conferir('a nota fiscal continua anexada', comNota.temNota === true);
  t.conferir('e não é copiada em cada parcela', comNota.semDuplicar === true);
  t.conferir('as parcelas somam o valor original', Math.abs(comNota.soma - 300) < 1e-9, String(comNota.soma));

  t.secao('editar uma parcela do carnê');
  const parcela = await pagina.evaluate(() => {
    bovT = []; anexosForm = []; anexosRemover = [];
    openTrans('bov');
    $('t-date').value = '2026-05-10'; $('t-amount').value = '1200';
    $('t-category').value = 'Ração/insumos';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change', { bubbles: true }));
    $('t-venc').value = '2026-06-10'; $('t-parcelas').value = '3';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const r = { criou: bovT.length, soma: bovT.reduce((s, x) => s + x.amount, 0) };

    const alvo = bovT.find(x => x.parcela === 2);
    openTrans('bov', alvo);
    r.travouOCampo = $('t-parcelas').disabled === true;
    $('t-amount').value = '500';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    r.aindaTres = bovT.length;
    r.valorDaSegunda = bovT.find(x => x.parcela === 2).amount;
    r.outrasIntactas = bovT.filter(x => x.parcela !== 2).every(x => Math.abs(x.amount - 400) < 1e-9);
    r.carneInteiro = new Set(bovT.map(x => x.grupo)).size === 1;
    return r;
  });
  t.conferir('a compra a prazo cria as 3 parcelas', parcela.criou === 3, String(parcela.criou));
  t.conferir('e elas somam o total da compra', Math.abs(parcela.soma - 1200) < 1e-9, String(parcela.soma));
  t.conferir('abrindo uma parcela, o campo de parcelas fica travado', parcela.travouOCampo === true);
  t.conferir('editar a parcela 2 não reparcela o carnê', parcela.aindaTres === 3, String(parcela.aindaTres));
  t.conferir('o novo valor fica na parcela editada', parcela.valorDaSegunda === 500, String(parcela.valorDaSegunda));
  t.conferir('e as outras parcelas ficam intactas', parcela.outrasIntactas === true);
  t.conferir('o carnê continua sendo um só', parcela.carneInteiro === true);

  t.secao('compra de estoque a prazo');
  const estoque = await pagina.evaluate(() => {
    bovT = []; moves = []; items = [{ id: 'ie', name: 'Proteinado', unit: 'kg' }];
    tab = 'bovinos'; seg = 'estoque'; detailItem = 'ie'; render();
    openMove('ie', 'entrada');
    $('m-date').value = '2026-05-10'; $('m-qty').value = '250'; $('m-cost').value = '4,37';
    $('m-postfin').checked = true;
    $('m-prazo').checked = true; $('m-prazo').dispatchEvent(new Event('change', { bubbles: true }));
    $('m-venc').value = '2026-06-10'; $('m-parcelas').value = '4';
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const total = 250 * 4.37;
    return {
      parcelas: bovT.length,
      soma: bovT.reduce((s, x) => s + x.amount, 0),
      totalReal: total,
      todasComVenc: bovT.every(x => !!x.venc),
      todasNaData: bovT.every(x => x.date === '2026-05-10'),
      custoMedio: avgCostOf('ie'),
      saldoEstoque: qtyOf('ie'),
      aPagar: contasAPagar(bovT).reduce((s, x) => s + x.amount, 0),
      vinculo: !!moves[0].linkGrupo,
      naFazenda: resumoFazenda('all').custos
    };
  });
  t.conferir('a compra de estoque a prazo cria as 4 parcelas', estoque.parcelas === 4, String(estoque.parcelas));
  t.conferir('as parcelas somam o total da compra (quantidade × preço)',
    Math.round(estoque.soma * 100) === Math.round(estoque.totalReal * 100),
    `${estoque.soma} vs ${estoque.totalReal}`);
  t.conferir('toda parcela tem vencimento', estoque.todasComVenc === true);
  t.conferir('e todas ficam no dia da compra', estoque.todasNaData === true);
  t.conferir('o custo médio do item é o preço pago', Math.abs(estoque.custoMedio - 4.37) < 1e-9, String(estoque.custoMedio));
  t.conferir('o saldo do estoque é a quantidade comprada', estoque.saldoEstoque === 250, String(estoque.saldoEstoque));
  t.conferir('o A pagar cobra a compra inteira, nem mais nem menos',
    Math.round(estoque.aPagar * 100) === Math.round(estoque.totalReal * 100), String(estoque.aPagar));
  t.conferir('a movimentação guarda o carnê', estoque.vinculo === true);
  t.conferir('e a Fazenda enxerga o custo uma vez só',
    Math.round(estoque.naFazenda * 100) === Math.round(estoque.totalReal * 100), String(estoque.naFazenda));

  t.secao('venda de animal lançada no financeiro');
  const venda = await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; moves = []; items = [];
    tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
    openAnimal();
    $('an-ident').value = '777';
    $('an-sold').checked = true; $('an-sold').dispatchEvent(new Event('change', { bubbles: true }));
    $('an-sold-date').value = '2026-05-20';
    $('an-sold-price').value = '7.850,55';
    $('form-animal').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return {
      lancou: bovT.length,
      valor: bovT[0] && bovT[0].amount,
      tipo: bovT[0] && bovT[0].type,
      semVenc: bovT[0] && !bovT[0].venc,
      receita: resumoFazenda('all').receitas,
      foraDoRebanho: animals.filter(noRebanho).length
    };
  });
  t.conferir('vender um animal lança a receita', venda.lancou === 1, String(venda.lancou));
  t.conferir('com o valor digitado em português (7.850,55)', venda.valor === 7850.55, String(venda.valor));
  t.conferir('como entrada de dinheiro', venda.tipo === 'entrada', String(venda.tipo));
  t.conferir('e à vista — venda não nasce a prazo', venda.semVenc === true);
  t.conferir('a Fazenda soma essa receita', Math.abs(venda.receita - 7850.55) < 1e-9, String(venda.receita));
  t.conferir('e o animal sai do rebanho', venda.foraDoRebanho === 0, String(venda.foraDoRebanho));

  t.secao('aviso de duplicidade');
  const perguntas = [];
  const anotar = async d => { perguntas.push(d.message()); await d.accept(); };
  pagina.on('dialog', anotar);
  const dupl = await pagina.evaluate(async () => {
    const lancar = (valor, n, venc) => {
      openTrans('bov');
      $('t-date').value = '2026-05-10';
      $('t-amount').value = valor;
      $('t-category').value = 'Ração/insumos';
      $('t-prazo').checked = n > 1; $('t-prazo').dispatchEvent(new Event('change', { bubbles: true }));
      if (n > 1) { $('t-venc').value = venc; $('t-parcelas').value = String(n); }
      $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    };
    bovT = []; moves = []; items = []; anexosForm = []; anexosRemover = [];
    // À vista duas vezes: já avisava antes
    lancar('900', 1);
    lancar('900', 1);
    const r = { aVista: bovT.length };

    // Parcelada duas vezes: é aqui que o carnê duplicado entrava calado
    bovT = [];
    lancar('900', 3, '2026-06-10');
    const antes = bovT.length;
    lancar('900', 3, '2026-06-10');
    r.parcelada = { antes, depois: bovT.length };

    // Compra diferente no mesmo dia NÃO pode ser confundida com duplicata
    bovT = [];
    lancar('900', 3, '2026-06-10');
    lancar('1500', 3, '2026-06-10');
    r.diferente = bovT.length;
    return r;
  });
  pagina.removeListener('dialog', anotar);
  t.conferir('lançar o mesmo valor à vista duas vezes pergunta antes',
    perguntas.some(m => /DUPLICIDADE/i.test(m)), perguntas.join(' | ').slice(0, 90));
  t.conferir('e, confirmado, os dois entram', dupl.aVista === 2, String(dupl.aVista));
  t.conferir('lançar a MESMA compra parcelada duas vezes também pergunta',
    perguntas.filter(m => /compra parcelada/i.test(m)).length === 1,
    perguntas.filter(m => /parcelada/i.test(m)).join(' | ').slice(0, 120));
  t.conferir('e, confirmado, os dois carnês entram inteiros',
    dupl.parcelada.antes === 3 && dupl.parcelada.depois === 6,
    `${dupl.parcelada.antes} → ${dupl.parcelada.depois}`);
  t.conferir('compra de valor diferente no mesmo dia não é acusada de duplicata',
    dupl.diferente === 6 && perguntas.filter(m => /parcelada/i.test(m)).length === 1,
    String(dupl.diferente));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
