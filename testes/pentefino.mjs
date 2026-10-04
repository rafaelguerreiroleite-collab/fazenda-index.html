// Pente fino nos números da pesagem, antes de um dia de curral de verdade.
//
// O dono avisou que ia pesar o rebanho nesta semana e decidir venda com o que
// a tela mostrasse. Fui procurar erro que não quebra nada — o tipo que não
// aparece em teste nenhum porque a tela continua bonita e o número continua
// plausível. Achei dois, e os dois mudavam decisão.
//
// ACHADO 1 — jejum comparado com cheio, sem aviso, na LISTA.
// Dois animais com 452 kg hoje. Um foi pesado em JEJUM na primeira vez
// (380 kg), o outro CHEIO (400 kg). A lista mostrava GMD 0,78 para o primeiro
// e 0,57 para o segundo: 38% de diferença que não existe no pasto, só o rúmen.
// Na tela onde se escolhe quem vende, isso guarda o animal errado. O bloco
// "GMD do rebanho" já deixava essa comparação de fora; a lista e o cartão
// "GMD médio" não deixavam — três números discordando na mesma tela.
//
// ACHADO 2 — animal sem pesagem some do total, calado.
// "ANIMAIS 10" em cima de "TOTAL DO REBANHO 94 @" lê-se como o rebanho
// inteiro. Com 4 de 10 sem passar na balança, o total some 40% e nada na tela
// diz de onde veio a diferença. Para quem vai negociar um lote pelo total de
// arrobas, é o número errado na boca.
import { servir, abrirApp, placar } from './apoio.mjs';

