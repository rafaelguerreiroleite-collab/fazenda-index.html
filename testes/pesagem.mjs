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

  // ---------- sugestões de brinco ----------
  t.secao('lista de brincos');
  await pagina.evaluate(() => {
    animals = [{ id: 's1', ident: '292' }, { id: 's2', ident: '9' }, { id: 's3', ident: '405' },
               { id: 's4', ident: '295' }, { id: 's5', ident: '1200' }, { id: 's6', ident: '30', sold: true }];
    weighings = [{ id: 'sw1', animalId: 's1', date: '2026-06-18', weight: 203 }];
    render(); openWeighMode();
  });
  await pagina.waitForTimeout(250);
  await pagina.fill('#wm-date', '2026-08-12');
  const sugestoes = () => pagina.evaluate(() => [...document.querySelectorAll('#wm-sugestoes .brinco')].map(e => e.textContent));
  await pagina.click('#wm-ident'); await pagina.waitForTimeout(80);
  let sug = await sugestoes();
  t.conferir('ordem numérica do menor para o maior', JSON.stringify(sug) === '["9","292","295","405","1200"]', JSON.stringify(sug));
  t.conferir('animal vendido fora da lista', !sug.includes('30'));

  await pagina.type('#wm-ident', '29');
  await pagina.waitForTimeout(80);
  sug = await sugestoes();
  t.conferir('filtra pelo que foi digitado, em ordem', JSON.stringify(sug) === '["292","295"]', JSON.stringify(sug));
  t.conferir('o que foi digitado permanece no campo', await pagina.inputValue('#wm-ident') === '29');

  await pagina.type('#wm-ident', '2');
  await pagina.waitForTimeout(80);
  t.conferir('digitar até o brinco exato mantém o texto', await pagina.inputValue('#wm-ident') === '292');
  t.conferir('lista some quando o brinco está completo', await pagina.evaluate(() => $('wm-sugestoes').hidden));

  await pagina.fill('#wm-ident', ''); await pagina.type('#wm-ident', '4');
  await pagina.waitForTimeout(80);
  await pagina.evaluate(() => document.querySelector('[data-sug="405"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await pagina.waitForTimeout(80);
  t.conferir('tocar na sugestão preenche o brinco', await pagina.inputValue('#wm-ident') === '405');
  t.conferir('lista fecha depois de escolher', await pagina.evaluate(() => $('wm-sugestoes').hidden));

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

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
