// GMD mês a mês.
//
// O GMD de uma pesagem para a outra continua onde estava — é o que serve no
// curral, com o animal na balança, e não pode sair. Este aqui responde outra
// coisa: em que MÊS o gado ganhou, para comparar a seca com as águas.
//
// A conta tem duas armadilhas, e as duas dariam números que parecem certos:
//
// 1. O intervalo entre duas pesagens quase nunca cabe num mês só. Pesou em
//    janeiro e em abril: jogar o ganho inteiro em abril diria que janeiro e
//    fevereiro não renderam nada, e que abril rendeu o triplo.
// 2. A média do mês não é a média dos GMDs dos animais. Um bicho que entrou
//    no dia 29 não pode pesar o mesmo que outro que ficou os trinta dias.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('GMD mês a mês');

  t.secao('repartir os dias entre os meses');
  const dias = await pagina.evaluate(() => {
    const soma = o => Object.values(o).reduce((a, b) => a + b, 0);
    const pares = [
      ['2026-01-10', '2026-04-10'], ['2025-12-20', '2026-01-15'],
      ['2024-02-01', '2024-03-01'], ['2020-01-01', '2026-09-29'],
      ['2026-03-31', '2026-04-01'], ['2026-01-31', '2026-02-28'],
      ['2026-05-10', '2026-05-11']
    ];
    return {
      tres: diasPorMes('2026-01-10', '2026-04-10'),
      viradaAno: diasPorMes('2025-12-20', '2026-01-15'),
      bissexto: diasPorMes('2024-02-01', '2024-03-01'),
      // o caso que quebrou na primeira tentativa: começar no último dia do mês
      ultimoDia: diasPorMes('2026-01-31', '2026-02-28'),
      // nada de fechar a conta com um total diferente do intervalo
      fecha: pares.every(([i, f]) => soma(diasPorMes(i, f)) === daysBetween(i, f)),
      detalhe: pares.map(([i, f]) => `${soma(diasPorMes(i, f))}/${daysBetween(i, f)}`).join(' '),
      // intervalo invertido ou de tamanho zero não pode inventar dia
      invertido: soma(diasPorMes('2026-04-10', '2026-01-10')),
      mesmoDia: soma(diasPorMes('2026-04-10', '2026-04-10'))
    };
  });
  t.conferir('janeiro a abril reparte entre os três meses e o quarto',
    dias.tres['2026-01'] === 21 && dias.tres['2026-02'] === 28
      && dias.tres['2026-03'] === 31 && dias.tres['2026-04'] === 10,
    JSON.stringify(dias.tres));
  t.conferir('a virada do ano não perde dia',
    dias.viradaAno['2025-12'] === 11 && dias.viradaAno['2026-01'] === 15,
    JSON.stringify(dias.viradaAno));
  t.conferir('fevereiro de ano bissexto tem 29',
    dias.bissexto['2024-02'] === 28 && dias.bissexto['2024-03'] === 1,
    JSON.stringify(dias.bissexto));
  // Olhando o mês do próprio dia inicial, a conta devolvia ele mesmo quando ele
  // já era o último do mês: o passo dava zero e o intervalo parava ali.
  t.conferir('começar no último dia do mês não trava a conta',
    dias.ultimoDia['2026-02'] === 28, JSON.stringify(dias.ultimoDia));
  t.conferir('a soma dos meses é exatamente o intervalo, sempre',
    dias.fecha === true, dias.detalhe);
  t.conferir('intervalo invertido não inventa dia', dias.invertido === 0);
  t.conferir('mesmo dia dá zero', dias.mesmoDia === 0);

  t.secao('o GMD de cada mês');
  const g = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '1' }, { id: 'a2', ident: '2' }];
    weighings = [
      // 90 kg em 90 dias = 1,000 kg/dia, espalhados por jan, fev, mar e abr
      { id: 'w1', animalId: 'a1', date: '2026-01-01', weight: 300 },
      { id: 'w2', animalId: 'a1', date: '2026-04-01', weight: 390 },
      // 15 kg em 31 dias, só em março e abril
      { id: 'w3', animalId: 'a2', date: '2026-03-01', weight: 280 },
      { id: 'w4', animalId: 'a2', date: '2026-04-01', weight: 295 }
    ];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    const r = gmdPorMes();
    const m = k => r.meses.find(x => x.mes === k);
    return {
      ordem: r.meses.map(x => x.mes).join(','),
      jan: m('2026-01'), fev: m('2026-02'), mar: m('2026-03'), abr: m('2026-04'),
      intervalos: r.intervalos, misturados: r.misturados
    };
  });
  t.conferir('os meses vêm do mais novo para o mais velho',
    g.ordem === '2026-04,2026-03,2026-02,2026-01', g.ordem);
  // Janeiro só teve o primeiro animal, e ele fazia 1,000 o tempo todo.
  t.conferir('janeiro fica com os 30 dias do primeiro animal, a 1,000',
    g.jan.dias === 30 && Math.abs(g.jan.gmd - 1) < 1e-9 && g.jan.animais === 1,
    `${g.jan.dias}d ${g.jan.gmd} ${g.jan.animais}an`);
  t.conferir('fevereiro idem, com 28', g.fev.dias === 28 && Math.abs(g.fev.gmd - 1) < 1e-9,
    `${g.fev.dias}d ${g.fev.gmd}`);
  // Março junta os dois: 31 dias a 1,000 de um, e 30 dias do outro (que começou
  // no dia 1º, então conta do dia 2 em diante) carregando 15 × 30/31 kg.
  t.conferir('março soma os dias-animal dos dois bichos',
    g.mar.dias === 61 && g.mar.animais === 2, `${g.mar.dias}d ${g.mar.animais}an`);
  t.conferir('e o GMD do mês é quilo total sobre dia total',
    Math.abs(g.mar.gmd - (31 * 1 + 15 * 30 / 31) / 61) < 1e-9, String(g.mar.gmd));
  // A média dos GMDs dos dois animais daria 0,742 — e não é isso que aconteceu
  // no pasto, porque um ficou o mês todo e o outro quase todo.
  t.conferir('que NÃO é a média dos GMDs dos animais',
    Math.abs(g.mar.gmd - (1 + 15 / 31) / 2) > 1e-6,
    `${g.mar.gmd} vs ${(1 + 15 / 31) / 2}`);
  t.conferir('os dois intervalos foram contados', g.intervalos === 2, String(g.intervalos));
  t.conferir('e nenhum ficou de fora', g.misturados === 0, String(g.misturados));

  t.secao('o que não pode entrar na conta');
  const fora = await pagina.evaluate(() => {
    const out = {};
    // jejum contra cheio distorce o ganho, e num número feito para comparar
    // meses a distorção passaria por diferença de pasto
    animals = [{ id: 'j1', ident: '1' }];
    weighings = [
      { id: 'x1', animalId: 'j1', date: '2026-01-01', weight: 300, jejum: false },
      { id: 'x2', animalId: 'j1', date: '2026-02-01', weight: 330, jejum: true }
    ];
    const r1 = gmdPorMes();
    out.misturado = { meses: r1.meses.length, intervalos: r1.intervalos, fora: r1.misturados };
    weighings[1].jejum = false;
    const r2 = gmdPorMes();
    // 1º de janeiro a 1º de fevereiro cobre DOIS meses: os 30 dias de janeiro e
    // o dia 1º de fevereiro. Escrever "um mês" aqui era erro do conferidor.
    out.mesmaCondicao = { meses: r2.meses.length, fora: r2.misturados,
      jan: (r2.meses.find(x => x.mes === '2026-01') || {}).dias,
      fev: (r2.meses.find(x => x.mes === '2026-02') || {}).dias };

    // duas pesagens no MESMO dia não são intervalo
    weighings = [
      { id: 'y1', animalId: 'j1', date: '2026-01-01', weight: 300 },
      { id: 'y2', animalId: 'j1', date: '2026-01-01', weight: 305 }
    ];
    out.mesmoDia = gmdPorMes().meses.length;

    // um animal com uma pesagem só não tem ganho para repartir
    weighings = [{ id: 'z1', animalId: 'j1', date: '2026-01-01', weight: 300 }];
    out.umaSo = gmdPorMes().meses.length;

    // o gado vendido depois NÃO pode sumir do mês em que ganhou: um mês
    // fechado não muda de valor porque um boi foi vendido em seguida
    animals = [{ id: 'v1', ident: '9', sold: true, soldDate: '2026-06-01' }];
    weighings = [
      { id: 'v1a', animalId: 'v1', date: '2026-01-01', weight: 300 },
      { id: 'v1b', animalId: 'v1', date: '2026-02-01', weight: 330 }
    ];
    out.vendidoConta = gmdPorMes().meses.length === 2;

    // perder peso é um fato: o mês fica negativo em vez de ser escondido
    animals = [{ id: 'p1', ident: '8' }];
    weighings = [
      { id: 'p1a', animalId: 'p1', date: '2026-01-01', weight: 400 },
      { id: 'p1b', animalId: 'p1', date: '2026-02-01', weight: 370 }
    ];
    const rn = gmdPorMes();
    out.negativo = rn.meses[0].gmd;
    return out;
  });
  t.conferir('jejum contra cheio fica de fora', fora.misturado.meses === 0
    && fora.misturado.fora === 1 && fora.misturado.intervalos === 1,
    JSON.stringify(fora.misturado));
  t.conferir('mesma condição entra, repartida entre os meses que o intervalo cobre',
    fora.mesmaCondicao.meses === 2 && fora.mesmaCondicao.fora === 0
      && fora.mesmaCondicao.jan === 30 && fora.mesmaCondicao.fev === 1,
    JSON.stringify(fora.mesmaCondicao));
  t.conferir('duas pesagens no mesmo dia não viram intervalo', fora.mesmoDia === 0);
  t.conferir('animal com uma pesagem só não entra', fora.umaSo === 0);
  t.conferir('o gado vendido depois continua contando no mês em que ganhou',
    fora.vendidoConta === true);
  t.conferir('perder peso deixa o mês negativo, em vez de escondê-lo',
    Math.abs(fora.negativo - (-30 / 31)) < 1e-9, String(fora.negativo));

  t.secao('na tela do Rebanho');
  const tela = await pagina.evaluate(() => {
    const out = {};
    animals = [{ id: 'a1', ident: '1' }, { id: 'a2', ident: '2' }];
    weighings = [
      { id: 'w1', animalId: 'a1', date: '2026-01-01', weight: 300 },
      { id: 'w2', animalId: 'a1', date: '2026-04-01', weight: 390 },
      { id: 'w3', animalId: 'a2', date: '2026-03-01', weight: 280 },
      { id: 'w4', animalId: 'a2', date: '2026-04-01', weight: 295 }
    ];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    tab = 'bovinos'; seg = 'rebanho'; render();
    out.visivel = !$('bov-gmd-mes').hidden;
    out.texto = $('bov-gmd-mes-lista').innerText.replace(/\n/g, ' | ');
    out.nota = $('bov-gmd-mes-nota').innerText;
    out.linhas = $('bov-gmd-mes-lista').querySelectorAll('.gm-linha').length;
    // o GMD de pesagem para pesagem NÃO pode ter sumido: é o do curral
    out.gmdMedioCartao = /GMD MÉDIO/i.test($('bov-stats').innerText);
    detailAnimal = 'a1'; render();
    out.detalheTemGmd = /GMD TOTAL/i.test($('animal-header').innerText)
      && /GMD RECENTE/i.test($('animal-header').innerText);
    detailAnimal = null;

    // jejum misturado é anunciado
    weighings[1].jejum = true; render();
    out.avisaJejum = /jejum com cheio/.test($('bov-gmd-mes-nota').innerText);
    weighings[1].jejum = false;

    // sem pesagem, o bloco some em vez de mostrar caixa vazia
    weighings = []; render();
    out.someSemDado = $('bov-gmd-mes').hidden;
    return out;
  });
  t.conferir('o bloco aparece quando há pesagem', tela.visivel === true);
  t.conferir('com uma linha por mês, do mais novo ao mais velho',
    tela.linhas === 4 && /abr\/26/.test(tela.texto) && /jan\/26/.test(tela.texto),
    tela.texto);
  t.conferir('a nota explica que o ganho é espalhado pelos dias',
    /espalhado pelos dias/.test(tela.nota), tela.nota.slice(0, 80));
  // Era o pedido explícito: o mês a mês entra SEM tirar o que já servia no curral.
  t.conferir('o GMD médio do rebanho continua nos cartões', tela.gmdMedioCartao === true);
  t.conferir('e o GMD total e o recente continuam no detalhe do animal',
    tela.detalheTemGmd === true);
  t.conferir('intervalo de jejum misturado é anunciado na nota', tela.avisaJejum === true);
  t.conferir('sem pesagem nenhuma, o bloco some', tela.someSemDado === true);

  t.secao('no relatório que vai para o sócio');
  const rel = await pagina.evaluate(() => {
    animals = [{ id: 'r1', ident: '1' }];
    weighings = [
      { id: 'rw1', animalId: 'r1', date: '2026-01-01', weight: 300 },
      { id: 'rw2', animalId: 'r1', date: '2026-03-01', weight: 360 }
    ];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    let texto = null;
    const orig = window.download;
    window.download = (n, c) => { texto = c; };
    $('menu-exp-relatorio').click();
    window.download = orig;
    const linhas = texto.split('\n').filter(l => l.startsWith('GMD mês a mês'));
    return { n: linhas.length, linhas: linhas.join(' || ') };
  });
  // 1º de janeiro a 1º de março cobre janeiro, fevereiro e março.
  t.conferir('o relatório traz uma linha por mês que o intervalo cobriu',
    rel.n === 3, `${rel.n}: ${rel.linhas}`);
  t.conferir('do mais novo para o mais velho', /mar\/26/.test(rel.linhas.split(' || ')[0]),
    rel.linhas.split(' || ')[0]);
  t.conferir('com o GMD, os animais, os dias e os quilos',
    /animal\(is\)/.test(rel.linhas) && /dias-animal/.test(rel.linhas)
      && /kg/.test(rel.linhas) && /1,017/.test(rel.linhas),
    rel.linhas);

  // ---------- o rebanho de uma pesagem para a outra ----------
  // Os números que existiam eram por ANIMAL: o GMD daquele bicho, do começo ao
  // fim ou da penúltima para a última. Faltava a leitura do REBANHO — a que se
  // faz no curral olhando o lote, e a do começo de tudo até agora.
  t.secao('rodadas: o curral não pesa tudo no mesmo dia');
  const rod = await pagina.evaluate(() => {
    weighings = [
      { id: 'r1', animalId: 'x', date: '2026-03-10', weight: 1 },
      { id: 'r2', animalId: 'y', date: '2026-03-11', weight: 1 },   // mesmo mutirão
      { id: 'r3', animalId: 'z', date: '2026-03-12', weight: 1 },   // idem
      { id: 'r4', animalId: 'x', date: '2026-06-10', weight: 1 },   // outra pesagem
      { id: 'r5', animalId: 'x', date: '2026-06-25', weight: 1 }    // 15 dias: outra
    ];
    animals = [];
    return {
      rodadas: rodadasDePesagem().map(r => `${r.ini}..${r.fim}`),
      achaDentro: rodadaDe(rodadasDePesagem(), '2026-03-11'),
      achaFora: rodadaDe(rodadasDePesagem(), '2026-04-01')
    };
  });
  t.conferir('dias de curral seguidos viram UMA pesagem',
    rod.rodadas[0] === '2026-03-10..2026-03-12', rod.rodadas.join(' '));
  t.conferir('e datas distantes viram pesagens separadas',
    rod.rodadas.length === 3, rod.rodadas.join(' '));
  t.conferir('uma data cai na rodada dela', rod.achaDentro === 0, String(rod.achaDentro));
  t.conferir('e uma data sem rodada não é forçada em nenhuma',
    rod.achaFora === -1, String(rod.achaFora));

  t.secao('o GMD do rebanho em cada pesagem');
  const ent = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '1' }, { id: 'a2', ident: '2' }, { id: 'a3', ident: '3' }];
    weighings = [
      { id: 'w1', animalId: 'a1', date: '2026-03-10', weight: 300 },
      { id: 'w2', animalId: 'a2', date: '2026-03-10', weight: 280 },
      { id: 'w3', animalId: 'a3', date: '2026-03-11', weight: 320 },
      { id: 'w4', animalId: 'a1', date: '2026-06-10', weight: 390 },
      { id: 'w5', animalId: 'a2', date: '2026-06-10', weight: 350 },
      // a3 FALTOU ao mutirão de junho
      { id: 'w6', animalId: 'a1', date: '2026-09-10', weight: 450 },
      { id: 'w7', animalId: 'a2', date: '2026-09-11', weight: 410 },
      { id: 'w8', animalId: 'a3', date: '2026-09-11', weight: 440 }
    ];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    const r = gmdEntrePesagens();
    const g = gmdGeralRebanho();
    return {
      linhas: r.linhas.map(l => ({ fim: l.fim, gmd: l.gmd, an: l.animais, dias: l.dias })),
      geral: { gmd: g.gmd, n: g.n, kg: g.kg, dias: g.dias, de: g.primeira, ate: g.ultima },
      misturados: r.misturados
    };
  });
  t.conferir('uma linha por pesagem que fechou ganho',
    ent.linhas.length === 2, String(ent.linhas.length));
  t.conferir('da mais recente para a mais antiga',
    ent.linhas[0].fim === '2026-09-11' && ent.linhas[1].fim === '2026-06-10',
    ent.linhas.map(l => l.fim).join(','));
  // junho: a1 fez 90 kg em 92 dias, a2 fez 70 em 92 → 160/184
  t.conferir('a pesagem de junho junta os dois que vieram',
    ent.linhas[1].an === 2 && ent.linhas[1].dias === 184
      && Math.abs(ent.linhas[1].gmd - 160 / 184) < 1e-9,
    JSON.stringify(ent.linhas[1]));
  // O boi que faltou a junho não se perde: o intervalo dele fecha em setembro,
  // carregando os 184 dias que ele passou sem subir na balança.
  t.conferir('o animal que faltou a uma pesagem entra na seguinte, inteiro',
    ent.linhas[0].an === 3 && ent.linhas[0].dias === 369
      && Math.abs(ent.linhas[0].gmd - 240 / 369) < 1e-9,
    JSON.stringify(ent.linhas[0]));

  t.secao('do começo até a pesagem mais recente');
  // Cada bicho entrou num dia: medir o tempo de um pelo calendário do outro
  // inventaria dias em que ele nem estava aqui.
  t.conferir('soma o ganho de cada animal do primeiro ao último peso dele',
    Math.abs(ent.geral.kg - 400) < 1e-9, String(ent.geral.kg));
  t.conferir('e os dias de cada um, não a distância entre a 1ª e a última data',
    ent.geral.dias === 553, String(ent.geral.dias));
  t.conferir('o GMD geral é quilo total sobre dia-animal total',
    Math.abs(ent.geral.gmd - 400 / 553) < 1e-9, String(ent.geral.gmd));
  t.conferir('com os três animais na conta', ent.geral.n === 3, String(ent.geral.n));
  t.conferir('e as datas das pontas', ent.geral.de === '2026-03-10' && ent.geral.ate === '2026-09-11',
    `${ent.geral.de} a ${ent.geral.ate}`);

  t.secao('na tela, sem tirar o que já havia');
  const telaP = await pagina.evaluate(() => {
    const out = {};
    tab = 'bovinos'; seg = 'rebanho'; render();
    out.visivel = !$('bov-gmd-pes').hidden;
    out.cabeca = $('bov-gmd-geral').innerText.replace(/\n/g, ' | ');
    out.linhas = $('bov-gmd-pes-lista').querySelectorAll('.gm-linha').length;
    out.texto = $('bov-gmd-pes-lista').innerText.replace(/\n/g, ' | ');
    out.nota = $('bov-gmd-pes-nota').innerText;
    // os três números por ANIMAL continuam onde estavam
    out.cartao = /GMD MÉDIO/i.test($('bov-stats').innerText);
    out.mesAMes = !$('bov-gmd-mes').hidden;
    detailAnimal = 'a1'; render();
    out.detalhe = /GMD TOTAL/i.test($('animal-header').innerText)
      && /GMD RECENTE/i.test($('animal-header').innerText);
    detailAnimal = null;
    // jejum misturado é anunciado
    weighings[5].jejum = true; render();
    out.avisaJejum = /jejum e cheio/.test($('bov-gmd-pes-nota').innerText);
    weighings[5].jejum = false;
    // sem pesagem, o bloco some
    weighings = []; render();
    out.some = $('bov-gmd-pes').hidden;
    return out;
  });
  t.conferir('o bloco aparece', telaP.visivel === true);
  t.conferir('com o número do começo até agora em destaque',
    /Da 1ª pesagem/.test(telaP.cabeca) && /0,723/.test(telaP.cabeca), telaP.cabeca);
  t.conferir('e uma linha por pesagem, com a data do mutirão',
    telaP.linhas === 2 && /10\/09\/26–11\/09\/26/.test(telaP.texto), telaP.texto);
  // A nota precisa explicar por que este número não bate com o cartão de cima:
  // dois números parecidos que discordam, sem explicação, é pior que um só.
  t.conferir('a nota explica a diferença para o cartão "GMD médio"',
    /média dos animais, um a um/.test(telaP.nota), telaP.nota.slice(-160));
  t.conferir('o cartão GMD médio continua lá', telaP.cartao === true);
  t.conferir('o bloco mês a mês continua lá', telaP.mesAMes === true);
  t.conferir('e o GMD total e recente do animal também', telaP.detalhe === true);
  t.conferir('jejum misturado é anunciado', telaP.avisaJejum === true);
  t.conferir('sem pesagem, o bloco some', telaP.some === true);

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