const naLista = ident => {
  const el = [...document.querySelectorAll('#animal-list [data-animal]')]
    .find(e => e.querySelector('.item-title').textContent === ident);
  if (!el) return null;
  const aux = el.querySelector('.aux');
  return { texto: aux.textContent.trim(), classe: aux.className, titulo: aux.getAttribute('title') || '' };
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Pente fino na pesagem');

  // ---------- jejum × cheio ----------
  t.secao('comparação entre jejum e cheio');
  const misto = await pagina.evaluate(`(function () {
    // Mesmo peso hoje, mesma data das duas pesagens. A ÚNICA diferença entre
    // os dois animais é a condição da primeira balança.
    animals = [{ id: 'a', ident: 'A', cat: 'Boi' }, { id: 'b', ident: 'B', cat: 'Boi' }];
    weighings = [
      { id: 'a1', animalId: 'a', date: '2026-07-01', weight: 380, jejum: true },
      { id: 'a2', animalId: 'a', date: '2026-10-01', weight: 452, jejum: false },
      { id: 'b1', animalId: 'b', date: '2026-07-01', weight: 400, jejum: false },
      { id: 'b2', animalId: 'b', date: '2026-10-01', weight: 452, jejum: false }
    ];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    tab = 'bovinos'; seg = 'rebanho'; render();
    const naLista = ${naLista.toString()};
    const ge = gmdGeralRebanho();
    const cartao = ($('bov-stats').innerText.match(/([\\d,]+)\\s*\\n*GMD MÉDIO/i) || [])[1]
      || $('bov-stats').innerText.split('\\n').filter(Boolean)[2];
    return { a: naLista('A'), b: naLista('B'), cartao,
      blocoGmd: ge.gmd, blocoFora: ge.fora,
      nota: $('bov-gmd-nota').hidden ? '' : $('bov-gmd-nota').textContent,
      infoA: gmdInfo(wOf('a')), infoB: gmdInfo(wOf('b')) };
  })()`);

  t.conferir('o aplicativo RECONHECE que a comparação do A é misturada',
    misto.infoA.misto === true && misto.infoB.misto === false, '');
  // A marca é o que o olho pega no curral; o título é para quem quer saber por quê.
  t.conferir('a linha do A traz a marca de aviso',
    /⚠/.test(misto.a.texto), misto.a.texto);
  // Cor é lida mais rápido que número: pintar de verde um GMD distorcido é
  // pior do que não pintar.
  t.conferir('e SAI da escala de cor, para não parecer comparável',
    /gmd-misto/.test(misto.a.classe) && !/gmd-mid|gmd-good|gmd-great|gmd-low/.test(misto.a.classe),
    misto.a.classe);
  t.conferir('o título explica por quê',
    /jejum e cheio/.test(misto.a.titulo), misto.a.titulo.slice(0, 50));
  t.conferir('a linha do B continua com a cor normal',
    !/⚠/.test(misto.b.texto) && /gmd-mid/.test(misto.b.classe), misto.b.classe);

  // O ponto central: os três números da mesma tela têm de concordar.
  t.conferir('o cartão "GMD médio" deixa a comparação misturada de fora',
    misto.cartao === '0,57', String(misto.cartao));
  t.conferir('e passa a bater com o bloco "GMD do rebanho"',
    Math.abs(misto.blocoGmd - 0.5652173913043478) < 1e-9 && misto.blocoFora === 1,
    `${misto.blocoGmd} · ${misto.blocoFora} fora`);
  t.conferir('a tela conta quantos ficaram de fora, em vez de encolher calada',
    /1 animal ficou de fora/.test(misto.nota) && /jejum e cheio/.test(misto.nota),
    misto.nota);

  // ---------- animal sem pesagem ----------
  t.secao('animal que ainda não passou na balança');
  const semPeso = await pagina.evaluate(() => {
    animals = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, ident: 'BR' + i, cat: 'Boi' }));
    weighings = [];
    for (let i = 0; i < 6; i++) {
      weighings.push({ id: 'w' + i, animalId: 'x' + i, date: '2026-09-10', weight: 450, jejum: false });
    }
    settings.yield = 52;
    tab = 'bovinos'; seg = 'rebanho'; render();
    const cartoes = $('bov-stats').innerText.replace(/\n+/g, ' | ');
    return { cartoes, nota: $('bov-gmd-nota').hidden ? '' : $('bov-gmd-nota').textContent,
      // o total mostrado é o dos SEIS pesados
      totalSeis: Math.round(450 * 6 * 0.52 / 15),
      totalDez: Math.round(450 * 10 * 0.52 / 15) };
  });
  t.conferir('o cartão conta os 10 animais do rebanho', /10 \| ANIMAIS/.test(semPeso.cartoes),
    semPeso.cartoes.slice(0, 30));
  t.conferir('e o total em arroba é só o dos pesados, como sempre foi',
    new RegExp(semPeso.totalSeis + ' @ \\| TOTAL DO REBANHO').test(semPeso.cartoes),
    `${semPeso.totalSeis} @ (seriam ${semPeso.totalDez} @ com os dez)`);
  // O que mudou: agora a tela DIZ. "10 animais" em cima de um total de 6 é
  // leitura errada garantida para quem vai negociar o lote.
  t.conferir('mas agora a tela avisa quantos ficaram de fora',
    /4 animais sem pesagem não entram no peso médio nem no total/.test(semPeso.nota),
    semPeso.nota);

  const semNota = await pagina.evaluate(() => {
    // Todos pesados: nada a ressalvar, e a nota some.
    weighings = animals.map((a, i) => ({ id: 'z' + i, animalId: a.id, date: '2026-09-10',
      weight: 450, jejum: false }));
    render();
    return { escondida: $('bov-gmd-nota').hidden, texto: $('bov-gmd-nota').textContent };
  });
  t.conferir('com todos pesados, a ressalva some da tela',
    semNota.escondida && semNota.texto === '', semNota.texto);

  // ---------- as fronteiras do GMD ----------
  t.secao('fronteiras do cálculo de GMD');
  const bordas = await pagina.evaluate(() => {
    const g = (d1, p1, d2, p2, j1, j2) => gmdBetween(
      { date: d1, weight: p1, jejum: !!j1 }, { date: d2, weight: p2, jejum: !!j2 });
    animals = [{ id: 'u', ident: 'U', cat: 'Boi' }];
    weighings = [
      { id: 'u1', animalId: 'u', date: '2026-09-10', weight: 400, jejum: false },
      { id: 'u2', animalId: 'u', date: '2026-09-10', weight: 405, jejum: false }
    ];
    const mesmoDia = gmdTotal(wOf('u'));
    weighings = [{ id: 'v1', animalId: 'u', date: '2026-09-10', weight: 400, jejum: false }];
    const umaSo = gmdTotal(wOf('u'));
    return {
      mesmoDia, umaSo,
      // 90 dias, 90 kg = exatamente 1,0
      exato: g('2026-07-01', 360, '2026-09-29', 450),
      perdendo: g('2026-07-01', 450, '2026-09-29', 420),
      // Data invertida não pode devolver GMD negativo por causa da ordem
      invertido: g('2026-09-29', 450, '2026-07-01', 360),
      bissexto: daysBetween('2028-02-28', '2028-03-01'),
      viradaAno: daysBetween('2026-12-31', '2027-01-01')
    };
  });
  // Dividir por zero devolveria Infinity e a tela escreveria "∞ kg/dia".
  t.conferir('duas pesagens no MESMO dia não inventam GMD', bordas.mesmoDia === null,
    String(bordas.mesmoDia));
  t.conferir('uma pesagem só não inventa GMD', bordas.umaSo === null, String(bordas.umaSo));
  t.conferir('90 kg em 90 dias dá exatamente 1,000',
    Math.abs(bordas.exato - 1) < 1e-12, String(bordas.exato));
  t.conferir('animal que perdeu peso dá GMD negativo, e não zero',
    bordas.perdendo < 0 && Math.abs(bordas.perdendo + 30 / 90) < 1e-12, String(bordas.perdendo));
  t.conferir('data invertida não devolve número', bordas.invertido === null,
    String(bordas.invertido));
  t.conferir('fevereiro de ano bissexto conta certo', bordas.bissexto === 2, String(bordas.bissexto));
  t.conferir('a virada de ano conta certo', bordas.viradaAno === 1, String(bordas.viradaAno));

  // ---------- a prévia do curral e a lista contam a mesma história ----------
  // No curral, a decisão é tomada olhando a prévia, com o animal na balança. Se
  // ela discordar da lista depois, uma das duas mandou vender o errado.
  t.secao('a prévia do curral bate com a lista');
  const previa = await pagina.evaluate(() => {
    animals = [{ id: 'p', ident: '292', cat: 'Boi' }];
    weighings = [{ id: 'p1', animalId: 'p', date: '2026-07-04', weight: 400, jejum: false }];
    render();
    $('weigh-mode').hidden = false;
    $('wm-date').value = '2026-10-02';
    $('wm-ident').value = '292';
    $('wm-peso').value = '490';
    atualizarPreviaPesagem();
    const txt = $('wm-previa').innerText.replace(/\s+/g, ' ');
    const daPrevia = parseFloat((txt.match(/([\d,]+)\s*kg\/dia/) || [])[1]?.replace(',', '.'));
    // 90 dias, 90 kg
    const esperado = 90 / daysBetween('2026-07-04', '2026-10-02');
    $('weigh-mode').hidden = true;
    return { txt, daPrevia, esperado, dias: daysBetween('2026-07-04', '2026-10-02') };
  });
  t.conferir('a prévia mostra o GMD do animal na balança',
    Number.isFinite(previa.daPrevia), previa.txt.slice(0, 80));
  t.conferir('e é a mesma conta da lista: quilo ganho sobre dias',
    Math.abs(previa.daPrevia - previa.esperado) < 0.005,
    `prévia ${previa.daPrevia} · conta ${previa.esperado.toFixed(3)} em ${previa.dias} dias`);

  // ---------- arroba ----------
  t.secao('arroba');
  const arroba = await pagina.evaluate(() => ({
    meio: arrobasDe(450, 50),      // 450 × 50% ÷ 15 = 15
    padrao: arrobasDe(450, 52),
    zeroPeso: arrobasDe(0, 52),
    dobra: arrobasDe(900, 52) / arrobasDe(450, 52)
  }));
  t.conferir('arroba é carcaça dividida por 15', Math.abs(arroba.meio - 15) < 1e-12,
    String(arroba.meio));
  t.conferir('rendimento de 52% em 450 kg dá 15,6 @',
    Math.abs(arroba.padrao - 15.6) < 1e-12, String(arroba.padrao));
  t.conferir('dobrar o peso dobra a arroba', Math.abs(arroba.dobra - 2) < 1e-12, String(arroba.dobra));
  t.conferir('peso zero não vira arroba', arroba.zeroPeso === 0, String(arroba.zeroPeso));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
