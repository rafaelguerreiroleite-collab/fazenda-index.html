// VARREDURA DOS INTERVALOS: QUANTOS DIAS SEPARAM DUAS PESAGENS.
//
// Pedido do dono: varredura total entre uma pesagem e outra, conferindo os
// cálculos quantas vezes for necessário, e verificar se a contagem de dias
// para o GMD está correta.
//
// É a pergunta certa. O GMD é uma divisão, e o divisor é a contagem de dias:
// um dia a mais ou a menos muda o número e não deixa rastro nenhum. Num
// intervalo de 45 dias, errar um dia muda o GMD em 2% — o bastante para
// escolher o lote errado na hora de vender, e pequeno demais para alguém
// desconfiar.
//
// Por isso esta bateria tem um calendário PRÓPRIO, escrito do zero, que não
// chama Date em lugar nenhum: a contagem é feita pela fórmula dos dias civis,
// aritmética pura, que não tem fuso, não tem horário de verão e não tem
// virada de dia. É contra ele que a contagem do aplicativo é cobrada.
//
// Cinco frentes:
//   1. a contagem de dias, par a par, em milhares de datas sorteadas e em
//      todas as bordas conhecidas (fim de mês, ano bissexto, virada de ano);
//   2. a corrente: somar os intervalos um a um tem de dar o intervalo inteiro,
//      e a média ponderada dos GMDs tem de dar o GMD total;
//   3. a repartição por mês: nenhum dia inventado, nenhum dia perdido;
//   4. o MESMO número de dias em toda parte — tela, arquivo, brete, relatório;
//   5. o fuso do aparelho: o celular do curral está em São Paulo, o conferidor
//      roda em UTC, e já houve aplicativo que errava um dia por causa disso.
import { servir, abrirApp, placar } from './apoio.mjs';

const PARES = Number(process.env.INTERVALOS || 120000);
const CORRENTES = Number(process.env.CORRENTES || 4000);
const MESES = Number(process.env.MESESQTD || 6000);
const SEMENTE = Number(process.env.SEMENTE_INTERVALO || (Date.now() % 2147483647));

const FUSOS = ['UTC', 'America/Sao_Paulo', 'America/Manaus', 'Pacific/Kiritimati',
  'Pacific/Midway', 'America/New_York', 'Australia/Lord_Howe'];

// O calendário do conferidor. Nenhuma linha usa Date: é a fórmula dos dias
// civis (ano, mês, dia → número do dia desde uma origem fixa). Dois números
// subtraídos não têm fuso nem horário de verão para errar.
const CALENDARIO = `
  const diaCivil = (y, m, d) => {
    const yy = y - (m <= 2 ? 1 : 0);
    const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
    const yoe = yy - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  };
  const numDia = iso => { const p = iso.split('-').map(Number); return diaCivil(p[0], p[1], p[2]); };
  const contaDias = (a, b) => numDia(b) - numDia(a);
  const bissexto = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const diasNoMes = (y, m) => m === 2 && bissexto(y) ? 29 : DIAS_MES[m - 1];
  // data → iso, andando dia a dia sem Date
  const somaDia = (iso, n) => {
    let [y, m, d] = iso.split('-').map(Number);
    for (let i = 0; i < n; i++) {
      d++;
      if (d > diasNoMes(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } }
    }
    const p2 = x => String(x).padStart(2, '0');
    return y + '-' + p2(m) + '-' + p2(d);
  };
`;

