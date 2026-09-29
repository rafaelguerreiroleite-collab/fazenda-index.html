// Geometria dos ícones do aplicativo.
//
// Ícone é o único pedaço do aplicativo que a pessoa vê sem abrir, e é o mais
// fácil de estragar sem ninguém notar: meio ponto percentual de diferença no
// tamanho da moeda, ou um pixel de descentralização, não aparece na tela do
// computador e aparece na tela de início. A arte é gerada por
// ferramentas/gerar-icones.py — este arquivo confere o resultado.
//
// O que é conferido, e por quê cada coisa:
// - tamanho exato, porque o iOS e o manifesto pedem tamanhos declarados;
// - nenhum pixel transparente, porque o iOS compõe ícone com alpha sobre PRETO
//   e a moldura preta aparece no aparelho e em lugar nenhum antes dele;
// - o canto é o verde da marca, porque ícone "sangrado" não pode ter borda;
// - a moeda tem a fração de largura pretendida, com folga de meio por cento;
// - as quatro margens são iguais, porque descentralizado se enxerga;
// - a borda verde→branco vira em no máximo dois pixels: mais do que isso é a
//   marca borrada, que foi exatamente o defeito da primeira tentativa;
// - o arquivo "maskable" cabe no círculo de 80% que o Android garante.
import { servir, abrirApp, placar } from './apoio.mjs';

const VERDE = [34, 84, 55];          // #225437

// nome, lado, fração da largura que a moeda ocupa
const ICONES = [
  ['icone-fazenda-js.png', 180, 0.84],
  ['icon-192.png', 192, 0.84],
  ['icon-512.png', 512, 0.84],
  ['icon-maskable-512.png', 512, 0.64]
];

// Lê o PNG num canvas e devolve as medidas. Roda no navegador porque é ele que
// tem decodificador de PNG — e é ele que vai desenhar o ícone de verdade.
const MEDIR = `(nome => new Promise(ok => {
  const img = new Image();
  img.onload = () => {
    const n = img.naturalWidth;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, n, n).data;
    const em = (x, y) => { const i = (y * n + x) * 4; return [d[i], d[i+1], d[i+2], d[i+3]]; };

    let transparentes = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) transparentes++;

    // A moeda é clara; o fundo é o verde escuro. Separar por luminância é
    // suficiente e não depende da cor exata do miolo do logo.
    const claro = (x, y) => { const p = em(x, y); return p[0] + p[1] + p[2] > 420; };
    const meio = Math.floor(n / 2);
    let esq = 0, dir = 0, topo = 0, baixo = 0;
    while (esq < n && !claro(esq, meio)) esq++;
    while (dir < n && !claro(n - 1 - dir, meio)) dir++;
    while (topo < n && !claro(meio, topo)) topo++;
    while (baixo < n && !claro(meio, n - 1 - baixo)) baixo++;

    // Quantos pixels a borda leva para sair do verde e chegar no claro.
    let virada = 0;
    for (let x = esq - 4; x < esq + 4; x++) {
      if (x < 0 || x >= n) continue;
      const p = em(x, meio), soma = p[0] + p[1] + p[2];
      if (soma > 200 && soma <= 420) virada++;
    }
    ok({ n, transparentes, canto: em(1, 1), esq, dir, topo, baixo,
         largura: n - esq - dir, altura: n - topo - baixo, virada });
  };
  img.onerror = () => ok(null);
  img.src = nome + '?m=' + Math.random();
}))`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Ícones do aplicativo');

  for (const [nome, lado, fracao] of ICONES) {
    t.secao(nome);
    const m = await pagina.evaluate(`(${MEDIR})(${JSON.stringify(nome)})`);
    if (!m) { t.conferir('o arquivo existe e abre', false, 'não carregou'); continue; }

    t.conferir('tem o tamanho declarado', m.n === lado, `${m.n}x${m.n}`);
    t.conferir('não tem pixel transparente', m.transparentes === 0, String(m.transparentes));
    t.conferir('o canto é o verde da marca',
      m.canto.slice(0, 3).every((v, i) => v === VERDE[i]), m.canto.slice(0, 3).join(','));

    const frac = m.largura / m.n;
    t.conferir('a moeda ocupa a fração pretendida', Math.abs(frac - fracao) < 0.005,
      `${(frac * 100).toFixed(1)}% (queria ${(fracao * 100).toFixed(0)}%)`);
    t.conferir('a moeda é redonda, não oval', Math.abs(m.largura - m.altura) <= 1,
      `${m.largura}x${m.altura}`);
    t.conferir('as quatro margens são iguais',
      Math.abs(m.esq - m.dir) <= 1 && Math.abs(m.topo - m.baixo) <= 1
      && Math.abs(m.esq - m.topo) <= 1,
      `e${m.esq} d${m.dir} t${m.topo} b${m.baixo}`);
    t.conferir('a borda é limpa, não borrada', m.virada <= 2, m.virada + 'px de transição');
  }

  // O Android recorta o ícone "maskable" num círculo e só promete os 80%
  // centrais. Declarar o arquivo errado ali corta o desenho no aparelho de
  // quem usa, e nunca no de quem programa.
  t.secao('manifesto');
  const man = await pagina.evaluate(`fetch('manifest.json?m=' + Math.random()).then(r => r.json())`);
  const porUso = u => man.icons.filter(i => (i.purpose || 'any').split(' ').includes(u));
  t.conferir('tem ícone "any" e ícone "maskable"',
    porUso('any').length >= 1 && porUso('maskable').length >= 1,
    man.icons.map(i => `${i.src}:${i.purpose}`).join(' · '));
  t.conferir('nenhum arquivo serve para os dois usos ao mesmo tempo',
    man.icons.every(i => (i.purpose || 'any').split(' ').filter(Boolean).length === 1),
    'um arquivo só cabe nas duas regras se desobedecer uma');
  const mask = porUso('maskable')[0];
  const cabe = ICONES.find(([n]) => n === mask.src);
  t.conferir('o "maskable" cabe no círculo seguro de 80%', cabe && cabe[2] <= 0.8,
    cabe ? `${(cabe[2] * 100).toFixed(0)}%` : 'arquivo desconhecido: ' + mask.src);
  t.conferir('todo ícone do manifesto é um arquivo que existe',
    man.icons.every(i => ICONES.some(([n]) => n === i.src)),
    man.icons.map(i => i.src).join(' · '));

  await navegador.close();
  await s.fechar();
  return t.fim(errosJS);
}
