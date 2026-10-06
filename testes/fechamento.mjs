// FECHAMENTO: tudo o que entrou está lá, uma vez só, com o valor certo.
//
// Pedido do dono: "confirmar todos lançamentos, não pode ocorrer bugs nem
// erros ou faltas de lançamentos".
//
// As outras baterias conferem cada peça: se o lançamento é gravado, se o carnê
// não duplica, se a soma da tela fecha, se nada se perde sem sinal. Esta faz a
// pergunta que nenhuma delas faz sozinha — a de quem usa o aplicativo por uma
// tarde inteira:
//
//   depois de DEZENAS de lançamentos de todo tipo, misturados, com correções,
//   baixas e exclusões no meio, o que está salvo é exatamente o que foi feito?
//
// O jeito de responder isso sem acreditar no próprio aplicativo é escriturar
// por fora. Esta bateria mantém o seu próprio livro-caixa, em CENTAVOS
// INTEIROS, calculado aqui dentro, sem chamar uma única função do app — nem
// para somar, nem para contar dias, nem para repartir parcela. No fim, os dois
// livros são postos lado a lado:
//
//   · cada lançamento feito existe, UMA vez (nada faltando, nada duplicado);
//   · o valor de cada um é o que foi digitado;
//   · a soma por atividade, por sentido e por regime fecha no centavo;
//   · as contas a pagar e a receber são as que ficaram abertas;
//   · o número que a TELA mostra é o mesmo que o livro de fora diz;
//   · e tudo isso continua verdade depois de fechar e reabrir o aplicativo.
//
// A ordem das operações é sorteada, mas com semente fixa: quando quebrar, o
// caso quebra igual na próxima vez e dá para ir atrás. A semente sai no
// cabeçalho; para repetir um caso, SEMENTE=12345 node testes/rodar.mjs.
import { servir, abrirApp, placar } from './apoio.mjs';

const SEMENTE = Number(process.env.SEMENTE || 20261006);
const QUANTOS = Number(process.env.FECHAMENTO || 44);

