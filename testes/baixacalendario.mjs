// Dar baixa numa conta tem de tirar o lembrete dela do calendário.
//
// O mecanismo já existia e funcionava: pagar gerava o arquivo de cancelamento,
// com STATUS:CANCELLED e sem alarme. O defeito era outro, e era de PALAVRA — o
// pior tipo, porque nada quebra e a conta continua apitando.
//
// A tela que abre sozinha dizia, sempre: "esta tela abriu sozinha porque você
// acabou de LANÇAR UMA CONTA A PRAZO". Era o que ela dizia também quando abria
// por uma conta PAGA. Quem acabou de dar baixa lia aquilo, não reconhecia a
// própria ação, fechava a tela — e o alarme da conta quitada seguia tocando no
// celular todo dia.
//
// Nenhum aplicativo web escreve no calendário do iPhone sozinho: a Apple exige
// um toque. O que o aplicativo PODE fazer é abrir a tela certa na hora certa e
// explicar o que aquele toque faz. É isso que esta bateria cobra.
import { servir, abrirApp, placar } from './apoio.mjs';

const campo = (texto, nome) => {
  const l = texto.split('\r\n').find(x => x.indexOf(nome + ':') === 0);
  return l ? l.slice(nome.length + 1) : null;
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Baixa de conta no calendário');
  pagina.on('dialog', d => d.accept());

  // ---------- lançar e depois pagar ----------
  t.secao('a conta vai para o calendário e depois sai dele');
  const fluxo = await pagina.evaluate(() => {
    const saidas = [];
    bovT = []; avT = []; gerT = []; animals = []; items = []; moves = [];
    LS.del('fjs-ics-enviados'); LS.s('fjs-ics-auto', true);
    const orig = window.mostrarSaida;
    window.mostrarSaida = o => { saidas.push(o); };
    bovT = [{ id: 'c1', date: '2026-09-01', type: 'saida', amount: 1000,
      category: 'Lenha', venc: '2026-11-10', pago: false }];
    const abriuAoLancar = agendarMudanca([bovT[0]], 'bov');
    const lembrada = Object.keys(enviadosICS());
    const conta = bovT[0];
    conta.pago = true; conta.pagoEm = todayISO();
    const abriuAoPagar = agendarMudanca([conta], 'bov');
    window.mostrarSaida = orig;
    return { abriuAoLancar, abriuAoPagar, lembrada,
      n: saidas.length,
      motivo1: saidas[0] && saidas[0].motivo, motivo2: saidas[1] && saidas[1].motivo,
      resumo2: saidas[1] && saidas[1].resumo,
      ics: saidas[1] && saidas[1].cru };
  });
  t.conferir('lançar a prazo abre a agenda sozinha', fluxo.abriuAoLancar === true);
  t.conferir('e o aplicativo guarda que aquela conta foi para o calendário',
    fluxo.lembrada.join(',') === 'c1', fluxo.lembrada.join(','));
  t.conferir('dar baixa abre a agenda de novo, para tirar o lembrete',
    fluxo.abriuAoPagar === true);

  const ics = fluxo.ics || '';
  t.conferir('o arquivo cancela exatamente aquele evento',
    /STATUS:CANCELLED/.test(ics) && /UID:c1@fazendajs/.test(ics),
    campo(ics, 'UID'));
  // Mesmo UID é o que faz o calendário ATUALIZAR o evento que já está lá, em
  // vez de criar um segundo ao lado do primeiro.
  t.conferir('com o MESMO identificador, para atualizar e não duplicar',
    (ics.match(/UID:/g) || []).length === 1, String((ics.match(/UID:/g) || []).length));
  t.conferir('e com sequência maior, senão o calendário ignora a atualização',
    Number(campo(ics, 'SEQUENCE')) > 0, campo(ics, 'SEQUENCE'));
  // O alarme é a razão de tudo isto: conta paga não pode acordar ninguém.
  t.conferir('o cancelamento não leva alarme nenhum junto',
    !/BEGIN:VALARM/.test(ics), '');
  t.conferir('o título diz que está paga', /SUMMARY:✔ PAGA/.test(ics),
    campo(ics, 'SUMMARY'));

  // ---------- a tela precisa dizer POR QUE abriu ----------
  // É aqui que estava o defeito.
  t.secao('a tela explica o que aquele toque faz');
  t.conferir('ao lançar, o motivo é "conta nova"', fluxo.motivo1 === 'nova', String(fluxo.motivo1));
  t.conferir('ao pagar, o motivo é "baixa" — e não "conta nova"',
    fluxo.motivo2 === 'baixa', String(fluxo.motivo2));
  t.conferir('o resumo conta quantas saem da agenda',
    /1 paga\(s\) saem da agenda/.test(fluxo.resumo2 || ''), fluxo.resumo2);

  const texto = await pagina.evaluate(() => {
    bovT = [{ id: 'c2', date: '2026-09-01', type: 'saida', amount: 500,
      category: 'Frete', venc: '2026-12-01', pago: true, pagoEm: todayISO() }];
    LS.s('fjs-ics-enviados', { c2: { venc: '2026-12-01', nome: 'Frete' } });
    LS.s('fjs-ics-auto', true);
    agendarMudanca([bovT[0]], 'bov');
    return { frase: $('ag-auto-motivo').textContent,
      botao: $('ag-abrir').textContent,
      visivel: !$('ag-auto').hidden };
  });
  t.conferir('a explicação aparece na tela', texto.visivel && texto.frase.length > 40);
  t.conferir('e fala de DAR BAIXA, não de lançar conta',
    /dar baixa/i.test(texto.frase) && !/acabou de lançar/i.test(texto.frase),
    texto.frase.slice(0, 70));
  t.conferir('avisa que sem o toque o alarme da conta paga continua tocando',
    /continua tocando/i.test(texto.frase), '');
  t.conferir('e o botão fala em ATUALIZAR, que é o que vai acontecer',
    texto.botao === 'Atualizar o Calendário', texto.botao);

  // ---------- conta que nunca foi para o calendário ----------
  // Abrir a tela para cancelar um lembrete que não existe seria pedir um toque
  // à toa, toda vez que alguém desse baixa.
  t.secao('conta que nunca foi para o calendário');
  const nunca = await pagina.evaluate(() => {
    LS.del('fjs-ics-enviados');
    bovT = [{ id: 'c3', date: '2026-09-01', type: 'saida', amount: 300,
      category: 'Sal', venc: '2026-12-20', pago: true, pagoEm: todayISO() }];
    return agendarMudanca([bovT[0]], 'bov');
  });
  t.conferir('não abre tela nenhuma, porque não há lembrete a tirar',
    nunca === false, String(nunca));

  // ---------- pagar pelo botão da lista ----------
  // É o caminho mais usado — mais do que abrir o formulário.
  t.secao('pagar pelo botão da lista');
  const peloBotao = await pagina.evaluate(() => {
    const saidas = [];
    LS.del('fjs-ics-enviados'); LS.s('fjs-ics-auto', true);
    gerT = []; avT = [];
    bovT = [{ id: 'c4', date: '2026-09-01', type: 'saida', amount: 777,
      category: 'Energia elétrica', venc: '2026-11-05', pago: false }];
    LS.s('fjs-ics-enviados', { c4: { venc: '2026-11-05', nome: 'Energia elétrica' } });
    const orig = window.mostrarSaida;
    window.mostrarSaida = o => { saidas.push(o); };
    const origC = window.confirm; window.confirm = () => true;
    tab = 'bovinos'; seg = 'financeiro';
    $('bfin-period').value = 'all'; guardarPeriodo('bfin-period');
    LS.s('fjs-dobra-apagar-bov', true);
    render();
    const botao = document.querySelector('#bfin-apagar [data-pagar]');
    if (botao) botao.click();
    window.confirm = origC; window.mostrarSaida = orig;
    return { achouBotao: !!botao, pago: !!bovT[0].pago,
      abriu: saidas.length, motivo: saidas[0] && saidas[0].motivo,
      cancelou: saidas[0] ? /STATUS:CANCELLED/.test(saidas[0].cru) : false,
      uid: saidas[0] ? /UID:c4@fazendajs/.test(saidas[0].cru) : false };
  });
  t.conferir('o botão "Pagar" está na lista', peloBotao.achouBotao);
  t.conferir('ele marca a conta como paga', peloBotao.pago);
  t.conferir('e dispara o cancelamento no calendário, pelo caminho mais usado',
    peloBotao.abriu === 1 && peloBotao.motivo === 'baixa'
    && peloBotao.cancelou && peloBotao.uid,
    `${peloBotao.abriu} tela(s) · motivo ${peloBotao.motivo}`);

  // ---------- quem desligou, fica desligado ----------
  t.secao('quem pediu para não abrir sozinho');
  const desligado = await pagina.evaluate(() => {
    LS.s('fjs-ics-auto', false);
    bovT = [{ id: 'c5', date: '2026-09-01', type: 'saida', amount: 100,
      category: 'Frete', venc: '2026-11-09', pago: true, pagoEm: todayISO() }];
    LS.s('fjs-ics-enviados', { c5: { venc: '2026-11-09', nome: 'Frete' } });
    const r = agendarMudanca([bovT[0]], 'bov');
    LS.s('fjs-ics-auto', true);
    return r;
  });
  t.conferir('a tela não abre sozinha para quem desligou', desligado === false);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
