// NADA SE PERDE: toda porta de gravação do aplicativo, sem sinal.
//
// Pergunta do dono: "conferir se lançamentos estão todos sendo salvos sem
// exceção, mesmo quando lanço offline".
//
// A resposta não pode ser lida no código — ali é fácil ver que a função de
// gravar está certa e não ver que UMA tela deixou de chamá-la. Então este
// teste faz o contrário: abre o aplicativo SEM NUVEM NENHUMA e passa por cada
// porta por onde um dado entra, sai ou muda — animal, pesagem pelo formulário,
// pesagem no brete, lançamento à vista, a prazo, parcelado, a receber, baixa,
// item de estoque, movimentação, atividade nova, nota fiscal, rendimento de
// carcaça, parâmetros de custo, importação de planilha, restauração de backup,
// e as exclusões de tudo isso.
//
// Para CADA uma, a mesma cobrança em três lugares:
//
//   1. na TELA        — está na memória do aplicativo, o dono vê;
//   2. no APARELHO    — está na cópia local, sobrevive a fechar o app;
//   3. na FILA        — está na caixa de saída, vai subir quando houver sinal.
//
// Faltar o 1 é um dado que não aparece. Faltar o 2 é um dado que some ao
// fechar o aplicativo — o pior caso do curral. Faltar o 3 é um dado que fica
// só neste celular para sempre, e ninguém descobre até precisar dele em outro.
//
// Depois: fecha e reabre ainda sem sinal (nada pode sumir), volta o sinal
// (tudo tem de subir e a fila esvaziar), e os três estados feios que o campo
// produz de verdade — sinal fraco em que a nuvem não responde nem recusa, um
// registro que a nuvem RECUSA, e a memória do aparelho cheia.
import { chromium } from 'playwright';
import { servir, placar } from './apoio.mjs';
import { existsSync } from 'node:fs';

const CHROMIUM = '/opt/pw-browsers/chromium';

// Sonda de conferência, instalada dentro da página. Usa o próprio lerColecao
// do aplicativo, que é quem sabe em qual lista mora cada coleção — inclusive
// as coleções das atividades criadas pelo dono (at_<id>).
const SONDA = `window.sonda = (col, id) => {
  const esp = JSON.parse(localStorage.getItem('fjs-espelho') || '{}');
  const chave = { animals: 'animals', weighings: 'weighings', bovtrans: 'bovT',
    avtrans: 'avT', gertrans: 'gerT', items: 'items', moves: 'moves' };
  const noEspelho = col.indexOf('at_') === 0
    ? ((esp.extraT || {})[col.slice(3)] || []).some(x => x.id === id)
    : (esp[chave[col]] || []).some(x => x.id === id);
  const op = pendentes.find(p => p.col === col && p.id === id);
  return {
    // A nota fiscal não vive numa lista na memória nem na cópia local: ela é
    // buscada na nuvem quando o dono abre o lançamento. Para ela, a fila É a
    // garantia — e por isso o teste cobra o conteúdo do arquivo dentro da op.
    memoria: col === 'anexos' ? null : lerColecao(col).some(x => x.id === id),
    // Anexo (nota fiscal) é o único registro que NÃO vai na cópia local: são
    // até ~1 MB por foto, e encher o armazenamento derrubaria a fila inteira.
    espelho: col === 'anexos' ? null : noEspelho,
    fila: !!op && !op.del,
    obj: op && op.obj ? op.obj : null
  };
};
window.sondaApagado = (col, id) => {
  const esp = JSON.parse(localStorage.getItem('fjs-espelho') || '{}');
  const chave = { animals: 'animals', weighings: 'weighings', bovtrans: 'bovT',
    avtrans: 'avT', gertrans: 'gerT', items: 'items', moves: 'moves' };
  const noEspelho = col.indexOf('at_') === 0
    ? ((esp.extraT || {})[col.slice(3)] || []).some(x => x.id === id)
    : (esp[chave[col]] || []).some(x => x.id === id);
  return {
    memoria: col === 'anexos' ? null : !lerColecao(col).some(x => x.id === id),
    espelho: col === 'anexos' ? null : !noEspelho,
    fila: pendentes.some(p => p.col === col && p.id === id && p.del === true)
  };
};
window.naFazenda = campo => {
  const p = pendentes.find(x => x.col === '_fazenda');
  return p && p.obj && p.obj[campo] !== undefined ? p.obj[campo] : null;
};`;