// Sorteio reprodutível (mulberry32). Não é criptografia, é repetibilidade.
function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Contas de data e de dinheiro feitas AQUI. Conferir o aplicativo com as
// funções do próprio aplicativo não confere nada.
const iso = d => d.toISOString().slice(0, 10);
const maisDias = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1, d + n)));
};
const maisMeses = (s, k) => {
  const [y, m, d] = s.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1 + k, Math.min(d, ultimo))));
};
// Reparte centavos inteiros: o que sobra da divisão vai para as primeiras
// parcelas, uma de cada vez. Soma SEMPRE o total — é a única coisa que esta
// bateria exige da repartição, e é a que importa para o dono.
const repartir = (cent, n) => {
  const base = Math.floor(cent / n), resto = cent - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
};
const centavos = v => Math.round(v * 100);
const emReais = c => (c / 100).toFixed(2);
// "1.234,56" → centavos. O leitor do aplicativo não entra aqui.
const lerTela = txt => {
  const m = String(txt || '').replace(/[^\d,.-]/g, '');
  const neg = /-|−/.test(String(txt));
  const n = Math.round(parseFloat(m.replace(/\./g, '').replace(',', '.')) * 100);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : NaN;
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 900 });
  pagina.on('dialog', d => d.accept().catch(() => {}));
  const t = placar(`Fechamento do livro — semente ${SEMENTE}, ${QUANTOS} operações`);
  const r = sorteador(SEMENTE);
  const ent = (a, b) => a + Math.floor(r() * (b - a + 1));
  const um = lista => lista[ent(0, lista.length - 1)];

  await pagina.evaluate(() => {
    bovT = []; avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    atividades = []; extraT = {}; pendentes = []; recomputarLivros();
    LS.s('fjs-ics-auto', false); LS.s('fjs-ics-visto', true);
    definirRegime('competencia');
    ['bfin-period', 'av-period', 'fz-period'].forEach(id => { if ($(id)) { $(id).value = 'all'; guardarPeriodo(id); } });
    items = [{ id: 'i1', name: 'Proteinado', unit: 'kg' }];
    tab = 'bovinos'; seg = 'financeiro'; render(); salvarEspelho(true);
  });

  // ===== O LIVRO DE FORA =====
  // Uma entrada por lançamento esperado: a etiqueta liga ao que foi digitado.
  // cent = valor em centavos; venc = null quando é à vista; pago = já liquidado.
  const livro = [];     // { tag, livro, tipo, cent, data, venc, pago }
  const doTag = tag => livro.filter(x => x.tag === tag);
  const LIVROS_T = ['bov', 'av', 'ger'];
  const COL = { bov: 'bovT', av: 'avT', ger: 'gerT' };
  const CATS = ['Ração/insumos', 'Mão de obra', 'Frete', 'Combustível', 'Manutenção', 'Outros'];
  const dataQualquer = () => `2026-${String(ent(1, 9)).padStart(2, '0')}-${String(ent(1, 28)).padStart(2, '0')}`;

  let n = 0;
  const proximaTag = () => 'op' + String(++n).padStart(3, '0');
  // Pesagem e cadastro de animal não são dinheiro, mas são lançamento igual:
  // o dono digita, espera encontrar depois, e uma pesagem que falta estraga o
  // GMD e a decisão de venda. Entram no livro de fora pelo que dá para contar
  // por fora — quantos animais, quantas pesagens, e quantos quilos somados.
  const rebanho = { animais: [], pesagens: [] };

  // ---- as portas, cada uma dirigida pelo formulário de verdade ----
  const lancar = async ({ tag, book, tipo, cent, data, venc, parcelas, ritmo, datas }) => {
    await pagina.evaluate(d => {
      openTrans(d.book, null);
      document.querySelector(`input[name="t-type"][value="${d.tipo}"]`).checked = true;
      $('t-date').value = d.data;
      $('t-amount').value = d.valor;
      $('t-category').value = d.cat;
      $('t-notes').value = d.tag;
      $('t-prazo').checked = !!d.venc;
      $('t-prazo').dispatchEvent(new Event('change'));
      if (d.venc) {
        $('t-venc').value = d.venc;
        $('t-parcelas').value = String(d.parcelas || 1);
        $('t-parcelas').dispatchEvent(new Event('input'));
        if (d.ritmo) { $('t-ritmo').value = d.ritmo; $('t-ritmo').dispatchEvent(new Event('change')); }
        if (d.datas) {
          $('t-datas').querySelectorAll('.pd-data').forEach(el => {
            const i = Number(el.dataset.parcela);
            if (d.datas[i]) el.value = d.datas[i];
          });
        }
      }
    }, { book, tipo, data, valor: emReais(cent).replace('.', ','), cat: um(CATS), tag, venc, parcelas, ritmo, datas });
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(110);
    await pagina.evaluate(() => closeAllM());
  };

  // ===== a tarde de trabalho =====
  t.secao(`${QUANTOS} operações misturadas, na ordem sorteada`);
  const feitas = { vista: 0, prazo: 0, carne: 0, receber: 0, baixa: 0, editar: 0,
    excluir: 0, compra: 0, animal: 0, pesagem: 0 };
  for (let k = 0; k < QUANTOS; k++) {
    const vivos = () => livro.filter(x => !x.lock);
    const escolha = um(['vista', 'vista', 'prazo', 'carne', 'receber', 'compra',
      'baixa', 'editar', 'excluir', 'animal', 'pesagem', 'pesagem']);

    if (escolha === 'vista') {
      const tag = proximaTag(), book = um(LIVROS_T), cent = ent(1500, 900000);
      const tipo = r() < 0.3 ? 'entrada' : 'saida', data = dataQualquer();
      await lancar({ tag, book, tipo, cent, data });
      livro.push({ tag, livro: book, tipo, cent, data, venc: null, pago: false });
      feitas.vista++;
    } else if (escolha === 'prazo') {
      const tag = proximaTag(), book = um(LIVROS_T), cent = ent(5000, 1500000);
      const data = dataQualquer(), venc = maisDias(data, ent(5, 120));
      await lancar({ tag, book, tipo: 'saida', cent, data, venc, parcelas: 1 });
      livro.push({ tag, livro: book, tipo: 'saida', cent, data, venc, pago: false });
      feitas.prazo++;
    } else if (escolha === 'receber') {
      const tag = proximaTag(), book = um(LIVROS_T), cent = ent(100000, 9000000);
      const data = dataQualquer(), venc = maisDias(data, ent(10, 150));
      await lancar({ tag, book, tipo: 'entrada', cent, data, venc, parcelas: 1 });
      livro.push({ tag, livro: book, tipo: 'entrada', cent, data, venc, pago: false });
      feitas.receber++;
    } else if (escolha === 'carne') {
      const tag = proximaTag(), book = um(LIVROS_T), cent = ent(30000, 3000000);
      const parcelas = ent(2, 5), data = dataQualquer(), venc = maisDias(data, ent(5, 60));
      const ritmo = um(['mes', '30', 'livre']);
      // No modo livre as datas são sorteadas em ordem crescente: é o que o
      // formulário aceita, e é o que um acerto de verdade parece.
      let datas = null, vencs;
      if (ritmo === 'livre') {
        datas = {}; vencs = [venc];
        let atual = venc;
        for (let i = 1; i < parcelas; i++) { atual = maisDias(atual, ent(7, 90)); datas[i] = atual; vencs.push(atual); }
      } else {
        vencs = Array.from({ length: parcelas }, (_, i) =>
          i === 0 ? venc : ritmo === '30' ? maisDias(venc, 30 * i) : maisMeses(venc, i));
      }
      await lancar({ tag, book, tipo: 'saida', cent, data, venc, parcelas, ritmo, datas });
      repartir(cent, parcelas).forEach((c, i) => {
        livro.push({ tag, livro: book, tipo: 'saida', cent: c, data, venc: vencs[i], pago: false, parcela: i + 1 });
      });
      feitas.carne++;
    } else if (escolha === 'compra') {
      // Compra de estoque: um lançamento no financeiro de Bovinos nasce dela.
      // É o tipo de reflexo onde um lançamento some ou nasce dobrado sem que
      // ninguém olhe — então ele entra no livro de fora como qualquer outro.
      const tag = proximaTag(), qtd = ent(50, 2000), unit = ent(150, 900);
      const data = dataQualquer();
      const aPrazo = r() < 0.5, parcelas = aPrazo ? ent(1, 4) : 1;
      const venc = aPrazo ? maisDias(data, ent(10, 60)) : null;
      const cent = qtd * unit;   // centavos: qtd × preço unitário em centavos
      await pagina.evaluate(d => {
        openMove('i1', 'entrada', null);
        $('m-date').value = d.data;
        $('m-qty').value = String(d.qtd);
        $('m-cost').value = d.unit;
        $('m-notes').value = d.tag;
        $('m-postfin').checked = true;
        $('m-prazo').checked = !!d.venc;
        $('m-prazo').dispatchEvent(new Event('change'));
        if (d.venc) {
          $('m-venc').value = d.venc;
          $('m-parcelas').value = String(d.parcelas);
          $('m-parcelas').dispatchEvent(new Event('input'));
          $('m-ritmo').value = 'mes'; $('m-ritmo').dispatchEvent(new Event('change'));
        }
      }, { data, qtd, unit: emReais(unit).replace('.', ','), tag, venc, parcelas });
      await pagina.click('#form-move button[type="submit"]');
      await pagina.waitForTimeout(130);
      await pagina.evaluate(() => closeAllM());
      if (parcelas > 1) {
        repartir(cent, parcelas).forEach((c, i) => {
          livro.push({ tag, livro: 'bov', tipo: 'saida', cent: c, data,
            venc: i === 0 ? venc : maisMeses(venc, i), pago: false, lock: true });
        });
      } else {
        livro.push({ tag, livro: 'bov', tipo: 'saida', cent, data, venc, pago: false, lock: true });
      }
      feitas.compra++;
    } else if (escolha === 'animal') {
      const brinco = 'B' + String(++n).padStart(3, '0');
      const peso = ent(180, 420);
      const data = dataQualquer();
      await pagina.evaluate(d => {
        openAnimal(null);
        $('an-ident').value = d.brinco;
        $('an-cat').value = 'Novilho';
        $('an-entry-date').value = d.data;
        $('an-entry-weight').value = String(d.peso);
      }, { brinco, data, peso });
      await pagina.click('#form-animal button[type="submit"]');
      await pagina.waitForTimeout(110);
      await pagina.evaluate(() => closeAllM());
      rebanho.animais.push(brinco);
      // O cadastro com peso de entrada cria a pesagem de entrada junto.
      rebanho.pesagens.push({ brinco, data, peso });
      feitas.animal++;
    } else if (escolha === 'pesagem') {
      if (!rebanho.animais.length) { k--; continue; }
      const brinco = um(rebanho.animais);
      // Data que o animal ainda não tem, senão o aplicativo avisa de pesagem
      // repetida — e aí quem está sendo conferido é outro assunto.
      const usadas = rebanho.pesagens.filter(p => p.brinco === brinco).map(p => p.data);
      let data = dataQualquer(), tentativas = 0;
      while (usadas.includes(data) && tentativas++ < 40) data = dataQualquer();
      if (usadas.includes(data)) { k--; continue; }
      const peso = ent(200, 560);
      await pagina.evaluate(d => {
        const a = animals.find(x => x.ident === d.brinco);
        openWeighing(a.id, null);
        $('w-date').value = d.data;
        $('w-weight').value = String(d.peso);
      }, { brinco, data, peso });
      await pagina.click('#form-weighing button[type="submit"]');
      await pagina.waitForTimeout(110);
      await pagina.evaluate(() => closeAllM());
      rebanho.pesagens.push({ brinco, data, peso });
      feitas.pesagem++;
    } else if (escolha === 'baixa') {
      // Dar baixa pelo botão Pagar, que é o caminho mais usado.
      const abertas = livro.filter(x => x.venc && !x.pago && x.tipo === 'saida');
      if (!abertas.length) { k--; continue; }
      const alvo = um(abertas);
      const ok = await pagina.evaluate(d => {
        tab = d.livro === 'av' ? 'aviarios' : d.livro === 'ger' ? 'fazenda' : 'bovinos';
        seg = 'financeiro'; render();
        const lista = arrLivro(d.livro);
        const alvo = lista.find(x => (x.notes || '').indexOf(d.tag) >= 0
          && x.venc === d.venc && Math.round(x.amount * 100) === d.cent && !x.pago);
        if (!alvo) return false;
        const b = document.querySelector(`[data-pagar="${alvo.id}"]`);
        if (!b) return false;
        b.click();
        return true;
      }, { livro: alvo.livro, tag: alvo.tag, venc: alvo.venc, cent: alvo.cent });
      await pagina.waitForTimeout(110);
      if (ok) { alvo.pago = true; alvo.pagoEm = 'hoje'; feitas.baixa++; } else k--;
    } else if (escolha === 'editar') {
      // Corrigir o valor de um lançamento simples (não parcela, não reflexo).
      const simples = livro.filter(x => !x.lock && !x.parcela);
      if (!simples.length) { k--; continue; }
      const alvo = um(simples);
      const novo = ent(2000, 700000);
      const ok = await pagina.evaluate(d => {
        const lista = arrLivro(d.livro);
        const alvo = lista.find(x => (x.notes || '') === d.tag && Math.round(x.amount * 100) === d.cent);
        if (!alvo) return false;
        openTrans(d.livro, alvo);
        $('t-amount').value = d.valor;
        $('t-amount').dispatchEvent(new Event('input'));
        return true;
      }, { livro: alvo.livro, tag: alvo.tag, cent: alvo.cent, valor: emReais(novo).replace('.', ',') });
      if (!ok) { k--; continue; }
      await pagina.click('#form-transaction button[type="submit"]');
      await pagina.waitForTimeout(110);
      await pagina.evaluate(() => closeAllM());
      alvo.cent = novo;
      feitas.editar++;
    } else if (escolha === 'excluir') {
      const simples = livro.filter(x => !x.lock && !x.parcela);
      if (!simples.length) { k--; continue; }
      const alvo = um(simples);
      const ok = await pagina.evaluate(d => {
        const lista = arrLivro(d.livro);
        const alvo = lista.find(x => (x.notes || '') === d.tag && Math.round(x.amount * 100) === d.cent);
        if (!alvo) return false;
        openTrans(d.livro, alvo);
        return true;
      }, { livro: alvo.livro, tag: alvo.tag, cent: alvo.cent });
      if (!ok) { k--; continue; }
      await pagina.click('#btn-delete-transaction');
      await pagina.waitForTimeout(130);
      await pagina.evaluate(() => closeAllM());
      livro.splice(livro.indexOf(alvo), 1);
      feitas.excluir++;
    }
  }
  t.conferir('a tarde de trabalho foi até o fim sem travar',
    livro.length > 0, Object.entries(feitas).map(([k2, v]) => `${k2}: ${v}`).join(' · '));

  // ===== A CONFERÊNCIA =====
  const lerApp = () => pagina.evaluate(() => {
    const dump = {};
    ['bov', 'av', 'ger'].forEach(b => {
      dump[b] = arrLivro(b).map(x => ({
        notes: x.notes || '', cent: Math.round(x.amount * 100), tipo: x.type,
        data: x.date, venc: x.venc || null, pago: !!x.pago, grupo: x.grupo || null,
        parcela: x.parcela || null, parcelas: x.parcelas || null, lock: x.lock || null
      }));
    });
    return dump;
  });
  const app = await lerApp();
  const todos = [...app.bov, ...app.av, ...app.ger];
  const etiqueta = x => (x.notes.match(/op\d{3}/) || [''])[0];

  t.secao('nada faltando, nada duplicado');
  const tags = [...new Set(livro.map(x => x.tag))];
  const faltando = [], sobrando = [], valorErrado = [], vencErrado = [];
  tags.forEach(tag => {
    const esperado = doTag(tag).slice().sort((a, b) => a.cent - b.cent || String(a.venc).localeCompare(String(b.venc)));
    const achado = todos.filter(x => etiqueta(x) === tag)
      .slice().sort((a, b) => a.cent - b.cent || String(a.venc).localeCompare(String(b.venc)));
    if (achado.length < esperado.length) faltando.push(`${tag}: ${achado.length} de ${esperado.length}`);
    else if (achado.length > esperado.length) sobrando.push(`${tag}: ${achado.length} em vez de ${esperado.length}`);
    else {
      esperado.forEach((e, i) => {
        if (achado[i].cent !== e.cent) valorErrado.push(`${tag}: R$ ${emReais(achado[i].cent)} em vez de R$ ${emReais(e.cent)}`);
        if ((achado[i].venc || null) !== (e.venc || null)) vencErrado.push(`${tag}: venc ${achado[i].venc} em vez de ${e.venc}`);
      });
    }
  });
  // Etiqueta que o livro de fora não conhece é lançamento que o aplicativo
  // criou sozinho — o pior caso, porque a tela parece certa.
  const intrusos = todos.filter(x => !tags.includes(etiqueta(x)));
  t.conferir(`os ${livro.length} lançamentos esperados estão todos lá`,
    faltando.length === 0, faltando.join(' | ') || `${tags.length} etiquetas conferidas`);
  t.conferir('nenhum lançamento duplicado', sobrando.length === 0, sobrando.join(' | '));
  t.conferir('nenhum lançamento que o livro de fora não conheça',
    intrusos.length === 0, intrusos.map(x => `${x.notes} R$ ${emReais(x.cent)}`).join(' | '));
  t.conferir('o total de registros fecha',
    todos.length === livro.length, `${todos.length} no aplicativo, ${livro.length} no livro de fora`);

  t.secao('o valor de cada um');
  t.conferir('nenhum valor diferente do que foi digitado',
    valorErrado.length === 0, valorErrado.slice(0, 4).join(' | '));
  t.conferir('nenhum vencimento fora do combinado',
    vencErrado.length === 0, vencErrado.slice(0, 4).join(' | '));
  // Carnê: a soma das parcelas é o total da compra, no centavo.
  const carnes = tags.filter(tag => doTag(tag).length > 1);
  const carneTorto = carnes.filter(tag => {
    const esperado = doTag(tag).reduce((a, x) => a + x.cent, 0);
    const achado = todos.filter(x => etiqueta(x) === tag).reduce((a, x) => a + x.cent, 0);
    return esperado !== achado;
  });
  t.conferir(`os ${carnes.length} carnês somam o total da compra, no centavo`,
    carneTorto.length === 0, carneTorto.join(' | '));

  t.secao('as somas por atividade e por sentido');
  const soma = (lista, f) => lista.filter(f).reduce((a, x) => a + x.cent, 0);
  const erradas = [];
  LIVROS_T.forEach(b => {
    ['entrada', 'saida'].forEach(tipo => {
      const fora = soma(livro, x => x.livro === b && x.tipo === tipo);
      const dentro = soma(app[b], x => x.tipo === tipo);
      if (fora !== dentro) erradas.push(`${b}/${tipo}: app R$ ${emReais(dentro)} vs livro R$ ${emReais(fora)}`);
    });
  });
  t.conferir('entradas e saídas de cada atividade batem no centavo',
    erradas.length === 0, erradas.join(' | ') || LIVROS_T.map(b =>
      `${b}: +${emReais(soma(livro, x => x.livro === b && x.tipo === 'entrada'))} −${emReais(soma(livro, x => x.livro === b && x.tipo === 'saida'))}`).join(' · '));

  t.secao('contas a pagar e a receber');
  const aPagarFora = livro.filter(x => x.venc && !x.pago && x.tipo === 'saida');
  const aReceberFora = livro.filter(x => x.venc && !x.pago && x.tipo === 'entrada');
  const abertas = await pagina.evaluate(() => ({
    pagar: LIVROS.flatMap(b => contasAPagar(arrLivro(b))).map(x => Math.round(x.amount * 100)),
    receber: LIVROS.flatMap(b => contasAReceber(arrLivro(b))).map(x => Math.round(x.amount * 100))
  }));
  const multi = l => l.slice().sort((a, b) => a - b).join(',');
  t.conferir(`as ${aPagarFora.length} contas a pagar são exatamente as que ficaram abertas`,
    abertas.pagar.length === aPagarFora.length
    && multi(abertas.pagar) === multi(aPagarFora.map(x => x.cent)),
    `app ${abertas.pagar.length} · livro ${aPagarFora.length}`);
  t.conferir(`as ${aReceberFora.length} a receber também`,
    abertas.receber.length === aReceberFora.length
    && multi(abertas.receber) === multi(aReceberFora.map(x => x.cent)),
    `app ${abertas.receber.length} · livro ${aReceberFora.length}`);
  // Baixa dada é baixa gravada: conta marcada como paga não pode voltar a
  // cobrar, nem no "A pagar" nem no calendário.
  const pagasFora = livro.filter(x => x.pago).length;
  const pagasDentro = todos.filter(x => x.pago).length;
  t.conferir('toda baixa dada ficou gravada', pagasDentro === pagasFora,
    `app ${pagasDentro} · livro ${pagasFora}`);

  t.secao('os três regimes');
  // Competência: a data do lançamento. Caixa: só o que passou pela conta.
  // Vencimento: a data de vencer, para o que tem vencimento.
  const porRegime = {
    competencia: livro,
    caixa: livro.filter(x => !x.venc || x.pago),
    vencimento: livro
  };
  for (const [regime, lista] of Object.entries(porRegime)) {
    const fora = soma(lista, x => x.tipo === 'entrada') - soma(lista, x => x.tipo === 'saida');
    const dentro = await pagina.evaluate(reg => {
      definirRegime(reg);
      const tudo = LIVROS.flatMap(b => arrLivro(b));
      return tudo.reduce((acc, x) => {
        const d = dataDoRegime(x, reg);
        if (!d) return acc;
        return acc + (x.type === 'entrada' ? 1 : -1) * Math.round(x.amount * 100);
      }, 0);
    }, regime);
    t.conferir(`regime de ${regime}: o saldo fecha no centavo`, dentro === fora,
      `app R$ ${emReais(dentro)} · livro R$ ${emReais(fora)}`);
  }

  t.secao('o número que a tela mostra');
  await pagina.evaluate(() => {
    definirRegime('competencia');
    ['bfin-period'].forEach(id => { $(id).value = 'all'; guardarPeriodo(id); });
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-busca').value = ''; render();
  });
  const naTela = await pagina.evaluate(() => {
    const ler = sel => { const el = document.querySelector('#bfin-balance ' + sel); return el ? el.textContent : ''; };
    return { saldo: ler('.bc-value'), entradas: ler('.val.in'), saidas: ler('.val.out') };
  });
  const bovIn = soma(livro, x => x.livro === 'bov' && x.tipo === 'entrada');
  const bovOut = soma(livro, x => x.livro === 'bov' && x.tipo === 'saida');
  t.conferir('as entradas de Bovinos na tela são as do livro de fora',
    lerTela(naTela.entradas) === bovIn, `tela ${naTela.entradas} · livro R$ ${emReais(bovIn)}`);
  t.conferir('as saídas também',
    lerTela(naTela.saidas) === bovOut, `tela ${naTela.saidas} · livro R$ ${emReais(bovOut)}`);
  t.conferir('e o saldo é a diferença exata, sem arredondar na passagem',
    lerTela(naTela.saldo) === bovIn - bovOut,
    `tela ${naTela.saldo} · livro R$ ${emReais(bovIn - bovOut)}`);

  t.secao('o rebanho e as pesagens');
  const noRebanho = await pagina.evaluate(() => ({
    animais: animals.map(a => a.ident).sort(),
    pesagens: weighings.map(w => ({ brinco: (animals.find(a => a.id === w.animalId) || {}).ident,
      data: w.date, peso: w.weight }))
  }));
  t.conferir(`os ${rebanho.animais.length} animais cadastrados estão todos lá`,
    noRebanho.animais.join(',') === rebanho.animais.slice().sort().join(','),
    `app ${noRebanho.animais.length} · livro ${rebanho.animais.length}`);
  t.conferir(`as ${rebanho.pesagens.length} pesagens também, contando a de entrada do cadastro`,
    noRebanho.pesagens.length === rebanho.pesagens.length,
    `app ${noRebanho.pesagens.length} · livro ${rebanho.pesagens.length}`);
  const quilos = l => l.reduce((a, p) => a + p.peso, 0);
  t.conferir('somando exatamente os mesmos quilos',
    Math.abs(quilos(noRebanho.pesagens) - quilos(rebanho.pesagens)) < 1e-9,
    `app ${quilos(noRebanho.pesagens)} kg · livro ${quilos(rebanho.pesagens)} kg`);
  const pesagemErrada = rebanho.pesagens.filter(p =>
    !noRebanho.pesagens.some(q => q.brinco === p.brinco && q.data === p.data && Math.abs(q.peso - p.peso) < 1e-9));
  t.conferir('cada pesagem no animal certo, no dia certo, com o peso certo',
    pesagemErrada.length === 0,
    pesagemErrada.slice(0, 3).map(p => `${p.brinco} ${p.data} ${p.peso}kg`).join(' | '));

  t.secao('fecha e reabre o aplicativo');
  // Tudo o que foi conferido até aqui estava na memória da página. O que o dono
  // vê amanhã é o que sobreviveu ao fechamento.
  await pagina.evaluate(() => salvarEspelho(true));
  await pagina.goto(s.url + '/index.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await pagina.waitForFunction(() => typeof window.render === 'function', { timeout: 15000 });
  await pagina.waitForTimeout(250);
  const depois = await lerApp();
  const todosDepois = [...depois.bov, ...depois.av, ...depois.ger];
  t.conferir('o mesmo número de lançamentos continua lá',
    todosDepois.length === livro.length, `${todosDepois.length} de ${livro.length}`);
  const somaTudo = l => l.reduce((a, x) => a + x.cent, 0);
  t.conferir('somando exatamente o mesmo dinheiro',
    somaTudo(todosDepois) === somaTudo(livro),
    `R$ ${emReais(somaTudo(todosDepois))} de R$ ${emReais(somaTudo(livro))}`);
  const faltandoDepois = tags.filter(tag =>
    todosDepois.filter(x => etiqueta(x) === tag).length !== doTag(tag).length);
  t.conferir('e cada etiqueta com o mesmo número de linhas',
    faltandoDepois.length === 0, faltandoDepois.join(' | '));
  t.conferir('as contas abertas continuam as mesmas',
    multi(todosDepois.filter(x => x.venc && !x.pago && x.tipo === 'saida').map(x => x.cent))
    === multi(aPagarFora.map(x => x.cent)));

  const rebanhoDepois = await pagina.evaluate(() => ({ a: animals.length, w: weighings.length }));
  t.conferir('o rebanho e as pesagens sobreviveram ao fechamento',
    rebanhoDepois.a === rebanho.animais.length && rebanhoDepois.w === rebanho.pesagens.length,
    `app ${rebanhoDepois.a} animais / ${rebanhoDepois.w} pesagens · livro ${rebanho.animais.length} / ${rebanho.pesagens.length}`);

  t.conferir('nenhum erro de JavaScript em toda a tarde de trabalho',
    errosJS.length === 0, errosJS.slice(0, 3).join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
