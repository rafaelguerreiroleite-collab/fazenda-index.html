// Ensaia o dia de pesagem no curral, do jeito que acontece de verdade:
// modo pesagem em sequência, brinco novo aparecendo, correção no mesmo dia,
// vírgula no teclado, GMD saindo certo depois e a fila offline.
import { servir, abrirApp, placar, perto } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Dia de pesagem no curral');
  const eq = (a, b) => perto(a, b);

  const gravadas = () => pagina.evaluate(() => weighings.map(w => ({
    animal: (animals.find(a => a.id === w.animalId) || {}).ident, data: w.date, peso: w.weight, jejum: !!w.jejum
  })));

  // ---------- rebanho de véspera: 3 animais já pesados em 01/06 ----------
  await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '292' }, { id: 'a2', ident: '293' }, { id: 'a3', ident: '294' }];
    weighings = [
      { id: 'w1', animalId: 'a1', date: '2026-06-01', weight: 300 },
      { id: 'w2', animalId: 'a2', date: '2026-06-01', weight: 320.5 },
      { id: 'w3', animalId: 'a3', date: '2026-06-01', weight: 280 }
    ];
    seg = 'rebanho'; detailAnimal = null; render();
  });

  // ---------- modo pesagem: a sequência do curral ----------
  t.secao('modo pesagem em sequência');
  await pagina.evaluate(() => openWeighMode());
  await pagina.waitForTimeout(250); // o app posiciona o cursor sozinho após 100ms
  await pagina.fill('#wm-date', '2026-08-12');

  const pesar = async (brinco, peso) => {
    await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', brinco);
    await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', peso);
    await pagina.click('#wm-save'); await pagina.waitForTimeout(80);
    return pagina.evaluate(() => ({ aviso: $('wm-last').textContent, contador: $('wm-count').textContent,
      brincoLimpo: $('wm-ident').value === '' && $('wm-peso').value === '' }));
  };

  let r = await pesar('292', '390');
  t.conferir('animal conhecido: grava e mostra o GMD na hora', /292/.test(r.aviso) && /GMD/.test(r.aviso), r.aviso);
  t.conferir('campos limpam sozinhos para o próximo', r.brincoLimpo);

  r = await pesar('293', '415,5');           // vírgula, como no teclado do celular
  t.conferir('peso com vírgula é aceito', /415,5/.test(r.aviso), r.aviso);

  r = await pesar('295', '250');             // brinco que ainda não existe
  t.conferir('brinco desconhecido cria o animal', /novo animal/.test(r.aviso), r.aviso);

  r = await pesar('294', '333');
  t.conferir('contador da sessão soma certo', /4 pesagens/.test(r.contador), r.contador);

  let lista = await gravadas();
  t.conferir('as 4 pesagens do dia foram gravadas', lista.filter(x => x.data === '2026-08-12').length === 4);
  t.conferir('peso com vírgula gravado como 415,5', eq(lista.find(x => x.animal === '293' && x.data === '2026-08-12').peso, 415.5));
  t.conferir('animal novo 295 existe no rebanho', await pagina.evaluate(() => animals.some(a => a.ident === '295')));

  // ---------- errou o peso: repesar no mesmo dia corrige, não duplica ----------
  t.secao('correção no mesmo dia');
  r = await pesar('292', '395');
  lista = await gravadas();
  const doDia292 = lista.filter(x => x.animal === '292' && x.data === '2026-08-12');
  t.conferir('repesar no mesmo dia substitui, não duplica', doDia292.length === 1 && eq(doDia292[0].peso, 395),
    doDia292.length + ' registro(s), peso ' + doDia292[0].peso);
  t.conferir('a pesagem antiga de 01/06 permanece', lista.some(x => x.animal === '292' && x.data === '2026-06-01'));

  // ---------- jejum ----------
  t.secao('pesagem em jejum');
  await pagina.check('#wm-jejum');
  await pesar('293', '410');
  t.conferir('marca de jejum é gravada', (await gravadas()).find(x => x.animal === '293' && x.data === '2026-08-12').jejum === true);
  await pagina.uncheck('#wm-jejum');
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; render(); });

  // ---------- GMD ----------
  t.secao('GMD depois da pesagem');
  const dias = await pagina.evaluate(() => daysBetween('2026-06-01', '2026-08-12'));
  t.conferir('01/06 → 12/08 = 72 dias', dias === 72, dias + ' dias');
  const g = await pagina.evaluate(() => {
    const porBrinco = {};
    for (const a of animals) { const ws = wOf(a.id); porBrinco[a.ident] = { total: gmdTotal(ws), recente: gmdRecent(ws), n: ws.length }; }
    return porBrinco;
  });
  t.conferir('292: (395−300)/72 = 1,319', eq(g['292'].total, 95 / 72), g['292'].total.toFixed(4));
  t.conferir('293: (410−320,5)/72 = 1,243', eq(g['293'].total, (410 - 320.5) / 72), g['293'].total.toFixed(4));
  t.conferir('294: (333−280)/72 = 0,736', eq(g['294'].total, 53 / 72), g['294'].total.toFixed(4));
  t.conferir('295 (1 só pesagem) fica sem GMD', g['295'].total === null);

  // ---------- o que aparece na tela ----------
  t.secao('o que você vai ver na lista e na ficha');
  await pagina.evaluate(() => { seg = 'rebanho'; detailAnimal = null; render(); });
  const naLista = await pagina.evaluate(() => [...document.querySelectorAll('#animal-list .list-item')].map(i => ({
    brinco: i.querySelector('.item-title').textContent,
    peso: i.querySelector('.item-side .value').textContent,
    gmd: i.querySelector('.item-side .aux').textContent
  })));
  const l292 = naLista.find(x => x.brinco === '292');
  t.conferir('lista mostra o último peso', l292.peso === '395 kg', l292.peso);
  t.conferir('lista mostra o GMD', l292.gmd === 'GMD 1,32', l292.gmd);
  t.conferir('animal sem GMD não mostra número solto', naLista.find(x => x.brinco === '295').gmd === '');

  await pagina.evaluate(() => { detailAnimal = animals.find(a => a.ident === '292').id; render(); });
  const ficha = await pagina.evaluate(() => ({
    cabecalho: $('animal-header').textContent,
    linhas: [...document.querySelectorAll('#weighings-table .wt-row')].map(l => l.textContent),
    temGrafico: !!document.querySelector('#chart-wrap svg')
  }));
  t.conferir('ficha traz peso atual e GMD total', /395 kg/.test(ficha.cabecalho) && /1,319/.test(ficha.cabecalho), '');
  t.conferir('histórico lista as 2 pesagens', ficha.linhas.length === 2, ficha.linhas.length + ' linha(s)');
  t.conferir('mais recente em cima', /12\/08\/26/.test(ficha.linhas[0]), ficha.linhas[0].slice(0, 22));
  t.conferir('gráfico é desenhado', ficha.temGrafico);

  // ---------- pesagem pelo formulário (fora do modo pesagem) ----------
  t.secao('pesagem avulsa pelo botão +');
  await pagina.evaluate(() => { const a = animals.find(x => x.ident === '294'); detailAnimal = a.id; render(); openWeighing(a.id); });
  await pagina.fill('#w-date', '2026-08-13');
  await pagina.fill('#w-weight', ''); await pagina.type('#w-weight', '340,2');
  await pagina.click('#form-weighing button[type="submit"]'); await pagina.waitForTimeout(100);
  const av = (await gravadas()).find(x => x.animal === '294' && x.data === '2026-08-13');
  t.conferir('pesagem avulsa grava com vírgula', av && eq(av.peso, 340.2), av ? String(av.peso) : 'não gravou');

  // ---------- aviso de duplicidade não atrapalha o dia normal ----------
  t.secao('aviso de duplicidade no uso normal');
  let houveAviso = false;
  const ouvir = async d => { houveAviso = true; await d.accept(); };
  pagina.on('dialog', ouvir);
  await pagina.evaluate(() => openWeighMode());
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-14');
  await pesar('292', '400'); await pesar('293', '420'); await pesar('294', '345');
  pagina.removeListener('dialog', ouvir);
  t.conferir('dia novo não dispara aviso nenhum', houveAviso === false);
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; render(); });

  // ---------- sem sinal no curral ----------
  t.secao('curral sem sinal');
  const antes = await pagina.evaluate(() => weighings.length);
  await pagina.evaluate(() => {
    // a nuvem recusa a escrita, como aconteceria sem internet
    const semSinal = () => Promise.reject(new Error('offline'));
    const doc = { set: semSinal, delete: semSinal };
    const col = { doc: () => doc };
    doc.collection = () => col;
    db.collection = () => col;
    db.batch = () => ({ set() {}, delete() {}, commit: semSinal });
    openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-15');
  r = await pesar('292', '405');
  const depois = await pagina.evaluate(() => ({ n: weighings.length, ultimo: weighings[weighings.length - 1] }));
  t.conferir('pesagem sem sinal continua registrada no aparelho', depois.n === antes + 1 && eq(depois.ultimo.weight, 405), '');
  t.conferir('modo pesagem segue funcionando e confirma na tela', /405/.test(r.aviso), r.aviso);
  t.conferir('GMD segue sendo calculado sem sinal',
    eq(await pagina.evaluate(() => gmdTotal(wOf(animals.find(a => a.ident === '292').id))), (405 - 300) / daysEntre()), '');
  function daysEntre() { return 75; } // 01/06 → 15/08

  // ---------- prévia do GMD antes de salvar ----------
  t.secao('prévia do GMD com o animal na balança');
  await pagina.evaluate(() => {
    animals = [{ id: 'p1', ident: 'P1' }, { id: 'p2', ident: 'P2' }, { id: 'p3', ident: 'P3' }];
    weighings = [{ id: 'pw1', animalId: 'p1', date: '2026-06-01', weight: 300 },
                 { id: 'pw2', animalId: 'p2', date: '2026-06-01', weight: 330 },
                 { id: 'pw3', animalId: 'p3', date: '2026-06-01', weight: 350 }];
    settings.yield = 52; render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  const previa = async (brinco, peso) => {
    await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', brinco);
    await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', peso);
    await pagina.waitForTimeout(100);
    return pagina.evaluate(() => {
      const el = $('wm-previa'), g = el.querySelector('.wp-gmd');
      return { visivel: !el.hidden, texto: el.textContent.replace(/\s+/g, ' ').trim(),
        classe: g ? g.className : '', cor: g ? getComputedStyle(g).color : '' };
    });
  };
  let pv = await previa('P1', '415');
  t.conferir('GMD aparece antes de salvar', pv.visivel && /1,597/.test(pv.texto), pv.texto.slice(0, 46));
  t.conferir('mostra ganho e dias', /\+115 kg em 72 dias/.test(pv.texto));
  t.conferir('mostra peso anterior e data', /anterior 300 kg em 01\/06\/26/.test(pv.texto));
  t.conferir('mostra o peso em arrobas', /14,4 @/.test(pv.texto));
  t.conferir('GMD bom fica verde', pv.classe.includes('g-otimo') && pv.cor === 'rgb(110, 231, 183)', pv.cor);
  t.conferir('nada foi gravado só por olhar a prévia', await pagina.evaluate(() => weighings.length) === 3);

  pv = await previa('P2', '360');
  t.conferir('GMD mediano fica âmbar', pv.classe.includes('g-medio') && /0,417/.test(pv.texto), pv.cor);
  pv = await previa('P3', '365');
  t.conferir('GMD baixo fica vermelho', pv.classe.includes('g-baixo') && /0,208/.test(pv.texto), pv.cor);
  pv = await previa('NOVO9', '250');
  t.conferir('brinco novo avisa em vez de mostrar GMD', /será cadastrado/.test(pv.texto) && !/kg\/dia/.test(pv.texto), pv.texto.slice(0, 40));

  await pagina.fill('#wm-peso', '');
  t.conferir('prévia some quando falta o peso', await pagina.evaluate(() => $('wm-previa').hidden));
  await pagina.type('#wm-peso', '400'); await pagina.fill('#wm-ident', '');
  t.conferir('prévia some quando falta o brinco', await pagina.evaluate(() => $('wm-previa').hidden));

  // a prévia tem de bater com o GMD que fica gravado depois de salvar
  await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', 'P1');
  await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', '415');
  const daPrevia = await pagina.evaluate(() => parseNum($('wm-previa').querySelector('.wp-gmd').firstChild.textContent));
  await pagina.click('#wm-save'); await pagina.waitForTimeout(100);
  const gravado = await pagina.evaluate(() => gmdRecent(wOf(animals.find(a => a.ident === 'P1').id)));
  t.conferir('prévia bate com o GMD gravado', Math.abs(daPrevia - gravado) < 0.0005, `prévia ${daPrevia} · gravado ${gravado.toFixed(3)}`);
  t.conferir('prévia some depois de salvar', await pagina.evaluate(() => $('wm-previa').hidden));
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; render(); });

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
