// Contraste e tamanho de alvo de toque — em todas as telas, com os blocos abertos.
//
// Por que virou teste fixo: uma auditoria encontrou nove textos abaixo do
// mínimo legível, e TRÊS deles eram CSS escrito nas duas últimas versões
// (.dc-sub, .gg-det e .gm-n, todos a 2,52:1 — cinza claro sobre branco). Ou
// seja: não foi um erro antigo que sobrou, foi regressão nova. Cor é fácil de
// piorar sem perceber na tela do computador, e impossível de ler no sol do
// pasto. Daqui em diante quem baixar um cinza abaixo de 4,5:1 quebra a
// publicação em vez de descobrir no curral.
//
// A régua é a WCAG AA: 4,5:1 para texto normal, 3:1 para texto grande
// (>=24px, ou >=18.66px em negrito). O alvo de toque mínimo cobrado aqui é
// 40px de altura — abaixo disso o dedo com luva não acerta.
import { servir, abrirApp, placar, ABRIR_DOBRAS } from './apoio.mjs';

const ALVO_MIN = 40;

// Uma fazenda com dados em todas as telas: texto que não é desenhado não é
// medido, e é justamente o número escondido num bloco que ninguém confere.
const MONTAR = () => {
  const p = n => String(n).padStart(2, '0');
  animals = Array.from({ length: 20 }, (_, i) => ({ id: 'a' + i, ident: 'BR' + p(i + 1),
    cat: i % 3 ? 'Novilho' : 'Novilha', entryDate: '2025-06-01', entryWeight: 260 + i % 40,
    sold: i === 19 ? true : undefined, saleDate: i === 19 ? '2026-08-10' : undefined,
    saleWeight: i === 19 ? 480 : undefined, salePrice: i === 19 ? 7200 : undefined,
    dead: i === 18 ? true : undefined, deathDate: i === 18 ? '2026-07-01' : undefined,
    deathCause: i === 18 ? 'Acidente' : undefined }));
  weighings = [];
  ['2025-08-15', '2025-11-20', '2026-02-18', '2026-05-22', '2026-09-10'].forEach((d, k) => {
    animals.forEach((a, i) => weighings.push({ id: 'w' + k + '_' + i, animalId: a.id,
      date: d, weight: 280 + k * 45 + (i % 30) }));
  });
  const cats = ['Ração/insumos', 'Vacina', 'Frete', 'Energia elétrica', 'Mão de obra'];
  bovT = Array.from({ length: 40 }, (_, i) => Object.assign({
    id: 't' + i, date: `2026-0${1 + i % 9}-1${i % 9}`, type: i % 8 ? 'saida' : 'entrada',
    amount: 50 + (i * 37) % 3000, category: cats[i % 5], notes: 'nota ' + i
  }, i % 9 === 0 ? { venc: `2026-1${i % 3}-1${i % 9}`, pago: false } : {}));
  avT = bovT.slice(0, 20).map((t, i) => Object.assign({}, t, { id: 'av' + i }));
  gerT = bovT.slice(0, 10).map((t, i) => Object.assign({}, t, { id: 'g' + i }));
  items = [{ id: 'i1', name: 'Vacina aftosa', un: 'dose', min: 10 }];
  moves = [{ id: 'm1', itemId: 'i1', type: 'in', qty: 100, date: '2026-03-01', cost: 350 }];
  settings.yield = 52;
  definirRegime('competencia');
  ['bfin-period', 'av-period', 'fz-period'].forEach(id => { $(id).value = 'this-year'; guardarPeriodo(id); });
};

