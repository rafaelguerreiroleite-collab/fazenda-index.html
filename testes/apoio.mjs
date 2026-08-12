// Apoio comum aos testes: sobe o app, abre o navegador e conta os resultados.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const RAIZ = resolve(import.meta.dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

export async function servir() {
  const s = createServer(async (req, res) => {
    try {
      const caminho = join(RAIZ, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      if (!caminho.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
      const corpo = await readFile(caminho);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream' }).end(corpo);
    } catch { res.writeHead(404).end('nao encontrado'); }
  });
  await new Promise(ok => s.listen(0, ok));
  return { url: `http://localhost:${s.address().port}`, fechar: () => new Promise(ok => s.close(ok)) };
}

// Abre o app já configurado, com um banco falso no lugar do Firestore, para que
// os testes exercitem a lógica sem depender de rede.
// Nesta máquina o navegador vem num caminho fixo; no servidor de testes o
// Playwright resolve sozinho. Só passa o caminho quando ele existir.
const CHROMIUM = '/opt/pw-browsers/chromium';
const opcoesNavegador = existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {};

export async function abrirApp(url, { locale = 'pt-BR' } = {}) {
  const navegador = await chromium.launch(opcoesNavegador);
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale });
  const pagina = await ctx.newPage();
  const errosJS = [];
  pagina.on('pageerror', e => { if (!/firebase|collection/.test(e.message)) errosJS.push(e.message); });
  await pagina.addInitScript(() => {
    localStorage.setItem('fjs-fbconfig', JSON.stringify({ apiKey: 'x', projectId: 'p', authDomain: 'a', appId: '1' }));
    localStorage.setItem('fjs-farm', JSON.stringify('demo'));
  });
  await pagina.goto(url + '/index.html', { waitUntil: 'domcontentloaded' });
  await pagina.waitForFunction(() => typeof window.render === 'function', { timeout: 15000 });
  await pagina.evaluate(() => {
    const falso = { set: async () => {}, delete: async () => {} };
    falso.collection = () => falso; falso.doc = () => falso;
    falso.batch = () => ({ set() {}, delete() {}, commit: async () => {} });
    db = falso;
  });
  return { navegador, pagina, errosJS };
}

export function placar(titulo) {
  let ok = 0, falhas = 0;
  const linhas = [];
  return {
    conferir(nome, passou, detalhe = '') {
      passou ? ok++ : falhas++;
      linhas.push(`  ${passou ? 'ok  ' : 'FALHA'} | ${nome}${detalhe ? '  ' + detalhe : ''}`);
    },
    secao(nome) { linhas.push(`--- ${nome} ---`); },
    fim(errosJS = []) {
      console.log(`\n### ${titulo}`);
      console.log(linhas.join('\n'));
      if (errosJS.length) { falhas += errosJS.length; console.log('  ERRO JS: ' + errosJS.join(' | ')); }
      console.log(`  => ${ok} ok, ${falhas} falhas`);
      return falhas;
    }
  };
}

export const perto = (a, b, tol = 1e-9) => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
};
