// VARREDURA DO GMD: DA PESAGEM AO REBANHO, CONTA POR CONTA.
//
// Pedido do dono: varredura no cálculo do GMD por pesagem e do GMD geral.
//
// O GMD é o número que a fazenda inteira acompanha — é com ele que se decide
// quem vende, quem fica e se o pasto está pagando. Errado, ele não denuncia
// nada: continua sendo um número bonito na tela, só que falso.
//
// Por isso esta bateria NÃO chama as funções do aplicativo para conferir o
// aplicativo. Cada conta é refeita aqui, do zero, com outra implementação,
// escrita só para discordar quando houver diferença:
//
//   · o par de pesagens        (kg ganhos ÷ dias corridos)
//   · o total de cada animal   (primeira até a última dele)
//   · o recente de cada animal (as duas últimas)
//   · o GMD do rebanho         (quilo total ÷ dia-animal total)
//   · o GMD entre pesagens     (rodadas de curral, ganho na rodada que fechou)
//   · o GMD mês a mês          (ganho repartido pelos dias de cada mês)
//
// E, além das contas, as três coisas que fazem um número de GMD mentir sem que
// ninguém perceba:
//
//   1. NADA PODE SE PERDER NA REPARTIÇÃO. A soma dos quilos de todos os meses
//      tem de ser exatamente a soma dos ganhos dos intervalos. Se um pedaço
//      some no meio do caminho, todo mês fica um pouco mais baixo e a fazenda
//      inteira parece pior do que é.
//   2. O PASSADO NÃO PODE MUDAR. Vender ou perder um boi hoje não pode alterar
//      o GMD de um mês fechado: aquele ganho aconteceu. Número que muda
//      sozinho é número em que ninguém mais confia.
//   3. A TELA TEM DE DIZER O QUE CALCULOU. O cartão "GMD médio" e o bloco "GMD
//      do rebanho" são contas DIFERENTES de propósito — média por animal e
//      média por dia-animal. Os dois aparecem juntos, e a tela precisa
//      explicar a diferença, senão parecem dois números brigando.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.GMDVARREDURA || 1500);
const SEMENTE = Number(process.env.SEMENTE_GMD || (Date.now() % 2147483647));

