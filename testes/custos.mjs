// VARREDURA DA ABA CUSTOS — CONTA POR CONTA, ITEM POR ITEM.
//
// Pedido do dono: varredura dos cálculos da aba Custos dos Bovinos.
//
// É a aba que decide compra e venda de lote. Ela tem dezoito números na tela —
// um grande, seis cartões, uma composição com quatro linhas, doze cartões de
// simulação — e todos saem de dois parâmetros e nove campos. Nenhum deles pode
// discordar do vizinho, e nenhum pode declarar uma base que não usou.
//
// SEIS DEFEITOS ACHADOS, todos medidos no aplicativo rodando:
//
// 1. RÉGUA TROCADA, O QUE SOBROU DA CORREÇÃO ANTERIOR. Sem os dois pesos, o
//    custo da arroba saía pelo rendimento dos PARÂMETROS, e a margem logo
//    abaixo o subtraía de um preço medido pelo rendimento da VENDA. Com 52% e
//    60%: custo R$ 55,79 contra o certo R$ 48,35 — R$ 7,44 por arroba de
//    margem inventada. A correção de antes pegou o caminho com pesos; este
//    tinha sobrado.
//
// 2. A TELA DECLARAVA UMA BASE QUE NÃO USOU. No mesmo caso, a dica dizia
//    "rendimento 52,0% na compra e 60,0% na venda" sobre uma conta que usou
//    52% e nada mais. Quem fosse conferir na calculadora erraria junto — e
//    confiaria no resultado. O relatório de auditoria repetia o mesmo erro.
//
// 3. CUSTO INFORMADO PELA METADE DESAPARECIA. Consumo de sal preenchido e
//    preço do sal em branco: o sal — 74% do custo do dia — saía da conta e da
//    composição sem nada na tela denunciando. Custo da arroba R$ 55,79 onde o
//    número cheio é R$ 216,14. QUATRO VEZES menos, e com cara de certo.
//
// 4. CUSTO ZERO AFIRMADO SEM DADO. "Custo por dia R$ 0,00", "Custo por mês
//    R$ 0,00" e "@ produzida custa R$ 0,00" com nenhum custo informado, ao
//    lado de um número grande dizendo "—" e de uma dica pedindo para informar
//    algum custo: três lugares da mesma tela, três histórias.
//
// 5. AS PORCENTAGENS NÃO FECHAVAM. Três custos iguais davam 33% + 33% + 33% ao
//    lado de um total que é o todo.
//
// 6. "RETORNO AO MÊS" É JURO SIMPLES ANUNCIADO COMO TAXA MENSAL. 19,7% em 10,1
//    meses virava 1,96% ao mês por divisão; compondo são 1,80%. Quem compara
//    com aplicação financeira compara com o número errado. O número ficou — é
//    o da pecuária — mas agora a tela diz de onde vem e mostra o composto.
//
// O resto da bateria é amarração: cada número tem de fechar com os vizinhos, e
// os dois caminhos que calculam o custo da arroba têm de dar o MESMO número.
import { servir, abrirApp, placar, perto } from './apoio.mjs';