// Mede no navegador. Fica tudo numa função só porque atravessar a ponte
// elemento por elemento, em oito telas, levaria minutos.
const MEDIR = `(function () {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rgb = v => { const m = String(v).match(/[\\d.]+/g); return m ? m.map(Number) : null; };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const razao = (a, b) => { const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // O fundo de verdade é o do primeiro ancestral que pinta algo. Parar no
  // próprio elemento daria "transparente" e um contraste inventado.
  const fundoReal = el => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const e = getComputedStyle(n);
      if (e.backgroundImage !== 'none') return null;   // gradiente: não dá para medir
      const c = rgb(e.backgroundColor);
      if (c && (c.length < 4 || c[3] > 0.95)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const visivel = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const e = getComputedStyle(el);
    return e.visibility !== 'hidden' && e.opacity !== '0';
  };
  // Só folhas de texto: medir um contêiner herdaria a cor de um filho e
  // acusaria o elemento errado.
  const temTextoProprio = el => Array.from(el.childNodes)
    .some(n => n.nodeType === 3 && n.textContent.trim().length > 1);

  const cont = [], alvos = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visivel(el)) continue;
    const e = getComputedStyle(el);

    if (temTextoProprio(el)) {
      const frente = rgb(e.color), fundo = fundoReal(el);
      if (frente && fundo && (frente.length < 4 || frente[3] > 0.95)) {
        const px = parseFloat(e.fontSize);
        const peso = parseInt(e.fontWeight, 10) || 400;
        const grande = px >= 24 || (px >= 18.66 && peso >= 700);
        const exige = grande ? 3 : 4.5;
        const r = razao(frente.slice(0, 3), fundo);
        if (r < exige) cont.push({ r: +r.toFixed(2), exige, px: +px.toFixed(1),
          cor: e.color, classe: el.className || el.tagName,
          txt: el.innerText.trim().slice(0, 24) });
      }
    }

    const clicavel = /^(BUTTON|SELECT|A)$/.test(el.tagName)
      || (el.tagName === 'INPUT' && !/^(radio|checkbox|hidden|file)$/.test(el.type))
      || el.tagName === 'SUMMARY';
    if (clicavel) {
      const r = el.getBoundingClientRect();
      if (r.height < ${ALVO_MIN}) alvos.push({ a: Math.round(r.height), l: Math.round(r.width),
        classe: el.className || el.tagName, txt: (el.innerText || el.value || '').trim().slice(0, 18) });
    }
  }
  return { cont, alvos };
})()`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Legibilidade: contraste e alvos de toque');

  await pagina.evaluate(`(${MONTAR.toString()})(); render();`);

  const TELAS = [
    ['Bovinos · Rebanho', 'bovinos', 'rebanho'],
    ['Bovinos · Vendidas', 'bovinos', 'vendidas'],
    ['Bovinos · Mortalidade', 'bovinos', 'mortes'],
    ['Bovinos · Estoque', 'bovinos', 'estoque'],
    ['Bovinos · Financeiro', 'bovinos', 'financeiro'],
    ['Bovinos · Custos', 'bovinos', 'custos'],
    ['Aviários', 'aviarios', 'rebanho'],
    ['Fazenda', 'fazenda', 'rebanho']
  ];

  const contraste = [], alvos = [];
  for (const [nome, aba, segmento] of TELAS) {
    await pagina.evaluate(`tab = '${aba}'; seg = '${segmento}'; render(); ${ABRIR_DOBRAS}`);
    const m = await pagina.evaluate(MEDIR);
    m.cont.forEach(c => contraste.push(Object.assign({ tela: nome }, c)));
    m.alvos.forEach(a => alvos.push(Object.assign({ tela: nome }, a)));
  }

  // Um mesmo .dc-sub aparece em seis telas; listar seis vezes esconde quantos
  // problemas DIFERENTES existem. A chave é a classe mais a cor.
  const juntar = (lista, chave) => {
    const m = new Map();
    lista.forEach(x => { const k = chave(x); if (!m.has(k)) m.set(k, x); });
    return [...m.values()];
  };
  const cUnicos = juntar(contraste, x => x.classe + '|' + x.cor);
  const aUnicos = juntar(alvos, x => x.classe + '|' + x.a);

  t.secao('contraste mínimo da WCAG AA');
  t.conferir('nenhum texto abaixo do mínimo', cUnicos.length === 0,
    cUnicos.length ? '\n' + cUnicos.map(c =>
      `        ${c.r}:1 (exige ${c.exige}) ${c.px}px ${c.cor} .${c.classe} "${c.txt}" — ${c.tela}`).join('\n') : '');

  t.secao(`alvos de toque de pelo menos ${ALVO_MIN}px de altura`);
  t.conferir('nenhum controle pequeno demais para o dedo', aUnicos.length === 0,
    aUnicos.length ? '\n' + aUnicos.map(a =>
      `        ${a.l}x${a.a} .${a.classe} "${a.txt}" — ${a.tela}`).join('\n') : '');

  await navegador.close();
  await s.fechar();
  return t.fim(errosJS);
}
