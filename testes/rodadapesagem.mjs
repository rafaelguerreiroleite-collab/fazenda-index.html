// QUEM ENTROU NA PESAGEM, E QUEM FICOU NO PASTO.
//
// Pedido do dono: conferir se as pesagens anteriores e a de hoje entraram em
// todas as novilhas que foram pesadas.
//
// É a pergunta que fecha a rodada de curral, e o aplicativo não sabia
// responder. Sabia dizer tudo sobre UM animal, e nada sobre o conjunto: entrou
// todo mundo? Boi que não sobe na balança não tem GMD, não entra na estimativa
// de arroba e não aparece em decisão de venda nenhuma — ele some do
// acompanhamento sem sumir do pasto, e ninguém recebe aviso de ausência.
//
// O que esta bateria cobra:
//   · a conta fecha: pesados + ficaram de fora = rebanho, sempre;
//   · quem já saiu não é cobrado: vendido e morto não sobem na balança;
//   · a rodada junta os dias seguidos de curral — pesar em três dias é UMA
//     pesagem, e cobrar três seria acusar ausência de quem estava lá;
//   · quem está há mais tempo sem pesar aparece primeiro, e quem nunca foi
//     pesado vem na frente de todos;
//   · a separação entre "ganhou GMD novo" e "foi a primeira pesagem": não ter
//     GMD na primeira vez não é defeito, é falta de uma segunda medida.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.RODADAS_QTD || 600);
const SEMENTE = Number(process.env.SEMENTE_RODADA || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Conferência da rodada de pesagem (${QTD.toLocaleString('pt-BR')} rebanhos · semente ${SEMENTE})`);

  // ---------- o caso do curral, montado à mão ----------
  t.secao('a rodada de hoje, com dois esquecidos no pasto');
  const caso = await pagina.evaluate(() => {
    animals = []; weighings = [];
    for (let i = 1; i <= 8; i++) {
      animals.push({ id: 'a' + i, ident: '70' + i, cat: 'Novilha' });
      weighings.push({ id: 'v' + i, animalId: 'a' + i, date: '2026-07-10', weight: 250 + i, jejum: false });
    }
    for (let i = 1; i <= 6; i++) {
      weighings.push({ id: 'h' + i, animalId: 'a' + i, date: '2026-10-19', weight: 320 + i, jejum: false });
    }
    ['801', '802'].forEach((b, k) => {
      animals.push({ id: 'n' + k, ident: b, cat: 'Novilha' });
      weighings.push({ id: 'nw' + k, animalId: 'n' + k, date: '2026-10-19', weight: 190 + k, jejum: false });
    });
    animals.push({ id: 'z', ident: '999', cat: 'Novilha' });
    recomputarLivros();
    tab = 'bovinos'; seg = 'rebanho'; render();
    document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });
    return { c: conferenciaDaRodada(),
      cab: document.querySelector('#bov-rodada .dobra-cab').innerText.replace(/\s+/g, ' '),
      corpo: document.querySelector('#bov-rodada .dobra-corpo').innerText.replace(/\s+/g, ' '),
      escondido: $('bov-rodada').hidden };
  });
  t.conferir('o bloco aparece depois de uma pesagem', !caso.escondido);
  t.conferir('conta quantos do rebanho entraram na pesagem',
    caso.c.pesados === 8 && caso.c.rebanho === 11, `${caso.c.pesados}/${caso.c.rebanho}`);
  t.conferir('e nomeia quem ficou de fora', caso.c.faltaram.length === 3,
    caso.c.faltaram.map(f => f.ident).join(','));
  t.conferir('quem nunca foi pesado aparece primeiro',
    caso.c.faltaram[0].ident === '999' && caso.c.faltaram[0].ultima === null,
    caso.c.faltaram.map(f => f.ident).join(','));
  t.conferir('e os outros vêm com a data da última pesagem e há quantos dias',
    caso.c.faltaram[1].ultima === '2026-07-10' && caso.c.faltaram[1].dias === 101,
    JSON.stringify(caso.c.faltaram[1]));
  t.conferir('separa quem ganhou GMD novo de quem foi pesado pela primeira vez',
    caso.c.comAnterior === 6 && caso.c.primeira === 2,
    `${caso.c.comAnterior} com anterior · ${caso.c.primeira} primeira`);
  t.conferir('o cabeçalho mostra quantos de quantos e a data da rodada',
    /8\/11/.test(caso.cab) && /19\/10\/26/.test(caso.cab), caso.cab);
  t.conferir('e avisa no cabeçalho que alguém ficou de fora',
    /3 ficaram de fora/.test(caso.cab), caso.cab);
  t.conferir('o corpo mostra os brincos que faltaram',
    /999/.test(caso.corpo) && /707/.test(caso.corpo) && /708/.test(caso.corpo), caso.corpo.slice(0, 140));
  t.conferir('e explica que a primeira pesagem ainda não tem GMD',
    /primeira pesagem/.test(caso.corpo), caso.corpo.slice(0, 200));

  // ---------- quem já saiu do rebanho não é cobrado ----------
  t.secao('vendido e morto não sobem na balança');
  const saiu = await pagina.evaluate(() => {
    animals.find(a => a.id === 'a7').sold = true;
    animals.find(a => a.id === 'a7').soldDate = '2026-09-01';
    animals.find(a => a.id === 'a8').dead = true;
    animals.find(a => a.id === 'a8').deadDate = '2026-09-02';
    render();
    return conferenciaDaRodada();
  });
  t.conferir('o vendido e o morto saem da conta do rebanho',
    saiu.rebanho === 9, String(saiu.rebanho));
  t.conferir('e deixam de ser cobrados como ausentes',
    saiu.faltaram.length === 1 && saiu.faltaram[0].ident === '999',
    saiu.faltaram.map(f => f.ident).join(','));
  t.conferir('sem mexer em quem entrou', saiu.pesados === 8, String(saiu.pesados));

  // ---------- a rodada junta os dias seguidos de curral ----------
  t.secao('pesar em três dias é UMA pesagem, não três');
  const tresDias = await pagina.evaluate(() => {
    animals = []; weighings = [];
    for (let i = 1; i <= 9; i++) {
      animals.push({ id: 'b' + i, ident: 'B' + i, cat: 'Novilha' });
      // três dias de curral seguidos: 17, 18 e 19
      weighings.push({ id: 'p' + i, animalId: 'b' + i,
        date: '2026-10-1' + (7 + (i % 3)), weight: 300 + i, jejum: false });
    }
    recomputarLivros(); render();
    return { c: conferenciaDaRodada(), rodadas: rodadasDePesagem().length };
  });
  t.conferir('os três dias viram uma rodada só', tresDias.rodadas === 1,
    String(tresDias.rodadas));
  t.conferir('e ninguém é acusado de ter faltado',
    tresDias.c.faltaram.length === 0 && tresDias.c.pesados === 9,
    `${tresDias.c.pesados} pesados · ${tresDias.c.faltaram.length} fora`);
  t.conferir('o cabeçalho diz que todos entraram',
    await pagina.evaluate(() =>
      /todos entraram/.test(document.querySelector('#bov-rodada .dobra-cab').innerText)));

  // ---------- sem pesagem nenhuma, o bloco não aparece ----------
  t.secao('sem pesagem, nada a conferir');
  const vazio = await pagina.evaluate(() => {
    animals = [{ id: 'x', ident: '1', cat: 'Novilha' }];
    weighings = []; recomputarLivros(); render();
    return { c: conferenciaDaRodada(), escondido: $('bov-rodada').hidden };
  });
  t.conferir('sem pesagem nenhuma o bloco fica escondido',
    vazio.c === null && vazio.escondido, JSON.stringify(vazio.c));

  // ---------- o relatório diz o mesmo ----------
  // Conferência que só existe na tela não serve para auditar: o sócio e o
  // banco conferem no papel.
  t.secao('o relatório de auditoria repete a conferência');
  const rel = await pagina.evaluate(() => {
    animals = []; weighings = [];
    for (let i = 1; i <= 5; i++) {
      animals.push({ id: 'c' + i, ident: 'C' + i, cat: 'Novilha' });
      weighings.push({ id: 'cv' + i, animalId: 'c' + i, date: '2026-06-01', weight: 250, jejum: false });
    }
    for (let i = 1; i <= 3; i++) {
      weighings.push({ id: 'ch' + i, animalId: 'c' + i, date: '2026-10-19', weight: 320, jejum: false });
    }
    recomputarLivros(); render();
    let saiu = '';
    const orig = window.download;
    window.download = (n, c) => { saiu = String(c); };
    exportRelatorio('bov');
    window.download = orig;
    return saiu;
  });
  const linhaDe = rot => (rel.split('\n').filter(l => l.indexOf(rot) >= 0)[0] || '').replace(/"/g, '');
  const entraram = linhaDe('Entraram na última pesagem');
  t.conferir('o relatório traz quantos entraram na última pesagem',
    /;3 de 5;/.test(entraram) && /19\/10\/2026/.test(entraram),
    entraram || 'linha ausente');
  const fora = linhaDe('Ficaram de fora da última pesagem');
  t.conferir('e nomeia quem ficou de fora, com há quantos dias',
    /;2;/.test(fora) && /C4/.test(fora) && /C5/.test(fora) && /140d/.test(fora),
    fora || 'linha ausente');

  // ---------- varredura: a conta tem de fechar sempre ----------
  t.secao(`a conta fecha em qualquer rebanho (${QTD.toLocaleString('pt-BR')} sorteios)`);
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
    for (let k = 0; k < N; k++) {
      animals = []; weighings = [];
      const nA = ent(1, 25);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        const vendido = rnd() < 0.15, morto = rnd() < 0.08;
        animals.push({ id: id, ident: 'T' + i, cat: 'Novilha',
          sold: vendido, soldDate: vendido ? '2026-08-01' : null,
          dead: morto, deadDate: morto ? '2026-08-02' : null });
        // histórico antigo, aleatório
        if (rnd() < 0.8) {
          weighings.push({ id: id + 'v', animalId: id,
            date: '2026-0' + ent(1, 6) + '-' + p2(ent(1, 28)), weight: ent(150, 350), jejum: false });
        }
        // e a rodada de agora, em que nem todos entram
        if (rnd() < 0.7) {
          weighings.push({ id: id + 'h', animalId: id,
            date: '2026-10-1' + ent(7, 9), weight: ent(200, 420), jejum: false });
        }
      }
      recomputarLivros();
      const c = conferenciaDaRodada();
      if (!c) { regra('sem pesagem o resultado é nulo', weighings.length === 0, 'tinha pesagem'); continue; }
      const rebanho = animals.filter(a => !a.sold && !a.dead);
      regra('pesados mais ausentes é o rebanho inteiro, sempre',
        c.pesados + c.faltaram.length === c.rebanho,
        c.pesados + ' + ' + c.faltaram.length + ' != ' + c.rebanho);
      regra('o rebanho da conta é o rebanho de verdade',
        c.rebanho === rebanho.length, c.rebanho + ' vs ' + rebanho.length);
      regra('ninguém aparece duas vezes na lista de ausentes',
        new Set(c.faltaram.map(f2 => f2.id)).size === c.faltaram.length, '');
      regra('nenhum ausente foi pesado na rodada',
        c.faltaram.every(f2 => !weighings.some(w => w.animalId === f2.id
          && w.date >= c.ini && w.date <= c.fim)), '');
      regra('nenhum vendido ou morto é cobrado como ausente',
        c.faltaram.every(f2 => rebanho.some(a => a.id === f2.id)), '');
      regra('quem ganhou GMD novo mais quem estreou é quem foi pesado',
        c.comAnterior + c.primeira === c.pesados,
        c.comAnterior + ' + ' + c.primeira + ' != ' + c.pesados);
      regra('a rodada conferida é a mais recente de todas',
        rodadasDePesagem().every(r => r.fim <= c.fim), c.fim);
      regra('os ausentes vêm do mais antigo para o mais recente',
        c.faltaram.every((f2, i) => {
          if (i === 0) return true;
          const ant = c.faltaram[i - 1];
          if (ant.ultima === null) return true;
          return f2.ultima !== null && ant.ultima <= f2.ultima;
        }), JSON.stringify(c.faltaram.map(f2 => f2.ultima)));
      regra('os dias sem pesar nunca são negativos',
        c.faltaram.every(f2 => f2.dias === null || f2.dias >= 0),
        JSON.stringify(c.faltaram.map(f2 => f2.dias)));
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} sorteios` : caso));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
