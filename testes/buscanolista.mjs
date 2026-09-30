// Achar um animal, e enxergar quem está ficando para trás.
//
// Duas coisas que a tela do Rebanho não fazia, e que são o trabalho do curral:
//
// 1. ACHAR. Com sessenta animais, encontrar o BR037 era rolar o dedo até ver o
//    brinco passar. A busca por palavra existia só nas três telas de dinheiro.
//
// 2. ENXERGAR. A cor do GMD era calculada, escrita no HTML e nunca aparecia:
//    ".item-side .aux" tem duas classes de especificidade e ".gmd-low" tem uma,
//    então o cinza ganhava sempre. Sessenta números do mesmo cinza, e o animal
//    que está perdendo peso com a mesma cara do que está ganhando.
//
// A regra que este arquivo protege: a busca esconde LINHA, nunca número. Os
// cartões do topo respondem "como está o rebanho" — um fato da fazenda, que
// não pode oscilar porque alguém digitou uma letra.
import { servir, abrirApp, placar } from './apoio.mjs';

const MONTAR = () => {
  const p = n => String(n).padStart(3, '0');
  animals = Array.from({ length: 40 }, (_, i) => ({
    id: 'a' + i, ident: 'BR' + p(i + 1),
    cat: ['Novilho', 'Novilha', 'Boi', 'Vaca'][i % 4],
    raca: ['Nelore', 'Angus', 'Brangus', 'Cruzado'][i % 4],
    entryDate: '2025-01-15', entryWeight: 240 }));
  animals[7].sold = true; animals[7].soldDate = '2026-08-10';
  animals[7].soldWeight = 480; animals[7].soldPrice = 7000;
  animals[9].dead = true; animals[9].deadDate = '2026-07-01'; animals[9].deadCause = 'Cobra';
  weighings = [];
  // Dois animais de propósito nos extremos do GMD: um perdendo, um voando.
  ['2026-01-10', '2026-09-10'].forEach((d, k) => animals.forEach((a, i) => {
    let ganho = 60;
    if (i === 3) ganho = -20;      // emagreceu
    if (i === 5) ganho = 350;      // GMD altíssimo
    weighings.push({ id: 'w' + k + '_' + i, animalId: a.id, date: d, weight: 300 + k * ganho });
  }));
  items = [
    { id: 'i1', name: 'Sal mineral', unit: 'kg', minQty: 10 },
    { id: 'i2', name: 'Vacina aftosa', unit: 'dose', carencia: 30 },
    { id: 'i3', name: 'Óleo diesel', unit: 'L' }
  ];
  moves = [
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 200, date: '2026-06-01', cost: 800 },
    { id: 'm2', itemId: 'i2', type: 'entrada', qty: 50, date: '2026-06-01', cost: 500 },
    // Saiu mais do que entrou: estoque negativo, que é erro de lançamento.
    { id: 'm3', itemId: 'i3', type: 'saida', qty: 40, date: '2026-06-02' }
  ];
  bovT = []; avT = []; gerT = [];
  tab = 'bovinos'; seg = 'rebanho'; render();
};

