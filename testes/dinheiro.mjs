// O REBANHO EM DINHEIRO, E A CONTA DO PASTO.
//
// Itens 2 e 6 da lista de melhorias, escolhidos pelo dono, com o pedido de
// tratar a parte financeira como um sênior trataria e de analisar todos os
// cálculos.
//
// Número financeiro errado não se denuncia: ele continua bonito na tela e a
// decisão sai torta. Por isso aqui cada conta é refeita do zero — arroba por
// arroba, real por real — e três perguntas de auditoria são feitas a cada uma:
//
//   1. DE ONDE SAI? Preço inventado por aplicativo é a pior espécie de
//      número, porque parece cotação. Sem preço informado, não há valor.
//   2. CONFERE NA CALCULADORA? O que está escrito tem de multiplicar. "1.622 @
//      × R$ 340" dá R$ 551.480; se o valor exibido for R$ 551.571, quem
//      confere acha erro — e passa a desconfiar do resto.
//   3. QUE RÉGUA USOU? Arroba depende do rendimento de carcaça, e o aplicativo
//      tem DOIS: o do Rebanho e o da aba Custos. Subtrair um do outro é somar
//      metro com jarda.
//
// A terceira pergunta já achou um furo de verdade, e ele tem teste próprio
// aqui embaixo.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.DINHEIRO || 600);
const SEMENTE = Number(process.env.SEMENTE_DINHEIRO || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`O rebanho em dinheiro e a conta do pasto (${QTD.toLocaleString('pt-BR')} rebanhos · semente ${SEMENTE})`);

  const tela = () => pagina.evaluate(() => {
    tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
    document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
    const cx = $('bov-valor');
    return { escondido: cx.hidden,
      cab: cx.hidden ? '' : cx.querySelector('.dobra-cab').innerText.replace(/\s+/g, ' '),
      corpo: cx.hidden ? '' : cx.querySelector('.dobra-corpo').innerText.replace(/\s+/g, ' '),
      v: valorDoRebanho() };
  });

  // ---------- a conta, refeita do zero ----------
  t.secao('quanto vale o rebanho: a conta e o que a tela afirma');
  const base = await pagina.evaluate(() => {
    settings.yield = 50;
    custoParams = Object.assign({}, CUSTO_VAZIO, { precoArroba: 340 });
    animals = []; weighings = [];
    // três animais pesados, um sem pesagem, um vendido e um morto
    [['101', 300], ['102', 420], ['103', 255]].forEach(([id, kg], i) => {
      animals.push({ id: 'a' + i, ident: id, cat: 'Novilha' });
      weighings.push({ id: 'w' + i, animalId: 'a' + i, date: '2026-10-19', weight: kg, jejum: false });
    });
    animals.push({ id: 'sp', ident: '104', cat: 'Novilha' });            // sem pesagem
    animals.push({ id: 'vd', ident: '105', cat: 'Novilha', sold: true }); // vendida
    animals.push({ id: 'mt', ident: '106', cat: 'Novilha', dead: true }); // morta
    weighings.push({ id: 'wv', animalId: 'vd', date: '2026-10-19', weight: 500, jejum: false });
    weighings.push({ id: 'wm', animalId: 'mt', date: '2026-10-19', weight: 500, jejum: false });
    recomputarLivros();
    return valorDoRebanho();
  });
  const kgEsperado = 300 + 420 + 255;
  const arrEsperada = kgEsperado * 0.5 / 15;
  t.conferir('só o rebanho entra: vendido e morto ficam de fora',
    base.kg === kgEsperado, `${base.kg} kg, esperado ${kgEsperado}`);
  t.conferir('animal sem pesagem não entra, e é contado à parte',
    base.n === 3 && base.semPeso === 1, `${base.n} com peso · ${base.semPeso} sem`);
  t.conferir('as arrobas são peso vivo × rendimento ÷ 15',
    Math.abs(base.arrobas - arrEsperada) < 1e-9, `${base.arrobas} vs ${arrEsperada}`);
  t.conferir('o valor é arrobas × preço da arroba',
    Math.abs(base.valor - arrEsperada * 340) < 1e-9, `${base.valor} vs ${arrEsperada * 340}`);
  const telaBase = await tela();
  // Os números esperados saem da PRÓPRIA montagem, não escritos à mão: conta
  // de cabeça num conferidor é só mais um lugar onde errar — e já errei aqui,
  // somando 945 onde são 975.
  const brl = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const arr2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  t.conferir('a tela mostra o valor arredondado, sem centavos',
    telaBase.cab.indexOf('R$ ' + brl(Math.round(arrEsperada * 340))) >= 0,
    `${telaBase.cab} | esperado R$ ${brl(Math.round(arrEsperada * 340))}`);
  t.conferir('e a conta ao lado fecha na calculadora: arrobas × preço',
    telaBase.corpo.indexOf(arr2(arrEsperada) + ' @ × R$ 340,00') >= 0,
    `${telaBase.corpo.slice(0, 90)} | esperado ${arr2(arrEsperada)} @`);
  t.conferir('o valor exibido é mesmo o produto das duas parcelas exibidas',
    Math.abs(Math.round(arrEsperada * 340) - Math.round(Number(arr2(arrEsperada).replace('.', '').replace(',', '.')) * 340)) <= 1,
    `${arr2(arrEsperada)} × 340`);
  t.conferir('a tela diz que o peso é o da última pesagem de cada um',
    /última pesagem de cada um/.test(telaBase.corpo), telaBase.corpo.slice(0, 200));
  t.conferir('avisa que é valor bruto, antes de frete, comissão e impostos',
    /bruto/.test(telaBase.corpo) && /frete/.test(telaBase.corpo) && /impostos/.test(telaBase.corpo),
    telaBase.corpo.slice(-220));
  t.conferir('e avisa do animal que ficou de fora por não ter pesagem',
    /1 animal ainda não foi pesado/.test(telaBase.corpo), telaBase.corpo.slice(-200));

  // ---------- o peso que vale é o da ÚLTIMA pesagem ----------
  t.secao('o peso que vale é o último de cada animal');
  const ultimo = await pagina.evaluate(() => {
    weighings.push({ id: 'novo', animalId: 'a0', date: '2026-11-20', weight: 333, jejum: false });
    weighings.push({ id: 'velho', animalId: 'a1', date: '2026-01-05', weight: 100, jejum: false });
    recomputarLivros();
    return valorDoRebanho();
  });
  t.conferir('pesagem mais nova substitui a anterior na conta',
    ultimo.kg === 333 + 420 + 255, `${ultimo.kg} kg`);
  t.conferir('pesagem mais antiga não puxa o peso para baixo',
    ultimo.n === 3, `${ultimo.n} animais`);

  // ---------- sem preço, não se inventa preço ----------
  t.secao('sem preço informado, nenhum valor é inventado');
  for (const [nome, preco] of [['vazio', null], ['zero', 0], ['negativo', -5], ['texto', NaN]]) {
    const r = await pagina.evaluate(p => {
      custoParams.precoArroba = p; render();
      const cx = $('bov-valor');
      return { v: valorDoRebanho(),
        cab: cx.hidden ? '' : cx.querySelector('.dobra-cab').innerText.replace(/\s+/g, ' '),
        corpo: cx.hidden ? '' : cx.querySelector('.dobra-corpo').innerText.replace(/\s+/g, ' ') };
    }, preco);
    t.conferir(`preço ${nome}: não sai valor nenhum`,
      r.v && r.v.valor === null && /falta o preço/.test(r.cab), `${r.cab} | ${JSON.stringify(r.v && r.v.valor)}`);
    t.conferir(`preço ${nome}: a tela ensina onde informar`,
      /aba Custos/.test(r.corpo), r.corpo.slice(0, 100));
  }

  // ---------- a régua: rendimento do Rebanho, não o da aba Custos ----------
  t.secao('a arroba do rebanho usa o rendimento DO REBANHO');
  const reguas = await pagina.evaluate(() => {
    custoParams.precoArroba = 340;
    settings.yield = 50; custoParams.rend = 52;
    const com50 = valorDoRebanho().valor;
    settings.yield = 54;
    const com54 = valorDoRebanho().valor;
    settings.yield = 50; custoParams.rend = 60;
    const mexendoNoOutro = valorDoRebanho().valor;
    return { com50, com54, mexendoNoOutro };
  });
  t.conferir('mudar o rendimento do Rebanho muda o valor',
    Math.abs(reguas.com54 / reguas.com50 - 54 / 50) < 1e-9,
    `${reguas.com50} → ${reguas.com54}`);
  t.conferir('mexer no rendimento da aba Custos NÃO muda o valor do rebanho',
    reguas.mexendoNoOutro === reguas.com50, `${reguas.mexendoNoOutro} vs ${reguas.com50}`);

  // ---------- O FURO DA AUDITORIA ----------
  // A margem subtraía o custo da arroba (rendimento da aba Custos) do preço da
  // arroba vendida (rendimento do Rebanho). Dois rendimentos, uma subtração.
  t.secao('a margem não pode subtrair arrobas medidas com réguas diferentes');
  const furo = await pagina.evaluate(() => {
    settings.yield = 50;           // régua do Rebanho
    custoParams = Object.assign({}, CUSTO_VAZIO, {
      gmd: 1, salPct: 0, salPreco: 0, sanidade: 0, mo: 0, terra: 300, rend: 60
    });                            // régua da aba Custos: 60%
    animals = [{ id: 'v1', ident: '201', cat: 'Boi', sold: true,
      soldDate: '2026-09-01', soldWeight: 500, soldPrice: 10000 }];
    weighings = []; recomputarLivros();
    const c = calcCusto();
    // o preço por arroba vendida, nas duas réguas
    const com50 = precoArrobaVenda(null, 50).porArroba;
    const com60 = precoArrobaVenda(null, 60).porArroba;
    tab = 'bovinos'; seg = 'custos'; render();
    const txt = $('cst-venda').innerText.replace(/\s+/g, ' ');
    return { c, com50, com60, txt,
      // a margem certa: preço e custo na MESMA régua da aba Custos
      margemCerta: com60 - c.custoArroba,
      margemErrada: com50 - c.custoArroba };
  });
  t.conferir('as duas réguas dão preços por arroba bem diferentes',
    Math.abs(furo.com50 - furo.com60) > 50, `${furo.com50} vs ${furo.com60}`);
  t.conferir('a tela usa o preço na régua do custo, não na do Rebanho',
    furo.txt.indexOf(fmtRSteste(furo.com60)) >= 0 || furo.txt.indexOf(fmtRSteste(furo.margemCerta)) >= 0,
    `${furo.txt} | certo ${furo.margemCerta.toFixed(2)} · errado ${furo.margemErrada.toFixed(2)}`);
  t.conferir('e a margem mostrada é a certa, não a inflada pela régua trocada',
    furo.txt.indexOf(fmtRSteste(furo.margemErrada)) < 0,
    `${furo.txt} | a errada seria ${furo.margemErrada.toFixed(2)}`);

  // ---------- a conta do pasto ----------
  t.secao('o pasto está pagando: custo contra preço, na mesma régua');
  const pasto = await pagina.evaluate(() => {
    settings.yield = 50;
    animals = []; weighings = [];
    custoParams = Object.assign({}, CUSTO_VAZIO, {
      gmd: 0.5, salPct: 0, salPreco: 0, sanidade: 0, mo: 0, terra: 304.17, rend: 50,
      precoArroba: 340
    });
    recomputarLivros();
    tab = 'bovinos'; seg = 'custos'; render();
    const c = calcCusto();
    return { c, txt: $('cst-venda').innerText.replace(/\s+/g, ' '),
      arroba: $('cst-arroba').textContent };
  });
  // custo diário = 304,17/mês ÷ (365/12) = 10,00/dia; arroba/dia = 0,5×50%/15 = 0,016667
  t.conferir('o custo por dia sai certo dos custos mensais',
    Math.abs(pasto.c.custoDia - 10) < 0.01, String(pasto.c.custoDia));
  t.conferir('a arroba ganha por dia é GMD × rendimento ÷ 15',
    Math.abs(pasto.c.arrobaDia - 0.5 * 0.5 / 15) < 1e-12, String(pasto.c.arrobaDia));
  // A identidade exata é contra os PRÓPRIOS componentes; o ~600 é só a
  // conferência de ordem de grandeza, e a terra de R$ 304,17/mês não dá
  // exatamente R$ 10,00/dia.
  t.conferir('o custo da arroba produzida é custo do dia ÷ arroba do dia',
    Math.abs(pasto.c.custoArroba - pasto.c.custoDia / pasto.c.arrobaDia) < 1e-9,
    `${pasto.c.custoArroba} vs ${pasto.c.custoDia / pasto.c.arrobaDia}`);
  t.conferir('e dá a ordem de grandeza esperada para esses custos',
    Math.abs(pasto.c.custoArroba - 600) < 1, String(pasto.c.custoArroba));
  t.conferir('sem venda registrada, a margem sai do preço informado — e a tela diz isso',
    /preço informado/.test(pasto.txt) && /340,00/.test(pasto.txt), pasto.txt);
  t.conferir('a margem é preço menos custo da arroba produzida',
    pasto.txt.indexOf(fmtRSteste(340 - pasto.c.custoArroba)) >= 0,
    `${pasto.txt} | esperado ${(340 - pasto.c.custoArroba).toFixed(2)}`);
  t.conferir('a tela diz o que NÃO está na conta: animal, frete, comissão e impostos',
    /não entra aqui o que você pagou pelo animal/i.test(pasto.txt)
    && /frete/.test(pasto.txt) && /impostos/.test(pasto.txt), pasto.txt.slice(-200));

  // custo maior que o preço: a palavra muda
  const prejuizo = await pagina.evaluate(() => {
    custoParams.precoArroba = 100; render();
    return $('cst-venda').innerText.replace(/\s+/g, ' ');
  });
  t.conferir('custo acima do preço: a tela escreve "falta", não "sobra"',
    /falta/.test(prejuizo) && !/sobra/.test(prejuizo), prejuizo);

  // ---------- as duas contas do custo têm de dar o mesmo ----------
  // custoArroba (custo do dia ÷ arroba do dia) e custoArrobaProduzida (custo do
  // período ÷ arrobas produzidas) são caminhos diferentes para o mesmo número.
  t.secao('os dois caminhos do custo da arroba chegam ao mesmo lugar');
  const dois = await pagina.evaluate(() => {
    custoParams = Object.assign({}, CUSTO_VAZIO, {
      gmd: 0.8, salPct: 0.3, salPreco: 4.5, sanidade: 6, mo: 18, terra: 35,
      pesoCompra: 230, pesoVenda: 450, valorCompra: 4800, precoArroba: 330, rend: 52
    });
    const c = calcCusto();
    const sim = calcSimulacao(c);
    return { custoArroba: c.custoArroba, produzida: sim.custoArrobaProduzida,
      receita: sim.receita, arrobasVenda: sim.arrobasVenda, preco: 330,
      investido: sim.investido, custoPeriodo: sim.custoPeriodo, valorCompra: 4800,
      resultado: sim.resultado };
  });
  t.conferir('custo do dia ÷ arroba do dia = custo do período ÷ arrobas produzidas',
    Math.abs(dois.custoArroba - dois.produzida) < 1e-9,
    `${dois.custoArroba} vs ${dois.produzida}`);
  t.conferir('a receita da simulação é arrobas de venda × preço',
    Math.abs(dois.receita - dois.arrobasVenda * dois.preco) < 1e-9,
    `${dois.receita} vs ${dois.arrobasVenda * dois.preco}`);
  t.conferir('o investido é o que pagou pelo animal mais o custo do período',
    Math.abs(dois.investido - (dois.valorCompra + dois.custoPeriodo)) < 1e-9,
    `${dois.investido}`);
  t.conferir('e o resultado é receita menos investido',
    Math.abs(dois.resultado - (dois.receita - dois.investido)) < 1e-9, `${dois.resultado}`);

  // ---------- varredura ----------
  t.secao(`a conta fecha em qualquer rebanho e qualquer preço (${QTD.toLocaleString('pt-BR')} sorteios)`);
  const f = await pagina.evaluate(`(function (N) {
    let _s = ${SEMENTE} >>> 0;
    const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const perto = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-9 : e);
    const falhas = {};
    const regra = (nome, ok, caso) => {
      if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
    };
    for (let k = 0; k < N; k++) {
      settings.yield = ent(40, 60);
      const preco = rnd() < 0.2 ? null : ent(180, 420);
      custoParams = Object.assign({}, CUSTO_VAZIO, { precoArroba: preco });
      animals = []; weighings = [];
      let kgRebanho = 0, nComPeso = 0, nSemPeso = 0;
      const nA = ent(1, 25);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        const vend = rnd() < 0.15, morto = rnd() < 0.08;
        animals.push({ id, ident: 'T' + i, cat: 'Novilha', sold: vend, dead: morto });
        const temPeso = rnd() < 0.85;
        if (temPeso) {
          // duas pesagens: a última é a que vale
          const velho = ent(120, 300), novo = ent(150, 500);
          weighings.push({ id: id + 'a', animalId: id, date: '2026-05-10', weight: velho, jejum: false });
          weighings.push({ id: id + 'b', animalId: id, date: '2026-10-19', weight: novo, jejum: false });
          if (!vend && !morto) { kgRebanho += novo; nComPeso++; }
        } else if (!vend && !morto) nSemPeso++;
      }
      recomputarLivros();
      const v = valorDoRebanho();
      if (!nComPeso) { regra('sem animal pesado no rebanho, não há valor', v === null, JSON.stringify(v)); continue; }
      regra('a conta pega exatamente o peso do rebanho pesado', v.kg === kgRebanho, v.kg + ' vs ' + kgRebanho);
      regra('e conta certo quantos entraram e quantos ficaram sem peso',
        v.n === nComPeso && v.semPeso === nSemPeso, v.n + '/' + v.semPeso + ' vs ' + nComPeso + '/' + nSemPeso);
      regra('as arrobas são peso × rendimento ÷ 15',
        perto(v.arrobas, kgRebanho * settings.yield / 100 / 15, 1e-9), String(v.arrobas));
      regra('o rendimento usado é o do Rebanho', v.rend === settings.yield, v.rend + ' vs ' + settings.yield);
      if (preco == null) {
        regra('sem preço, o valor é nulo — nunca zero nem estimado', v.valor === null, String(v.valor));
      } else {
        regra('o valor é arrobas × preço', perto(v.valor, v.arrobas * preco, 1e-6),
          v.valor + ' vs ' + v.arrobas * preco);
        regra('o valor nunca é negativo', v.valor >= 0, String(v.valor));
        regra('dobrar o preço dobra o valor', (function () {
          custoParams.precoArroba = preco * 2;
          const d = valorDoRebanho().valor;
          custoParams.precoArroba = preco;
          return perto(d, v.valor * 2, 1e-6);
        })(), 'não dobrou');
      }
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} sorteios` : caso));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}

// R$ como a tela escreve, para procurar o número no texto exibido.
function fmtRSteste(v) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
