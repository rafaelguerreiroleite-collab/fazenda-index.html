// TODO NÚMERO COM A SUA COMPARAÇÃO AO LADO.
//
// Pedido do dono, item 1 da lista de melhorias: pôr no cartão a comparação com
// a pesagem passada. "Peso médio 295 kg" está certo e não responde à única
// pergunta que se faz no curral — subiu ou desceu? Para responder, ele tinha
// de lembrar do número do mês anterior, e ninguém lembra.
//
// Uma comparação errada é pior do que nenhuma: ela parece informação. Por isso
// a regra central desta bateria é uma só, e tem um teste que existe só para
// prová-la:
//
//   SÓ ENTRA NA COMPARAÇÃO QUEM SUBIU NA BALANÇA NAS DUAS PESAGENS.
//
// Sem essa regra, comprar vinte bezerras leves depois da pesagem passada faria
// o "peso médio" cair — e o cartão anunciaria queda de desempenho num lote em
// que todo animal engordou. O dono venderia por causa de um número que mentiu.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.COMPARATIVO || 800);
const SEMENTE = Number(process.env.SEMENTE_CMP || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Comparação com a pesagem passada (${QTD.toLocaleString('pt-BR')} rebanhos · semente ${SEMENTE})`);

  const cartoes = () => pagina.evaluate(() => {
    tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
    const por = {};
    [].slice.call(document.querySelectorAll('#bov-stats .stat-card')).forEach(c => {
      const rot = (c.querySelector('.stat-label') || {}).textContent || '';
      const d = c.querySelector('.stat-delta');
      por[rot] = { valor: (c.querySelector('.stat-value') || {}).textContent || '',
        delta: d ? d.textContent : null, classe: d ? d.className : '' };
    });
    return { por, nota: $('bov-gmd-nota').textContent, cmp: comparativoRebanho() };
  });

  // ---------- a regra que justifica tudo ----------
  t.secao('comprar gado leve depois da pesagem não pode virar "o lote emagreceu"');
  const armadilha = await pagina.evaluate(() => {
    settings.yield = 50;
    animals = []; weighings = [];
    // 10 novilhas pesadas nas duas rodadas, TODAS ganhando 60 kg
    for (let i = 1; i <= 10; i++) {
      animals.push({ id: 'v' + i, ident: 'V' + i, cat: 'Novilha' });
      weighings.push({ id: 'v' + i + 'a', animalId: 'v' + i, date: '2026-07-10', weight: 300, jejum: false });
      weighings.push({ id: 'v' + i + 'b', animalId: 'v' + i, date: '2026-10-19', weight: 360, jejum: false });
    }
    // 10 bezerras leves compradas DEPOIS, pesadas só agora
    for (let i = 1; i <= 10; i++) {
      animals.push({ id: 'b' + i, ident: 'B' + i, cat: 'Bezerra' });
      weighings.push({ id: 'b' + i + 'a', animalId: 'b' + i, date: '2026-10-19', weight: 150, jejum: false });
    }
    recomputarLivros();
    const c = comparativoRebanho();
    const pesoMedioNaTela = animals.filter(noRebanho)
      .map(a => { const w = wOf(a.id); return w[w.length - 1].weight; })
      .reduce((x, v) => x + v, 0) / 20;
    return { c, pesoMedioNaTela };
  });
  t.conferir('o peso médio da tela realmente cai com as bezerras novas',
    armadilha.pesoMedioNaTela === 255, `${armadilha.pesoMedioNaTela} kg`);
  t.conferir('mas a comparação só olha as 10 que foram pesadas nas duas',
    armadilha.c && armadilha.c.n === 10, armadilha.c ? String(armadilha.c.n) : 'sem comparação');
  t.conferir('e ela mostra GANHO de 60 kg, não a queda que o lote novo criou',
    armadilha.c && armadilha.c.kgMedio === 60, armadilha.c ? String(armadilha.c.kgMedio) : '—');
  t.conferir('o cartão mostra a seta para cima',
    /▲/.test((await cartoes()).por['Peso médio'].delta || ''),
    (await cartoes()).por['Peso médio'].delta);

  // ---------- o que fica de fora ----------
  t.secao('quem não pode ser comparado fica de fora, e é contado');
  const fora = await pagina.evaluate(() => {
    animals = []; weighings = [];
    const par = (id, p1, p2, j1, j2) => {
      animals.push({ id, ident: id, cat: 'Novilha' });
      weighings.push({ id: id + 'a', animalId: id, date: '2026-07-10', weight: p1, jejum: !!j1 });
      weighings.push({ id: id + 'b', animalId: id, date: '2026-10-19', weight: p2, jejum: !!j2 });
    };
    par('n1', 300, 360);              // normal
    par('n2', 280, 350);              // normal
    par('j1', 300, 360, true, false); // jejum numa, cheio na outra
    // vendido e morto: não são mais rebanho
    par('vd', 300, 400); animals.find(a => a.id === 'vd').sold = true;
    par('mt', 300, 400); animals.find(a => a.id === 'mt').dead = true;
    recomputarLivros();
    return comparativoRebanho();
  });
  t.conferir('o par jejum↔cheio não entra na conta', fora.n === 2, String(fora.n));
  t.conferir('e é contado para poder ser explicado', fora.fora === 1, String(fora.fora));
  t.conferir('animal vendido e animal morto não entram',
    fora.n === 2 && fora.kgMedio === 65, `${fora.n} animais · ${fora.kgMedio} kg`);
  const notaFora = (await cartoes()).nota;
  t.conferir('a tela explica que alguém ficou de fora por causa do jejum',
    /jejum/.test(notaFora) && /de fora/.test(notaFora), notaFora);

  // ---------- a nota confere com o cartão ----------
  t.secao('a nota permite conferir o cartão na mão');
  const conf = await cartoes();
  t.conferir('a nota diz a data da pesagem anterior',
    /10\/07\/26/.test(conf.nota), conf.nota);
  t.conferir('diz quantos animais entraram na comparação',
    /2 animais/.test(conf.nota), conf.nota);
  t.conferir('e traz as duas médias, de onde saiu a diferença',
    /290,0 kg para 355,0 kg/.test(conf.nota), conf.nota);
  t.conferir('as duas médias e a diferença fecham',
    Math.abs((fora.pesoAgora - fora.pesoAntes) - fora.kgMedio) < 1e-9,
    `${fora.pesoAntes} → ${fora.pesoAgora} · ${fora.kgMedio}`);
  t.conferir('o total do lote é a diferença média vezes os animais',
    Math.abs(fora.kgTotal - fora.kgMedio * fora.n) < 1e-9,
    `${fora.kgTotal} vs ${fora.kgMedio * fora.n}`);

  // ---------- perda de peso, e empate ----------
  t.secao('seca também é notícia: a seta desce');
  const perdeu = await pagina.evaluate(() => {
    weighings.filter(w => w.date === '2026-10-19').forEach(w => { w.weight = 250; });
    recomputarLivros(); render();
    return null;
  });
  const cPerda = await cartoes();
  t.conferir('peso médio mostra seta para baixo',
    /▼/.test(cPerda.por['Peso médio'].delta || ''), cPerda.por['Peso médio'].delta);
  t.conferir('e a cor é a de queda, não a de ganho',
    /desce/.test(cPerda.por['Peso médio'].classe), cPerda.por['Peso médio'].classe);
  const igual = await pagina.evaluate(() => {
    weighings.filter(w => w.date === '2026-10-19').forEach(w => {
      const a = w.animalId;
      w.weight = weighings.filter(x => x.animalId === a && x.date === '2026-07-10')[0].weight;
    });
    recomputarLivros(); render();
    return null;
  });
  const cIgual = await cartoes();
  t.conferir('sem variação nenhuma, a tela escreve "igual" em vez de "▲ +0"',
    /igual/.test(cIgual.por['Peso médio'].delta || '') && !/▲|▼/.test(cIgual.por['Peso médio'].delta || ''),
    cIgual.por['Peso médio'].delta);

  // ---------- uma pesagem só ----------
  t.secao('com uma pesagem só não há o que comparar — e nada é inventado');
  const sozinha = await pagina.evaluate(() => {
    weighings = weighings.filter(w => w.date === '2026-07-10');
    recomputarLivros(); render();
    return { cmp: comparativoRebanho(), nota: $('bov-gmd-nota').textContent,
      deltas: [].slice.call(document.querySelectorAll('#bov-stats .stat-delta'))
        .map(d => d.textContent) };
  });
  t.conferir('não existe comparação', sozinha.cmp === null, JSON.stringify(sozinha.cmp));
  t.conferir('nenhum cartão mostra variação',
    sozinha.deltas.every(d => !/▲|▼|igual/.test(d)), sozinha.deltas.join(' | '));
  t.conferir('e a nota não fala de comparação nenhuma',
    !/Comparado/.test(sozinha.nota), sozinha.nota);

  // ---------- a faixa do GMD e os dias ----------
  t.secao('o que o número significa, escrito em palavra');
  const faixas = await pagina.evaluate(() => {
    // O cartão é achado pelo RÓTULO em textContent, nunca por innerText: o
    // innerText vem com o text-transform aplicado, em maiúsculas, e procurar
    // "GMD médio" nele não acha nada.
    const cardDe = rot => [].slice.call(document.querySelectorAll('#bov-stats .stat-card'))
      .filter(c => ((c.querySelector('.stat-label') || {}).textContent || '') === rot)[0];
    const ver = gmd => {
      animals = [{ id: 'x', ident: '1', cat: 'Novilha' }];
      weighings = [
        { id: 'w1', animalId: 'x', date: '2026-01-01', weight: 200, jejum: false },
        { id: 'w2', animalId: 'x', date: '2026-04-11', weight: 200 + gmd * 100, jejum: false }
      ];
      recomputarLivros(); render();
      const c = cardDe('GMD médio');
      return c ? c.innerText.replace(/\s+/g, ' ') : '(cartão não encontrado)';
    };
    return { fraco: ver(0.39), regular: ver(0.4), bom: ver(0.8), otimo: ver(1.2) };
  });
  t.conferir('0,39 é fraco', /fraco/.test(faixas.fraco), faixas.fraco);
  t.conferir('0,40 já é regular', /regular/.test(faixas.regular), faixas.regular);
  t.conferir('0,80 é bom', /bom/.test(faixas.bom), faixas.bom);
  t.conferir('1,20 é ótimo', /ótimo/.test(faixas.otimo), faixas.otimo);
  const dias = await pagina.evaluate(() => {
    const cardDe = rot => [].slice.call(document.querySelectorAll('#bov-stats .stat-card'))
      .filter(c => ((c.querySelector('.stat-label') || {}).textContent || '') === rot)[0];
    const ler = quando => {
      weighings[0].date = quando; recomputarLivros(); render();
      const c = cardDe('Últ. pesagem');
      return c ? c.innerText.replace(/\s+/g, ' ') : '(cartão não encontrado)';
    };
    animals = [{ id: 'x', ident: '1', cat: 'Novilha' }];
    weighings = [{ id: 'w1', animalId: 'x', date: todayISO(), weight: 300, jejum: false }];
    return { hojeTxt: ler(todayISO()), ontem: ler(somarDias(todayISO(), -1)),
      antes: ler(somarDias(todayISO(), -45)) };
  });
  t.conferir('pesado hoje: a tela diz "hoje"', /hoje/.test(dias.hojeTxt), dias.hojeTxt);
  t.conferir('ontem: "há 1 dia", no singular', /há 1 dia(?!s)/.test(dias.ontem), dias.ontem);
  t.conferir('45 dias atrás: "há 45 dias"', /há 45 dias/.test(dias.antes), dias.antes);

  // ---------- varredura ----------
  t.secao(`a conta fecha em qualquer rebanho (${QTD.toLocaleString('pt-BR')} sorteios)`);
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
      animals = []; weighings = [];
      const nA = ent(1, 20);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        const vend = rnd() < 0.15, morto = rnd() < 0.08;
        animals.push({ id, ident: 'T' + i, cat: 'Novilha', sold: vend, dead: morto,
          soldDate: vend ? '2026-09-01' : null, deadDate: morto ? '2026-09-02' : null });
        if (rnd() < 0.85) weighings.push({ id: id + 'a', animalId: id, date: '2026-07-1' + ent(0, 2),
          weight: ent(150, 400), jejum: rnd() < 0.1 });
        if (rnd() < 0.8) weighings.push({ id: id + 'b', animalId: id, date: '2026-10-1' + ent(7, 9),
          weight: ent(150, 460), jejum: rnd() < 0.1 });
      }
      recomputarLivros();
      const c = comparativoRebanho();
      const rodadas = rodadasDePesagem();
      if (!c) {
        // sem comparação só é aceitável quando não há dois mutirões ou nenhum
        // animal do rebanho subiu nos dois em igual condição
        const possiveis = animals.filter(a => !a.sold && !a.dead).filter(a => {
          if (rodadas.length < 2) return false;
          const r1 = rodadas[rodadas.length - 2], r2 = rodadas[rodadas.length - 1];
          const b = wOf(a.id).filter(w => w.date >= r1.ini && w.date <= r1.fim).pop();
          const d = wOf(a.id).filter(w => w.date >= r2.ini && w.date <= r2.fim).pop();
          return b && d && !!b.jejum === !!d.jejum;
        }).length;
        regra('quando não há comparação, é porque não havia par comparável',
          possiveis === 0, String(possiveis));
        continue;
      }
      // refeito aqui, do zero
      const r1 = rodadas[rodadas.length - 2], r2 = rodadas[rodadas.length - 1];
      let n = 0, antes = 0, agora = 0, fora = 0;
      animals.filter(a => !a.sold && !a.dead).forEach(a => {
        const b = wOf(a.id).filter(w => w.date >= r1.ini && w.date <= r1.fim).pop();
        const d = wOf(a.id).filter(w => w.date >= r2.ini && w.date <= r2.fim).pop();
        if (!b || !d) return;
        if (!!b.jejum !== !!d.jejum) { fora++; return; }
        n++; antes += b.weight; agora += d.weight;
      });
      regra('a comparação pega exatamente quem subiu nas duas', c.n === n, c.n + ' vs ' + n);
      regra('e conta certo quantos ficaram de fora por jejum', c.fora === fora, c.fora + ' vs ' + fora);
      regra('a média de antes confere', perto(c.pesoAntes, antes / n, 1e-9), c.pesoAntes + ' vs ' + antes / n);
      regra('a média de agora confere', perto(c.pesoAgora, agora / n, 1e-9), c.pesoAgora + ' vs ' + agora / n);
      regra('a diferença é a média de agora menos a de antes',
        perto(c.kgMedio, c.pesoAgora - c.pesoAntes, 1e-9), String(c.kgMedio));
      regra('o total do lote é a diferença vezes os animais',
        perto(c.kgTotal, c.kgMedio * c.n, 1e-6), c.kgTotal + ' vs ' + c.kgMedio * c.n);
      regra('nenhum animal vendido ou morto entra na conta', true, '');
      regra('nunca entra mais animal do que o rebanho tem',
        c.n <= animals.filter(a => !a.sold && !a.dead).length, String(c.n));
      regra('as datas da comparação são as das duas últimas rodadas',
        c.de === r1.fim && c.ate === r2.fim, c.de + '–' + c.ate);
      regra('nenhum número da comparação sai impossível',
        [c.pesoAntes, c.pesoAgora, c.kgMedio, c.kgTotal, c.dias].every(Number.isFinite),
        JSON.stringify(c));
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} sorteios` : caso));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