export default async function () {
  const s = await servir();
  const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
  // Service worker bloqueado de propósito: o pior caso é o aparelho que não
  // tem nem o SDK guardado. Se nada se perde aqui, não se perde em lugar nenhum.
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: 'pt-BR', serviceWorkers: 'block' });
  const pagina = await ctx.newPage();
  const errosJS = [];
  const avisos = [];
  pagina.on('pageerror', e => errosJS.push(e.message));
  pagina.on('dialog', d => { avisos.push(d.type() + ': ' + d.message().replace(/\s+/g, ' ')); d.accept().catch(() => {}); });
  const t = placar('Nada se perde: toda porta de gravação, sem sinal');

  // Nada sai para a internet.
  await pagina.route('**/*', r =>
    ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());

  await pagina.addInitScript(() => {
    localStorage.setItem('fjs-fbconfig', JSON.stringify({ apiKey: 'x', projectId: 'p', authDomain: 'a', appId: '1' }));
    localStorage.setItem('fjs-farm', JSON.stringify('demo'));
    // A tela do calendário tapa os cliques e não é o assunto aqui.
    localStorage.setItem('fjs-ics-auto', JSON.stringify(false));
    localStorage.setItem('fjs-ics-visto', JSON.stringify(true));
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
    await pagina.evaluate(SONDA);
    await pagina.waitForTimeout(250);
  };

  // Cada porta é cobrada nos três lugares. As portas vão para esta lista, que
  // é conferida de novo depois do fecha-e-abre e depois do sinal voltar — não
  // basta gravar certo: tem de continuar lá e tem de subir.
  const portas = [];
  const rotulo = (v, sim, nao) => v === null ? 'n/a' : v ? sim : nao;
  const bom = r => (r.memoria === null || r.memoria) && (r.espelho === null || r.espelho) && r.fila;
  const tresLugares = async (nome, col, id) => {
    const r = await pagina.evaluate(([c, i]) => sonda(c, i), [col, id]);
    t.conferir(`${nome} — na tela, no aparelho e na fila`, bom(r),
      `tela ${rotulo(r.memoria, 'sim', 'NÃO')} · aparelho ${rotulo(r.espelho, 'sim', 'NÃO')} · fila ${rotulo(r.fila, 'sim', 'NÃO')}`);
    portas.push({ nome, col, id });
    return r;
  };
  const tresLugaresApagado = async (nome, col, id) => {
    const r = await pagina.evaluate(([c, i]) => sondaApagado(c, i), [col, id]);
    t.conferir(`${nome} — saiu da tela, do aparelho, e a remoção está na fila`, bom(r),
      `tela ${rotulo(r.memoria, 'saiu', 'AINDA ESTÁ')} · aparelho ${rotulo(r.espelho, 'saiu', 'AINDA ESTÁ')} · fila ${rotulo(r.fila, 'sim', 'NÃO')}`);
    // O registro apagado deixa de ser cobrado como gravação: o que tem de
    // sobreviver ao fecha-e-abre agora é a REMOÇÃO dele.
    const i = portas.findIndex(p => p.col === col && p.id === id);
    if (i >= 0) portas.splice(i, 1);
    portas.push({ nome, col, id, apagado: true });
  };

  await abrir(false);
  t.secao('o aparelho está sem nuvem nenhuma');
  t.conferir('nuvem indisponível, como o curral de verdade', await pagina.evaluate(() => db === null));
  t.conferir('a tela de configuração não apareceu', await pagina.evaluate(() => $('setup-screen').hidden));
  await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = [];
    atividades = []; extraT = {}; pendentes = []; guardarFila();
    recomputarLivros(); salvarEspelho(true); render();
  });

  // ---------- animal ----------
  t.secao('cadastro do animal');
  await pagina.evaluate(() => { openAnimal(null); });
  await pagina.fill('#an-ident', '1001');
  await pagina.fill('#an-cat', 'Novilha');
  await pagina.fill('#an-raca', 'Nelore');
  await pagina.fill('#an-entry-date', '2026-03-10');
  await pagina.fill('#an-entry-weight', '300');
  await pagina.click('#form-animal button[type="submit"]');
  await pagina.waitForTimeout(150);
  const a1 = await pagina.evaluate(() => {
    const a = animals.find(x => x.ident === '1001');
    return { id: a.id, pesagem: a.entryWeighingId };
  });
  await tresLugares('animal novo', 'animals', a1.id);
  // A pesagem de entrada nasce junto com o cadastro: se ela não entrar na
  // fila, o animal sobe com peso que nenhum outro aparelho consegue ver.
  await tresLugares('peso de entrada do cadastro', 'weighings', a1.pesagem);

  t.secao('edição do animal');
  await pagina.evaluate(id => { openAnimal(animals.find(a => a.id === id)); }, a1.id);
  await pagina.fill('#an-raca', 'Angus');
  await pagina.fill('#an-entry-weight', '310');
  await pagina.click('#form-animal button[type="submit"]');
  await pagina.waitForTimeout(150);
  const edit = await pagina.evaluate(([i, w]) => ({ a: sonda('animals', i), w: sonda('weighings', w) }), [a1.id, a1.pesagem]);
  t.conferir('a correção da raça vai para a fila com o valor NOVO',
    edit.a.obj && edit.a.obj.raca === 'Angus', edit.a.obj ? String(edit.a.obj.raca) : 'sem op na fila');
  t.conferir('e corrigir o peso de entrada corrige a pesagem na fila também',
    edit.w.obj && edit.w.obj.weight === 310, edit.w.obj ? String(edit.w.obj.weight) : 'sem op na fila');

  // ---------- pesagem pelo formulário ----------
  t.secao('pesagem pelo formulário');
  await pagina.evaluate(id => { openWeighing(id, null); }, a1.id);
  await pagina.fill('#w-date', '2026-06-10');
  await pagina.fill('#w-weight', '372,5');
  await pagina.click('#form-weighing button[type="submit"]');
  await pagina.waitForTimeout(150);
  const w1 = await pagina.evaluate(() => weighings.find(w => w.date === '2026-06-10').id);
  const rw1 = await tresLugares('pesagem nova', 'weighings', w1);
  t.conferir('com o peso exato que foi digitado, vírgula e tudo',
    rw1.obj && rw1.obj.weight === 372.5, rw1.obj ? String(rw1.obj.weight) : '—');

  await pagina.evaluate(id => { openWeighing(weighings.find(w => w.id === id).animalId, weighings.find(w => w.id === id)); }, w1);
  await pagina.fill('#w-weight', '375');
  await pagina.click('#form-weighing button[type="submit"]');
  await pagina.waitForTimeout(150);
  const rw1b = await pagina.evaluate(i => sonda('weighings', i), w1);
  t.conferir('corrigir o peso manda a correção para a fila',
    rw1b.obj && rw1b.obj.weight === 375, rw1b.obj ? String(rw1b.obj.weight) : '—');

  // ---------- pesagem no brete ----------
  t.secao('pesagem no brete (modo pesagem)');
  await pagina.evaluate(() => openWeighMode());
  await pagina.waitForTimeout(200);
  await pagina.fill('#wm-date', '2026-08-12');
  await pagina.fill('#wm-ident', '2002');
  await pagina.fill('#wm-peso', '318');
  await pagina.click('#wm-save');
  await pagina.waitForTimeout(200);
  await pagina.click('#wm-close');
  await pagina.waitForTimeout(150);
  const brete = await pagina.evaluate(() => {
    const a = animals.find(x => x.ident === '2002');
    const w = weighings.find(x => x.animalId === a.id && x.date === '2026-08-12');
    return { a: a.id, w: w.id };
  });
  await tresLugares('animal criado no brete', 'animals', brete.a);
  await tresLugares('pesagem feita no brete', 'weighings', brete.w);

  // ---------- lançamentos ----------
  t.secao('lançamento à vista');
  const lancar = async (livro, campos) => {
    await pagina.evaluate(l => { openTrans(l, null); }, livro);
    await pagina.waitForTimeout(80);
    if (campos.entrada) await pagina.check('input[name="t-type"][value="entrada"]');
    await pagina.fill('#t-date', campos.date);
    await pagina.fill('#t-amount', campos.amount);
    await pagina.fill('#t-category', campos.category);
    if (campos.notes) await pagina.fill('#t-notes', campos.notes);
    if (campos.venc) {
      await pagina.check('#t-prazo');
      await pagina.fill('#t-venc', campos.venc);
      if (campos.parcelas) await pagina.fill('#t-parcelas', String(campos.parcelas));
    }
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => closeAllM());
  };
  await lancar('bov', { date: '2026-06-01', amount: '1.250,50', category: 'Mão de obra', notes: 'vaqueiro junho' });
  const tv = await pagina.evaluate(() => bovT.find(x => x.notes === 'vaqueiro junho').id);
  const rtv = await tresLugares('lançamento à vista', 'bovtrans', tv);
  t.conferir('com o valor exato, sem arredondar na passagem',
    rtv.obj && rtv.obj.amount === 1250.5, rtv.obj ? String(rtv.obj.amount) : '—');

  // O valor salvo tem de ser o valor digitado. Este era o furo mais caro que
  // esta bateria encontrou: "10.000" no campo de valor era lido como R$ 10,00
  // — mil vezes menos, em silêncio, com o lançamento gravado certinho nos três
  // lugares. Salvo sem exceção e errado não é salvo.
  t.secao('o valor digitado é o valor salvo');
  await lancar('bov', { date: '2026-06-12', amount: '10.000', category: 'Compra de gado (engorda)', notes: 'dez mil' });
  const dezMil = await pagina.evaluate(() => {
    const t2 = bovT.find(x => x.notes === 'dez mil');
    return { memoria: t2.amount, fila: (pendentes.find(p => p.id === t2.id) || {}).obj.amount,
      espelho: (JSON.parse(localStorage.getItem('fjs-espelho')).bovT.find(x => x.id === t2.id) || {}).amount };
  });
  t.conferir('"10.000" é dez mil reais, na tela, no aparelho e na fila',
    dezMil.memoria === 10000 && dezMil.fila === 10000 && dezMil.espelho === 10000,
    `tela ${dezMil.memoria} · aparelho ${dezMil.espelho} · fila ${dezMil.fila}`);
  const lidos = await pagina.evaluate(() => {
    openTrans('bov', null);
    const ler = v => {
      $('t-amount').value = v;
      $('t-amount').dispatchEvent(new Event('input'));
      return { texto: $('t-amount-lido').textContent, escondido: $('t-amount-lido').hidden };
    };
    const r = { vazio: ler(''), mil: ler('10.000'), milhao: ler('1.000.000'),
      centavos: ler('1.250,50'), ponto: ler('4.50'), lixo: ler('abc') };
    closeAllM();
    return r;
  });
  t.conferir('o campo mostra o valor que entendeu, em reais',
    /10\.000,00/.test(lidos.mil.texto), lidos.mil.texto);
  t.conferir('um milhão também', /1\.000\.000,00/.test(lidos.milhao.texto), lidos.milhao.texto);
  t.conferir('centavos com vírgula continuam centavos', /1\.250,50/.test(lidos.centavos.texto), lidos.centavos.texto);
  t.conferir('ponto com duas casas continua decimal', /4,50/.test(lidos.ponto.texto), lidos.ponto.texto);
  t.conferir('texto que não é valor vira aviso, não um número inventado',
    /Não entendi/.test(lidos.lixo.texto), lidos.lixo.texto);
  t.conferir('campo vazio não mostra nada', lidos.vazio.escondido === true);

  t.secao('lançamento a prazo');
  await lancar('bov', { date: '2026-06-02', amount: '900', category: 'Ração/insumos', notes: 'ração a prazo', venc: '2026-07-02' });
  const tp = await pagina.evaluate(() => bovT.find(x => x.notes === 'ração a prazo').id);
  const rtp = await tresLugares('conta a pagar', 'bovtrans', tp);
  t.conferir('o vencimento vai junto para a fila',
    rtp.obj && rtp.obj.venc === '2026-07-02', rtp.obj ? String(rtp.obj.venc) : '—');

  t.secao('compra parcelada');
  await lancar('bov', { date: '2026-06-03', amount: '3.000', category: 'Medicamentos/vacinas', notes: 'carnê 3x', venc: '2026-07-03', parcelas: 3 });
  const carne = await pagina.evaluate(() => bovT.filter(x => x.notes === 'carnê 3x').map(x => x.id));
  t.conferir('as 3 parcelas nasceram', carne.length === 3, carne.length + ' parcela(s)');
  for (let i = 0; i < carne.length; i++) await tresLugares(`parcela ${i + 1} de 3`, 'bovtrans', carne[i]);
  const somaCarne = await pagina.evaluate(() =>
    pendentes.filter(p => p.col === 'bovtrans' && p.obj && p.obj.notes === 'carnê 3x')
      .reduce((s, p) => s + p.obj.amount, 0));
  t.conferir('e a fila carrega R$ 3.000 no total, não R$ 3.000 por parcela',
    Math.abs(somaCarne - 3000) < 1e-9, 'R$ ' + somaCarne.toFixed(2));

  t.secao('recebimento futuro');
  await lancar('bov', { entrada: true, date: '2026-06-04', amount: '12.000', category: 'Venda de gado', notes: 'boi a receber', venc: '2026-08-04' });
  const tr = await pagina.evaluate(() => bovT.find(x => x.notes === 'boi a receber').id);
  const rtr = await tresLugares('conta a receber', 'bovtrans', tr);
  t.conferir('entra como entrada a receber, não como gasto',
    rtr.obj && rtr.obj.type === 'entrada' && rtr.obj.venc === '2026-08-04' && !rtr.obj.pago,
    rtr.obj ? `${rtr.obj.type} · venc ${rtr.obj.venc} · pago ${!!rtr.obj.pago}` : '—');

  t.secao('baixa pelo botão Pagar');
  await pagina.evaluate(() => { tab = 'bovinos'; seg = 'financeiro'; render(); });
  await pagina.waitForTimeout(150);
  await pagina.evaluate(id => {
    const b = document.querySelector(`[data-pagar="${id}"]`);
    if (!b) throw new Error('botão Pagar não encontrado na tela');
    b.click();
  }, tp);
  await pagina.waitForTimeout(200);
  const baixa = await pagina.evaluate(i => sonda('bovtrans', i), tp);
  t.conferir('marcar como paga sem sinal entra na fila como PAGA',
    baixa.obj && baixa.obj.pago === true && !!baixa.obj.pagoEm,
    baixa.obj ? `pago ${baixa.obj.pago} em ${baixa.obj.pagoEm}` : '—');
  t.conferir('e a cópia local já diz que está paga',
    await pagina.evaluate(i => (JSON.parse(localStorage.getItem('fjs-espelho')).bovT
      .find(x => x.id === i) || {}).pago === true, tp));

  t.secao('os outros livros');
  await lancar('av', { date: '2026-06-05', amount: '400', category: 'Gás', notes: 'gás aviário' });
  await tresLugares('lançamento dos Aviários', 'avtrans',
    await pagina.evaluate(() => avT.find(x => x.notes === 'gás aviário').id));
  await lancar('ger', { date: '2026-06-06', amount: '700', category: 'Contador/serviços', notes: 'contador' });
  await tresLugares('lançamento do Geral', 'gertrans',
    await pagina.evaluate(() => gerT.find(x => x.notes === 'contador').id));

  // ---------- atividade criada pelo dono ----------
  t.secao('atividade criada pelo dono, sem sinal');
  await pagina.evaluate(() => { closeAllM(); $('at-nome').value = 'Soja 2026'; $('at-criar').click(); });
  await pagina.waitForTimeout(200);
  const at = await pagina.evaluate(() => (atividades.find(a => a.nome === 'Soja 2026') || {}).id || null);
  t.conferir('a atividade nova existe', !!at, String(at));
  t.conferir('e a lista de atividades entrou na fila da fazenda',
    await pagina.evaluate(() => {
      const l = naFazenda('atividades');
      return Array.isArray(l) && l.some(x => x.nome === 'Soja 2026');
    }));
  await pagina.evaluate(() => closeAllM());
  await lancar(at, { date: '2026-06-07', amount: '5.000', category: 'Soja', notes: 'semente soja' });
  await tresLugares('lançamento da atividade nova', 'at_' + at,
    await pagina.evaluate(i => (extraT[i].find(x => x.notes === 'semente soja') || {}).id, at));

  // ---------- estoque ----------
  t.secao('item de estoque e movimentação');
  await pagina.evaluate(() => { openItem(null); });
  await pagina.fill('#i-name', 'Proteinado 30%');
  await pagina.fill('#i-min', '10');
  await pagina.click('#form-item button[type="submit"]');
  await pagina.waitForTimeout(150);
  const it = await pagina.evaluate(() => items.find(x => x.name === 'Proteinado 30%').id);
  await tresLugares('item de estoque', 'items', it);

  await pagina.evaluate(i => { openMove(i, 'entrada', null); }, it);
  await pagina.waitForTimeout(80);
  await pagina.fill('#m-date', '2026-06-08');
  await pagina.fill('#m-qty', '40');
  await pagina.fill('#m-cost', '3,50');
  await pagina.fill('#m-notes', 'compra proteinado');
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => closeAllM());
  const mv = await pagina.evaluate(() => moves.find(m => m.notes === 'compra proteinado').id);
  await tresLugares('entrada de estoque', 'moves', mv);
  // A compra gera o lançamento no financeiro. Ele é tão dado quanto o resto:
  // ficar só na memória significa estoque certo num aparelho e caixa errado
  // em todos os outros.
  const mvT = await pagina.evaluate(i => (bovT.find(x => x.lock === 'stock' && x.linkMove === i) || bovT.filter(x => x.lock === 'stock').slice(-1)[0] || {}).id || null, mv);
  t.conferir('a compra lançou no financeiro', !!mvT, String(mvT));
  if (mvT) await tresLugares('lançamento gerado pela compra', 'bovtrans', mvT);

  t.secao('compra de estoque parcelada');
  await pagina.evaluate(i => { openMove(i, 'entrada', null); }, it);
  await pagina.waitForTimeout(80);
  await pagina.fill('#m-date', '2026-06-09');
  await pagina.fill('#m-qty', '20');
  await pagina.fill('#m-cost', '4');
  await pagina.fill('#m-notes', 'proteinado a prazo');
  await pagina.check('#m-prazo');
  await pagina.fill('#m-venc', '2026-07-09');
  await pagina.fill('#m-parcelas', '2');
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => closeAllM());
  const mv2 = await pagina.evaluate(() => moves.find(m => m.notes === 'proteinado a prazo').id);
  await tresLugares('entrada de estoque a prazo', 'moves', mv2);
  const parcelasEstoque = await pagina.evaluate(() =>
    pendentes.filter(p => p.col === 'bovtrans' && p.obj && p.obj.lock === 'stock' && p.obj.venc).map(p => p.id));
  t.conferir('as 2 parcelas da compra a prazo estão na fila',
    parcelasEstoque.length === 2, parcelasEstoque.length + ' na fila');

  t.secao('saída de estoque (consumo no cocho)');
  await pagina.evaluate(i => { openMove(i, 'saida', null); }, it);
  await pagina.waitForTimeout(80);
  await pagina.check('input[name="m-type"][value="saida"]');
  await pagina.fill('#m-date', '2026-06-20');
  await pagina.fill('#m-qty', '15');
  await pagina.fill('#m-notes', 'consumo lote 3');
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => closeAllM());
  await tresLugares('saída de estoque', 'moves',
    await pagina.evaluate(() => moves.find(m => m.notes === 'consumo lote 3').id));

  // ---------- nota fiscal ----------
  // O anexo tem caminho próprio por ser pesado. "Caminho próprio" é onde um
  // dado se perde sem ninguém ver: sem nuvem ele PRECISA entrar na fila.
  t.secao('nota fiscal anexada');
  await pagina.evaluate(() => {
    openTrans('bov', null);
    anexosForm = [{ id: 'ax-teste', novo: true, nome: 'nf.jpg', tipo: 'image/jpeg', tamanho: 120 }];
    anexoCache.set('ax-teste', 'data:image/jpeg;base64,AAAA');
    $('t-date').value = '2026-06-11'; $('t-amount').value = '250';
    $('t-category').value = 'Frete'; $('t-notes').value = 'frete com nota';
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => closeAllM());
  const rax = await tresLugares('nota fiscal (anexo)', 'anexos', 'ax-teste');
  t.conferir('e o arquivo inteiro vai dentro da op da fila, não só o nome dele',
    rax.obj && typeof rax.obj.dados === 'string' && rax.obj.dados.indexOf('data:image') === 0,
    rax.obj ? String(rax.obj.dados).slice(0, 24) : 'sem op na fila');
  const comNota = await pagina.evaluate(() => (bovT.find(x => x.notes === 'frete com nota') || {}).id);
  const rNota = await pagina.evaluate(i => sonda('bovtrans', i), comNota);
  t.conferir('e o lançamento guarda a referência da nota',
    rNota.obj && (rNota.obj.anexos || []).some(a => a.id === 'ax-teste'),
    JSON.stringify(rNota.obj && rNota.obj.anexos));

  // ---------- ajustes da fazenda ----------
  t.secao('ajustes da fazenda');
  await pagina.evaluate(() => {
    $('set-yield').value = '54';
    $('set-yield').dispatchEvent(new Event('change'));
  });
  await pagina.waitForTimeout(120);
  t.conferir('rendimento de carcaça entra na fila da fazenda',
    await pagina.evaluate(() => naFazenda('yield')) === 54,
    String(await pagina.evaluate(() => naFazenda('yield'))));
  await pagina.evaluate(() => {
    $('cst-gmd').value = '0,9';
    $('cst-gmd').dispatchEvent(new Event('input'));
  });
  await pagina.waitForTimeout(900);   // o salvamento dos custos espera o dedo parar
  const custoFila = await pagina.evaluate(() => naFazenda('custo'));
  t.conferir('parâmetros de custo entram na fila da fazenda',
    custoFila && Math.abs(custoFila.gmd - 0.9) < 1e-9, JSON.stringify(custoFila && custoFila.gmd));
  // E um não pode apagar o outro: são pedaços do MESMO documento na fila.
  t.conferir('e guardar o custo não apagou o rendimento que esperava sinal',
    await pagina.evaluate(() => naFazenda('yield')) === 54);

  // ---------- importação de planilha ----------
  t.secao('importação de planilha');
  await pagina.evaluate(() => {
    pendingRows = [
      { ident: '3003', date: '2026-07-01', peso: 288 },
      { ident: '3004', date: '2026-07-01', peso: 301 }
    ];
    $('btn-confirm-import').click();
  });
  await pagina.waitForTimeout(300);
  const imp = await pagina.evaluate(() => ['3003', '3004'].map(id => {
    const a = animals.find(x => x.ident === id);
    return { a: a.id, w: weighings.find(w => w.animalId === a.id).id };
  }));
  for (const r of imp) {
    await tresLugares('animal importado da planilha', 'animals', r.a);
    await tresLugares('pesagem importada da planilha', 'weighings', r.w);
  }

  // ---------- exclusões ----------
  t.secao('exclusões sem sinal');
  await pagina.evaluate(i => { openWeighing(weighings.find(w => w.id === i).animalId, weighings.find(w => w.id === i)); }, w1);
  await pagina.click('#btn-delete-weighing');
  await pagina.waitForTimeout(200);
  await tresLugaresApagado('pesagem excluída', 'weighings', w1);

  const antesDoAnimal = await pagina.evaluate(i => ({
    pesagens: weighings.filter(w => w.animalId === i).map(w => w.id)
  }), brete.a);
  await pagina.evaluate(i => { openAnimal(animals.find(a => a.id === i)); }, brete.a);
  await pagina.click('#btn-delete-animal');
  await pagina.waitForTimeout(250);
  await tresLugaresApagado('animal excluído', 'animals', brete.a);
  for (const p of antesDoAnimal.pesagens) {
    await tresLugaresApagado('pesagem do animal excluído', 'weighings', p);
  }

  await pagina.evaluate(i => { openTrans('bov', bovT.find(x => x.id === i)); }, tv);
  await pagina.click('#btn-delete-transaction');
  await pagina.waitForTimeout(250);
  await tresLugaresApagado('lançamento excluído', 'bovtrans', tv);

  const antesDoItem = await pagina.evaluate(i => ({
    moves: moves.filter(m => m.itemId === i).map(m => m.id),
    // Apagar o item leva as compras dele, e com elas as parcelas a pagar. Se a
    // remoção delas não entrar na fila, a nuvem segue cobrando uma ração que
    // não existe mais no estoque — e o calendário cobra junto.
    lancs: bovT.filter(x => x.lock === 'stock').map(x => x.id)
  }), it);
  await pagina.evaluate(i => { openItem(items.find(x => x.id === i)); }, it);
  await pagina.click('#btn-delete-item');
  await pagina.waitForTimeout(250);
  await tresLugaresApagado('item de estoque excluído', 'items', it);
  for (const m of antesDoItem.moves) {
    await tresLugaresApagado('movimentação do item excluído', 'moves', m);
  }
  t.conferir('o item excluído levou as 3 compras dele no financeiro',
    antesDoItem.lancs.length === 3, antesDoItem.lancs.length + ' lançamento(s) de estoque');
  for (const l of antesDoItem.lancs) {
    await tresLugaresApagado('compra de estoque do item excluído', 'bovtrans', l);
  }

  // ---------- 2. fecha e reabre, ainda sem sinal ----------
  t.secao('fecha e reabre o aplicativo, ainda sem sinal');
  const filaAntes = await pagina.evaluate(() => pendentes.length);
  await abrir(false);
  t.conferir('a fila sobreviveu ao fechamento inteira',
    await pagina.evaluate(() => pendentes.length) === filaAntes,
    `${await pagina.evaluate(() => pendentes.length)} de ${filaAntes}`);
  let sobreviveram = 0, perdidas = [];
  for (const p of portas) {
    const r = await pagina.evaluate(([c, i, d]) => d ? sondaApagado(c, i) : sonda(c, i), [p.col, p.id, !!p.apagado]);
    bom(r) ? sobreviveram++ : perdidas.push(p.nome);
  }
  t.conferir(`todas as ${portas.length} gravações continuam lá depois de fechar o app`,
    perdidas.length === 0, perdidas.length ? 'perdeu: ' + perdidas.join(' · ') : `${sobreviveram} conferidas`);

  // ---------- 3. sinal fraco: a nuvem não responde nem recusa ----------
  // É o estado do curral com uma barra de sinal, e o mais traiçoeiro: o SDK
  // está carregado, a autenticação valendo, e o set() não resolve NEM rejeita.
  // Se a gravação só entrasse na fila pelo .catch, ela existiria apenas dentro
  // do Firestore — e, sem a persistência dele, só na memória.
  t.secao('sinal fraco: a nuvem não responde nem recusa');
  await pagina.evaluate(() => {
    const nunca = () => new Promise(() => {});
    const ref = { set: nunca, delete: nunca, onSnapshot: () => () => {} };
    ref.collection = () => ref; ref.doc = () => ref;
    db = { collection: () => ref, doc: () => ref,
      batch: () => ({ set() {}, delete() {}, commit: nunca }) };
    openWeighing(animals.find(a => a.ident === '1001').id, null);
    $('w-date').value = '2026-09-01'; $('w-weight').value = '390';
  });
  await pagina.click('#form-weighing button[type="submit"]');
  await pagina.waitForTimeout(400);
  const fraco = await pagina.evaluate(() => {
    const w = weighings.find(x => x.date === '2026-09-01');
    return sonda('weighings', w.id);
  });
  t.conferir('a pesagem do sinal fraco fica guardada e NA FILA, não só no Firestore',
    fraco.memoria && fraco.espelho && fraco.fila,
    `tela ${fraco.memoria ? 'sim' : 'NÃO'} · aparelho ${fraco.espelho ? 'sim' : 'NÃO'} · fila ${fraco.fila ? 'sim' : 'NÃO'}`);

  // ---------- 4. volta o sinal: tudo sobe ----------
  t.secao('de volta em casa, com sinal');
  const esperado = await pagina.evaluate(() => pendentes.map(p => p.col));
  await pagina.evaluate(() => localStorage.removeItem('teste-nuvem'));
  await abrir(true);
  await pagina.waitForTimeout(900);
  const subiu = await pagina.evaluate(() => JSON.parse(localStorage.getItem('teste-nuvem') || '[]'));
  t.conferir('a fila inteira subiu para a nuvem',
    subiu.length >= esperado.length, `${subiu.length} escrita(s) para ${esperado.length} pendência(s)`);
  const colecoes = [...new Set(esperado)];
  const faltou = colecoes.filter(c => !subiu.some(caminho =>
    c === '_fazenda' ? /farms\/demo$/.test(caminho) : caminho.indexOf(c) >= 0));
  t.conferir('nenhuma coleção ficou para trás',
    faltou.length === 0, faltou.length ? 'faltou: ' + faltou.join(' · ') : colecoes.join(' · '));
  t.conferir('as exclusões subiram como exclusão, não como gravação',
    subiu.some(c => c.indexOf('apagar ') === 0), subiu.filter(c => c.indexOf('apagar ') === 0).length + ' remoção(ões)');
  t.conferir('e a fila esvaziou',
    await pagina.evaluate(() => pendentes.length) === 0,
    await pagina.evaluate(() => pendentes.length) + ' restante(s)');
  t.conferir('o ponto de sincronização voltou a zero',
    await pagina.evaluate(() => $('sync-dot').dataset.n) === '0',
    await pagina.evaluate(() => $('sync-dot').dataset.n));

  // ---------- 5. a nuvem RECUSA um registro ----------
  // Um registro que a nuvem não aceita (documento grande demais, regra mudada)
  // derrubava o lote INTEIRO: um só prendia todos os outros para sempre. E,
  // pior, o aviso mandava esperar internet por algo que nunca ia acontecer.
  t.secao('a nuvem recusa um registro');
  await pagina.evaluate(() => {
    pendentes = []; guardarFila();
    const ruim = 'reprovado';
    const ref = caminho => {
      const r = {
        _caminho: caminho,
        collection: n => ref(caminho + '/' + n),
        doc: i => ref(caminho + '/' + i),
        set: async () => { if (caminho.indexOf(ruim) >= 0) throw new Error('recusado'); },
        delete: async () => {}, onSnapshot: () => () => {}
      };
      return r;
    };
    db = { collection: n => ref(n), doc: i => ref(i),
      batch: () => {
        const alvos = [];
        return { set(r) { alvos.push(r._caminho); }, delete(r) { alvos.push(r._caminho); },
          commit: async () => { if (alvos.some(c => c.indexOf(ruim) >= 0)) throw new Error('lote recusado'); } };
      } };
    pendentes = [
      { col: 'weighings', id: 'bom-1', obj: { id: 'bom-1', weight: 300 } },
      { col: 'weighings', id: 'reprovado', obj: { id: 'reprovado', weight: 301 } },
      { col: 'weighings', id: 'bom-2', obj: { id: 'bom-2', weight: 302 } }
    ];
    guardarFila();
  });
  await pagina.evaluate(() => enviarPendentes());
  await pagina.waitForTimeout(300);
  const recusa = await pagina.evaluate(() => ({
    fila: pendentes.map(p => p.id), recusados: pendentes.filter(p => p.recusado).map(p => p.id),
    ponto: $('sync-dot').title, marca: $('sync-dot').classList.contains('recusado')
  }));
  t.conferir('o registro recusado não prende os outros na fila',
    recusa.fila.length === 1 && recusa.fila[0] === 'reprovado', recusa.fila.join(' · ') || 'fila vazia');
  t.conferir('e ele fica marcado como RECUSADO, não como "esperando internet"',
    recusa.recusados.length === 1 && recusa.marca && /RECUSOU/.test(recusa.ponto), recusa.ponto);

  // ---------- 6. restaurar backup sem sinal ----------
  // A restauração é a operação mais pesada do aplicativo: apaga tudo e grava
  // tudo de novo. Sem sinal, ou ela entra inteira na fila, ou a fazenda volta
  // a existir só na tela deste celular.
  t.secao('restaurar backup sem sinal');
  await abrir(false);
  await pagina.evaluate(() => { pendentes = []; guardarFila(); });
  const backup = {
    app: 'fazendajs', v: 8, farm: 'demo',
    animals: [{ id: 'bk-a1', ident: '7001', cat: 'Boi' }, { id: 'bk-a2', ident: '7002', cat: 'Boi' }],
    weighings: [{ id: 'bk-w1', animalId: 'bk-a1', date: '2026-05-01', weight: 410, jejum: false }],
    bovT: [{ id: 'bk-t1', date: '2026-05-02', type: 'saida', amount: 777, category: 'Frete' }],
    avT: [{ id: 'bk-t2', date: '2026-05-03', type: 'entrada', amount: 8000, category: 'Pagamento Seara' }],
    gerT: [{ id: 'bk-t3', date: '2026-05-04', type: 'saida', amount: 500, category: 'Soja' }],
    items: [{ id: 'bk-i1', name: 'Sal mineral', unit: 'kg' }],
    moves: [{ id: 'bk-m1', itemId: 'bk-i1', date: '2026-05-05', type: 'entrada', qty: 500 }],
    atividades: [{ id: 'bk-at', nome: 'Milho 2026' }],
    extraT: { 'bk-at': [{ id: 'bk-t4', date: '2026-05-06', type: 'saida', amount: 1200, category: 'Semente' }] },
    anexos: [], settings: { yield: 53 }
  };
  await pagina.setInputFiles('#restore-input', {
    name: 'backup-fazendajs.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup), 'utf-8')
  });
  await pagina.waitForTimeout(700);
  const doBackup = [['animals', 'bk-a1'], ['animals', 'bk-a2'], ['weighings', 'bk-w1'],
    ['bovtrans', 'bk-t1'], ['avtrans', 'bk-t2'], ['gertrans', 'bk-t3'],
    ['items', 'bk-i1'], ['moves', 'bk-m1'], ['at_bk-at', 'bk-t4']];
  const faltandoBackup = [];
  for (const [col, id] of doBackup) {
    const r = await pagina.evaluate(([c, i]) => sonda(c, i), [col, id]);
    if (!bom(r)) faltandoBackup.push(`${col}/${id} (${rotulo(r.memoria, 'tela', 'SEM TELA')} · ${rotulo(r.espelho, 'aparelho', 'SEM APARELHO')} · ${rotulo(r.fila, 'fila', 'SEM FILA')})`);
  }
  t.conferir(`os ${doBackup.length} registros do backup entraram na tela, no aparelho e na fila`,
    faltandoBackup.length === 0, faltandoBackup.join(' | ') || 'incluindo os da atividade restaurada');
  t.conferir('e o rendimento de carcaça do backup entrou na fila da fazenda',
    await pagina.evaluate(() => naFazenda('yield')) === 53,
    String(await pagina.evaluate(() => naFazenda('yield'))));

  // ---------- 7. memória do aparelho cheia ----------
  // Fila que não é gravada não é fila. Se o aparelho não consegue guardar, o
  // dono tem de ser avisado na hora — em silêncio, ele registraria a tarde
  // inteira achando que está salvo.
  t.secao('memória do aparelho cheia');
  const antes = avisos.length;
  await pagina.evaluate(() => {
    const original = LS.s;
    LS.s = (k, v) => k === 'fjs-pendentes' ? false : original(k, v);
    filaFalhou = false;
    upsert('weighings', { id: 'sem-espaco', animalId: 'x', date: '2026-09-09', weight: 400 });
  });
  await pagina.waitForTimeout(250);
  t.conferir('o aplicativo GRITA quando não consegue guardar a fila',
    avisos.slice(antes).some(a => /mem[óo]ria cheia|não está conseguindo guardar/i.test(a)),
    avisos.slice(antes).join(' | ').slice(0, 120) || 'nenhum aviso');

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
