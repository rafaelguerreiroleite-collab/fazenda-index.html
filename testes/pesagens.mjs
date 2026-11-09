// AUDITORIA DAS PESAGENS E DA ARROBA — ITEM POR ITEM.
//
// Pedido do dono: varredura na aba de pesagens e nos cálculos de arroba, item
// por item, procurando erro.
//
// O peso é o número mais digitado deste aplicativo e o que tem a consequência
// mais longa: ele vira GMD, vira arroba, vira o valor do rebanho e vira decisão
// de venda. Um erro ali não erra sozinho.
//
// DOIS DEFEITOS ACHADOS, os dois medidos no aplicativo rodando:
//
// 1. A TRAVA CONTRA ERRO DE DIGITAÇÃO EXISTIA EM DUAS DAS QUATRO PORTAS.
//    O curral confere a plausibilidade do peso antes de gravar, e a importação
//    de planilha também. A ficha do animal e o peso de entrada do cadastro não
//    conferiam nada. Medido: 2.100 kg numa novilha de 210 entravam em silêncio
//    pela ficha, com "Pesagem salva" na tela. Oito quilos também.
//
// 2. A FÓRMULA DA ARROBA ESTAVA ESCRITA À MÃO EM SEIS LUGARES.
//    peso × rendimento ÷ 15, copiada no cartão do rebanho, em dois pontos da
//    mortalidade, na ficha do animal e na prévia do curral, além da função
//    oficial. As seis concordavam — sorte mantida à mão. A regra escrita no
//    próprio código diz o que isso vira: duas cópias da conta é como uma delas
//    passa a mentir sem ninguém descobrir qual.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.PESAGENS_QTD || 500);
const SEMENTE = Number(process.env.SEMENTE_PESAGENS || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Auditoria das pesagens e da arroba (${QTD.toLocaleString('pt-BR')} sorteios · semente ${SEMENTE})`);

  // Toda pergunta do aplicativo passa por aqui, para que a bateria cobre o
  // TEXTO: aviso que não diz o que está errado não serve para quem está com o
  // gado na balança.
  let dialogos = [];
  let responder = true;
  pagina.on('dialog', async d => {
    dialogos.push({ tipo: d.type(), msg: d.message() });
    responder ? await d.accept() : await d.dismiss();
  });

  const SEMEAR = `(function () {
    const diasAtras = n => { const d = new Date(todayISO() + 'T12:00');
      d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    animals = [{ id: 'a1', ident: '292', cat: 'Novilha' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: diasAtras(60), weight: 210, jejum: false }];
    bovT = []; avT = []; gerT = []; items = []; moves = []; rebmov = [];
    extraT = {}; atividades = [];
    settings.yield = 50;
    pendentes = []; guardarFila();
    recomputarLivros(); tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
    document.getElementById('toast').hidden = true;
  })()`;

  const estado = `(function () {
    const ws = weighings.filter(w => w.animalId === 'a1').sort((a, b) => a.date.localeCompare(b.date));
    return { n: ws.length, pesos: ws.map(w => w.weight).join(','),
      toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent };
  })()`;

  async function porta(qual, peso, { aceitar = true } = {}) {
    await pagina.evaluate(SEMEAR);
    dialogos = []; responder = aceitar;
    if (qual === 'ficha') {
      await pagina.evaluate(`(function (p) {
        openWeighing('a1');
        document.getElementById('w-weight').value = String(p);
        document.getElementById('form-weighing').dispatchEvent(new Event('submit', { cancelable: true }));
      })(${peso})`);
    } else if (qual === 'curral') {
      await pagina.evaluate(`(function (p) {
        openWeighMode();
        document.getElementById('wm-ident').value = '292';
        document.getElementById('wm-peso').value = String(p);
        document.getElementById('wm-save').click();
        document.getElementById('weigh-mode').hidden = true;
      })(${peso})`);
    } else if (qual === 'cadastro') {
      await pagina.evaluate(`(function (p) {
        const diasAtras = n => { const d = new Date(todayISO() + 'T12:00');
          d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
        openAnimal(animals[0]);
        document.getElementById('an-entry-date').value = diasAtras(90);
        document.getElementById('an-entry-weight').value = String(p);
        document.getElementById('form-animal').dispatchEvent(new Event('submit', { cancelable: true }));
      })(${peso})`);
    }
    await pagina.waitForTimeout(220);
    const e = await pagina.evaluate(estado);
    return Object.assign(e, { avisos: dialogos.slice(),
      aviso: (dialogos.filter(x => x.tipo === 'confirm')[0] || {}).msg || '' });
  }

  // ---------- 1. as quatro portas por onde um peso entra ----------
  t.secao('todo peso passa pela mesma trava, venha por onde vier');
  const PORTAS = [['curral', 'curral'], ['ficha', 'ficha do animal'], ['cadastro', 'peso de entrada']];
  for (const [qual, rot] of PORTAS) {
    const gordo = await porta(qual, 2100);
    t.conferir(`${rot}: 2.100 kg num bovino é barrado para conferência`,
      /CONFIRA/.test(gordo.aviso) && /fora do esperado para um bovino/.test(gordo.aviso),
      gordo.aviso.replace(/\n/g, ' | ') || 'nenhum aviso');
    const magro = await porta(qual, 8);
    t.conferir(`${rot}: 8 kg também`,
      /fora do esperado para um bovino/.test(magro.aviso),
      magro.aviso.replace(/\n/g, ' | ') || 'nenhum aviso');
    const bom = await porta(qual, 245);
    t.conferir(`${rot}: 245 kg passa sem incomodar ninguém`,
      bom.aviso === '', bom.aviso.replace(/\n/g, ' | '));
    const recusado = await porta(qual, 2100, { aceitar: false });
    t.conferir(`${rot}: recusando a confirmação, nada é gravado`,
      !recusado.pesos.split(',').includes('2100'), recusado.pesos);
  }

  // O ganho impossível por dia: dentro da faixa de peso, fora da faixa de ganho.
  t.secao('ganho por dia impossível também é barrado');
  const salto = await porta('ficha', 400);   // 210 → 400 kg em 60 dias = 3,17/dia
  t.conferir('a ficha do animal barra 3,17 kg por dia',
    /kg por dia/.test(salto.aviso) && /alto demais/i.test(salto.aviso),
    salto.aviso.replace(/\n/g, ' | ') || 'nenhum aviso');
  const salto2 = await porta('curral', 400);
  t.conferir('e o curral barra o mesmo caso, com o mesmo texto',
    /kg por dia/.test(salto2.aviso) && /alto demais/i.test(salto2.aviso),
    salto2.aviso.replace(/\n/g, ' | ') || 'nenhum aviso');
  const queda = await porta('ficha', 100);   // perde 110 kg em 60 dias = −1,83/dia
  t.conferir('e barra a perda de peso grande demais',
    /Perda de peso muito grande/.test(queda.aviso),
    queda.aviso.replace(/\n/g, ' | ') || 'nenhum aviso');

  // ---------- 2. a arroba tem uma definição só ----------
  // A conferência não lê o código: ela cobra que TODA tela que mostra arroba
  // mostre exatamente peso × rendimento ÷ 15, com o rendimento do Rebanho.
  t.secao('a arroba é a mesma conta em toda tela que a mostra');
  const arro = await pagina.evaluate(`(function () {
    const diasAtras = n => { const d = new Date(todayISO() + 'T12:00');
      d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    animals = [
      { id: 'a1', ident: '292', cat: 'Novilha' },
      { id: 'a2', ident: '300', cat: 'Novilha' },
      { id: 'am', ident: '400', cat: 'Novilha', dead: true, deadDate: diasAtras(5), deadCause: 'cobra' }
    ];
    weighings = [
      { id: 'w1', animalId: 'a1', date: diasAtras(60), weight: 210, jejum: false },
      { id: 'w2', animalId: 'a1', date: diasAtras(10), weight: 260, jejum: false },
      { id: 'w3', animalId: 'a2', date: diasAtras(10), weight: 318, jejum: false },
      { id: 'w4', animalId: 'am', date: diasAtras(20), weight: 275, jejum: false }
    ];
    bovT = []; items = []; moves = []; rebmov = [];
    settings.yield = 53;
    recomputarLivros();
    const lerArroba = txt => Number(String(txt).replace(' @', '').replace(/\\./g, '').replace(',', '.'));
    const cartao = (sel, rot) => { const e = [...document.querySelectorAll(sel + ' .stat-card')]
      .find(x => x.querySelector('.stat-label').textContent === rot);
      return e ? e.querySelector('.stat-value').textContent.trim() : null; };
    // cartões do rebanho
    tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
    const mediaCartao = cartao('#bov-stats', 'Média em @');
    const totalCartao = cartao('#bov-stats', 'Total do rebanho');
    // ficha do animal
    detailAnimal = 'a1'; render();
    const fichaTxt = document.querySelector('#animal-header .meta').textContent;
    const fichaArroba = (fichaTxt.match(/~([\\d.,]+) @/) || [])[1];
    detailAnimal = null;
    // mortalidade
    seg = 'mortes'; render();
    const mortCartao = cartao('#mortes-stats2', 'Arrobas perdidas');
    const mortLinha = document.querySelector('#mortes-list .item-side .aux').textContent.trim();
    // prévia do curral
    seg = 'rebanho'; render();
    openWeighMode();
    document.getElementById('wm-ident').value = '292';
    document.getElementById('wm-peso').value = '260';
    atualizarPreviaPesagem();
    const previa = document.querySelector('#wm-previa .wp-lado').textContent;
    const previaArroba = (previa.match(/([\\d.,]+) @/) || [])[1];
    document.getElementById('weigh-mode').hidden = true;
    return {
      rend: settings.yield,
      esperadoMedia: arrobasDe((260 + 318) / 2, 53),
      esperadoTotal: arrobasDe(260 + 318, 53),
      esperadoFicha: arrobasDe(260, 53),
      esperadoMorte: arrobasDe(275, 53),
      mediaCartao: lerArroba(mediaCartao), totalCartao: lerArroba(totalCartao),
      fichaArroba: lerArroba(fichaArroba), mortCartao: lerArroba(mortCartao),
      mortLinha: lerArroba(mortLinha), previaArroba: lerArroba(previaArroba)
    };
  })()`);
  const perto1 = (a, b) => Math.abs(a - b) < 0.06;   // os textos saem com 1 casa
  t.conferir('o cartão "Média em @" é peso médio × rendimento ÷ 15',
    perto1(arro.mediaCartao, arro.esperadoMedia), `${arro.mediaCartao} vs ${arro.esperadoMedia}`);
  t.conferir('o cartão "Total do rebanho" é o peso somado pela mesma conta',
    Math.abs(arro.totalCartao - arro.esperadoTotal) < 0.6,
    `${arro.totalCartao} vs ${arro.esperadoTotal}`);
  t.conferir('a ficha do animal usa a mesma conta',
    perto1(arro.fichaArroba, arro.esperadoFicha), `${arro.fichaArroba} vs ${arro.esperadoFicha}`);
  t.conferir('a mortalidade usa a mesma conta, no cartão',
    perto1(arro.mortCartao, arro.esperadoMorte), `${arro.mortCartao} vs ${arro.esperadoMorte}`);
  t.conferir('e na linha de cada animal morto',
    perto1(arro.mortLinha, arro.esperadoMorte), `${arro.mortLinha} vs ${arro.esperadoMorte}`);
  t.conferir('a prévia do curral usa a mesma conta, com o animal na balança',
    perto1(arro.previaArroba, arro.esperadoFicha), `${arro.previaArroba} vs ${arro.esperadoFicha}`);

  // Mudar o rendimento tem de mover TODAS juntas: se uma ficasse para trás,
  // seria exatamente a cópia que passou a mentir.
  const mexendo = await pagina.evaluate(`(function () {
    const lerArroba = txt => Number(String(txt).replace(' @', '').replace(/\\./g, '').replace(',', '.'));
    const cartao = rot => { const e = [...document.querySelectorAll('#bov-stats .stat-card')]
      .find(x => x.querySelector('.stat-label').textContent === rot);
      return e ? lerArroba(e.querySelector('.stat-value').textContent) : null; };
    const medir = r => {
      settings.yield = r;
      tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
      const total = cartao('Total do rebanho');
      detailAnimal = 'a1'; render();
      const ficha = lerArroba((document.querySelector('#animal-header .meta').textContent
        .match(/~([\\d.,]+) @/) || [])[1]);
      detailAnimal = null; seg = 'mortes'; render();
      const morte = lerArroba(document.querySelector('#mortes-list .item-side .aux').textContent);
      seg = 'rebanho'; render();
      return { total, ficha, morte };
    };
    const a = medir(50), b = medir(60);
    return { a, b, razao: 60 / 50 };
  })()`);
  t.conferir('subindo o rendimento de 50% para 60%, as três telas sobem na mesma proporção',
    Math.abs(mexendo.b.ficha / mexendo.a.ficha - mexendo.razao) < 0.02
    && Math.abs(mexendo.b.morte / mexendo.a.morte - mexendo.razao) < 0.02
    && Math.abs(mexendo.b.total / mexendo.a.total - mexendo.razao) < 0.02,
    JSON.stringify(mexendo));

  // ---------- 3. a tabela de pesagens do animal, linha por linha ----------
  t.secao('a tabela do animal: cada linha e o cabeçalho contam a mesma história');
  const tab1 = await pagina.evaluate(`(function () {
    const diasAtras = n => { const d = new Date(todayISO() + 'T12:00');
      d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    animals = [{ id: 'a1', ident: '292', cat: 'Novilha' }];
    weighings = [
      { id: 'w1', animalId: 'a1', date: diasAtras(90), weight: 200, jejum: false },
      { id: 'w2', animalId: 'a1', date: diasAtras(60), weight: 230, jejum: false },
      { id: 'w3', animalId: 'a1', date: diasAtras(60), weight: 231, jejum: false },  // mesmo dia
      { id: 'w4', animalId: 'a1', date: diasAtras(20), weight: 275, jejum: true }    // jejum: mistura
    ];
    settings.yield = 50;
    recomputarLivros(); tab = 'bovinos'; seg = 'rebanho'; detailAnimal = 'a1'; render();
    const linhas = [...document.querySelectorAll('#weighings-table .wt-row')].map(r => ({
      data: r.querySelector('.date').textContent.trim(),
      peso: r.querySelector('.weight').textContent.trim(),
      jejum: r.querySelector('.flag').textContent.trim(),
      gmd: r.querySelector('.gmd').textContent.trim(),
      misto: !!r.querySelector('.gmd[title]')
    }));
    const met = [...document.querySelectorAll('#animal-header .metric')].map(m => ({
      rot: m.querySelector('.lbl').textContent, val: m.querySelector('.val').textContent.trim() }));
    const ws = wOf('a1');
    detailAnimal = null;
    return { linhas, met, gmdTotalCru: gmdTotal(ws), gmdRecenteCru: gmdRecent(ws),
      grafico: !!document.querySelector('#chart-wrap svg') };
  })()`);
  t.conferir('a tabela vem do mais novo para o mais antigo',
    tab1.linhas.length === 4 && tab1.linhas[0].peso === '275,0 kg'
    && tab1.linhas[3].peso === '200,0 kg',
    tab1.linhas.map(l => l.peso).join(' | '));
  t.conferir('a primeira pesagem diz "1ª pesagem", e não travessão',
    tab1.linhas[3].gmd === '1ª pesagem', tab1.linhas[3].gmd);
  // A tabela sai do mais novo para o mais antigo, então a linha de índice 1 é a
  // segunda pesagem do mesmo dia e a de índice 2 é a do intervalo de 30 dias.
  // Escrevi ao contrário na primeira versão deste conferidor; o aplicativo
  // estava certo, e os números saem da própria fixtura para não haver chute.
  t.conferir('duas pesagens no mesmo dia dizem "mesmo dia"',
    tab1.linhas[1].gmd === 'mesmo dia', tab1.linhas[1].gmd);
  t.conferir('a linha do intervalo traz o ganho por dia dele',
    tab1.linhas[2].gmd === '1,000', tab1.linhas[2].gmd);   // 230−200 em 30 dias
  t.conferir('a linha em jejum é marcada e avisada como comparação misturada',
    tab1.linhas[0].jejum === 'jejum' && tab1.linhas[0].misto
    && /⚠/.test(tab1.linhas[0].gmd), JSON.stringify(tab1.linhas[0]));
  t.conferir('o cabeçalho mostra o peso atual da última pesagem',
    tab1.met[0].val === '275 kg', tab1.met[0].val);
  // 200 kg há 90 dias → 275 kg há 20 dias: 75 kg em 70 dias = 1,0714.
  t.conferir('o GMD total do cabeçalho é o da primeira à última pesagem',
    tab1.met[1].val === '1,071' && Math.abs(tab1.gmdTotalCru - 75 / 70) < 1e-9,
    `${tab1.met[1].val} · cru ${tab1.gmdTotalCru}`);
  t.conferir('e o GMD recente é só o do último intervalo, não o da vida toda',
    tab1.met[2].val === '1,100' && Math.abs(tab1.gmdRecenteCru - 44 / 40) < 1e-9,
    `${tab1.met[2].val} · cru ${tab1.gmdRecenteCru}`);
  t.conferir('o gráfico é desenhado quando há duas pesagens ou mais',
    tab1.grafico, String(tab1.grafico));

  // ---------- 4. varredura: as identidades do GMD e da arroba ----------
  t.secao(`as identidades fecham em qualquer histórico (${QTD.toLocaleString('pt-BR')} sorteios)`);
  const f = await pagina.evaluate(`(function (N) {
    let _s = ${SEMENTE} >>> 0;
    const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const p2 = x => String(x).padStart(2, '0');
    const falhas = {};
    const regra = (nome, ok, caso) => {
      if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
    };
    const quase = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
    for (let k = 0; k < N; k++) {
      const rend = ent(40, 65);
      settings.yield = rend;
      animals = []; weighings = [];
      const nA = ent(1, 8);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        animals.push({ id: id, ident: 'T' + i, cat: 'Novilha' });
        const nW = ent(0, 5);
        let peso = ent(150, 400);
        for (let j = 0; j < nW; j++) {
          peso += ent(-20, 60);
          weighings.push({ id: id + 'w' + j, animalId: id,
            date: '2026-' + p2(ent(1, 10)) + '-' + p2(ent(1, 28)),
            weight: Math.max(20, peso), jejum: rnd() < 0.2 });
        }
      }
      recomputarLivros();
      // --- a arroba é sempre a mesma conta
      const kg = ent(50, 900);
      regra('a arroba é peso × rendimento ÷ 15, sem exceção',
        quase(arrobasDe(kg, rend), kg * rend / 100 / 15), kg + ' a ' + rend + '%');
      regra('arroba de zero é zero, e nunca negativa para peso positivo',
        arrobasDe(0, rend) === 0 && arrobasDe(kg, rend) > 0, String(arrobasDe(kg, rend)));
      regra('dobrar o peso dobra a arroba',
        quase(arrobasDe(kg * 2, rend), arrobasDe(kg, rend) * 2), String(kg));
      regra('dobrar o rendimento dobra a arroba',
        quase(arrobasDe(kg, rend * 2), arrobasDe(kg, rend) * 2), String(rend));
      // --- o GMD de cada animal, por todos os caminhos
      animals.forEach(a => {
        const ws = wOf(a.id);
        regra('as pesagens de um animal saem sempre em ordem de data',
          ws.every((w, i) => i === 0 || ws[i - 1].date <= w.date), a.id);
        if (ws.length < 2) {
          regra('com menos de duas pesagens não há GMD',
            !Number.isFinite(gmdTotal(ws)) && !Number.isFinite(gmdRecent(ws)), a.id);
          return;
        }
        const p = ws[0], u = ws[ws.length - 1];
        const d = daysBetween(p.date, u.date);
        if (d > 0) {
          regra('o GMD total é (último − primeiro) ÷ dias entre eles',
            quase(gmdTotal(ws), (u.weight - p.weight) / d),
            gmdTotal(ws) + ' vs ' + ((u.weight - p.weight) / d));
        } else {
          regra('primeira e última no mesmo dia não produzem GMD',
            !Number.isFinite(gmdTotal(ws)), String(gmdTotal(ws)));
        }
        const ant = ws[ws.length - 2];
        const dr = daysBetween(ant.date, u.date);
        if (dr > 0) {
          regra('o GMD recente é o do último intervalo',
            quase(gmdRecent(ws), (u.weight - ant.weight) / dr),
            gmdRecent(ws) + ' vs ' + ((u.weight - ant.weight) / dr));
          regra('e é o mesmo que gmdBetween das duas últimas',
            quase(gmdRecent(ws), gmdBetween(ant, u)), String(gmdRecent(ws)));
        }
        // A soma dos trechos tem de dar o todo: quilo ganho e dias somados
        // trecho a trecho reconstroem a primeira-à-última. É a amarração que
        // pega intervalo contado em dobro ou intervalo que some.
        let kgSoma = 0, diasSoma = 0;
        for (let i = 1; i < ws.length; i++) {
          kgSoma += ws[i].weight - ws[i - 1].weight;
          diasSoma += daysBetween(ws[i - 1].date, ws[i].date);
        }
        regra('a soma dos trechos reconstrói o ganho total',
          quase(kgSoma, u.weight - p.weight), kgSoma + ' vs ' + (u.weight - p.weight));
        regra('e a soma dos dias dos trechos reconstrói o período',
          quase(diasSoma, d), diasSoma + ' vs ' + d);
      });
      // --- a trava de plausibilidade, nas bordas exatas
      regra('peso na borda de baixo não é acusado', pesagemSuspeita('x', 20, null, null, 0) === null, '20 kg');
      regra('peso abaixo da borda é acusado', pesagemSuspeita('x', 19.9, null, null, 0) !== null, '19,9 kg');
      regra('peso na borda de cima não é acusado', pesagemSuspeita('x', 1500, null, null, 0) === null, '1500 kg');
      regra('peso acima da borda é acusado', pesagemSuspeita('x', 1500.1, null, null, 0) !== null, '1500,1 kg');
      const ontem = { weight: 300, date: '2026-01-01', jejum: false };
      regra('ganho de 2,5 kg/dia ainda passa',
        pesagemSuspeita('x', 300 + 2.5 * 30, 2.5, ontem, 30) === null, '2,5');
      regra('ganho acima de 2,5 kg/dia é acusado',
        pesagemSuspeita('x', 300 + 2.6 * 30, 2.6, ontem, 30) !== null, '2,6');
      regra('perda de 1 kg/dia ainda passa',
        pesagemSuspeita('x', 300 - 1 * 30, -1, ontem, 30) === null, '-1');
      regra('perda acima de 1 kg/dia é acusada',
        pesagemSuspeita('x', 300 - 1.1 * 30, -1.1, ontem, 30) !== null, '-1,1');
      regra('em intervalo curto a conferência é pela variação, não pelo GMD',
        pesagemSuspeita('x', 300 * 1.2, 60, ontem, 1) !== null
        && pesagemSuspeita('x', 300 * 1.1, 30, ontem, 1) === null, 'curto');
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} sorteios` : caso));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
