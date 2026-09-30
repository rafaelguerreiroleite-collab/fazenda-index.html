// Peso projetado por animal, a partir de um GMD informado à mão.
//
// O cartão pontilhado do topo já dizia onde o rebanho estaria hoje. O que
// faltava era a mesma resposta POR ANIMAL, na linha de cada um — que é o
// número que se usa para escolher quem sai do lote.
//
// A regra que este arquivo existe para proteger: o cartão e as linhas mostram
// o MESMO número, em dois lugares da mesma tela. São duas leituras da mesma
// conta, e se a conta estiver escrita duas vezes no código, um dia uma delas
// muda sozinha e não há nada na tela que denuncie qual das duas está mentindo.
// Por isso a soma das linhas tem de fechar com o cartão, sempre.
import { servir, abrirApp, placar } from './apoio.mjs';

const MONTAR = () => {
  animals = [
    { id: 'a1', ident: 'BR001', cat: 'Novilha' },
    { id: 'a2', ident: 'BR002', cat: 'Novilha' },
    { id: 'a3', ident: 'BR003', cat: 'Novilha' },
    { id: 'a4', ident: 'BR004', cat: 'Novilha' },   // nunca pesado
    { id: 'a5', ident: 'BR005', cat: 'Novilha' }    // pesagem com data no futuro
  ];
  weighings = [
    // Pesados em dias DIFERENTES de propósito: é o caso que o peso médio não
    // resolve, e o motivo de a projeção ser feita animal por animal.
    { id: 'w1', animalId: 'a1', date: '2026-08-01', weight: 300 },
    { id: 'w2', animalId: 'a2', date: '2026-09-01', weight: 400 },
    { id: 'w3', animalId: 'a3', date: '2026-09-30', weight: 500 },
    { id: 'w5', animalId: 'a5', date: '2027-01-01', weight: 250 }
  ];
  items = []; moves = []; bovT = []; avT = []; gerT = [];
  tab = 'bovinos'; seg = 'rebanho';
  $('bov-sort').value = 'ident-asc'; bovSort = 'ident-asc';
  render();
};

const pesoDaLinha = ident => {
  const el = [...document.querySelectorAll('#animal-list [data-animal]')]
    .find(e => e.querySelector('.item-title').textContent === ident);
  const est = el && el.querySelector('.est-linha');
  return est ? est.textContent.trim() : null;
};