// Conferidor independente, escrito aqui dentro. Nenhuma linha dele chama o
// aplicativo — é esse o ponto.
const APOIO = semente => `
  let _s = ${semente} >>> 0;
  const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const perto = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-9 : e);
  const falhas = {};
  const regra = (nome, ok, caso) => {
    if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
  };
  // ---- calendário, feito na mão ----
  const dUTC = iso => { const p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]); };
  const dias2 = (a, b) => Math.round((dUTC(b) - dUTC(a)) / 86400000);
  const isoDe = ms => new Date(ms).toISOString().slice(0, 10);
  const maisDias = (iso, n) => isoDe(dUTC(iso) + n * 86400000);
  const mesDe = iso => iso.slice(0, 7);
  // Dias de cada mês entre duas datas, contando do dia SEGUINTE ao início até
  // o fim — implementação ingênua de propósito: um dia por vez, e o dia cai no
  // mês dele. Lenta e óbvia, que é o que se quer de um conferidor.
  const repartirMeses = (ini, fim) => {
    const out = {};
    for (let d = dUTC(ini) + 86400000; d <= dUTC(fim); d += 86400000) {
      const m = isoDe(d).slice(0, 7);
      out[m] = (out[m] || 0) + 1;
    }
    return out;
  };
  const pesagensDe = id => weighings.filter(w => w.animalId === id)
    .slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  // Todo par consecutivo de pesagens, de todos os animais. É daqui que saem
  // todas as outras contas.
  const todosIntervalos = () => {
    const fora = [];
    animals.forEach(a => {
      const ws = pesagensDe(a.id);
      for (let i = 1; i < ws.length; i++) {
        const d = dias2(ws[i - 1].date, ws[i].date);
        if (!(d > 0)) continue;
        fora.push({ animal: a.id, ini: ws[i - 1].date, fim: ws[i].date, dias: d,
          kg: ws[i].weight - ws[i - 1].weight,
          misto: !!ws[i - 1].jejum !== !!ws[i].jejum });
      }
    });
    return fora;
  };
  const geralConferido = () => {
    let kg = 0, dias = 0, n = 0, fora = 0, pri = null, ult = null;
    animals.forEach(a => {
      const ws = pesagensDe(a.id);
      if (ws.length < 2) return;
      const p = ws[0], u = ws[ws.length - 1];
      const d = dias2(p.date, u.date);
      if (!(d > 0)) return;
      if (!!p.jejum !== !!u.jejum) { fora++; return; }
      kg += u.weight - p.weight; dias += d; n++;
      if (!pri || p.date < pri) pri = p.date;
      if (!ult || u.date > ult) ult = u.date;
    });
    return { gmd: dias > 0 ? kg / dias : null, kg, dias, n, fora, primeira: pri, ultima: ult };
  };
  const mesesConferidos = () => {
    const por = {};
    todosIntervalos().forEach(iv => {
      if (iv.misto) return;
      const partes = repartirMeses(iv.ini, iv.fim);
      Object.keys(partes).forEach(m => {
        const e = por[m] || (por[m] = { kg: 0, dias: 0, animais: {} });
        e.kg += iv.kg * partes[m] / iv.dias;
        e.dias += partes[m];
        e.animais[iv.animal] = 1;
      });
    });
    return Object.keys(por).sort().reverse().map(m => ({ mes: m, kg: por[m].kg,
      dias: por[m].dias, animais: Object.keys(por[m].animais).length,
      gmd: por[m].dias > 0 ? por[m].kg / por[m].dias : null }));
  };
`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Varredura do GMD: pesagem a pesagem e no rebanho (${QTD.toLocaleString('pt-BR')} rebanhos · semente ${SEMENTE})`);
  const marcar = (res, n) => Object.entries(res).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${n.toLocaleString('pt-BR')} sorteios` : caso));

  // ================= 1. AS CONTAS =================
  t.secao(`1. cada conta do GMD contra um conferidor escrito do zero`);
  const f1 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 3)}
    for (let k = 0; k < N; k++) {
      // rebanho sorteado: animais com históricos de tamanhos diferentes,
      // alguns vendidos, alguns mortos, alguns com uma pesagem só
      const nA = ent(1, 7);
      animals = []; weighings = [];
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        const vendido = rnd() < 0.25, morto = rnd() < 0.1;
        animals.push({ id: id, ident: 'B' + i, cat: 'Novilha',
          sold: vendido, soldDate: vendido ? '2026-09-01' : null,
          dead: morto, deadDate: morto ? '2026-09-15' : null });
        const nW = ent(0, 6);
        let data = '2026-0' + ent(1, 3) + '-' + String(ent(1, 28)).padStart(2, '0');
        let peso = ent(150, 400);
        for (let j = 0; j < nW; j++) {
          weighings.push({ id: id + 'w' + j, animalId: id, date: data, weight: peso,
            jejum: rnd() < 0.12, notes: '' });
          data = maisDias(data, ent(1, 120));
          peso = peso + ent(-20, 90);
        }
      }
      recomputarLivros();

      // ---- par a par ----
      animals.forEach(a => {
        const ws = pesagensDe(a.id);
        const doApp = wOf(a.id);
        regra('a ordem das pesagens do animal é por data',
          doApp.map(w => w.id).join() === ws.map(w => w.id).join(), a.id);
        for (let i = 1; i < ws.length; i++) {
          const d = dias2(ws[i - 1].date, ws[i].date);
          const meu = d > 0 ? (ws[i].weight - ws[i - 1].weight) / d : null;
          const dele = gmdBetween(ws[i - 1], ws[i]);
          regra('o ganho entre duas pesagens é quilo ganho sobre dias corridos',
            meu === null ? dele === null : perto(meu, dele, 1e-12),
            meu + ' vs ' + dele);
        }
        const total = ws.length >= 2 && dias2(ws[0].date, ws[ws.length - 1].date) > 0
          ? (ws[ws.length - 1].weight - ws[0].weight) / dias2(ws[0].date, ws[ws.length - 1].date) : null;
        const tApp = gmdTotal(ws);
        regra('o GMD total do animal vai da primeira à última pesagem DELE',
          total === null ? tApp === null : perto(total, tApp, 1e-12), total + ' vs ' + tApp);
        const rec = ws.length >= 2 && dias2(ws[ws.length - 2].date, ws[ws.length - 1].date) > 0
          ? (ws[ws.length - 1].weight - ws[ws.length - 2].weight) / dias2(ws[ws.length - 2].date, ws[ws.length - 1].date) : null;
        const rApp = gmdRecent(ws);
        regra('o GMD recente do animal é o das duas últimas',
          rec === null ? rApp === null : perto(rec, rApp, 1e-12), rec + ' vs ' + rApp);
        const info = gmdInfo(ws);
        const mistoMeu = ws.length >= 2 && (!!ws[0].jejum !== !!ws[ws.length - 1].jejum);
        regra('e ele avisa quando compara jejum com cheio',
          info.misto === (ws.length >= 2 ? mistoMeu : false), String(info.misto));
      });

      // ---- o rebanho inteiro ----
      const meu = geralConferido();
      const dele = gmdGeralRebanho();
      regra('o GMD do rebanho é quilo total sobre dia-animal total',
        meu.gmd === null ? dele.gmd === null : perto(meu.gmd, dele.gmd, 1e-10),
        meu.gmd + ' vs ' + dele.gmd);
      regra('com a mesma quantidade de animais na conta', meu.n === dele.n, meu.n + ' vs ' + dele.n);
      regra('os mesmos quilos', perto(meu.kg, dele.kg, 1e-9), meu.kg + ' vs ' + dele.kg);
      regra('os mesmos dias-animal', meu.dias === dele.dias, meu.dias + ' vs ' + dele.dias);
      regra('e as mesmas pontas de data',
        meu.primeira === dele.primeira && meu.ultima === dele.ultima,
        meu.primeira + '–' + meu.ultima + ' vs ' + dele.primeira + '–' + dele.ultima);
      regra('os pares jejum/cheio ficam de fora, e são contados',
        meu.fora === dele.fora, meu.fora + ' vs ' + dele.fora);

      // ---- mês a mês ----
      const meusMeses = mesesConferidos();
      const delesMeses = gmdPorMes().meses;
      regra('o mês a mês tem os mesmos meses, na mesma ordem',
        meusMeses.map(m => m.mes).join() === delesMeses.map(m => m.mes).join(),
        meusMeses.map(m => m.mes).join() + ' vs ' + delesMeses.map(m => m.mes).join());
      meusMeses.forEach((m, i) => {
        const d = delesMeses[i] || {};
        regra('cada mês com os mesmos quilos repartidos', perto(m.kg, d.kg, 1e-9),
          m.mes + ': ' + m.kg + ' vs ' + d.kg);
        regra('cada mês com os mesmos dias-animal', m.dias === d.dias,
          m.mes + ': ' + m.dias + ' vs ' + d.dias);
        regra('cada mês com os mesmos animais', m.animais === d.animais,
          m.mes + ': ' + m.animais + ' vs ' + d.animais);
        regra('e o GMD do mês é quilo do mês sobre dia-animal do mês',
          m.gmd === null ? d.gmd === null : perto(m.gmd, d.gmd, 1e-10),
          m.mes + ': ' + m.gmd + ' vs ' + d.gmd);
      });

      // ---- NADA SE PERDE NA REPARTIÇÃO ----
      const ivs = todosIntervalos().filter(x => !x.misto);
      const kgTotal = ivs.reduce((x, iv) => x + iv.kg, 0);
      const diasTotal = ivs.reduce((x, iv) => x + iv.dias, 0);
      const kgMeses = delesMeses.reduce((x, m) => x + m.kg, 0);
      const diasMeses = delesMeses.reduce((x, m) => x + m.dias, 0);
      regra('a soma dos quilos de todos os meses é a soma dos ganhos',
        perto(kgTotal, kgMeses, 1e-6), kgTotal + ' vs ' + kgMeses);
      regra('e a soma dos dias dos meses é a soma dos dias dos intervalos',
        diasTotal === diasMeses, diasTotal + ' vs ' + diasMeses);

      // ---- entre pesagens: nada se perde, e cada intervalo cai em uma rodada ----
      const ep = gmdEntrePesagens();
      const kgRodadas = ep.linhas.reduce((x, l) => x + l.kg, 0);
      const diasRodadas = ep.linhas.reduce((x, l) => x + l.dias, 0);
      regra('a soma dos quilos das rodadas é a soma dos ganhos',
        perto(kgTotal, kgRodadas, 1e-6), kgTotal + ' vs ' + kgRodadas);
      regra('e a soma dos dias das rodadas também',
        diasTotal === diasRodadas, diasTotal + ' vs ' + diasRodadas);
      ep.linhas.forEach(l => {
        regra('o GMD da rodada é quilo da rodada sobre dia-animal da rodada',
          l.dias > 0 ? perto(l.gmd, l.kg / l.dias, 1e-10) : l.gmd === null,
          l.ini + '–' + l.fim + ': ' + l.gmd);
        regra('a rodada não termina antes de começar', l.ini <= l.fim, l.ini + '–' + l.fim);
      });
      regra('as rodadas saem da mais recente para a mais antiga',
        ep.linhas.every((l, i) => i === 0 || ep.linhas[i - 1].fim >= l.fim), '');
      regra('o mês a mês e as rodadas contam os mesmos intervalos',
        gmdPorMes().intervalos === ep.intervalos,
        gmdPorMes().intervalos + ' vs ' + ep.intervalos);
    }
    return falhas;
  })(${QTD})`);
  marcar(f1, QTD);

  // ================= 2. O PASSADO NÃO MUDA =================
  // Um mês fechado não pode mudar de valor porque um boi foi vendido depois,
  // nem porque o gado foi pesado de novo hoje. Número que muda sozinho é
  // número em que ninguém mais confia — e ninguém vai procurar a causa, porque
  // ninguém guarda o valor de ontem para comparar.
  t.secao('2. vender, perder ou pesar de novo não mexe no mês que já fechou');
  const f2 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 11)}
    for (let k = 0; k < N; k++) {
      animals = []; weighings = [];
      const nA = ent(2, 6);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        animals.push({ id: id, ident: 'B' + i, cat: 'Novilha' });
        let data = '2026-01-' + String(ent(1, 20)).padStart(2, '0');
        let peso = ent(180, 380);
        const nW = ent(2, 5);
        for (let j = 0; j < nW; j++) {
          weighings.push({ id: id + 'w' + j, animalId: id, date: data, weight: peso, jejum: false });
          data = maisDias(data, ent(20, 70));
          peso += ent(5, 70);
        }
      }
      recomputarLivros();
      // Só os NÚMEROS: a marca de "mês em aberto" muda de propósito ao vender,
      // porque boi vendido não vai mais à balança e o mês dele fecha ali.
      const numeros = ms => JSON.stringify(ms.map(m =>
        [m.mes, m.kg.toFixed(6), m.dias, m.animais, m.gmd.toFixed(6)]));
      const antes = numeros(gmdPorMes().meses);
      const antesRodadas = JSON.stringify(gmdEntrePesagens().linhas);

      // vende um, mata outro
      animals[0].sold = true; animals[0].soldDate = '2026-10-01';
      if (animals[1]) { animals[1].dead = true; animals[1].deadDate = '2026-10-02'; }
      regra('vender ou perder um animal não muda nenhum mês passado',
        numeros(gmdPorMes().meses) === antes, 'mudou ao vender');
      regra('nem muda nenhuma rodada de pesagem',
        JSON.stringify(gmdEntrePesagens().linhas) === antesRodadas, 'mudou ao vender');

      // pesa o rebanho de novo, bem depois
      //
      // O que NÃO pode mudar é o mês FECHADO. Mês fechado é o que está antes
      // da última pesagem de todos os animais: dali para a frente há intervalo
      // em curso, e o ganho dele vai ser repartido por esses meses quando a
      // próxima pesagem fechar o intervalo. Isso não é o passado mudando — é o
      // pedaço do mês que ainda não tinha sido medido chegando. Quem erra essa
      // distinção acusa defeito onde não há, e é por isso que o aplicativo
      // marca esses meses na tela.
      const ultima = weighings.map(w => w.date).sort().pop();
      const novaData = maisDias(ultima, ent(40, 90));
      // quem vai à balança de novo é o rebanho: boi vendido e boi morto não
      const voltam = animals.filter(a => !a.sold && !a.dead);
      const limite = voltam.map(a => {
        const ws = pesagensDe(a.id);
        return ws.length ? ws[ws.length - 1].date.slice(0, 7) : null;
      }).filter(Boolean).sort()[0];
      const antesMeses = gmdPorMes().meses;
      const fechados = antesMeses.filter(m => m.mes < limite);
      voltam.forEach(a => {
        const ws = pesagensDe(a.id);
        if (!ws.length) return;
        weighings.push({ id: a.id + 'novo', animalId: a.id, date: novaData,
          weight: ws[ws.length - 1].weight + ent(10, 80), jejum: false });
      });
      const depois = gmdPorMes().meses;
      const mesesIguais = fechados.every(v => {
        const d = depois.filter(x => x.mes === v.mes)[0];
        return d && perto(d.kg, v.kg, 1e-9) && d.dias === v.dias;
      });
      regra('pesar o gado de novo não muda nenhum mês já fechado', mesesIguais,
        'mês fechado antes de ' + limite + ' mudou');
      // e o aplicativo tem de ter avisado quais meses ainda estavam abertos
      regra('o aplicativo marcava como em aberto todo mês que viria a mudar',
        antesMeses.every(m => {
          const d = depois.filter(x => x.mes === m.mes)[0];
          const mudou = !d || !perto(d.kg, m.kg, 1e-9) || d.dias !== m.dias;
          return !mudou || m.aberto === true;
        }), 'um mês mudou sem estar marcado como em aberto');
      regra('e não marcava como em aberto um mês que não mudaria',
        fechados.every(m => m.aberto === false), 'marcou mês fechado como aberto');
    }
    return falhas;
  })(${Math.max(50, Math.round(QTD / 4))})`);
  marcar(f2, Math.max(50, Math.round(QTD / 4)));

  // ================= 3. O QUE A TELA AFIRMA =================
  t.secao('3. os números do GMD na tela, no relatório e no arquivo');
  const f3 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 23)}
    for (let k = 0; k < N; k++) {
      animals = []; weighings = []; items = []; moves = [];
      const nA = ent(2, 5);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        const vendido = i === 0;   // um vendido sempre, para cobrar a diferença
        animals.push({ id: id, ident: '10' + i, cat: 'Novilha',
          sold: vendido, soldDate: vendido ? '2026-09-20' : null });
        let data = '2026-02-' + String(ent(1, 20)).padStart(2, '0');
        let peso = ent(200, 330);
        for (let j = 0; j < ent(2, 4); j++) {
          weighings.push({ id: id + 'w' + j, animalId: id, date: data, weight: peso, jejum: false });
          data = maisDias(data, ent(25, 60));
          peso += ent(10, 70);
        }
      }
      recomputarLivros();
      tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
      document.querySelectorAll('details[data-dobra]').forEach(d => { d.open = true; });

      const ge = gmdGeralRebanho();
      const ep = gmdEntrePesagens();
      const tresCasas = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

      // o cabeçalho do bloco traz o número do rebanho
      const cab = ($('bov-gmd-pes').querySelector('.dobra-cab') || {}).innerText || '';
      regra('o cabeçalho do bloco mostra o GMD do rebanho',
        ge.gmd == null || cab.indexOf(tresCasas(ge.gmd)) >= 0, cab.replace(/\\n/g, ' | ') + ' | esperado ' + (ge.gmd == null ? '—' : tresCasas(ge.gmd)));
      // e o corpo repete o mesmo número, com a conta que o produziu
      const corpo = ($('bov-gmd-geral') || {}).innerText || '';
      regra('o corpo do bloco mostra o mesmo número do cabeçalho',
        ge.gmd == null || corpo.indexOf(tresCasas(ge.gmd)) >= 0, corpo.replace(/\\n/g, ' | '));
      regra('e diz quantos animais e quantos dias-animal entraram na conta',
        ge.gmd == null || (corpo.indexOf(String(ge.n)) >= 0 && corpo.indexOf(String(ge.dias)) >= 0),
        corpo.replace(/\\n/g, ' | '));

      // cada linha de rodada na tela bate com a linha calculada
      const linhasTela = [].slice.call(document.querySelectorAll('#bov-gmd-pes-lista .gm-linha'));
      regra('a tela desenha uma linha por rodada de pesagem',
        linhasTela.length === Math.min(12, ep.linhas.length),
        linhasTela.length + ' vs ' + Math.min(12, ep.linhas.length));
      linhasTela.forEach((el, i) => {
        const l = ep.linhas[i];
        const txt = el.innerText.replace(/\\s+/g, ' ');
        regra('cada linha da tela mostra o GMD daquela rodada',
          !l || txt.indexOf(tresCasas(l.gmd)) >= 0, txt + ' | esperado ' + (l ? tresCasas(l.gmd) : '?'));
        regra('e quantos animais entraram nela',
          !l || txt.indexOf(String(l.animais)) >= 0, txt + ' | ' + (l ? l.animais : '?'));
      });

      // o cartão "GMD médio" é outra conta, e a tela precisa dizer isso
      const ativos = animals.filter(a => !a.sold && !a.dead);
      const gmdsAtivos = ativos.map(a => {
        const ws = pesagensDe(a.id);
        if (ws.length < 2) return null;
        const d = dias2(ws[0].date, ws[ws.length - 1].date);
        return d > 0 ? (ws[ws.length - 1].weight - ws[0].weight) / d : null;
      }).filter(x => x !== null);
      const media = gmdsAtivos.length ? gmdsAtivos.reduce((x, g) => x + g, 0) / gmdsAtivos.length : null;
      const cartao = [].slice.call(document.querySelectorAll('#bov-stats .stat'))
        .filter(e => /GMD médio/i.test(e.innerText))[0];
      regra('o cartão GMD médio é a média dos animais do rebanho, um a um',
        !cartao || media === null || cartao.innerText.indexOf(tresCasas(media)) >= 0,
        (cartao ? cartao.innerText.replace(/\\n/g, ' ') : 'sem cartão') + ' | esperado ' + (media === null ? '—' : tresCasas(media)));
      // os dois números convivem na mesma tela: a diferença tem de estar escrita
      const nota = ($('bov-gmd-pes-nota') || {}).innerText || '';
      regra('a tela explica por que o cartão e o bloco podem não bater',
        /GMD médio/i.test(nota) && /dias/i.test(nota), nota.slice(0, 120));
      regra('e avisa que o animal vendido continua na conta do rebanho',
        /vendid/i.test(nota), nota.slice(0, 120));

      // ---- o arquivo de pesagens ----
      let csvTxt = '';
      const origDown = window.download;
      window.download = function (n2, c) { csvTxt = String(c); };
      $('menu-exp-pes').click();
      window.download = origDown;
      const linhasCsv = csvTxt.split('\\n').slice(1).filter(Boolean);
      let confCsv = 0;
      animals.forEach(a => {
        const ws = pesagensDe(a.id);
        for (let i = 1; i < ws.length; i++) {
          const d = dias2(ws[i - 1].date, ws[i].date);
          const g = (ws[i].weight - ws[i - 1].weight) / d;
          const alvo = linhasCsv.filter(l => {
            const c = l.split(';');
            return c[0] === a.ident && c[4] === String(ws[i].weight);
          })[0];
          if (!alvo) continue;
          const col = alvo.split(';');
          const esperado = g.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
          regra('o arquivo de pesagens traz o ganho desde a pesagem anterior',
            col[6] === esperado, a.ident + ' ' + ws[i].date + ': ' + col[6] + ' vs ' + esperado);
          regra('e os dias desde ela', col[7] === String(d), col[7] + ' vs ' + d);
          confCsv++;
        }
      });
      regra('o arquivo de pesagens foi conferido de verdade', confCsv > 0, String(confCsv));

      // ---- o relatório ----
      let rel = '';
      window.download = function (n2, c) { rel = String(c); };
      exportRelatorio('bov');
      window.download = origDown;
      regra('o relatório traz o GMD do rebanho igual ao da tela',
        ge.gmd == null || rel.indexOf(tresCasas(ge.gmd)) >= 0,
        'esperado ' + (ge.gmd == null ? '—' : tresCasas(ge.gmd)));
      gmdPorMes().meses.slice(0, 24).forEach(m => {
        regra('e o mês a mês do relatório bate com o da tela',
          rel.indexOf(tresCasas(m.gmd)) >= 0, m.mes + ' ' + tresCasas(m.gmd));
      });
    }
    return falhas;
  })(${Math.max(20, Math.round(QTD / 20))})`);
  marcar(f3, Math.max(20, Math.round(QTD / 20)));

  // ================= 4. OS CASOS QUE QUEBRAM CONTA =================
  t.secao('4. os casos de curral que costumam quebrar a conta');
  const f4 = await pagina.evaluate(`(function () {
    ${APOIO(SEMENTE + 31)}
    const montar = ws => {
      animals = [{ id: 'x', ident: '1', cat: 'Novilha' }];
      weighings = ws.map((w, i) => ({ id: 'w' + i, animalId: 'x', date: w[0], weight: w[1],
        jejum: !!w[2] }));
      recomputarLivros();
    };
    // uma pesagem só: não há ganho a mostrar, e inventar um seria pior
    montar([['2026-03-01', 300]]);
    regra('com uma pesagem só, não há GMD — e o aplicativo não inventa um',
      gmdTotal(wOf('x')) === null && gmdGeralRebanho().gmd === null, 'inventou');
    regra('e o mês a mês fica vazio', gmdPorMes().meses.length === 0, 'tem mês');

    // duas no mesmo dia: zero dia não divide
    montar([['2026-03-01', 300], ['2026-03-01', 310]]);
    regra('duas pesagens no mesmo dia não viram divisão por zero',
      gmdTotal(wOf('x')) === null && gmdGeralRebanho().gmd === null,
      String(gmdTotal(wOf('x'))));

    // perda de peso: o número é negativo, e tem de aparecer como negativo
    montar([['2026-03-01', 400], ['2026-04-01', 370]]);
    const perdeu = gmdTotal(wOf('x'));
    regra('perda de peso dá GMD negativo, e não some da conta',
      perdeu !== null && perdeu < 0 && perto(perdeu, -30 / 31, 1e-12), String(perdeu));
    regra('e o mês a mês também mostra a perda',
      gmdPorMes().meses.every(m => m.gmd < 0), JSON.stringify(gmdPorMes().meses));

    // fora de ordem no cadastro: a conta é por DATA, não pela ordem de digitação
    animals = [{ id: 'y', ident: '2', cat: 'Novilha' }];
    weighings = [
      { id: 'y2', animalId: 'y', date: '2026-06-01', weight: 400, jejum: false },
      { id: 'y1', animalId: 'y', date: '2026-03-01', weight: 300, jejum: false },
      { id: 'y3', animalId: 'y', date: '2026-04-15', weight: 340, jejum: false }
    ];
    recomputarLivros();
    regra('pesagem digitada fora de ordem não inverte o ganho',
      perto(gmdTotal(wOf('y')), 100 / dias2('2026-03-01', '2026-06-01'), 1e-12),
      String(gmdTotal(wOf('y'))));
    regra('e a mais recente é a de data maior, não a última digitada',
      perto(gmdRecent(wOf('y')), 60 / dias2('2026-04-15', '2026-06-01'), 1e-12),
      String(gmdRecent(wOf('y'))));

    // ano bissexto, virada de ano e mês de 31
    montar([['2024-02-01', 300], ['2024-03-01', 329]]);
    regra('fevereiro de ano bissexto tem 29 dias na conta',
      perto(gmdTotal(wOf('x')), 29 / 29, 1e-12), String(gmdTotal(wOf('x'))));
    montar([['2025-12-15', 300], ['2026-01-15', 331]]);
    regra('a virada de ano não perde dia',
      perto(gmdTotal(wOf('x')), 31 / 31, 1e-12), String(gmdTotal(wOf('x'))));
    const m2 = gmdPorMes().meses.map(m => m.mes + ':' + m.dias).sort().join(' ');
    regra('e reparte os dias entre dezembro e janeiro',
      m2 === '2025-12:16 2026-01:15', m2);

    // jejum misturado fica de fora, e é contado
    montar([['2026-03-01', 300, true], ['2026-04-01', 340, false]]);
    regra('jejum contra cheio fica fora do GMD do rebanho',
      gmdGeralRebanho().gmd === null && gmdGeralRebanho().fora === 1,
      JSON.stringify(gmdGeralRebanho()));
    regra('e o mês a mês conta o intervalo como misturado',
      gmdPorMes().misturados === 1 && gmdPorMes().meses.length === 0,
      JSON.stringify(gmdPorMes()));
    regra('mas o animal ainda mostra o número dele, marcado como misto',
      gmdInfo(wOf('x')).gmd !== null && gmdInfo(wOf('x')).misto === true,
      JSON.stringify(gmdInfo(wOf('x'))));

    // pesagem com data no futuro não projeta para trás
    montar([['2026-03-01', 300], ['2030-01-01', 500]]);
    const proj = projetar(animals[0], 0.8, '2026-10-19');
    regra('pesagem com data no futuro não faz a projeção andar para trás',
      proj && proj.dias === 0 && proj.peso === 500, JSON.stringify(proj));

    // rodada de curral: dias seguidos são a MESMA pesagem
    animals = []; weighings = [];
    for (let i = 0; i < 6; i++) {
      animals.push({ id: 'r' + i, ident: 'R' + i, cat: 'Novilha' });
      weighings.push({ id: 'r' + i + 'a', animalId: 'r' + i, date: '2026-03-0' + (1 + (i % 3)), weight: 300, jejum: false });
      weighings.push({ id: 'r' + i + 'b', animalId: 'r' + i, date: '2026-06-1' + (i % 3), weight: 360, jejum: false });
    }
    recomputarLivros();
    const rods = gmdEntrePesagens();
    regra('três dias seguidos de curral contam como uma rodada só',
      rods.linhas.length === 1, JSON.stringify(rods.linhas.map(l => l.ini + '–' + l.fim)));
    regra('e a rodada junta os seis animais',
      rods.linhas[0] && rods.linhas[0].animais === 6,
      JSON.stringify(rods.linhas[0]));
    return falhas;
  })()`);
  marcar(f4, 1);

  t.conferir('nenhum erro de JavaScript na varredura do GMD',
    errosJS.length === 0, errosJS.slice(0, 3).join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