async function digitar(pagina, id, texto) {
  await pagina.evaluate(([i, t]) => {
    $(i).value = t;
    $(i).dispatchEvent(new Event('input'));
  }, [id, texto]);
  await pagina.waitForTimeout(280);   // a busca espera a digitação parar
}

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Busca nas listas e cor do GMD');
  await pagina.evaluate(`(${MONTAR.toString()})()`);

  // ---------- achar um animal ----------
  t.secao('achar no rebanho');
  const antes = await pagina.evaluate(() => ({
    linhas: document.querySelectorAll('#animal-list [data-animal]').length,
    animais: $('bov-stats').innerText.match(/\d+/)[0]
  }));
  t.conferir('a lista começa inteira', antes.linhas === 38, String(antes.linhas));

  await digitar(pagina, 'bov-busca', 'BR037');
  const achou = await pagina.evaluate(() => ({
    linhas: [...document.querySelectorAll('#animal-list [data-animal]')]
      .map(e => e.querySelector('.item-title').textContent),
    cartaoAnimais: $('bov-stats').innerText.match(/\d+/)[0],
    aviso: $('bov-busca-aviso').innerText.replace(/\s+/g, ' ').trim()
  }));
  t.conferir('achou exatamente o animal procurado',
    achou.linhas.length === 1 && achou.linhas[0] === 'BR037', achou.linhas.join(','));
  // O ponto mais importante do arquivo: o cartão NÃO pode encolher.
  t.conferir('o cartão de animais continua contando o rebanho inteiro',
    achou.cartaoAnimais === antes.animais, `${achou.cartaoAnimais} vs ${antes.animais}`);
  t.conferir('e a tela diz quantos ficaram de fora',
    /37 animais fora da busca/.test(achou.aviso), achou.aviso);

  // ---------- achar por raça e por categoria ----------
  await digitar(pagina, 'bov-busca', 'angus');
  const raca = await pagina.evaluate(() =>
    [...document.querySelectorAll('#animal-list [data-animal]')].length);
  // "angus" está dentro de "brangus", e achar os dois é o certo: quem procura
  // um pedaço de palavra quer tudo que contém aquele pedaço.
  t.conferir('acha por raça, sem acento e sem maiúscula, inclusive dentro de outra',
    raca === 19, String(raca));
  await digitar(pagina, 'bov-busca', 'novilha angus');
  const duas = await pagina.evaluate(() =>
    [...document.querySelectorAll('#animal-list [data-animal]')]
      .every(e => e.innerText.indexOf('Novilha') >= 0 && e.innerText.indexOf('Angus') >= 0));
  t.conferir('duas palavras exigem as duas, em qualquer ordem', duas);

  await digitar(pagina, 'bov-busca', 'zzzz');
  const vazio = await pagina.evaluate(() => ({
    texto: $('animal-list').innerText.replace(/\s+/g, ' ').trim(),
    empty: $('bov-empty').hidden
  }));
  t.conferir('sem resultado, explica em vez de dizer "nenhum animal cadastrado"',
    /Nenhum animal com "zzzz"/.test(vazio.texto) && vazio.empty === true, vazio.texto.slice(0, 70));

  // Limpar devolve tudo — e é o botão que a própria tela oferece.
  await pagina.evaluate(() => $('bov-busca-aviso').querySelector('[data-limpar-busca]')
    || $('.busca-x[data-limpar-busca="bov-busca"]'));
  await digitar(pagina, 'bov-busca', '');
  const voltou = await pagina.evaluate(() =>
    document.querySelectorAll('#animal-list [data-animal]').length);
  t.conferir('limpar a busca devolve a lista inteira', voltou === 38, String(voltou));

  // ---------- a cor do GMD ----------
  t.secao('a cor do GMD aparece de verdade');
  const cores = await pagina.evaluate(() => {
    const cor = ident => {
      const el = [...document.querySelectorAll('#animal-list [data-animal]')]
        .find(e => e.querySelector('.item-title').textContent === ident);
      const aux = el && el.querySelector('.aux');
      return aux ? { classe: aux.className, cor: getComputedStyle(aux).color } : null;
    };
    return { ruim: cor('BR004'), otimo: cor('BR006'), normal: cor('BR001'),
      cinza: getComputedStyle(document.querySelector('#animal-list .aux')).color };
  });
  t.conferir('o animal que emagreceu tem classe de GMD baixo',
    cores.ruim && /gmd-low/.test(cores.ruim.classe), cores.ruim && cores.ruim.classe);
  // A prova de que a cor não morreu no CSS: ela é diferente do cinza padrão.
  const CINZA = 'rgb(87, 83, 78)';
  t.conferir('e é pintado de vermelho, não do cinza de sempre',
    cores.ruim && cores.ruim.cor !== CINZA, cores.ruim && cores.ruim.cor);
  t.conferir('o de GMD ótimo é pintado de verde',
    cores.otimo && /gmd-great/.test(cores.otimo.classe) && cores.otimo.cor !== CINZA,
    cores.otimo && `${cores.otimo.classe} ${cores.otimo.cor}`);
  t.conferir('e os dois não têm a mesma cor',
    cores.ruim && cores.otimo && cores.ruim.cor !== cores.otimo.cor,
    `${cores.ruim && cores.ruim.cor} vs ${cores.otimo && cores.otimo.cor}`);

  // ---------- estoque ----------
  t.secao('estoque');
  await pagina.evaluate(() => { seg = 'estoque'; render(); });
  await digitar(pagina, 'est-busca', 'vacina');
  const est = await pagina.evaluate(() => ({
    linhas: [...document.querySelectorAll('#stock-list [data-item]')]
      .map(e => e.querySelector('.item-title').textContent),
    aviso: $('est-busca-aviso').innerText.replace(/\s+/g, ' ').trim()
  }));
  t.conferir('acha o item do estoque', est.linhas.length === 1 && est.linhas[0] === 'Vacina aftosa',
    est.linhas.join(','));
  t.conferir('e diz quantos escondeu', /2 itens fora da busca/.test(est.aviso), est.aviso);
  await digitar(pagina, 'est-busca', 'carencia');
  const car = await pagina.evaluate(() =>
    [...document.querySelectorAll('#stock-list [data-item]')].length);
  t.conferir('acha também pelo que a linha não mostra (carência)', car === 1, String(car));

  await digitar(pagina, 'est-busca', '');
  const neg = await pagina.evaluate(() => {
    const el = [...document.querySelectorAll('#stock-list [data-item]')]
      .find(e => e.querySelector('.item-title').textContent === 'Óleo diesel');
    const val = el && el.querySelector('.value');
    const aux = el && el.querySelector('.aux');
    return { texto: val && val.textContent.trim(), classe: val && val.className,
      cor: val && getComputedStyle(val).color, aviso: aux && aux.textContent.trim() };
  });
  t.conferir('estoque negativo é mostrado', /-40/.test(neg.texto || ''), neg.texto);
  t.conferir('e acusado como erro, não como número normal',
    /qtd-neg/.test(neg.classe || '') && /saiu mais do que entrou/.test(neg.aviso || ''),
    `${neg.classe} · ${neg.aviso}`);

  // ---------- vendidas e mortalidade ----------
  t.secao('vendidas e mortalidade');
  await pagina.evaluate(() => { seg = 'vendidas'; render(); });
  await digitar(pagina, 'vend-busca', 'BR008');
  const vend = await pagina.evaluate(() =>
    document.querySelectorAll('#vendidas-list [data-animal-edit]').length);
  t.conferir('a busca funciona nas vendidas', vend === 1, String(vend));
  await pagina.evaluate(() => { seg = 'mortes'; render(); });
  await digitar(pagina, 'mort-busca', 'cobra');
  const mort = await pagina.evaluate(() =>
    document.querySelectorAll('#mortes-list [data-animal-edit]').length);
  t.conferir('e na mortalidade, inclusive pela causa', mort === 1, String(mort));

  // ---------- a busca não fica guardada ----------
  // Busca é gesto, não postura: se sobrevivesse ao fechamento, o aplicativo
  // abriria com metade do rebanho escondido e sem ninguém lembrar por quê.
  const guardado = await pagina.evaluate(() =>
    Object.keys(localStorage).filter(k => /busca/i.test(k)));
  t.conferir('nenhum termo de busca é gravado no aparelho',
    guardado.length === 0, guardado.join(','));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