async function estimar(pagina, valor) {
  await pagina.evaluate(v => {
    $('bov-gmd-sim').value = v;
    $('bov-gmd-sim').dispatchEvent(new Event('input'));
  }, valor);
  await pagina.waitForTimeout(150);
}

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Peso projetado por animal');
  await pagina.evaluate(`(${MONTAR.toString()})()`);

  // ---------- sem estimativa, nada muda ----------
  t.secao('sem GMD informado');
  await estimar(pagina, '');
  const semEst = await pagina.evaluate(`(${pesoDaLinha.toString()})('BR001')`);
  t.conferir('nenhuma linha ganha peso projetado', semEst === null, String(semEst));

  // ---------- a conta ----------
  t.secao('a conta de cada animal');
  const conta = await pagina.evaluate(() => {
    // Congela "hoje" para a conta poder ser conferida no braço.
    const hoje = '2026-10-30';
    const ver = id => {
      const p = projetar(animals.find(x => x.id === id), 0.5, hoje);
      return p ? { peso: p.peso, dias: p.dias, ganho: p.ganho } : null;
    };
    return { a1: ver('a1'), a2: ver('a2'), a3: ver('a3'), a4: ver('a4'), a5: ver('a5'),
      semGmd: projetar(animals[0], NaN, hoje) };
  });
  // 01/08 → 30/10 = 90 dias · 300 + 0,5×90 = 345
  t.conferir('projeta da última balança DE CADA ANIMAL',
    conta.a1 && conta.a1.dias === 90 && conta.a1.peso === 345,
    conta.a1 && `${conta.a1.dias}d · ${conta.a1.peso} kg`);
  // 01/09 → 30/10 = 59 dias · 400 + 29,5 = 429,5
  t.conferir('cada um com os dias dele, não com a média',
    conta.a2 && conta.a2.dias === 59 && conta.a2.peso === 429.5,
    conta.a2 && `${conta.a2.dias}d · ${conta.a2.peso} kg`);
  t.conferir('o ganho é a diferença para a última pesagem',
    conta.a1 && conta.a1.ganho === 45, conta.a1 && String(conta.a1.ganho));
  t.conferir('animal nunca pesado não é projetado', conta.a4 === null);
  t.conferir('sem GMD informado não há projeção', conta.semGmd === null);
  // Pesagem digitada com data no futuro não pode projetar para TRÁS e inventar
  // um animal mais leve do que a balança disse.
  t.conferir('pesagem com data no futuro não anda para trás',
    conta.a5 && conta.a5.dias === 0 && conta.a5.peso === 250,
    conta.a5 && `${conta.a5.dias}d · ${conta.a5.peso} kg`);

  // ---------- na tela ----------
  t.secao('na linha de cada animal');
  await estimar(pagina, '0,500');
  const naTela = await pagina.evaluate(`(function(){
    const pesoDaLinha = ${pesoDaLinha.toString()};
    return { um: pesoDaLinha('BR001'), quatro: pesoDaLinha('BR004'),
      quantas: document.querySelectorAll('#animal-list .est-linha').length };
  })()`);
  t.conferir('a linha mostra o peso projetado', /kg hoje/.test(naTela.um || ''), naTela.um);
  t.conferir('o animal sem pesagem não ganha linha nenhuma', naTela.quatro === null);
  t.conferir('uma linha para cada animal projetável', naTela.quantas === 4, String(naTela.quantas));

  // ---------- o cartão e as linhas contam a mesma coisa ----------
  // É o ponto do arquivo: a mesma conta aparece em dois lugares da tela.
  t.secao('cartão e linhas não podem discordar');
  const bate = await pagina.evaluate(() => {
    const hoje = todayISO();
    const daLinha = [...document.querySelectorAll('#animal-list [data-animal]')]
      .map(e => {
        const est = e.querySelector('.est-linha');
        return est ? parseFloat(est.textContent.replace(/[^\d,-]/g, '').replace(',', '.')) : null;
      }).filter(Number.isFinite);
    const projetados = animals.filter(noRebanho)
      .map(a => projetar(a, 0.5, hoje)).filter(Boolean).map(p => p.peso);
    const medio = projetados.reduce((s, p) => s + p, 0) / projetados.length;
    // O cartão mostra o peso médio estimado, arredondado para quilo inteiro.
    // O ponto no número é separador de milhar do português, não decimal.
    const bruto = ($('bov-stats-est').textContent.match(/([\d.]+)\s*kg/) || [])[1];
    const doCartao = bruto == null ? null : parseInt(bruto.replace(/\./g, ''), 10);
    return { nLinhas: daLinha.length, nProjetados: projetados.length,
      medioCalculado: Math.round(medio), doCartao,
      // Cada linha da tela tem de ser exatamente o que a conta devolve.
      iguais: daLinha.every((v, i) => Math.abs(v - Math.round(projetados[i])) < 0.51) };
  });
  t.conferir('a tela projeta exatamente os animais que a conta projeta',
    bate.nLinhas === bate.nProjetados, `${bate.nLinhas} vs ${bate.nProjetados}`);
  t.conferir('cada linha é o número que a conta devolve', bate.iguais);
  t.conferir('e o peso médio do cartão é a média das linhas',
    bate.doCartao === bate.medioCalculado, `cartão ${bate.doCartao} · linhas ${bate.medioCalculado}`);

  // ---------- GMD negativo ----------
  // Informar um GMD negativo é legítimo: seca, e o lote perdendo peso.
  t.secao('GMD negativo');
  await estimar(pagina, '-0,200');
  const neg = await pagina.evaluate(`(function(){
    const pesoDaLinha = ${pesoDaLinha.toString()};
    return pesoDaLinha('BR003');
  })()`);
  t.conferir('projeta para baixo sem quebrar', /kg hoje/.test(neg || ''), neg);
  // Um GMD negativo absurdo zeraria o animal, e peso zero ou negativo não é
  // peso. Quem foi pesado HOJE não se move com GMD nenhum — zero dia vezes
  // qualquer coisa é zero —, e esse continua aparecendo, que é o certo.
  await estimar(pagina, '-99');
  const absurdo = await pagina.evaluate(() => {
    const vistos = [...document.querySelectorAll('#animal-list .est-linha')]
      .map(e => parseFloat(e.textContent.replace(/[^\d,-]/g, '').replace(',', '.')));
    const hoje = todayISO();
    const semDias = animals.filter(noRebanho)
      .filter(a => { const w = wOf(a.id); return w.length && daysBetween(w[w.length - 1].date, hoje) <= 0; });
    return { vistos, semDias: semDias.length };
  });
  t.conferir('nenhum peso projetado sai zerado ou negativo',
    absurdo.vistos.every(v => v > 0), absurdo.vistos.join(','));
  t.conferir('só sobram os que foram pesados hoje, que GMD nenhum move',
    absurdo.vistos.length === absurdo.semDias,
    `${absurdo.vistos.length} linhas · ${absurdo.semDias} pesados hoje`);

  await estimar(pagina, '');
  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
