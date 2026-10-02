// O selo no ícone: lembrete que não pede confirmação nenhuma.
//
// O pedido foi "criar o lembrete sem me fazer confirmar no calendário". No
// calendário não dá — a Apple exige um toque para qualquer aplicativo pôr ou
// tirar evento, e nenhuma página da web passa por cima disso. O que passa é o
// número vermelho no canto do ícone: pede permissão UMA vez e depois atualiza
// calado, toda vez que o aplicativo abre.
//
// O que esta bateria cobra é que ele conte a coisa certa e, principalmente,
// que ele DESÇA. Selo que sobe e não desce é pior do que selo nenhum: a pessoa
// paga tudo, o 3 continua no ícone, e em uma semana ela para de olhar.
import { servir, abrirApp, placar } from './apoio.mjs';

const MONTAR = () => {
  const hoje = todayISO();
  const dia = n => {
    const d = new Date(hoje + 'T12:00'); d.setDate(d.getDate() + n);
    const p = v => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  animals = []; weighings = []; items = []; moves = []; pendentes = [];
  LS.s('fjs-ics-auto', false);
  LS.s('fjs-lembrete-visto', hoje);     // o aviso de topo não interessa aqui
  bovT = [
    { id: 'v1', date: dia(-40), type: 'saida', amount: 500, category: 'Frete',
      venc: dia(-3), pago: false },                       // vencida
    { id: 'v2', date: dia(-10), type: 'saida', amount: 300, category: 'Lenha',
      venc: dia(2), pago: false },                        // vence em 2 dias
    { id: 'v3', date: dia(-10), type: 'saida', amount: 900, category: 'Ração/insumos',
      venc: dia(60), pago: false },                       // longe: não conta
    { id: 'v4', date: dia(-10), type: 'saida', amount: 100, category: 'Vacina',
      venc: dia(1), pago: true, pagoEm: dia(-1) },        // já paga: não conta
    { id: 'v5', date: dia(-5), type: 'entrada', amount: 7000, category: 'Venda de gado',
      venc: dia(3), pago: false }                         // a RECEBER: não é conta a pagar
  ];
  gerT = [{ id: 'g1', date: dia(-20), type: 'saida', amount: 1200, category: 'Contador/serviços',
    venc: dia(5), pago: false }];                         // outro livro: conta
  avT = [];
  tab = 'bovinos'; seg = 'rebanho';
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Selo no ícone do aplicativo');
  pagina.on('dialog', d => d.accept());

  // O aparelho de teste pode não ter a API; o dublê deixa a conferência
  // acontecer de qualquer jeito, e registra o que o aplicativo pediu.
  await pagina.evaluate(() => {
    window.__selo = [];
    navigator.setAppBadge = n => { window.__selo.push(n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__selo.push(0); return Promise.resolve(); };
    window.Notification = { permission: 'granted', requestPermission: async () => 'granted' };
  });
  await pagina.evaluate(`(${MONTAR.toString()})()`);

  // ---------- desligado, não mexe no ícone ----------
  t.secao('desligado');
  const desligado = await pagina.evaluate(() => {
    LS.s('fjs-selo', false); seloAtual = -1; window.__selo = [];
    render();
    return { pedidos: window.__selo.slice(), contaria: contasDoSelo() };
  });
  // Ligar sozinho seria pedir permissão de notificação que ninguém pediu.
  t.conferir('nasce desligado e não põe número nenhum no ícone',
    desligado.pedidos.every(n => n === 0), JSON.stringify(desligado.pedidos));
  t.conferir('mas já sabe quantas contariam', desligado.contaria === 3,
    String(desligado.contaria));

  // ---------- ligar pelo menu ----------
  t.secao('ligar pelo menu');
  await pagina.evaluate(() => { window.__selo = []; $('menu-selo').click(); });
  await pagina.waitForTimeout(250);
  const ligou = await pagina.evaluate(() => ({
    guardado: LS.g('fjs-selo', false),
    pedidos: window.__selo.slice(),
    rotulo: (() => { rotuloSelo(); return $('menu-selo-rot').textContent; })()
  }));
  t.conferir('o menu liga o selo', ligou.guardado === true);
  t.conferir('e põe no ícone o número de contas vencendo ou vencidas',
    ligou.pedidos[ligou.pedidos.length - 1] === 3, JSON.stringify(ligou.pedidos));
  t.conferir('o menu passa a mostrar que está ligado',
    /LIGADO/.test(ligou.rotulo), ligou.rotulo);

  // ---------- o que entra na conta ----------
  t.secao('o que o número conta');
  const conta = await pagina.evaluate(() => {
    const porId = id => LIVROS.flatMap(b => contasAPagar(arrLivro(b)))
      .filter(c => c.dias <= AVISO_DIAS).some(c => c.id === id);
    return { vencida: porId('v1'), perto: porId('v2'), longe: porId('v3'),
      paga: porId('v4'), aReceber: porId('v5'), outroLivro: porId('g1') };
  });
  t.conferir('conta a vencida', conta.vencida);
  t.conferir('conta a que vence nos próximos dias', conta.perto);
  t.conferir('conta a de OUTRO livro — a fazenda paga de um bolso só', conta.outroLivro);
  t.conferir('não conta a que vence daqui a dois meses', !conta.longe);
  t.conferir('não conta a que já foi paga', !conta.paga);
  // Selo é de dívida. Pôr recebimento ali faria o número subir por dinheiro
  // que ENTRA, e aí ele não quer dizer mais nada.
  t.conferir('não conta recebimento a receber, que não é dívida', !conta.aReceber);

  // ---------- o selo DESCE ----------
  // A parte que importa: selo que não desce é desligado pelo usuário em uma
  // semana, e aí não serve mais para nada.
  t.secao('pagar faz o número cair');
  const caiu = await pagina.evaluate(() => {
    window.__selo = [];
    const c = bovT.find(x => x.id === 'v1');
    c.pago = true; c.pagoEm = todayISO();
    render();
    const depoisDeUma = window.__selo.slice();
    bovT.find(x => x.id === 'v2').pago = true;
    gerT[0].pago = true;
    render();
    return { depoisDeUma, depoisDeTodas: window.__selo.slice() };
  });
  t.conferir('pagar uma conta baixa o número para 2',
    caiu.depoisDeUma[caiu.depoisDeUma.length - 1] === 2, JSON.stringify(caiu.depoisDeUma));
  t.conferir('pagar todas LIMPA o ícone, em vez de deixar número velho',
    caiu.depoisDeTodas[caiu.depoisDeTodas.length - 1] === 0,
    JSON.stringify(caiu.depoisDeTodas));

  // ---------- não repinta à toa ----------
  t.secao('não repinta à toa');
  const repinta = await pagina.evaluate(() => {
    window.__selo = [];
    render(); render(); render();
    return window.__selo.length;
  });
  // render() roda a cada toque na tela; pedir ao sistema para repintar o ícone
  // a cada toque é trabalho jogado fora.
  t.conferir('desenhar a tela de novo, com o mesmo número, não mexe no ícone',
    repinta === 0, String(repinta));

  // ---------- desligar ----------
  t.secao('desligar');
  const desligou = await pagina.evaluate(() => {
    const c = bovT.find(x => x.id === 'v1');
    c.pago = false;                       // volta a dever
    render();
    window.__selo = [];
    $('menu-selo').click();
    return { guardado: LS.g('fjs-selo', false), pedidos: window.__selo.slice() };
  });
  t.conferir('o menu desliga', desligou.guardado === false);
  t.conferir('e limpa o ícone ao desligar, sem deixar número para trás',
    desligou.pedidos[desligou.pedidos.length - 1] === 0, JSON.stringify(desligou.pedidos));

  // ---------- aparelho sem selo ----------
  t.secao('aparelho que não tem selo');
  const semApi = await pagina.evaluate(() => {
    const guardaSet = navigator.setAppBadge, guardaClear = navigator.clearAppBadge;
    delete navigator.setAppBadge; delete navigator.clearAppBadge;
    let quebrou = false;
    try { LS.s('fjs-selo', true); seloAtual = -1; atualizarSelo(); render(); }
    catch (e) { quebrou = true; }
    navigator.setAppBadge = guardaSet; navigator.clearAppBadge = guardaClear;
    LS.s('fjs-selo', false);
    return quebrou;
  });
  // Aparelho velho ou navegador sem a função não pode derrubar a tela inteira.
  t.conferir('aparelho sem a função não quebra nada', semApi === false);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
