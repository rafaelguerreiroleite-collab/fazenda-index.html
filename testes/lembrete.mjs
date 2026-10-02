// O aviso de conta vencida, e o "Ver" que precisa levar ATÉ ela.
//
// O defeito relatado pelo dono: "clico em Ver na conta vencida e não me leva
// até ela". E não levava mesmo. O botão trocava de aba e de período, e parava
// aí. Três buracos, um em cima do outro:
//
//   1. quem JÁ ESTAVA na aba Fazenda via a tela não mudar absolutamente nada —
//      trocar para a aba onde já se está não é ir a lugar nenhum;
//   2. o bloco "A pagar" nasce recolhido, então, mesmo vindo de outra aba, a
//      conta continuava dobrada;
//   3. ninguém rolava a tela até o bloco, que fica abaixo do saldo e de três
//      outros blocos.
//
// Botão que promete levar e não leva é pior que botão nenhum: a pessoa toca,
// nada acontece, e ela conclui que o aplicativo travou.
import { servir, abrirApp, placar } from './apoio.mjs';

const MONTAR = () => {
  const hoje = todayISO();
  const dia = n => {
    const d = new Date(hoje + 'T12:00'); d.setDate(d.getDate() + n);
    const p = v => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  animals = []; weighings = []; items = []; moves = []; avT = [];
  // A vencida fica no livro GERAL de propósito: o aviso junta os três livros, e
  // levar para o Financeiro de Bovinos deixaria quem tem conta vencida de outro
  // livro numa tela onde ela não está.
  gerT = [{ id: 'g1', date: dia(-40), type: 'saida', amount: 3456, category: 'Lenha',
    venc: dia(-1), pago: false }];
  bovT = Array.from({ length: 12 }, (_, i) => ({
    id: 'b' + i, date: dia(-30), type: 'saida', amount: 1000 + i,
    category: 'Ração/insumos', venc: dia(20 + i), pago: false }));
  LS.del('fjs-lembrete-visto');
  LS.s('fjs-dobra-apagar-fz', false);   // como nasce: recolhido
  tab = 'bovinos'; seg = 'rebanho';
  $('fz-period').value = 'this-month'; guardarPeriodo('fz-period');
  render();
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Aviso de conta vencida');
  await pagina.evaluate(`(${MONTAR.toString()})()`);

  t.secao('o aviso aparece');
  const aviso = await pagina.evaluate(() => ({
    visivel: !$('lembrete').hidden,
    texto: $('lembrete').innerText.replace(/\s+/g, ' ').trim(),
    temVer: !!$('lb-ver')
  }));
  t.conferir('o aviso aparece com conta vencida', aviso.visivel);
  t.conferir('e diz qual é', /1 conta vencida/.test(aviso.texto) && /3\.456,00/.test(aviso.texto),
    aviso.texto);
  t.conferir('com um botão "Ver"', aviso.temVer);

  // ---------- vindo de outra aba ----------
  t.secao('tocar em "Ver" estando em Bovinos');
  await pagina.click('#lb-ver');
  await pagina.waitForTimeout(500);
  const deBovinos = await pagina.evaluate(() => ({
    aba: tab,
    periodo: $('fz-period').value,
    blocoAberto: !!document.querySelector('[data-dobra="apagar-fz"]').open,
    // A conta precisa estar LEGÍVEL, não só existir no HTML
    vencidaNaTela: $('fz-apagar').innerText.indexOf('Lenha') >= 0
  }));
  t.conferir('vai para a aba Fazenda, a única que lista os três livros',
    deBovinos.aba === 'fazenda', deBovinos.aba);
  t.conferir('abre o período, senão a conta pode estar fora dele',
    deBovinos.periodo === 'all', deBovinos.periodo);
  t.conferir('ABRE o bloco "A pagar", que nasce recolhido', deBovinos.blocoAberto);
  t.conferir('e a conta vencida fica visível na tela', deBovinos.vencidaNaTela);

  // ---------- o caso que falhava: já estar na Fazenda ----------
  // É exatamente a situação da foto que o dono mandou.
  t.secao('tocar em "Ver" já estando na Fazenda');
  await pagina.evaluate(() => {
    LS.s('fjs-dobra-apagar-fz', false);
    LS.del('fjs-lembrete-visto');
    tab = 'fazenda';
    $('fz-period').value = 'all'; guardarPeriodo('fz-period');
    render();
    window.scrollTo(0, 0);
    // Marca a posição de partida para provar que a tela ANDOU.
    window.__scrollAntes = window.scrollY;
  });
  await pagina.waitForTimeout(150);
  const antes = await pagina.evaluate(() => ({
    aberto: !!document.querySelector('[data-dobra="apagar-fz"]').open,
    scroll: window.scrollY
  }));
  t.conferir('o bloco começa recolhido e a tela no topo',
    antes.aberto === false && antes.scroll === 0, `aberto ${antes.aberto} · y ${antes.scroll}`);

  await pagina.click('#lb-ver');
  await pagina.waitForTimeout(900);   // a rolagem é suave
  const depois = await pagina.evaluate(() => {
    const el = $('fz-apagar');
    const r = el.getBoundingClientRect();
    return {
      aberto: !!document.querySelector('[data-dobra="apagar-fz"]').open,
      scroll: Math.round(window.scrollY),
      // Dentro da janela, e não atrás do cabeçalho grudado no topo
      topo: Math.round(r.top),
      dentroDaTela: r.top >= 0 && r.top < window.innerHeight,
      texto: el.innerText.replace(/\s+/g, ' ')
    };
  });
  t.conferir('o bloco abre mesmo já estando na Fazenda', depois.aberto);
  // O coração do defeito: antes, a tela não saía do lugar.
  t.conferir('a tela ANDA até o bloco das contas', depois.scroll > 0,
    `rolou para y=${depois.scroll}`);
  t.conferir('e o bloco para dentro da janela, não atrás do cabeçalho',
    depois.dentroDaTela, `topo em ${depois.topo}px`);
  t.conferir('a conta vencida está lá, com valor e data',
    /Lenha/.test(depois.texto) && /3\.456,00/.test(depois.texto),
    (depois.texto.match(/Lenha[^·]*·[^R]*R\$ ?[\d.,]+/) || ['não achei'])[0]);

  // ---------- e dá para resolver a conta por ali ----------
  t.secao('resolver a conta sem sair dali');
  const resolveu = await pagina.evaluate(() => {
    const botao = [...$('fz-apagar').querySelectorAll('[data-pagar]')]
      .find(b => b.closest('.ap-linha').innerText.indexOf('Lenha') >= 0);
    if (!botao) return { achou: false };
    const original = window.confirm; window.confirm = () => true;
    botao.click();
    window.confirm = original;
    const c = gerT.find(x => x.id === 'g1');
    return { achou: true, pago: !!c.pago, em: c.pagoEm,
      saiuDaLista: $('fz-apagar').innerText.indexOf('Lenha') < 0 };
  });
  t.conferir('o botão de pagar está na própria linha da conta', resolveu.achou);
  t.conferir('dar baixa marca como paga, com a data', resolveu.pago && !!resolveu.em,
    String(resolveu.em));
  t.conferir('e a conta sai da lista de a pagar', resolveu.saiuDaLista);

  // ---------- dispensar por hoje ----------
  t.secao('dispensar o aviso');
  await pagina.evaluate(() => {
    gerT[0].pago = false; gerT[0].pagoEm = null;
    LS.del('fjs-lembrete-visto'); render();
  });
  await pagina.click('#lb-fechar');
  await pagina.waitForTimeout(150);
  const dispensou = await pagina.evaluate(() => ({
    escondido: $('lembrete').hidden,
    marca: LS.g('fjs-lembrete-visto', ''),
    // Dispensar é por HOJE, não para sempre: a conta continua devendo.
    continuaDevendo: contasAPagar(gerT).length
  }));
  t.conferir('o × esconde o aviso', dispensou.escondido);
  t.conferir('e marca só o dia de hoje, não para sempre',
    dispensou.marca === await pagina.evaluate(() => todayISO()), dispensou.marca);
  t.conferir('a conta continua em aberto — dispensar não é pagar',
    dispensou.continuaDevendo === 1, String(dispensou.continuaDevendo));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
