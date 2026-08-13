// A jornada real: carrega com internet, vai para o curral sem sinal, pesa,
// fecha e reabre o app ainda sem sinal, e volta para casa com internet.
// Nenhuma pesagem pode se perder em nenhum desses passos.
import { chromium } from 'playwright';
import { servir, placar } from './apoio.mjs';
import { existsSync } from 'node:fs';

const CHROMIUM = '/opt/pw-browsers/chromium';

export default async function () {
  const s = await servir();
  const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
  // Service worker desligado de propósito: força o pior caso, o aparelho que
  // nem sequer tem o SDK guardado. Se nada se perde aqui, não se perde nunca.
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: 'pt-BR', serviceWorkers: 'block' });
  const pagina = await ctx.newPage();
  const errosJS = [];
  pagina.on('pageerror', e => errosJS.push(e.message));
  const t = placar('Curral sem sinal, do começo ao fim');

  // Nada sai para a internet. O SDK do Firebase só existe quando o teste liga
  // a "internet", exatamente como o aparelho se comporta com e sem sinal.
  await pagina.route('**/*', r =>
    ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());

  await pagina.addInitScript(() => {
    localStorage.setItem('fjs-fbconfig', JSON.stringify({ apiKey: 'x', projectId: 'p', authDomain: 'a', appId: '1' }));
    localStorage.setItem('fjs-farm', JSON.stringify('demo'));
    if (localStorage.getItem('teste-online') !== '1') return;   // sem sinal: sem SDK
    const anotar = caminho => {
      const r = JSON.parse(localStorage.getItem('teste-nuvem') || '[]');
      r.push(caminho); localStorage.setItem('teste-nuvem', JSON.stringify(r));
    };
    const ref = caminho => ({
      _caminho: caminho,
      collection: n => ref(caminho + '/' + n),
      doc: i => ref(caminho + '/' + i),
      set: async () => anotar(caminho),
      delete: async () => anotar('apagar ' + caminho),
      onSnapshot: () => () => {}
    });
    const banco = {
      collection: n => ref(n), enablePersistence: async () => {},
      batch: () => ({ set(r) { anotar(r._caminho); }, delete(r) { anotar('apagar ' + r._caminho); }, commit: async () => {} })
    };
    window.firebase = {
      initializeApp() {}, firestore: () => banco,
      auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: 'teste' }), 10); }, signInAnonymously: async () => ({}) })
    };
  });

  const abrir = async comInternet => {
    await pagina.goto(s.url + '/index.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await pagina.evaluate(v => localStorage.setItem('teste-online', v), comInternet ? '1' : '0');
    await pagina.goto(s.url + '/index.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction(() => typeof window.render === 'function', { timeout: 15000 });
    await pagina.waitForTimeout(250);
  };

  // ---------- 1. em casa, com internet: o rebanho chega e fica guardado ----------
  t.secao('1. em casa, com internet');
  await abrir(true);
  await pagina.evaluate(() => {
    animals = Array.from({ length: 92 }, (_, i) => ({ id: 'a' + i, ident: String(292 + i) }));
    weighings = animals.map((a, i) => ({ id: 'w' + i, animalId: a.id, date: '2026-06-01', weight: 300 + i }));
    render(); salvarEspelho(true);
  });
  t.conferir('92 animais na tela', await pagina.evaluate(() => animals.length) === 92);
  t.conferir('cópia local gravada no aparelho', await pagina.evaluate(() => !!localStorage.getItem('fjs-espelho')));

  // ---------- 2. curral, sem sinal ----------
  t.secao('2. no curral, sem sinal');
  await abrir(false);
  t.conferir('app abre sem erro nenhum', errosJS.length === 0, errosJS.join(' | '));
  t.conferir('nuvem indisponível, como esperado', await pagina.evaluate(() => db === null));
  t.conferir('os 92 animais estão lá', await pagina.evaluate(() => animals.length) === 92,
    'carregou ' + await pagina.evaluate(() => animals.length));
  t.conferir('as 92 pesagens antigas também', await pagina.evaluate(() => weighings.length) === 92);
  t.conferir('tela de configuração não apareceu', await pagina.evaluate(() => $('setup-screen').hidden));

  await pagina.evaluate(() => openWeighMode());
  await pagina.waitForTimeout(250);
  t.conferir('lista de brincos traz todos os 92',
    await pagina.evaluate(() => $('wm-idents').querySelectorAll('option').length) === 92,
    'sugeriu ' + await pagina.evaluate(() => $('wm-idents').querySelectorAll('option').length));

  await pagina.fill('#wm-date', '2026-08-12');
  const pesar = async (brinco, peso) => {
    await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', brinco);
    await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', peso);
    await pagina.click('#wm-save'); await pagina.waitForTimeout(90);
    return pagina.evaluate(() => $('wm-last').textContent);
  };
  const aviso = await pesar('292', '415');
  t.conferir('pesagem confirma na tela mesmo sem sinal', /292/.test(aviso) && /415/.test(aviso), aviso);
  await pesar('293', '420,5');
  await pesar('999', '250');            // brinco novo, criado no curral
  t.conferir('as 3 pesagens entraram', await pagina.evaluate(() => weighings.filter(w => w.date === '2026-08-12').length) === 3);
  t.conferir('animal novo criado sem sinal', await pagina.evaluate(() => animals.some(a => a.ident === '999')));
  t.conferir('a prévia do GMD funciona sem sinal', /GMD|kg\/dia/.test(await pagina.evaluate(() => {
    $('wm-ident').value = '294'; $('wm-ident').dispatchEvent(new Event('input'));
    $('wm-peso').value = '400'; $('wm-peso').dispatchEvent(new Event('input'));
    return $('wm-previa').textContent;
  })));
  const naFila = await pagina.evaluate(() => pendentes.length);
  t.conferir('tudo ficou na fila para subir depois', naFila >= 4, naFila + ' na fila');

  // ---------- 3. fecha e reabre o app, ainda sem sinal ----------
  t.secao('3. fecha e reabre o app, ainda sem sinal');
  await abrir(false);
  const doDia = await pagina.evaluate(() => weighings.filter(w => w.date === '2026-08-12').map(w => w.weight).sort((a, b) => a - b));
  t.conferir('as pesagens do curral continuam lá depois de fechar', JSON.stringify(doDia) === '[250,415,420.5]', JSON.stringify(doDia));
  t.conferir('o animal novo continua lá', await pagina.evaluate(() => animals.some(a => a.ident === '999')));
  t.conferir('a fila sobreviveu ao fechamento', await pagina.evaluate(() => pendentes.length) >= 4);
  const gmd = await pagina.evaluate(() => gmdTotal(wOf(animals.find(a => a.ident === '292').id)));
  t.conferir('GMD calculado com o que foi pesado sem sinal', gmd !== null && Math.abs(gmd - 115 / 72) < 1e-9, gmd === null ? 'sem GMD (faltou pesagem)' : gmd.toFixed(4));

  // ---------- 4. de volta em casa, com internet ----------
  t.secao('4. de volta em casa, com internet');
  await pagina.evaluate(() => localStorage.removeItem('teste-nuvem'));
  await abrir(true);
  await pagina.waitForTimeout(600);
  const subiu = await pagina.evaluate(() => JSON.parse(localStorage.getItem('teste-nuvem') || '[]'));
  t.conferir('a fila subiu para a nuvem', subiu.length >= 4, subiu.length + ' escrita(s) enviadas');
  t.conferir('a pesagem do 292 subiu', subiu.some(c => /weighings/.test(c)), '');
  t.conferir('o animal novo subiu', subiu.some(c => /animals/.test(c)), '');
  t.conferir('fila esvaziada', await pagina.evaluate(() => pendentes.length) === 0,
    await pagina.evaluate(() => pendentes.length) + ' restante(s)');
  t.conferir('nenhum erro em toda a jornada', errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