const APOIO = semente => `
  let _s = ${semente} >>> 0;
  const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const perto = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-9 : e);
  ${CALENDARIO}
  const falhas = {};
  const regra = (nome, ok, caso) => {
    if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
  };
  const p2 = x => String(x).padStart(2, '0');
  const dataSorteada = () => {
    const y = ent(1990, 2060), m = ent(1, 12);
    return y + '-' + p2(m) + '-' + p2(ent(1, diasNoMes(y, m)));
  };
`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Varredura dos intervalos entre pesagens (${(PARES + CORRENTES + MESES).toLocaleString('pt-BR')} sorteios · semente ${SEMENTE})`);
  const marcar = (res, n) => Object.entries(res).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${n.toLocaleString('pt-BR')} sorteios` : caso));

  // ================= 1. A CONTAGEM DE DIAS =================
  t.secao(`1. quantos dias separam duas datas (${PARES.toLocaleString('pt-BR')} pares)`);
  const f1 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 5)}
    for (let k = 0; k < N; k++) {
      const a = dataSorteada(), b = dataSorteada();
      const meu = contaDias(a, b);
      const dele = daysBetween(a, b);
      regra('a contagem de dias bate com o calendário civil, dia a dia',
        meu === dele, a + ' → ' + b + ': ' + dele + ' em vez de ' + meu);
      regra('contar ao contrário dá o mesmo número com o sinal trocado',
        daysBetween(b, a) === -dele, a + ' ↔ ' + b);
      regra('a mesma data dá zero dia', daysBetween(a, a) === 0, a);
      regra('nenhuma contagem sai quebrada ou impossível',
        Number.isInteger(dele), a + ' → ' + b + ': ' + dele);
    }
    // ---- as bordas conhecidas, uma a uma, sem sorteio ----
    for (let y = 1996; y <= 2060; y++) {
      regra('fevereiro tem 29 dias em ano bissexto e 28 nos outros',
        daysBetween(y + '-02-01', y + '-03-01') === (bissexto(y) ? 29 : 28),
        y + ': ' + daysBetween(y + '-02-01', y + '-03-01'));
      regra('o dia 29 de fevereiro existe no ano bissexto',
        !bissexto(y) || daysBetween(y + '-02-28', y + '-02-29') === 1, String(y));
      regra('a virada de ano não perde nem ganha dia',
        daysBetween((y - 1) + '-12-31', y + '-01-01') === 1, String(y));
      regra('o ano inteiro tem 365 ou 366 dias',
        daysBetween(y + '-01-01', (y + 1) + '-01-01') === (bissexto(y) ? 366 : 365),
        y + ': ' + daysBetween(y + '-01-01', (y + 1) + '-01-01'));
      for (let m = 1; m <= 12; m++) {
        const ult = diasNoMes(y, m);
        regra('do último dia do mês para o dia 1º do seguinte é um dia',
          daysBetween(y + '-' + p2(m) + '-' + p2(ult),
            m === 12 ? (y + 1) + '-01-01' : y + '-' + p2(m + 1) + '-01') === 1,
          y + '-' + p2(m));
        regra('o mês inteiro tem o número de dias do calendário',
          daysBetween(y + '-' + p2(m) + '-01',
            m === 12 ? (y + 1) + '-01-01' : y + '-' + p2(m + 1) + '-01') === ult,
          y + '-' + p2(m) + ': ' + ult);
      }
    }
    // ---- as datas em que relógio costuma errar ----
    // Horário de verão: o Brasil não tem mais, mas o aparelho pode estar em
    // qualquer fuso, e a conta é feita ao meio-dia justamente para que o
    // adianta-uma-hora não vire um dia a mais nem a menos.
    [['2026-10-17', '2026-10-19'], ['2026-02-20', '2026-02-22'],
     ['2026-03-07', '2026-03-09'], ['2026-11-01', '2026-11-02'],
     ['2026-04-04', '2026-04-05'], ['2026-09-26', '2026-09-28']].forEach(par => {
      regra('as datas de mudança de horário não mexem na contagem',
        daysBetween(par[0], par[1]) === contaDias(par[0], par[1]),
        par[0] + ' → ' + par[1] + ': ' + daysBetween(par[0], par[1]));
    });
    return falhas;
  })(${PARES})`);
  marcar(f1, PARES);

  // ================= 2. A CORRENTE DE PESAGENS =================
  // Entre a primeira e a última pesagem de um animal há vários intervalos. Se
  // a soma deles não fechar com o intervalo inteiro, um pedaço do tempo do
  // bicho sumiu — e o GMD do período inteiro deixa de bater com o das partes.
  t.secao(`2. somar as pesagens uma a uma tem de dar o período inteiro (${CORRENTES.toLocaleString('pt-BR')} históricos)`);
  const f2 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 13)}
    for (let k = 0; k < N; k++) {
      // um animal, com uma fila de pesagens em datas crescentes
      const nW = ent(2, 10);
      let data = dataSorteada();
      let peso = ent(120, 450);
      const ws = [];
      for (let j = 0; j < nW; j++) {
        ws.push({ id: 'w' + j, animalId: 'a', date: data, weight: peso, jejum: false });
        data = somaDia(data, ent(1, 200));
        peso = peso + ent(-30, 120);
      }
      animals = [{ id: 'a', ident: '1', cat: 'Novilha' }];
      weighings = ws.slice();
      recomputarLivros();
      const lista = wOf('a');
      regra('o histórico do animal sai em ordem de data',
        lista.map(w => w.date).join() === ws.map(w => w.date).join(), '');

      // a corrente dos dias
      let somaDias = 0;
      for (let i = 1; i < lista.length; i++) somaDias += daysBetween(lista[i - 1].date, lista[i].date);
      const inteiro = daysBetween(lista[0].date, lista[lista.length - 1].date);
      regra('a soma dos intervalos é o intervalo inteiro',
        somaDias === inteiro, somaDias + ' vs ' + inteiro);
      regra('e bate com o calendário civil',
        inteiro === contaDias(lista[0].date, lista[lista.length - 1].date),
        String(inteiro));

      // a corrente dos quilos
      let somaKg = 0;
      for (let i = 1; i < lista.length; i++) somaKg += lista[i].weight - lista[i - 1].weight;
      regra('a soma dos ganhos é o ganho do período inteiro',
        perto(somaKg, lista[lista.length - 1].weight - lista[0].weight, 1e-9),
        somaKg + ' vs ' + (lista[lista.length - 1].weight - lista[0].weight));

      // o GMD do período é a média dos GMDs PESADA PELOS DIAS — não a média simples
      let pond = 0;
      for (let i = 1; i < lista.length; i++) {
        const d = daysBetween(lista[i - 1].date, lista[i].date);
        const g = gmdBetween(lista[i - 1], lista[i]);
        if (d > 0 && g !== null) pond += g * d;
      }
      const total = gmdTotal(lista);
      regra('o GMD do período é a média dos intervalos pesada pelos dias',
        total === null ? inteiro <= 0 : perto(pond / inteiro, total, 1e-9),
        (pond / inteiro) + ' vs ' + total);

      // e cada intervalo: quilo sobre dia, sem arredondar no meio
      for (let i = 1; i < lista.length; i++) {
        const d = contaDias(lista[i - 1].date, lista[i].date);
        const esperado = d > 0 ? (lista[i].weight - lista[i - 1].weight) / d : null;
        const obtido = gmdBetween(lista[i - 1], lista[i]);
        regra('cada intervalo é quilo ganho dividido pelos dias do calendário',
          esperado === null ? obtido === null : perto(esperado, obtido, 1e-12),
          lista[i - 1].date + ' → ' + lista[i].date + ': ' + obtido + ' vs ' + esperado);
      }
    }
    return falhas;
  })(${CORRENTES})`);
  marcar(f2, CORRENTES);

  // ================= 3. A REPARTIÇÃO POR MÊS =================
  t.secao(`3. repartir o intervalo pelos meses sem perder dia (${MESES.toLocaleString('pt-BR')} intervalos)`);
  const f3 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 29)}
    for (let k = 0; k < N; k++) {
      const ini = dataSorteada();
      const fim = somaDia(ini, ent(1, 420));
      const total = contaDias(ini, fim);
      const partes = diasPorMes(ini, fim);
      const chaves = Object.keys(partes).sort();
      const soma = chaves.reduce((x, m) => x + partes[m], 0);
      regra('a soma dos dias dos meses é o intervalo inteiro',
        soma === total, ini + ' → ' + fim + ': ' + soma + ' vs ' + total);
      regra('nenhum mês fica com zero ou menos dias',
        chaves.every(m => partes[m] > 0), ini + ' → ' + fim + ': ' + JSON.stringify(partes));
      regra('nenhum mês fica com mais dias do que ele tem',
        chaves.every(m => {
          const p = m.split('-').map(Number);
          return partes[m] <= diasNoMes(p[0], p[1]);
        }), ini + ' → ' + fim + ': ' + JSON.stringify(partes));
      regra('os meses vão do mês do começo ao mês do fim, sem buraco',
        chaves[0] >= ini.slice(0, 7) && chaves[chaves.length - 1] === fim.slice(0, 7),
        ini + ' → ' + fim + ': ' + chaves.join(' '));
      // a conta refeita dia a dia, do jeito mais burro possível
      const meu = {};
      for (let d = 1; d <= total; d++) {
        const dia = somaDia(ini, d);
        const m = dia.slice(0, 7);
        meu[m] = (meu[m] || 0) + 1;
      }
      regra('a repartição bate com a contagem feita dia a dia',
        JSON.stringify(partes) === JSON.stringify(meu),
        ini + ' → ' + fim + ': ' + JSON.stringify(partes) + ' vs ' + JSON.stringify(meu));
      // e o ganho repartido pelos dias devolve o ganho inteiro
      const ganho = ent(-40, 200);
      const repartido = chaves.reduce((x, m) => x + ganho * partes[m] / total, 0);
      regra('o ganho repartido pelos meses volta a somar o ganho inteiro',
        perto(repartido, ganho, 1e-9), repartido + ' vs ' + ganho);
    }
    return falhas;
  })(${MESES})`);
  marcar(f3, MESES);

  // ================= 4. O MESMO NÚMERO EM TODA PARTE =================
  // Dias contados de um jeito na tela e de outro no arquivo é como o mesmo
  // animal passa a ter dois GMDs — e quem confere no papel não descobre qual
  // dos dois está certo.
  t.secao('4. o mesmo número de dias na tela, no arquivo e no brete');
  const f4 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 41)}
    for (let k = 0; k < N; k++) {
      const ini = '2026-0' + ent(1, 5) + '-' + p2(ent(1, 28));
      const dias = ent(15, 120);
      const fim = somaDia(ini, dias);
      const p1 = ent(180, 320), p2peso = p1 + ent(10, 140);
      animals = [{ id: 'a', ident: '707', cat: 'Novilha' }];
      weighings = [
        { id: 'w1', animalId: 'a', date: ini, weight: p1, jejum: false },
        { id: 'w2', animalId: 'a', date: fim, weight: p2peso, jejum: false }
      ];
      items = []; moves = []; recomputarLivros();
      const gmdEsperado = (p2peso - p1) / dias;

      // a) o cálculo
      regra('o cálculo usa os dias do calendário',
        perto(gmdTotal(wOf('a')), gmdEsperado, 1e-12), String(gmdTotal(wOf('a'))));

      // b) a ficha do animal na tela
      tab = 'bovinos'; seg = 'rebanho'; detailAnimal = 'a'; render();
      const ficha = document.getElementById('view-bovinos').innerText.replace(/\\s+/g, ' ');
      const tresCasas = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
      regra('a ficha do animal mostra o GMD calculado com esses dias',
        ficha.indexOf(tresCasas(gmdEsperado)) >= 0,
        'esperado ' + tresCasas(gmdEsperado) + ' em: ' + ficha.slice(0, 160));

      // c) o arquivo de pesagens
      let csvTxt = '';
      const origDown = window.download;
      window.download = function (n2, c) { csvTxt = String(c); };
      $('menu-exp-pes').click();
      window.download = origDown;
      const linha = csvTxt.split('\\n').filter(l => l.indexOf(';' + p2peso + ';') >= 0)[0] || '';
      const col = linha.split(';');
      regra('o arquivo traz os mesmos dias desde a pesagem anterior',
        col[7] === String(dias), 'coluna dias = ' + col[7] + ', esperado ' + dias);
      regra('e o mesmo GMD da tela', col[6] === tresCasas(gmdEsperado),
        'coluna gmd = ' + col[6] + ', esperado ' + tresCasas(gmdEsperado));

      // d) o brete: pesar de novo anuncia o ganho desde a anterior
      detailAnimal = null;
      openWeighMode();
      $('wm-date').value = somaDia(fim, 30);
      $('wm-ident').value = '707';
      $('wm-peso').value = String(p2peso + 25);
      $('wm-save').click();
      const aviso = $('wm-last').textContent.replace(/\\s+/g, ' ');
      $('weigh-mode').hidden = true;
      regra('o brete anuncia o ganho contado nos mesmos dias',
        aviso.indexOf(tresCasas(25 / 30)) >= 0 || aviso.indexOf('30 dias') >= 0,
        aviso + ' | esperado ' + tresCasas(25 / 30));
      // a pesagem do brete entrou com a data certa
      const ultima = wOf('a')[wOf('a').length - 1];
      regra('e a pesagem do brete fica na data em que foi feita',
        ultima.date === somaDia(fim, 30), ultima.date + ' vs ' + somaDia(fim, 30));
    }
    return falhas;
  })(${Math.max(30, Math.round(CORRENTES / 100))})`);
  marcar(f4, Math.max(30, Math.round(CORRENTES / 100)));

  await navegador.close();

  // ================= 5. O FUSO DO APARELHO =================
  // O celular do curral está em São Paulo; esta bateria roda em UTC. Se a
  // contagem dependesse do fuso, o GMD do aparelho e o do conferidor seriam
  // diferentes — e os dois pareceriam certos.
  t.secao(`5. o mesmo número de dias em qualquer fuso do aparelho (${FUSOS.length} fusos)`);
  const medir = async fuso => {
    const { navegador: nav, pagina: pg } = await abrirApp(s.url, { fuso });
    const r = await pg.evaluate(`(function () {
      ${CALENDARIO}
      const pares = [['2026-05-01', '2026-06-15'], ['2024-02-01', '2024-03-01'],
        ['2025-12-15', '2026-01-15'], ['2020-01-01', '2026-01-01'],
        ['2026-10-17', '2026-10-19'], ['2026-02-28', '2026-03-01'],
        ['1999-12-31', '2000-01-01'], ['2026-11-01', '2026-11-02']];
      const contas = pares.map(p => daysBetween(p[0], p[1]));
      const civis = pares.map(p => contaDias(p[0], p[1]));
      animals = [{ id: 'a', ident: '1', cat: 'Novilha' }];
      weighings = [{ id: 'w1', animalId: 'a', date: '2026-05-01', weight: 300, jejum: false },
        { id: 'w2', animalId: 'a', date: '2026-06-15', weight: 345, jejum: false }];
      recomputarLivros();
      return { contas: contas.join(','), civis: civis.join(','),
        gmd: gmdTotal(wOf('a')), geral: gmdGeralRebanho().dias,
        meses: JSON.stringify(diasPorMes('2026-05-01', '2026-06-15')),
        hoje: todayISO(), hojeLocal: new Date().toLocaleDateString('en-CA') };
    })()`);
    await nav.close();
    return r;
  };
  const base = await medir(FUSOS[0]);
  t.conferir('a contagem do aplicativo é a do calendário civil',
    base.contas === base.civis, base.contas + ' vs ' + base.civis);
  for (const fuso of FUSOS) {
    const r = await medir(fuso);
    t.conferir(`${fuso}: os mesmos dias entre as mesmas datas`,
      r.contas === base.contas, r.contas + ' vs ' + base.contas);
    t.conferir(`${fuso}: o mesmo GMD`, r.gmd === base.gmd, r.gmd + ' vs ' + base.gmd);
    t.conferir(`${fuso}: os mesmos dias-animal e a mesma repartição por mês`,
      r.geral === base.geral && r.meses === base.meses,
      `${r.geral} dias-animal e ${r.meses} · esperado ${base.geral} e ${base.meses}`);
    // "hoje" é o dia DO APARELHO, e aí ele tem de seguir o fuso, não contrariá-lo
    t.conferir(`${fuso}: "hoje" é o dia do aparelho, não o de outro fuso`,
      r.hoje === r.hojeLocal, r.hoje + ' vs ' + r.hojeLocal);
  }

  const falhas = t.fim(errosJS);
  await s.fechar();
  return falhas;
}
