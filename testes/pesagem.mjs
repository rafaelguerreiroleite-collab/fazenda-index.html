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

  // ---------- a fazenda não pesa em jejum: o curral grava sempre peso cheio ----------
  t.secao('modo pesagem grava sempre peso cheio');
  t.conferir('a opção de jejum saiu da tela do curral', await pagina.evaluate(() => !document.getElementById('wm-jejum')));
  await pesar('293', '410');
  t.conferir('pesagem do curral gravada como peso cheio',
    (await gravadas()).find(x => x.animal === '293' && x.data === '2026-08-12').jejum === false);
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

  // ---------- campo do brinco: só digitação, nada abrindo por cima ----------
  t.secao('campo do brinco sem lista');
  await pagina.evaluate(() => {
    animals = [{ id: 's1', ident: '292' }, { id: 's2', ident: '9' }, { id: 's3', ident: '405' },
               { id: 's4', ident: '295' }, { id: 's5', ident: '1200' }, { id: 's6', ident: '30', sold: true }];
    weighings = [{ id: 'sw1', animalId: 's1', date: '2026-06-18', weight: 203 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  t.conferir('nao existe mais lista de brincos na tela', await pagina.evaluate(() => !document.getElementById('wm-sugestoes')));
  await pagina.click('#wm-ident'); await pagina.waitForTimeout(80);
  t.conferir('tocar no campo nao abre nada por cima',
    await pagina.evaluate(() => document.querySelectorAll('#weigh-mode [data-sug]').length) === 0);

  // O que se digita fica exatamente como foi digitado, dígito por dígito.
  const digitado = [];
  for (const d of ['2', '9', '2']) { await pagina.type('#wm-ident', d); await pagina.waitForTimeout(60);
    digitado.push(await pagina.inputValue('#wm-ident')); }
  t.conferir('o texto digitado nunca é trocado', JSON.stringify(digitado) === '["2","29","292"]', JSON.stringify(digitado));

  // Brinco que não existe: dá para escrever inteiro sem nada atrapalhar.
  await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', '5001');
  await pagina.waitForTimeout(80);
  t.conferir('brinco novo pode ser escrito inteiro', await pagina.inputValue('#wm-ident') === '5001');

  // A conferência do brinco passa a ser a prévia: ela mostra o peso anterior.
  await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', '292');
  await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', '250');
  await pagina.waitForTimeout(120);
  const conf = await pagina.evaluate(() => $('wm-previa').textContent.replace(/\s+/g, ' '));
  t.conferir('a prévia confirma que é o animal certo', /203 kg/.test(conf) && /18\/06\/26/.test(conf), conf.slice(-70));
  await pagina.fill('#wm-ident', ''); await pagina.fill('#wm-peso', '');

  // ---------- por que o GMD sumia de alguns brincos ----------
  t.secao('GMD não pode sumir do brinco certo');
  const pesarD = async (b, p, aceitar = true) => {
    const h = async d => { await (aceitar ? d.accept() : d.dismiss()); };
    pagina.on('dialog', h);
    await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', b);
    await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', p);
    await pagina.click('#wm-save'); await pagina.waitForTimeout(120);
    pagina.removeListener('dialog', h);
    return pagina.evaluate(() => $('wm-last').textContent);
  };

  // Espaço a mais no brinco criava um animal novo e zerava o histórico.
  await pagina.evaluate(() => {
    animals = [{ id: 'e1', ident: '292' }];
    weighings = [{ id: 'ew1', animalId: 'e1', date: '2026-06-18', weight: 200 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');   // 55 dias depois
  let saida = await pesarD(' 292 ', '255');
  t.conferir('brinco com espaço acha o mesmo animal, com GMD', /GMD 1,000/.test(saida), saida);
  t.conferir('e não cria um animal duplicado', await pagina.evaluate(() => animals.length) === 1,
    await pagina.evaluate(() => animals.length) + ' animal(is)');

  // Animal vendido: antes virava uma cópia escondida, sem histórico e sem GMD.
  await pagina.evaluate(() => {
    animals = [{ id: 'v1', ident: '700', sold: true }];
    weighings = [{ id: 'vw1', animalId: 'v1', date: '2026-06-18', weight: 300 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  let avisoVendido = null;
  const ouvirVendido = async d => { avisoVendido = d.message(); await d.dismiss(); };
  pagina.on('dialog', ouvirVendido);
  await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', '700');
  await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', '355');
  await pagina.click('#wm-save'); await pagina.waitForTimeout(120);
  pagina.removeListener('dialog', ouvirVendido);
  t.conferir('brinco vendido avisa antes de gravar', /VENDIDO/.test(avisoVendido || ''), (avisoVendido || 'sem aviso').split('\n')[0]);
  t.conferir('recusando o aviso, nada é gravado', await pagina.evaluate(() => weighings.length) === 1,
    await pagina.evaluate(() => weighings.length) + ' pesagem(ns)');

  saida = await pesarD('700', '355');
  t.conferir('aceitando, grava no histórico dele e o GMD sai', /GMD 1,000/.test(saida), saida);
  t.conferir('e continua um só animal no rebanho', await pagina.evaluate(() => animals.length) === 1,
    await pagina.evaluate(() => animals.length) + ' animal(is)');

  // Duplicata no rebanho: a pesagem tem de cair no que tem passado.
  await pagina.evaluate(() => {
    animals = [{ id: 'd1', ident: '800' }, { id: 'd2', ident: '800' }];
    weighings = [{ id: 'dw1', animalId: 'd2', date: '2026-06-18', weight: 250 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  saida = await pesarD('800', '305');
  t.conferir('brinco duplicado usa o animal que tem histórico', /GMD 1,000/.test(saida), saida);

  // Sem GMD tem de vir escrito o motivo, não um traço solto.
  await pagina.evaluate(() => { animals = [{ id: 'n1', ident: '900' }]; weighings = []; render(); openWeighMode(); });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  await pesarD('900', '280');
  const semGmd = await pagina.evaluate(() => document.querySelector('#wm-sessao .ws-linha .gmd').textContent);
  t.conferir('sem histórico a tela escreve o motivo', semGmd === '1ª pesagem', semGmd);
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; render(); });

  // ---------- alarme de pesagem implausível ----------
  t.secao('alarme de erro de digitação');
  await pagina.evaluate(() => {
    animals = [{ id: 'x1', ident: '293' }];
    weighings = [{ id: 'xw1', animalId: 'x1', date: '2026-06-18', weight: 147 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  const tentar = async (brinco, peso, aceitar) => {
    let msg = null;
    const h = async d => { msg = d.message(); await (aceitar ? d.accept() : d.dismiss()); };
    pagina.once('dialog', h);
    await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', brinco);
    await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', peso);
    await pagina.click('#wm-save'); await pagina.waitForTimeout(120);
    pagina.removeListener('dialog', h);
    return msg;
  };
  let aviso = await tentar('293', '330', false);   // 3,327 kg/dia: impossível
  t.conferir('GMD impossível dispara alarme', /CONFIRA/.test(aviso || '') && /3,327/.test(aviso || ''), (aviso || 'sem alarme').split('\n')[2] || '');
  t.conferir('recusando, nada é gravado', await pagina.evaluate(() => weighings.length) === 1);
  aviso = await tentar('293', '200', false);        // 0,964: plausível
  t.conferir('ganho plausível não incomoda', aviso === null);
  t.conferir('e é gravado normalmente', await pagina.evaluate(() => weighings.length) === 2);
  aviso = await tentar('293', '8', false);          // peso absurdo
  t.conferir('peso absurdo dispara alarme', /fora do esperado/.test(aviso || ''), '');
  aviso = await tentar('293', '330', true);         // aceita mesmo assim
  t.conferir('aceitando o alarme, grava', await pagina.evaluate(() => weighings.some(w => w.weight === 330)));

  // ---------- lista da sessão ----------
  t.secao('lista da sessão abaixo do botão');
  await pagina.evaluate(() => {
    animals = [{ id: 'm1', ident: '292' }, { id: 'm2', ident: '293' }, { id: 'm3', ident: '294' }];
    weighings = [{ id: 'mw1', animalId: 'm1', date: '2026-06-18', weight: 200 },
                 { id: 'mw2', animalId: 'm2', date: '2026-06-18', weight: 300 },
                 { id: 'mw3', animalId: 'm3', date: '2026-06-18', weight: 250 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');   // 55 dias depois
  t.conferir('lista começa escondida', await pagina.evaluate(() => $('wm-sessao').hidden));
  const pesarS = async (b, p) => { await pagina.fill('#wm-ident',''); await pagina.type('#wm-ident', b);
    await pagina.fill('#wm-peso',''); await pagina.type('#wm-peso', p);
    await pagina.click('#wm-save'); await pagina.waitForTimeout(100); };
  await pesarS('292', '255');   // +55 em 55d = 1,000
  await pesarS('293', '355');   // +55 em 55d = 1,000
  await pesarS('294', '277');   // +27 em 55d = 0,491
  const sessao = await pagina.evaluate(() => ({
    media: document.querySelector('#wm-sessao .ws-media .val').textContent,
    cabecalhos: [...document.querySelectorAll('#wm-sessao .ws-media')].map(e => e.querySelector('.val').textContent),
    linhas: [...document.querySelectorAll('#wm-sessao .ws-linha')].map(l => [...l.children].map(c => c.textContent))
  }));
  const esperado = (1 + 1 + 27 / 55) / 3;
  t.conferir('média do GMD da sessão', sessao.media === fmt3(esperado), sessao.media + ' (esperado ' + fmt3(esperado) + ')');
  t.conferir('peso médio da sessão', sessao.cabecalhos[1] === '296 kg', sessao.cabecalhos[1]);
  t.conferir('três animais na lista', sessao.linhas.length === 3);
  t.conferir('mais recente no topo', sessao.linhas[0][0] === '294', sessao.linhas[0][0]);
  t.conferir('GMD individual por linha', sessao.linhas[0][2] === '0,491' && sessao.linhas[1][2] === '1,000', sessao.linhas.map(l => l[2]).join(' '));
  await pesarS('294', '300');   // repesa o mesmo animal
  const dep = await pagina.evaluate(() => [...document.querySelectorAll('#wm-sessao .ws-linha')].map(l => l.children[0].textContent));
  t.conferir('repesar atualiza a linha, não duplica', dep.length === 3 && dep[0] === '294', dep.join(','));

  // Sair do modo pesagem e voltar no mesmo dia: a lista vem do que está gravado,
  // então tudo que já foi pesado continua na tela.
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; render(); });
  await pagina.evaluate(() => openWeighMode());
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  await pagina.waitForTimeout(80);
  const volta = await pagina.evaluate(() => ({
    escondida: $('wm-sessao').hidden,
    linhas: [...document.querySelectorAll('#wm-sessao .ws-linha')].map(l => l.children[0].textContent),
    media: (document.querySelector('#wm-sessao .ws-media .val') || {}).textContent
  }));
  t.conferir('saindo e voltando, a lista do dia continua na tela', volta.escondida === false && volta.linhas.length === 3,
    volta.escondida ? 'lista sumiu' : volta.linhas.join(','));
  t.conferir('e os 3 brincos do dia estão lá', ['292', '293', '294'].every(b => volta.linhas.includes(b)), volta.linhas.join(','));
  const esperado2 = (1 + 1 + 50 / 55) / 3;   // 294 foi repesado para 300 kg: +50 em 55 dias
  t.conferir('média do dia recalculada com o que está gravado', volta.media === fmt3(esperado2),
    volta.media + ' (esperado ' + fmt3(esperado2) + ')');
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; render(); });
  function fmt3(n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }

  // ---------- intervalo curto: GMD nao serve, vale a variacao do peso ----------
  t.secao('intervalo curto entre pesagens');
  await pagina.evaluate(() => {
    animals = [{ id: 'c1', ident: '500' }];
    weighings = [{ id: 'cw1', animalId: 'c1', date: '2026-08-12', weight: 400 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-14');   // 2 dias depois
  aviso = await tentar('500', '410', false);      // +2,5%: repesagem normal
  t.conferir('repesar em 2 dias com pequena diferença não alarma', aviso === null, aviso || '');
  aviso = await tentar('500', '520', false);      // +30% em 2 dias: erro de digitação
  t.conferir('variação absurda em poucos dias alarma', /% de diferença/.test(aviso || ''), (aviso || 'sem alarme').split('\n')[0]);

  // ---------- histórico antigo em jejum ainda precisa avisar ----------
  t.secao('pesagem antiga em jejum');
  await pagina.evaluate(() => {
    animals = [{ id: 'j1', ident: '700' }];
    weighings = [{ id: 'jw1', animalId: 'j1', date: '2026-06-01', weight: 300, jejum: true }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', '700');
  await pagina.fill('#wm-peso', ''); await pagina.type('#wm-peso', '360');
  await pagina.waitForTimeout(120);
  let prev = await pagina.evaluate(() => $('wm-previa').textContent.replace(/\s+/g, ' '));
  t.conferir('avisa que compara jejum com cheio', /comparando jejum com cheio/.test(prev), prev.slice(-60));
  t.conferir('indica o sentido do erro', /ganho real é menor/.test(prev));
  t.conferir('anota que a anterior era em jejum', /\(jejum\)/.test(prev));
  await pagina.evaluate(() => {
    weighings = [{ id: 'jw1', animalId: 'j1', date: '2026-06-01', weight: 300, jejum: false }];
    $('wm-peso').dispatchEvent(new Event('input'));
  });
  await pagina.waitForTimeout(120);
  prev = await pagina.evaluate(() => $('wm-previa').textContent.replace(/\s+/g, ' '));
  t.conferir('histórico de peso cheio não gera aviso', !/comparando/.test(prev), prev.slice(-60));

  // ---------- peso de entrada editado corrige o histórico ----------
  t.secao('peso de entrada e histórico');
  await pagina.evaluate(() => { $('weigh-mode').hidden = true; animals = []; weighings = []; render(); openAnimal(); });
  await pagina.fill('#an-ident', 'E1');
  await pagina.fill('#an-entry-date', '2026-05-01');
  await pagina.fill('#an-entry-weight', ''); await pagina.type('#an-entry-weight', '250');
  await pagina.click('#form-animal button[type="submit"]'); await pagina.waitForTimeout(120);
  t.conferir('cadastro cria a pesagem de entrada', await pagina.evaluate(() => weighings.length) === 1);
  await pagina.evaluate(() => openAnimal(animals[0]));
  await pagina.fill('#an-entry-weight', ''); await pagina.type('#an-entry-weight', '270');
  await pagina.click('#form-animal button[type="submit"]'); await pagina.waitForTimeout(120);
  let hist = await pagina.evaluate(() => weighings.map(w => w.weight));
  t.conferir('corrigir o peso corrige a pesagem, sem duplicar', JSON.stringify(hist) === '[270]', JSON.stringify(hist));
  await pagina.evaluate(() => openAnimal(animals[0]));
  await pagina.fill('#an-entry-weight', '');
  await pagina.click('#form-animal button[type="submit"]'); await pagina.waitForTimeout(120);
  t.conferir('apagar o peso remove a pesagem de entrada', await pagina.evaluate(() => weighings.length) === 0);

  // ---------- aparelho sem memória ----------
  t.secao('memória do aparelho cheia');
  let alerta = null;
  const ouvirAlerta = async d => { alerta = d.message(); await d.accept(); };
  pagina.on('dialog', ouvirAlerta);
  await pagina.evaluate(() => {
    espelhoFalhou = false;
    LS.s = () => false;              // como se o aparelho recusasse gravar
    animals = [{ id: 'q1', ident: '800' }]; weighings = [];
    salvarEspelho(true);
  });
  await pagina.waitForTimeout(150);
  pagina.removeListener('dialog', ouvirAlerta);
  t.conferir('avisa em alto e bom som que não está guardando', /não está conseguindo guardar/.test(alerta || ''), (alerta || 'sem aviso').split('\n')[0]);
  await pagina.evaluate(() => { LS.s = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }; });

  // ---------- estimativa de peso com GMD informado à mão ----------
  // Quem conhece o lote sabe o GMD que ele vem fazendo. Com esse número, o app
  // diz onde o animal DEVERIA estar hoje — antes de subir na balança, para
  // saber o que esperar, e depois, para conferir o que a balança mostrou.
  // A estimativa não grava nada e não entra em conta nenhuma do aplicativo.
  t.secao('estimativa de peso no modo pesagem');
  const est = await pagina.evaluate(() => {
    animals = [
      { id: 'n1', ident: '292' },
      { id: 'n2', ident: '999' }   // sem pesagem nenhuma
    ];
    weighings = [{ id: 'we', animalId: 'n1', date: '2026-08-13', weight: 227, jejum: false }];
    openWeighMode();
    const ler = (brinco, gmd, peso) => {
      $('wm-date').value = '2026-09-01';
      $('wm-gmd-sim').value = gmd;
      $('wm-ident').value = brinco;
      $('wm-peso').value = peso == null ? '' : peso;
      atualizarPreviaPesagem();
      return { texto: $('wm-previa').innerText, escondida: $('wm-previa').hidden,
        temBloco: !!document.querySelector('#wm-previa .wp-est') };
    };
    const r = {};
    // 227 kg em 13/08 + 0,600 × 19 dias = 238,4 kg
    r.semPeso = ler('292', '0,600', null);
    r.comPesoIgual = ler('292', '0,600', '238,4');
    r.comPesoAcima = ler('292', '0,600', '250');
    r.comPesoAbaixo = ler('292', '0,600', '230');
    r.semGmd = ler('292', '', '250');
    r.gmdLixo = ler('292', 'abc', '250');
    r.semHistorico = ler('999', '0,600', null);
    r.brincoNovo = ler('555', '0,600', null);
    // GMD negativo (seca, perda de peso) é informação legítima
    r.gmdNegativo = ler('292', '-0,200', null);
    // mesma data da última pesagem: não há dias para projetar
    $('wm-date').value = '2026-08-13';
    $('wm-ident').value = '292'; $('wm-peso').value = ''; $('wm-gmd-sim').value = '0,600';
    atualizarPreviaPesagem();
    r.mesmoDia = { temBloco: !!document.querySelector('#wm-previa .wp-est') };
    // o GMD digitado fica guardado para o lote inteiro
    $('wm-gmd-sim').value = '0,750';
    $('wm-gmd-sim').dispatchEvent(new Event('input', { bubbles: true }));
    r.guardado = JSON.parse(localStorage.getItem('fjs-gmd-sim'));
    // e nada disso encostou nos dados
    r.pesagens = weighings.length;
    r.animais = animals.length;
    $('weigh-mode').hidden = true;
    return r;
  });
  const num = txt => (txt.match(/238,4|238,40/) || [])[0];
  t.conferir('a estimativa aparece antes de digitar o peso',
    est.semPeso.temBloco === true && est.semPeso.escondida === false, est.semPeso.texto.slice(0, 90));
  t.conferir('e ela projeta o peso certo (227 kg + 0,600 × 19 dias = 238,4)',
    !!num(est.semPeso.texto), est.semPeso.texto.replace(/\n/g, ' | '));
  t.conferir('a estimativa também sai em arrobas',
    /@/.test(est.semPeso.texto), est.semPeso.texto.replace(/\n/g, ' | '));
  t.conferir('mostra de onde partiu: última pesagem e quantos dias',
    /13\/08/.test(est.semPeso.texto) && /19 dias/.test(est.semPeso.texto),
    est.semPeso.texto.replace(/\n/g, ' | '));
  t.conferir('com o peso digitado, ela vira conferência da balança',
    /acima|ABAIXO/.test(est.comPesoAcima.texto), est.comPesoAcima.texto.replace(/\n/g, ' | '));
  t.conferir('peso acima do estimado é apontado como acima',
    /11,6 kg acima/.test(est.comPesoAcima.texto), est.comPesoAcima.texto.replace(/\n/g, ' | '));
  t.conferir('peso abaixo do estimado é apontado como ABAIXO',
    /8,4 kg ABAIXO/.test(est.comPesoAbaixo.texto), est.comPesoAbaixo.texto.replace(/\n/g, ' | '));
  t.conferir('sem GMD informado não inventa estimativa',
    est.semGmd.temBloco === false, est.semGmd.texto.replace(/\n/g, ' | '));
  t.conferir('GMD digitado errado não vira estimativa maluca',
    est.gmdLixo.temBloco === false, est.gmdLixo.texto.replace(/\n/g, ' | '));
  t.conferir('animal sem pesagem anterior não recebe estimativa',
    est.semHistorico.temBloco === false, est.semHistorico.texto.replace(/\n/g, ' | '));
  t.conferir('brinco novo também não', est.brincoNovo.temBloco === false,
    est.brincoNovo.texto.replace(/\n/g, ' | '));
  t.conferir('GMD negativo é aceito — na seca o gado perde peso',
    est.gmdNegativo.temBloco === true && /2\d\d,\d/.test(est.gmdNegativo.texto),
    est.gmdNegativo.texto.replace(/\n/g, ' | '));
  t.conferir('pesando no mesmo dia da última não há o que projetar',
    est.mesmoDia.temBloco === false);
  t.conferir('o GMD da estimativa fica guardado para o lote inteiro',
    est.guardado === '0,750', String(est.guardado));
  t.conferir('a estimativa não cria nem altera pesagem nenhuma',
    est.pesagens === 1 && est.animais === 2, `${est.pesagens} pesagens · ${est.animais} animais`);

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