const QTD = Number(process.env.CUSTOS_QTD || 800);
const SEMENTE = Number(process.env.SEMENTE_CUSTOS || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Varredura da aba Custos (${QTD.toLocaleString('pt-BR')} jogos de parâmetros · semente ${SEMENTE})`);

  // Monta a aba com um jogo de parâmetros e devolve TUDO: o que a tela mostra
  // e o que as funções calcularam, para que a conferência possa comparar os
  // dois. Número conferido só no miolo não prova que a tela mostra ele.
  const montar = (p, vendidos = []) => `(function () {
    animals = ${JSON.stringify(vendidos)};
    weighings = []; bovT = []; avT = []; gerT = [];
    items = []; moves = []; rebmov = []; extraT = {}; atividades = [];
    custoParams = Object.assign({}, CUSTO_VAZIO, ${JSON.stringify(p)});
    settings.yield = 52;
    recomputarLivros(); tab = 'bovinos'; seg = 'custos'; detailAnimal = null; render();
    const txt = id => { const e = document.getElementById(id);
      return !e ? '?' : (e.hidden ? '' : e.textContent.replace(/\\s+/g, ' ').trim()); };
    const cartao = (sel, rotulo) => {
      const achado = [...document.querySelectorAll(sel + ' .stat-card')]
        .find(e => e.querySelector('.stat-label').textContent === rotulo);
      return achado ? achado.querySelector('.stat-value').textContent.trim() : null;
    };
    const c = calcCusto(), sim = calcSimulacao(c);
    return {
      c: c, sim: sim,
      base: baseDoRendimento(c),
      tela: {
        grande: txt('cst-arroba'), hint: txt('cst-hint'), falta: txt('cst-falta'),
        venda: txt('cst-venda'), simValor: txt('sim-valor'), simHint: txt('sim-hint'),
        simNota: txt('sim-nota'),
        pesoMedio: cartao('#cst-stats', 'Peso médio'),
        salDia: cartao('#cst-stats', 'Sal por dia'),
        custoDia: cartao('#cst-stats', 'Custo por dia'),
        custoMes: cartao('#cst-stats', 'Custo por mês'),
        ganhoMes: cartao('#cst-stats', 'Ganho por mês'),
        diasArroba: cartao('#cst-stats', 'Dias por @'),
        arrobaProduzidaCusta: cartao('#sim-stats', '@ produzida custa'),
        retornoMes: cartao('#sim-stats', 'Retorno ao mês')
      },
      composicao: (function () {
        const bd = document.getElementById('cst-breakdown');
        if (bd.style.display === 'none') return null;
        return [...bd.querySelectorAll('.cb-line')].map(e => ({
          nome: e.querySelector('span').textContent,
          valor: e.querySelector('.value').textContent.trim()
        }));
      })()
    };
  })()`;

  const COMPLETO = { gmd: 0.85, salPct: 0.3, salPreco: 4.5, sanidade: 5, mo: 15, terra: 30,
    rend: 52, pesoCompra: 220, valorCompra: 2500, pesoVenda: 480, precoArroba: 320 };
  const DIAS_MES = 365 / 12;

  // ---------- 1. a conta completa, refeita à mão ----------
  // O caso de referência: toda conta da tela refeita fora do aplicativo, com
  // os números escritos aqui. Se uma fórmula mudar sem querer, esta seção
  // acusa antes de qualquer varredura.
  t.secao('a conta completa, refeita fora do aplicativo');
  const r1 = await pagina.evaluate(montar(COMPLETO));
  const salDia = 350 * 0.3 / 100 * 4.5;                   // 4,725
  const custoDia = salDia + 5 / DIAS_MES + 15 / DIAS_MES + 30 / DIAS_MES;
  const arrobasC = 220 * 0.52 / 15, arrobasV = 480 * 0.52 / 15;
  const dias = (480 - 220) / 0.85;
  const arrobaDia = (arrobasV - arrobasC) / dias;
  t.conferir('peso médio é a média dos dois pesos informados',
    r1.c.pesoMedio === 350, String(r1.c.pesoMedio));
  t.conferir('consumo de sal é a porcentagem do peso médio',
    perto(r1.c.salKgDia, 350 * 0.3 / 100), String(r1.c.salKgDia));
  t.conferir('sal do dia é consumo × preço', perto(r1.c.salDia, salDia), String(r1.c.salDia));
  t.conferir('custo mensal vira diário dividindo por 365/12, não por 30',
    perto(r1.c.sanDia, 5 / DIAS_MES) && perto(r1.c.moDia, 15 / DIAS_MES)
    && perto(r1.c.terraDia, 30 / DIAS_MES),
    `${r1.c.sanDia} · ${r1.c.moDia} · ${r1.c.terraDia}`);
  t.conferir('custo do dia é a soma das quatro parcelas',
    perto(r1.c.custoDia, custoDia), `${r1.c.custoDia} vs ${custoDia}`);
  t.conferir('arroba ganha por dia é a arroba produzida dividida pelos dias',
    perto(r1.c.arrobaDia, arrobaDia), `${r1.c.arrobaDia} vs ${arrobaDia}`);
  t.conferir('custo da arroba é custo do dia ÷ arroba do dia',
    perto(r1.c.custoArroba, custoDia / arrobaDia) && perto(r1.c.custoArroba, 216.136955, 1e-5),
    String(r1.c.custoArroba));
  t.conferir('a tela mostra esse mesmo número', r1.tela.grande === 'R$ 216,14', r1.tela.grande);
  t.conferir('dias de engorda = quilos a ganhar ÷ GMD',
    perto(r1.sim.dias, dias), String(r1.sim.dias));
  t.conferir('receita = arrobas da venda × preço da arroba',
    perto(r1.sim.receita, arrobasV * 320) && perto(r1.sim.receita, 5324.8),
    String(r1.sim.receita));
  t.conferir('investido = valor pago no animal + custo do período',
    perto(r1.sim.investido, 2500 + custoDia * dias), String(r1.sim.investido));
  t.conferir('resultado = receita − investido',
    perto(r1.sim.resultado, arrobasV * 320 - (2500 + custoDia * dias)),
    String(r1.sim.resultado));
  t.conferir('margem = resultado ÷ investido',
    perto(r1.sim.margem, r1.sim.resultado / r1.sim.investido * 100), String(r1.sim.margem));
  t.conferir('@ paga na compra = valor pago ÷ arrobas da compra',
    perto(r1.sim.precoArrobaCompra, 2500 / arrobasC), String(r1.sim.precoArrobaCompra));

  // ---------- 2. a régua única ----------
  // O defeito 1, que é o que move dinheiro. A arroba que o custo precifica tem
  // de ser a MESMA arroba que o preço precifica, senão a subtração da margem é
  // metro menos jarda.
  t.secao('o custo e o preço medidos pela mesma régua');
  const VENDIDOS = [
    { id: 'v1', ident: '1', cat: 'Boi', sold: true, soldDate: '2026-09-01', soldWeight: 500, soldPrice: 6000 },
    { id: 'v2', ident: '2', cat: 'Boi', sold: true, soldDate: '2026-09-02', soldWeight: 480, soldPrice: 5600 }
  ];
  const semPeso = { gmd: 0.85, salPreco: 4.5, sanidade: 5, mo: 15, terra: 30, rend: 52, rendVenda: 60 };
  const r2 = await pagina.evaluate(montar(semPeso, VENDIDOS));
  const custoDia2 = (5 + 15 + 30) / DIAS_MES;
  t.conferir('sem os dois pesos, a arroba do dia sai pelo rendimento da VENDA',
    perto(r2.c.arrobaDia, 0.85 * 60 / 100 / 15), String(r2.c.arrobaDia));
  t.conferir('e o custo da arroba sai na régua da venda',
    perto(r2.c.custoArroba, custoDia2 / (0.85 * 0.6 / 15)) && perto(r2.c.custoArroba, 48.348106, 1e-5),
    String(r2.c.custoArroba));
  // O preço realizado é convertido a arrobas pelo rendimento da venda; o custo
  // também. A subtração fecha com os dois números que a tela mostra ao lado.
  const arrobasVendidas = (500 + 480) * 0.6 / 15;
  const precoReal = (6000 + 5600) / arrobasVendidas;
  t.conferir('o preço da arroba vendida é total recebido ÷ total de arrobas',
    perto(precoReal, 295.918367, 1e-5), String(precoReal));
  t.conferir('a margem é a diferença entre os dois, na mesma régua',
    /sobra R\$ 247,57 por @ produzida/.test(r2.tela.venda), r2.tela.venda.slice(0, 140));
  t.conferir('a dica declara o rendimento que a conta REALMENTE usou',
    r2.tela.hint === 'por @ produzida · rendimento 60,0%', r2.tela.hint);
  // Com os dois pesos, a conta usa as duas pontas — e aí sim a dica cita as duas.
  const r2b = await pagina.evaluate(montar(Object.assign({}, semPeso,
    { pesoCompra: 220, pesoVenda: 480 }), VENDIDOS));
  t.conferir('com os dois pesos, a conta usa as duas pontas',
    r2b.c.usouDuasPontas && perto(r2b.c.arrobaDia,
      (480 * 0.6 / 15 - 220 * 0.52 / 15) / ((480 - 220) / 0.85)),
    String(r2b.c.arrobaDia));
  t.conferir('e a dica passa a citar as duas',
    r2b.tela.hint === 'por @ produzida · rendimento 52,0% na compra e 60,0% na venda',
    r2b.tela.hint);
  t.conferir('deixando as duas pontas em branco, nada muda para quem não as usa',
    (await pagina.evaluate(montar({ gmd: 0.85, sanidade: 5, mo: 15, terra: 30, rend: 52 }))).c.custoArroba
    === (await pagina.evaluate(montar({ gmd: 0.85, sanidade: 5, mo: 15, terra: 30,
      rend: 52, rendVenda: 52, rendCompra: 52 }))).c.custoArroba);

  // ---------- 3. custo informado pela metade ----------
  t.secao('custo pela metade não pode desaparecer em silêncio');
  const r3 = await pagina.evaluate(montar({ gmd: 0.85, salPct: 0.3, sanidade: 5, mo: 15, terra: 30,
    rend: 52, pesoCompra: 220, pesoVenda: 480, precoArroba: 320 }));
  t.conferir('o consumo de sal está calculado na tela',
    r3.tela.salDia === '1,050 kg', r3.tela.salDia);
  t.conferir('mas o sal não entrou no custo, porque falta o preço dele',
    r3.c.salDia === 0 && r3.c.faltaSalPreco, `${r3.c.salDia} · falta=${r3.c.faltaSalPreco}`);
  t.conferir('e a tela AVISA isso, colado no número grande',
    /O sal NÃO está neste custo/.test(r3.tela.falta) && /preço do sal/.test(r3.tela.falta),
    r3.tela.falta || 'nenhum aviso');
  t.conferir('o aviso diz o consumo que já está calculado',
    /1,050 kg por dia/.test(r3.tela.falta), r3.tela.falta);
  const r3b = await pagina.evaluate(montar({ gmd: 0.85, salPct: 0.3, salPreco: 4.5, sanidade: 5,
    mo: 15, terra: 30, rend: 52, pesoCompra: 220, pesoVenda: 480, precoArroba: 320 }));
  t.conferir('com o preço do sal, o aviso sai da tela', r3b.tela.falta === '', r3b.tela.falta);
  t.conferir('e o número grande quadruplica, que é o tamanho do que faltava',
    r3b.tela.grande === 'R$ 216,14' && r3.tela.grande === 'R$ 55,79',
    `${r3.tela.grande} → ${r3b.tela.grande}`);
  const r3c = await pagina.evaluate(montar({ gmd: 0.85, rend: 52, pesoCompra: 220, pesoVenda: 480 }));
  t.conferir('sem nenhum custo informado, não aparecem dois avisos dizendo o mesmo',
    r3c.tela.falta === '' && /Informe ao menos um custo/.test(r3c.tela.hint),
    `${r3c.tela.falta} | ${r3c.tela.hint}`);

  // ---------- 4. custo zero é uma afirmação ----------
  t.secao('custo zero não se afirma sem dado');
  t.conferir('"Custo por dia" fica em branco quando nada foi informado',
    r3c.tela.custoDia === '—', r3c.tela.custoDia);
  t.conferir('"Custo por mês" também', r3c.tela.custoMes === '—', r3c.tela.custoMes);
  t.conferir('"@ produzida custa" também', r3c.tela.arrobaProduzidaCusta === '—',
    r3c.tela.arrobaProduzidaCusta);
  t.conferir('e o número grande continua dizendo o que falta',
    r3c.tela.grande === '—' && /Informe ao menos um custo/.test(r3c.tela.hint),
    `${r3c.tela.grande} · ${r3c.tela.hint}`);
  t.conferir('informado um único custo, os três voltam a mostrar valor',
    (function () { return true; })() && r1.tela.custoDia === 'R$ 6,37'
    && r1.tela.custoMes === 'R$ 193,72' && r1.tela.arrobaProduzidaCusta === 'R$ 216,14',
    `${r1.tela.custoDia} · ${r1.tela.custoMes} · ${r1.tela.arrobaProduzidaCusta}`);

  // ---------- 5. a composição fecha ----------
  t.secao('a composição do custo diário fecha em 100%');
  const r5 = await pagina.evaluate(montar({ gmd: 0.85, sanidade: 10, mo: 10, terra: 10, rend: 52 }));
  const soma5 = r5.composicao.reduce((n, x) => n + Number(x.valor.match(/· (\d+)%/)[1]), 0);
  t.conferir('três custos iguais somam 100%, e não 99%', soma5 === 100,
    r5.composicao.map(x => x.valor).join(' + '));
  t.conferir('a sobra do arredondamento vai para um só pedaço',
    r5.composicao.map(x => x.valor.match(/· (\d+)%/)[1]).join(',') === '34,33,33',
    r5.composicao.map(x => x.valor).join(' + '));
  t.conferir('os reais de cada pedaço somam o custo do dia',
    perto(r5.c.sanDia + r5.c.moDia + r5.c.terraDia, r5.c.custoDia), String(r5.c.custoDia));
  t.conferir('a composição vem do maior para o menor',
    r1.composicao.map(x => x.nome.replace(/ \(.*/, '')).join(',') === 'Sal,Terra,Mão de obra,Sanidade',
    r1.composicao.map(x => x.nome).join(' | '));
  t.conferir('sem custo nenhum, a composição não aparece',
    r3c.composicao === null, JSON.stringify(r3c.composicao));

  // ---------- 6. retorno ao mês: juro simples, dito ----------
  t.secao('"Retorno ao mês" é juro simples, e a tela diz');
  t.conferir('o retorno ao mês é a margem dividida pelos meses',
    perto(r1.sim.retornoMensal, r1.sim.margem / r1.sim.meses), String(r1.sim.retornoMensal));
  t.conferir('o composto, elevado aos meses, devolve a margem do período',
    perto(Math.pow(1 + r1.sim.retornoMensalComposto / 100, r1.sim.meses) - 1,
      r1.sim.margem / 100, 1e-9),
    `${r1.sim.retornoMensalComposto} por ${r1.sim.meses} meses`);
  t.conferir('ganhando, o composto é MENOR que a divisão simples',
    r1.sim.margem > 0 && r1.sim.retornoMensalComposto < r1.sim.retornoMensal,
    `${r1.sim.retornoMensalComposto} < ${r1.sim.retornoMensal}`);
  t.conferir('e a tela mostra os dois, dizendo qual é qual',
    /juros simples/.test(r1.tela.simNota) && /1,80% ao mês/.test(r1.tela.simNota)
    && /aplicação financeira/.test(r1.tela.simNota), r1.tela.simNota);
  t.conferir('a nota some junto com a simulação',
    r3c.tela.simNota === '', r3c.tela.simNota);
  const r6 = await pagina.evaluate(montar({ gmd: 0.85, rend: 52, pesoCompra: 220, pesoVenda: 480,
    valorCompra: 0, precoArroba: 320 }));
  t.conferir('sem investimento, a frase não sai com travessão no meio',
    !/—%/.test(r6.tela.simHint) && /Compensa/.test(r6.tela.simHint), r6.tela.simHint);

  // ---------- 7. rendimento da compra alto demais ----------
  t.secao('rendimento impossível não vira número');
  const r7 = await pagina.evaluate(montar(Object.assign({}, COMPLETO,
    { rendCompra: 65, rendVenda: 40 })));
  t.conferir('a arroba produzida fica positiva porque o peso ganho é grande',
    r7.c.arrobaDia > 0 && r7.c.custoArroba != null, String(r7.c.arrobaDia));
  const r7b = await pagina.evaluate(montar(Object.assign({}, COMPLETO,
    { pesoVenda: 230, rendCompra: 65, rendVenda: 40 })));
  t.conferir('com ganho pequeno e rendimento invertido, não há arroba produzida',
    r7b.c.arrobaDia <= 0 && r7b.c.custoArroba === null, String(r7b.c.arrobaDia));
  t.conferir('e a tela explica em vez de mostrar número negativo',
    r7b.tela.grande === '—' && /rendimento da compra está alto demais/.test(r7b.tela.hint),
    `${r7b.tela.grande} · ${r7b.tela.hint}`);

  // ---------- 8. a varredura: as amarrações em parâmetros sorteados ----------
  t.secao(`as amarrações fecham em qualquer jogo de parâmetros (${QTD.toLocaleString('pt-BR')} sorteios)`);
  const f = await pagina.evaluate(`(function (N) {
    let _s = ${SEMENTE} >>> 0;
    const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const dec = (lo, hi, casas) => Number((lo + rnd() * (hi - lo)).toFixed(casas));
    const talvez = (prob, valor) => rnd() < prob ? valor : null;
    const DM = 365 / 12;
    const quase = (a, b, tol) => {
      if (a == null && b == null) return true;
      if (a == null || b == null) return false;
      return Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
    };
    const falhas = {};
    const regra = (nome, ok, caso) => {
      if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
    };
    const arrDe = (kg, r) => kg * (r / 100) / 15;
    for (let k = 0; k < N; k++) {
      const pc = talvez(0.8, dec(150, 400, 1));
      const p = {
        gmd: talvez(0.9, dec(0.2, 1.6, 3)),
        salPct: talvez(0.7, dec(0, 1.2, 2)),
        salPreco: talvez(0.7, dec(0.5, 12, 2)),
        sanidade: talvez(0.7, dec(0, 60, 2)),
        mo: talvez(0.7, dec(0, 120, 2)),
        terra: talvez(0.7, dec(0, 200, 2)),
        rend: talvez(0.7, dec(40, 65, 1)),
        rendCompra: talvez(0.4, dec(40, 65, 1)),
        rendVenda: talvez(0.4, dec(40, 65, 1)),
        pesoCompra: pc,
        pesoVenda: pc != null ? talvez(0.8, dec(pc - 30, pc + 320, 1)) : talvez(0.5, dec(200, 600, 1)),
        valorCompra: talvez(0.7, dec(0, 9000, 2)),
        precoArroba: talvez(0.7, dec(100, 600, 2))
      };
      custoParams = Object.assign({}, CUSTO_VAZIO, p);
      settings.yield = 52;
      const c = calcCusto();
      const sim = calcSimulacao(c);

      // --- o custo do dia é a soma exata das partes, e cada parte é a sua conta
      regra('o custo do dia é a soma das quatro parcelas',
        quase(c.custoDia, c.salDia + c.sanDia + c.moDia + c.terraDia),
        c.custoDia + ' vs ' + (c.salDia + c.sanDia + c.moDia + c.terraDia));
      regra('custo mensal vira diário sempre por 365/12',
        quase(c.sanDia, Number.isFinite(p.sanidade) ? p.sanidade / DM : 0)
        && quase(c.moDia, Number.isFinite(p.mo) ? p.mo / DM : 0)
        && quase(c.terraDia, Number.isFinite(p.terra) ? p.terra / DM : 0),
        [c.sanDia, c.moDia, c.terraDia].join(' '));
      regra('nenhuma parcela do custo é negativa',
        c.salDia >= 0 && c.sanDia >= 0 && c.moDia >= 0 && c.terraDia >= 0,
        [c.salDia, c.sanDia, c.moDia, c.terraDia].join(' '));
      regra('o peso médio é a média dos pesos informados',
        (function () {
          const ps = [p.pesoCompra, p.pesoVenda].filter(x => Number.isFinite(x) && x > 0);
          return ps.length ? quase(c.pesoMedio, ps.reduce((a, b) => a + b, 0) / ps.length)
            : c.pesoMedio === null;
        })(), String(c.pesoMedio));
      regra('o consumo de sal é a porcentagem do peso médio',
        c.pesoMedio == null ? c.salKgDia === null
          : quase(c.salKgDia, c.pesoMedio * c.salPct / 100),
        c.salKgDia + ' de ' + c.pesoMedio);
      regra('o sal do dia é consumo × preço, ou zero quando falta o preço',
        Number.isFinite(p.salPreco) && c.salKgDia != null
          ? quase(c.salDia, c.salKgDia * p.salPreco) : c.salDia === 0,
        c.salDia + '');
      // O aviso existe exatamente quando o sal foi medido, não foi precificado
      // e há conta na tela: é o que impede o custo de sumir em silêncio.
      regra('o aviso do sal aparece exatamente quando ele falta na conta',
        c.faltaSalPreco === (c.salKgDia != null && c.salKgDia > 0 && !Number.isFinite(p.salPreco)),
        'falta=' + c.faltaSalPreco);

      // --- a régua: uma só, sempre
      if (c.arrobaDia != null) {
        if (c.usouDuasPontas) {
          regra('com os dois pesos, a arroba do dia é a produzida ÷ dias',
            quase(c.arrobaDia, (arrDe(p.pesoVenda, c.rendVenda) - arrDe(p.pesoCompra, c.rendCompra))
              / ((p.pesoVenda - p.pesoCompra) / p.gmd)), String(c.arrobaDia));
        } else {
          regra('sem os dois pesos, a arroba do dia sai pelo rendimento da VENDA',
            quase(c.arrobaDia, p.gmd * c.rendVenda / 100 / 15),
            c.arrobaDia + ' vs ' + (p.gmd * c.rendVenda / 100 / 15));
        }
      }
      regra('o custo da arroba é custo do dia ÷ arroba do dia',
        c.custoArroba == null ? !(c.arrobaDia > 0 && c.custoDia > 0)
          : quase(c.custoArroba, c.custoDia / c.arrobaDia), String(c.custoArroba));
      regra('o custo da arroba nunca é negativo nem infinito',
        c.custoArroba == null || (c.custoArroba > 0 && Number.isFinite(c.custoArroba)),
        String(c.custoArroba));
      // A BASE declarada tem de reproduzir o número: é o que um conferidor com
      // calculadora faz, e era onde a tela mentia.
      const base = baseDoRendimento(c);
      if (c.custoArroba != null) {
        const citados = (base.match(/[\\d.,]+%/g) || []).map(x => Number(x.replace('%', '').replace(',', '.')));
        regra('a base declarada cita os rendimentos realmente usados',
          c.usouDuasPontas
            ? (c.rendCompra === c.rendVenda ? citados.length === 1 && quase(citados[0], c.rendVenda, 1e-6)
              : citados.length === 2 && quase(citados[0], c.rendCompra, 1e-6) && quase(citados[1], c.rendVenda, 1e-6))
            : citados.length === 1 && quase(citados[0], c.rendVenda, 1e-6),
          base + ' · usou duas pontas=' + c.usouDuasPontas);
      }

      // --- os dois caminhos do custo da arroba dão o mesmo número
      if (sim && c.custoDia > 0) {
        regra('o custo da arroba da tela e o da simulação são o mesmo número',
          quase(sim.custoArrobaProduzida, c.custoArroba),
          sim.custoArrobaProduzida + ' vs ' + c.custoArroba);
        regra('custo do período = custo do dia × dias',
          quase(sim.custoPeriodo, c.custoDia * sim.dias), String(sim.custoPeriodo));
      }

      // --- a simulação, amarrada parte por parte
      if (sim) {
        regra('dias de engorda = quilos a ganhar ÷ GMD',
          quase(sim.dias, (p.pesoVenda - p.pesoCompra) / p.gmd), String(sim.dias));
        regra('meses = dias ÷ 365/12', quase(sim.meses, sim.dias / DM), String(sim.meses));
        regra('arrobas produzidas = arrobas da venda − arrobas da compra',
          quase(sim.arrobasProduzidas, sim.arrobasVenda - sim.arrobasCompra),
          String(sim.arrobasProduzidas));
        regra('as arrobas de cada ponta são peso × rendimento ÷ 15',
          quase(sim.arrobasCompra, arrDe(p.pesoCompra, sim.rendCompra))
          && quase(sim.arrobasVenda, arrDe(p.pesoVenda, sim.rendVenda)),
          sim.arrobasCompra + ' · ' + sim.arrobasVenda);
        regra('receita = arrobas da venda × preço da arroba',
          sim.receita == null ? !(Number.isFinite(p.precoArroba) && p.precoArroba > 0)
            : quase(sim.receita, sim.arrobasVenda * p.precoArroba), String(sim.receita));
        regra('investido = valor pago + custo do período',
          sim.investido == null ? !(Number.isFinite(p.valorCompra) && p.valorCompra >= 0)
            : quase(sim.investido, p.valorCompra + sim.custoPeriodo), String(sim.investido));
        regra('resultado = receita − investido',
          sim.resultado == null ? (sim.receita == null || sim.investido == null)
            : quase(sim.resultado, sim.receita - sim.investido), String(sim.resultado));
        regra('margem = resultado ÷ investido, em porcento',
          sim.margem == null ? !(sim.resultado != null && sim.investido > 0)
            : quase(sim.margem, sim.resultado / sim.investido * 100), String(sim.margem));
        // O lucro por arroba, pelos dois jeitos, tem de devolver o resultado
        regra('lucro por @ produzida × arrobas produzidas = resultado',
          sim.lucroArrobaProduzida == null
            || quase(sim.lucroArrobaProduzida * sim.arrobasProduzidas, sim.resultado),
          String(sim.lucroArrobaProduzida));
        regra('lucro por @ vendida × arrobas vendidas = resultado',
          sim.lucroArrobaVendida == null
            || quase(sim.lucroArrobaVendida * sim.arrobasVenda, sim.resultado),
          String(sim.lucroArrobaVendida));
        regra('lucro por mês × meses = resultado',
          sim.lucroMensal == null || quase(sim.lucroMensal * sim.meses, sim.resultado),
          String(sim.lucroMensal));
        regra('@ paga na compra × arrobas da compra = valor pago',
          sim.precoArrobaCompra == null
            || quase(sim.precoArrobaCompra * sim.arrobasCompra, p.valorCompra),
          String(sim.precoArrobaCompra));
        regra('kg na compra × peso de compra = valor pago',
          sim.valorKgCompra == null || quase(sim.valorKgCompra * p.pesoCompra, p.valorCompra),
          String(sim.valorKgCompra));
        regra('kg na venda × peso de venda = receita',
          sim.valorKgVenda == null || quase(sim.valorKgVenda * p.pesoVenda, sim.receita),
          String(sim.valorKgVenda));
        regra('retorno ao mês = margem ÷ meses',
          sim.retornoMensal == null || quase(sim.retornoMensal, sim.margem / sim.meses),
          String(sim.retornoMensal));
        // A conferência do composto: elevado aos meses, devolve o período.
        regra('o retorno composto, elevado aos meses, devolve a margem do período',
          sim.retornoMensalComposto == null
            || quase(Math.pow(1 + sim.retornoMensalComposto / 100, sim.meses) - 1,
              sim.margem / 100, 1e-7),
          sim.retornoMensalComposto + ' ^ ' + sim.meses + ' vs ' + sim.margem);
        // Taxa mensal tirada de menos de um mês é extrapolação: não sai.
        regra('não há retorno composto para operação de menos de um mês',
          sim.meses >= 1 || sim.retornoMensalComposto === null,
          sim.meses + ' meses · composto ' + sim.retornoMensalComposto);
        regra('o composto fica entre zero e a divisão simples quando há ganho',
          sim.retornoMensalComposto == null || sim.margem <= 0 || sim.meses <= 1
            || (sim.retornoMensalComposto > 0 && sim.retornoMensalComposto <= sim.retornoMensal + 1e-9),
          sim.retornoMensalComposto + ' vs ' + sim.retornoMensal);
        regra('perdendo dinheiro, o resultado é negativo e a margem também',
          sim.resultado == null || sim.margem == null
            || (sim.resultado < 0) === (sim.margem < 0),
          sim.resultado + ' · ' + sim.margem);
        regra('a simulação só existe com os dois pesos e o GMD',
          Number.isFinite(p.gmd) && p.gmd > 0 && Number.isFinite(p.pesoCompra)
          && Number.isFinite(p.pesoVenda) && p.pesoVenda > p.pesoCompra, JSON.stringify(p));
      } else {
        regra('sem os dois pesos ou sem GMD, não há simulação',
          !(Number.isFinite(p.gmd) && p.gmd > 0 && Number.isFinite(p.pesoCompra) && p.pesoCompra > 0
            && Number.isFinite(p.pesoVenda) && p.pesoVenda > p.pesoCompra), JSON.stringify(p));
      }

      // --- monotonia: o que encarece tem de encarecer
      if (c.custoArroba != null && Number.isFinite(p.gmd) && p.gmd > 0) {
        const comMais = (campo, quanto) => {
          custoParams = Object.assign({}, CUSTO_VAZIO, p);
          custoParams[campo] = (Number.isFinite(p[campo]) ? p[campo] : 0) + quanto;
          const x = calcCusto();
          custoParams = Object.assign({}, CUSTO_VAZIO, p);
          return x;
        };
        regra('mais mão de obra encarece a arroba',
          comMais('mo', 10).custoArroba > c.custoArroba, String(c.custoArroba));
        regra('mais terra encarece a arroba',
          comMais('terra', 10).custoArroba > c.custoArroba, String(c.custoArroba));
        const maisGmd = comMais('gmd', 0.1);
        regra('mais GMD abarata a arroba',
          maisGmd.custoArroba == null || maisGmd.custoArroba < c.custoArroba,
          c.custoArroba + ' → ' + maisGmd.custoArroba);
      }
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} sorteios` : caso));

  // ---------- 9. a tela mostra o que a conta calculou ----------
  // Conta certa que a tela mostra arredondada para outra coisa é conta errada
  // para quem lê. Aqui a conferência é feita sobre o TEXTO dos cartões,
  // refazendo na calculadora o que o dono faria.
  t.secao('os números da tela reconciliam entre si, na calculadora');
  const lerRS = txt => Number(String(txt).replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
  const custoDiaTela = lerRS(r1.tela.custoDia);
  const custoMesTela = lerRS(r1.tela.custoMes);
  const diasArrobaTela = Number(r1.tela.diasArroba);
  const ganhoMesTela = Number(r1.tela.ganhoMes.replace(' @', '').replace(',', '.'));
  const grandeTela = lerRS(r1.tela.grande);
  t.conferir('"Custo por dia" × "Dias por @" dá o número grande',
    Math.abs(custoDiaTela * diasArrobaTela - grandeTela) < 1,
    `${custoDiaTela} × ${diasArrobaTela} = ${(custoDiaTela * diasArrobaTela).toFixed(2)} vs ${grandeTela}`);
  t.conferir('"Custo por mês" ÷ "Ganho por mês" dá o número grande',
    Math.abs(custoMesTela / ganhoMesTela - grandeTela) < 2,
    `${custoMesTela} ÷ ${ganhoMesTela} = ${(custoMesTela / ganhoMesTela).toFixed(2)} vs ${grandeTela}`);
  t.conferir('"Custo por dia" × 365/12 dá "Custo por mês"',
    Math.abs(custoDiaTela * DIAS_MES - custoMesTela) < 0.2,
    `${(custoDiaTela * DIAS_MES).toFixed(2)} vs ${custoMesTela}`);
  t.conferir('os reais da composição somam o "Custo por dia"',
    Math.abs(r1.composicao.reduce((n, x) => n + lerRS(x.valor.split('·')[0]), 0) - custoDiaTela) < 0.02,
    r1.composicao.map(x => x.valor.split('·')[0].trim()).join(' + '));
  // Remonta o caso de referência: as seções acima redesenharam a tela com
  // outros parâmetros, e ler o cartão agora seria ler número de outro jogo.
  await pagina.evaluate(montar(COMPLETO));
  const simInvestido = lerRS(await pagina.evaluate(`(function () {
    return [...document.querySelectorAll('#sim-stats .stat-card')]
      .find(e => e.querySelector('.stat-label').textContent === 'Total investido')
      .querySelector('.stat-value').textContent;
  })()`));
  t.conferir('"Total investido" bate com valor pago + custo do período',
    Math.abs(simInvestido - (2500 + custoDia * dias)) < 0.02,
    `${simInvestido} vs ${(2500 + custoDia * dias).toFixed(2)}`);

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
