// Preço da arroba na venda.
//
// O custo da arroba já era calculado; o preço RECEBIDO por ela não existia em
// lugar nenhum. Sem os dois lados, "a arroba me custa R$ 280" é meia conta — a
// que decide é a diferença, e ela ficava na cabeça de quem administra.
//
// A armadilha desta conta é a média. Média de razões não é razão de médias: um
// boi de 20@ vendido a R$ 300 e um de 10@ a R$ 360 dão média simples de R$ 330,
// e o que entrou no bolso foram R$ 320 por arroba. O número errado é o que
// parece mais justo — é por isso que engana, e é por isso que ele tem teste.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Preço da arroba na venda');

  const r = await pagina.evaluate(() => {
    settings.yield = 50;
    custoParams = Object.assign({}, CUSTO_VAZIO, { gmd: 0.8, salPct: 0.1, salPreco: 4,
      sanidade: 30, mo: 50, terra: 20, pesoCompra: 300, pesoVenda: 500, rend: 50 });
    animals = [
      // 600 kg a 50% = 20 @ por R$ 6.000 → R$ 300/@
      { id: 'v1', ident: '001', sold: true, soldDate: '2026-05-01', soldWeight: 600, soldPrice: 6000 },
      // 300 kg a 50% = 10 @ por R$ 3.600 → R$ 360/@
      { id: 'v2', ident: '002', sold: true, soldDate: '2026-06-01', soldWeight: 300, soldPrice: 3600 },
      { id: 'v3', ident: '003', sold: true, soldDate: '2026-07-01', soldWeight: 400 },  // sem preço
      { id: 'v4', ident: '004', sold: true, soldDate: '2026-07-02', soldPrice: 5000 },  // sem peso
      { id: 'v5', ident: '005' },                                                        // no rebanho
      { id: 'v6', ident: '006', dead: true, deadDate: '2026-02-01', soldWeight: 500, soldPrice: 5000 }
    ];
    weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = [];
    const pa = precoArrobaVenda();
    const out = {
      porArroba: pa.porArroba, arrobas: pa.arrobas, total: pa.total,
      n: pa.n, fora: pa.foraDaConta, rend: pa.rend,
      mediaIngenua: (300 + 360) / 2,
      boi1: arrobaDoAnimal(animals[0]),
      boi2: arrobaDoAnimal(animals[1]),
      semPreco: arrobaDoAnimal(animals[2]),
      semPeso: arrobaDoAnimal(animals[3])
    };
    tab = 'bovinos'; seg = 'vendidas'; render();
    out.cartoes = $('vendidas-stats').innerText.replace(/\n/g, ' | ');
    out.nota = $('vendidas-nota').innerText;
    out.lista = $('vendidas-list').innerText.replace(/\n/g, ' | ');

    seg = 'custos'; render();
    out.custo = $('cst-arroba').textContent;
    out.venda = $('cst-venda').innerText;
    out.verde = $('cst-venda').innerHTML.includes('mg-ok');

    // prejuízo: o mesmo gado vendido barato
    animals[0].soldPrice = 1000; animals[1].soldPrice = 600;
    render();
    out.prejuizo = $('cst-venda').innerText;
    out.vermelho = $('cst-venda').innerHTML.includes('mg-ruim');

    // sem venda nenhuma a linha some, em vez de mostrar margem inventada
    animals = [{ id: 'x1', ident: '9' }];
    render();
    out.semVendaSome = $('cst-venda').hidden;
    seg = 'vendidas'; render();
    out.semVendaCartao = $('vendidas-stats').innerText.replace(/\n/g, ' | ');
    out.semVendaNota = $('vendidas-nota').hidden;

    // venda sem preço nenhum: o cartão não pode inventar zero
    animals = [{ id: 'y1', ident: '8', sold: true, soldDate: '2026-01-01', soldWeight: 500 }];
    render();
    out.soSemPreco = $('vendidas-stats').innerText.replace(/\n/g, ' | ');
    out.soSemPrecoNota = $('vendidas-nota').innerText;
    return out;
  });

  t.secao('a conta de cada animal');
  t.conferir('600 kg a 50% por R$ 6.000 dá R$ 300 por arroba',
    Math.abs(r.boi1 - 300) < 1e-9, String(r.boi1));
  t.conferir('300 kg a 50% por R$ 3.600 dá R$ 360', Math.abs(r.boi2 - 360) < 1e-9, String(r.boi2));
  t.conferir('sem preço não há conta', r.semPreco === null, String(r.semPreco));
  t.conferir('sem peso também não', r.semPeso === null, String(r.semPeso));

  t.secao('a média é a do dinheiro, não a dos animais');
  // Com pesos diferentes, a média simples dá um número que não existiu: R$ 330
  // quando o que entrou no bolso foram R$ 320 por arroba.
  t.conferir('R$ 9.600 em 30 @ dá R$ 320 por arroba',
    Math.abs(r.porArroba - 320) < 1e-9, String(r.porArroba));
  t.conferir('e NÃO os R$ 330 da média simples dos dois preços',
    Math.abs(r.porArroba - r.mediaIngenua) > 1, `${r.porArroba} vs ${r.mediaIngenua}`);
  t.conferir('as arrobas somam 30', Math.abs(r.arrobas - 30) < 1e-9, String(r.arrobas));
  t.conferir('e o total, R$ 9.600', Math.abs(r.total - 9600) < 1e-9, String(r.total));
  t.conferir('animal morto nunca entra em venda', r.n === 2, String(r.n));
  // Uma média calculada sobre metade das vendas, anunciada como se fosse de
  // todas, é um número errado com cara de certo.
  t.conferir('as duas vendas sem peso ou preço ficam de fora, e são contadas',
    r.fora === 2, String(r.fora));
  t.conferir('o rendimento usado é o da VENDA', Math.abs(r.rend - 50) < 1e-9, String(r.rend));

  t.secao('na aba Vendidas');
  t.conferir('o cartão mostra o preço por arroba',
    /R\$ 320,00 \| POR ARROBA/i.test(r.cartoes), r.cartoes);
  t.conferir('e quantas arrobas saíram', /30,0 @ \| ARROBAS VENDIDAS/i.test(r.cartoes), r.cartoes);
  t.conferir('a nota diz o rendimento e quantas vendas entraram',
    /50,0%/.test(r.nota) && /2 venda\(s\) na conta/.test(r.nota), r.nota);
  t.conferir('e avisa quantas ficaram de fora, com o motivo',
    /2 sem peso ou preço ficaram de fora/.test(r.nota), r.nota);
  t.conferir('cada animal vendido mostra o preço por arroba dele',
    /R\$ 300,00\/@/.test(r.lista) && /R\$ 360,00\/@/.test(r.lista), r.lista.slice(0, 200));

  t.secao('ao lado do custo, a margem');
  t.conferir('o custo da arroba continua sendo calculado',
    /R\$ 183,29/.test(r.custo), r.custo);
  t.conferir('e ao lado dele, o que ela rendeu',
    /Vendida a R\$ 320,00 por @/.test(r.venda), r.venda);
  t.conferir('com a diferença escrita, que é a conta que decide',
    /sobra R\$ 136,71 por @/.test(r.venda), r.venda);
  t.conferir('marcada em verde quando sobra', r.verde === true);
  t.conferir('vendendo barato, ela diz que FALTA',
    /falta R\$ 129,95 por @/.test(r.prejuizo), r.prejuizo);
  t.conferir('em vermelho', r.vermelho === true);

  t.secao('sem dado, nada é inventado');
  // Margem calculada a partir de dado faltando é pior que margem nenhuma.
  t.conferir('sem venda, a linha da margem some', r.semVendaSome === true);
  t.conferir('o cartão mostra travessão, não zero',
    /— \| POR ARROBA/.test(r.semVendaCartao), r.semVendaCartao);
  t.conferir('e a nota some junto', r.semVendaNota === true);
  t.conferir('venda sem preço não vira R$ 0,00 por arroba',
    /— \| POR ARROBA/.test(r.soSemPreco), r.soSemPreco);
  t.conferir('e a nota ensina o que preencher',
    /Preencha peso e preço/.test(r.soSemPrecoNota), r.soSemPrecoNota);

  t.secao('no arquivo que vai para o contador');
  const csv = await pagina.evaluate(() => {
    animals = [
      { id: 'c1', ident: '001', sold: true, soldDate: '2026-05-01', soldWeight: 600, soldPrice: 6000 },
      { id: 'c2', ident: '002', sold: true, soldDate: '2026-05-02', soldWeight: 400 }
    ];
    weighings = [];
    settings.yield = 50;
    let texto = null;
    const orig = window.download;
    window.download = (n, c) => { texto = c; };
    $('menu-exp-pes').click();
    window.download = orig;
    const linhas = texto.trim().split('\n');
    const col = linhas[0].split(';').indexOf('preco_arroba_venda');
    return { col, l1: linhas[1].split(';')[col], l2: linhas[2].split(';')[col] };
  });
  // Refazer a conta à mão na planilha é onde entra o erro.
  t.conferir('o CSV traz a coluna preco_arroba_venda', csv.col >= 0, String(csv.col));
  t.conferir('já calculada, em número de planilha brasileira',
    csv.l1 === '300,00', csv.l1);
  t.conferir('e vazia quando não dá para calcular', csv.l2 === '', `"${csv.l2}"`);

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
