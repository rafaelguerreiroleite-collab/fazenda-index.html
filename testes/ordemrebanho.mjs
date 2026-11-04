// A ORDEM DA LISTA DO REBANHO, E O REGISTRO ESTRAGADO QUE CALAVA A TELA.
//
// Pedido do dono: procurar erro onde ainda não se procurou, e repassar onde já
// se procurou. As oito ordens da lista já eram varridas por uma regra
// estrutural — "nenhuma ordenação perde ou duplica animal" —, e é uma regra que
// passa mesmo quando a ordem está ao contrário. Faltava cobrar o que cada ordem
// PROMETE pelo próprio nome.
//
// Dois defeitos achados aqui, medidos no aplicativo rodando:
//
// 1. "Ordem: sem pesar há mais tempo" punha no FIM da lista quem NUNCA subiu na
//    balança. É a ordem com que se procura quem ficou no pasto, e o caso mais
//    extremo dela — o animal que ninguém nunca pesou — ficava escondido atrás
//    de todos os que já passaram pela balança ao menos uma vez. A conferência
//    da rodada de pesagem põe esse animal na frente desde que foi escrita; as
//    duas telas diziam coisas diferentes sobre o mesmo rebanho.
//    Pior: havia conferidor cobrando o comportamento errado — escrito olhando o
//    que o código fazia, em vez do que o dono precisa.
//
// 2. Um animal sem brinco derrubava o render INTEIRO. A comparação era
//    a.ident.localeCompare(b.ident), e um registro sem o campo parava a aba do
//    rebanho e a tela de "manter só quem foi pesado" — que é a que mostra quem
//    sai ANTES de apagar. Medido: "Cannot read properties of undefined
//    (reading 'localeCompare')".
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.ORDENS_QTD || 400);
const SEMENTE = Number(process.env.SEMENTE_ORDEM || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Ordem das listas e registro estragado (${QTD.toLocaleString('pt-BR')} rebanhos · semente ${SEMENTE})`);

  const ordem = async v => {
    await pagina.selectOption('#bov-sort', v);
    await pagina.waitForTimeout(50);
    return pagina.evaluate(() => [...document.querySelectorAll('#animal-list .item-title')]
      .map(e => e.textContent).join(','));
  };

  // ---------- o caso do curral ----------
  t.secao('quem nunca foi pesado é quem está sem pesar há mais tempo');
  await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: '292', cat: 'Novilha' }, { id: 'a2', ident: '300', cat: 'Novilha' },
      { id: 'a3', ident: '9', cat: 'Novilha' }, { id: 'a4', ident: '295', cat: 'Novilha' },
      { id: 'a5', ident: '301', cat: 'Novilha' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-08-13', weight: 227, jejum: false },
      { id: 'w2', animalId: 'a2', date: '2026-06-18', weight: 181, jejum: false },
      { id: 'w3', animalId: 'a3', date: '2026-08-13', weight: 350, jejum: false }];
    recomputarLivros(); tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
  });
  t.conferir('os dois que nunca foram pesados vêm na frente, em ordem de brinco',
    await ordem('data-asc') === '295,301,300,9,292', await ordem('data-asc'));
  t.conferir('e na ordem inversa eles vão para o fim',
    await ordem('data-desc') === '9,292,300,295,301', await ordem('data-desc'));
  t.conferir('sem pesagem continua no fim quando a ordem é por PESO — não ter peso não é ser leve',
    await ordem('peso-asc') === '300,292,9,295,301', await ordem('peso-asc'));
  // Com uma pesagem só, NINGUÉM tem GMD — nem os que subiram na balança. A
  // ordem então não tem o que comparar e cai no brinco, que é o certo: a lista
  // não pode inventar um ranking onde não há medida.
  t.conferir('sem ninguém com duas pesagens, a ordem por GMD cai no brinco',
    await ordem('gmd-asc') === '9,292,295,300,301', await ordem('gmd-asc'));
  await pagina.evaluate(() => {
    // agora com GMD de verdade: a1 ganha 1,00/dia e a2 ganha 0,50/dia
    weighings.push({ id: 'w4', animalId: 'a1', date: '2026-09-12', weight: 257, jejum: false });
    weighings.push({ id: 'w5', animalId: 'a2', date: '2026-09-12', weight: 224, jejum: false });
    recomputarLivros(); render();
  });
  t.conferir('com GMD de verdade, o pior vem primeiro e quem não tem GMD fica no fim',
    await ordem('gmd-asc') === '300,292,9,295,301', await ordem('gmd-asc'));
  t.conferir('e o melhor vem primeiro na ordem inversa, com os sem GMD ainda no fim',
    await ordem('gmd-desc') === '292,300,9,295,301', await ordem('gmd-desc'));

  // ---------- registro estragado não cala a tela ----------
  t.secao('um animal sem brinco não pode parar a tela');
  const estragado = await pagina.evaluate(() => {
    animals.push({ id: 'ruim', cat: 'Novilha' });              // sem o campo ident
    animals.push({ id: 'ruim2', ident: 7, cat: 'Novilha' });   // brinco que não é texto
    animals.push({ id: 'ruim3', ident: null, cat: 'Novilha' });
    const erros = [];
    const modos = ['ident-asc', 'ident-desc', 'peso-desc', 'peso-asc',
      'gmd-desc', 'gmd-asc', 'data-desc', 'data-asc'];
    const listas = {};
    for (const m of modos) {
      try {
        bovSort = m; detailAnimal = null; render();
        listas[m] = [...document.querySelectorAll('#animal-list .list-item')].map(e => e.dataset.animal);
      } catch (e) { erros.push(m + ': ' + e.message); }
    }
    // E a tela que mostra quem SAI antes de apagar: ela usa a mesma comparação.
    let erroLimpeza = '';
    let separados = null;
    try { separados = limpezaSeparar(new Set(['2026-08-13'])); }
    catch (e) { erroLimpeza = e.message; }
    try { bovSort = 'ident-asc'; render(); } catch (e) { erros.push('final: ' + e.message); }
    return { erros, listas, erroLimpeza,
      ficam: separados ? separados.ficam.length : -1,
      saem: separados ? separados.saem.length : -1,
      marcados: [...document.querySelectorAll('#animal-list .sem-identificacao')].length,
      titulos: [...document.querySelectorAll('#animal-list .item-title')].map(e => e.textContent) };
  });
  t.conferir('nenhuma das oito ordens quebra com registro estragado no meio',
    estragado.erros.length === 0, estragado.erros.join(' | '));
  t.conferir('as oito continuam mostrando o rebanho inteiro, sem perder nem duplicar',
    Object.values(estragado.listas).every(l => l.length === 8
      && new Set(l).size === 8), Object.entries(estragado.listas)
      .map(([m, l]) => m + '=' + l.length).join(' '));
  t.conferir('a tela de "manter só quem foi pesado" também aguenta',
    estragado.erroLimpeza === '' && estragado.ficam === 2 && estragado.saem === 6,
    estragado.erroLimpeza || `${estragado.ficam} ficam · ${estragado.saem} saem`);
  t.conferir('o animal sem brinco aparece escrito "sem brinco", e não em branco',
    estragado.marcados === 3 && estragado.titulos.filter(x => x === 'sem brinco').length === 3,
    estragado.titulos.join(' | '));
  t.conferir('e vai para o fim da lista nas DUAS ordens de brinco',
    estragado.listas['ident-asc'].slice(-3).every(id => id.indexOf('ruim') === 0)
    && estragado.listas['ident-desc'].slice(-3).every(id => id.indexOf('ruim') === 0),
    'asc: ' + estragado.listas['ident-asc'].join(',') + ' · desc: ' + estragado.listas['ident-desc'].join(','));

  // ---------- o estoque tem a mesma comparação, e tinha o mesmo defeito ----------
  t.secao('um item de estoque sem nome não pode parar a aba Estoque');
  const est = await pagina.evaluate(() => {
    items = [{ id: 'i1', name: 'Vermífugo', unit: 'ml' }, { id: 'i2', unit: 'kg' },
      { id: 'i3', name: 'Adubo', unit: 'kg' }, { id: 'i4', name: null, unit: 'un' }];
    moves = [];
    let erro = '';
    try { tab = 'bovinos'; seg = 'estoque'; detailItem = null; render(); } catch (e) { erro = e.message; }
    // A lista de medicamentos do manejo usa a mesma ordenação.
    let erroManejo = '';
    try { preencherMedicamentos(); } catch (e) { erroManejo = e.message; }
    return { erro, erroManejo,
      titulos: [...document.querySelectorAll('#stock-list .item-title')].map(e => e.textContent),
      marcados: [...document.querySelectorAll('#stock-list .sem-identificacao')].length };
  });
  t.conferir('a aba Estoque desenha com item sem nome no meio', est.erro === '', est.erro);
  t.conferir('a lista de medicamentos do manejo também', est.erroManejo === '', est.erroManejo);
  t.conferir('os itens com nome vêm em ordem, e os sem nome no fim',
    est.titulos.join(',') === 'Adubo,Vermífugo,sem nome,sem nome', est.titulos.join(','));
  t.conferir('e o item sem nome aparece escrito, não em branco', est.marcados === 2,
    String(est.marcados));

  // ---------- varredura: cada ordem cumpre o que o nome dela promete ----------
  // A regra estrutural que já existia — não perder nem duplicar animal — passa
  // mesmo com a ordem invertida. Estas cobram a ordem em si.
  t.secao(`cada ordem cumpre o nome dela (${QTD.toLocaleString('pt-BR')} rebanhos sorteados)`);
  const f = await pagina.evaluate(`(function (N) {
    let _s = ${SEMENTE} >>> 0;
    const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const p2 = x => String(x).padStart(2, '0');
    const falhas = {};
    const regra = (nome, ok, caso) => {
      if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
    };
    const naTela = () => [...document.querySelectorAll('#animal-list .list-item')].map(e => e.dataset.animal);
    for (let k = 0; k < N; k++) {
      animals = []; weighings = [];
      const nA = ent(2, 14);
      for (let i = 0; i < nA; i++) {
        const id = 'a' + i;
        // De propósito: brinco repetido, brinco ausente e brinco numérico
        // entram no sorteio. Ordem só vale se valer com o rebanho sujo.
        const sorte = rnd();
        const bicho = { id: id, cat: 'Novilha' };
        if (sorte < 0.08) { /* sem brinco nenhum */ }
        else if (sorte < 0.12) bicho.ident = null;
        else bicho.ident = String(ent(1, 999));
        animals.push(bicho);
        const quantas = rnd() < 0.25 ? 0 : ent(1, 3);
        for (let j = 0; j < quantas; j++) {
          weighings.push({ id: id + 'w' + j, animalId: id,
            date: '2026-' + p2(ent(1, 10)) + '-' + p2(ent(1, 28)),
            weight: ent(150, 450), jejum: false });
        }
      }
      recomputarLivros();
      const rebanho = animals.filter(noRebanho).map(a => a.id).sort().join(',');
      const ultima = {};
      const pesoFinal = {};
      animals.forEach(a => {
        const ws = weighings.filter(w => w.animalId === a.id).sort((x, y) => x.date.localeCompare(y.date));
        ultima[a.id] = ws.length ? ws[ws.length - 1].date : null;
        pesoFinal[a.id] = ws.length ? ws[ws.length - 1].weight : null;
      });
      for (const modo of ['ident-asc', 'ident-desc', 'peso-desc', 'peso-asc',
        'gmd-desc', 'gmd-asc', 'data-desc', 'data-asc']) {
        bovSort = modo; seg = 'rebanho'; tab = 'bovinos'; detailAnimal = null;
        try { render(); } catch (e) { regra('nenhuma ordem quebra o desenho da tela', false, modo + ': ' + e.message); continue; }
        const lista = naTela();
        regra('nenhuma ordem perde ou duplica animal',
          lista.slice().sort().join(',') === rebanho, modo + ': ' + lista.join(','));
        const semPesagem = lista.filter(id => ultima[id] === null);
        const comPesagem = lista.filter(id => ultima[id] !== null);
        if (modo === 'data-asc') {
          // Quem nunca foi pesado é quem está sem pesar há mais tempo: vem
          // ANTES de todo mundo que já passou pela balança.
          const primeiroComPeso = lista.findIndex(id => ultima[id] !== null);
          const ultimoSemPeso = lista.map(id => ultima[id] === null).lastIndexOf(true);
          regra('sem pesar há mais tempo: nunca pesado vem antes de todos os pesados',
            !semPesagem.length || !comPesagem.length || ultimoSemPeso < primeiroComPeso,
            lista.map(id => id + ':' + ultima[id]).join(' '));
          regra('sem pesar há mais tempo: as datas sobem do mais antigo para o mais novo',
            comPesagem.every((id, i) => i === 0 || ultima[comPesagem[i - 1]] <= ultima[id]),
            comPesagem.map(id => ultima[id]).join(' '));
        }
        if (modo === 'data-desc') {
          const primeiroSemPeso = lista.findIndex(id => ultima[id] === null);
          const ultimoComPeso = lista.map(id => ultima[id] !== null).lastIndexOf(true);
          regra('pesado mais recentemente: nunca pesado fica no fim',
            !semPesagem.length || !comPesagem.length || ultimoComPeso < primeiroSemPeso,
            lista.map(id => id + ':' + ultima[id]).join(' '));
          regra('pesado mais recentemente: as datas descem',
            comPesagem.every((id, i) => i === 0 || ultima[comPesagem[i - 1]] >= ultima[id]),
            comPesagem.map(id => ultima[id]).join(' '));
        }
        if (modo === 'peso-desc' || modo === 'peso-asc') {
          const primeiroSemPeso = lista.findIndex(id => pesoFinal[id] == null);
          const ultimoComPeso = lista.map(id => pesoFinal[id] != null).lastIndexOf(true);
          regra('por peso: quem não tem peso fica no fim das duas ordens',
            !semPesagem.length || !comPesagem.length || ultimoComPeso < primeiroSemPeso,
            modo + ': ' + lista.map(id => id + ':' + pesoFinal[id]).join(' '));
          const ok = comPesagem.every((id, i) => i === 0 || (modo === 'peso-desc'
            ? pesoFinal[comPesagem[i - 1]] >= pesoFinal[id]
            : pesoFinal[comPesagem[i - 1]] <= pesoFinal[id]));
          regra('por peso: os pesos seguem a ordem escolhida', ok,
            modo + ': ' + comPesagem.map(id => pesoFinal[id]).join(' '));
        }
        if (modo === 'gmd-desc' || modo === 'gmd-asc') {
          const gmd = {};
          lista.forEach(id => {
            const g = gmdTotal(weighings.filter(w => w.animalId === id)
              .sort((x, y) => x.date.localeCompare(y.date)));
            gmd[id] = Number.isFinite(g) ? g : null;
          });
          const comGmd = lista.filter(id => gmd[id] !== null);
          const primeiroSemGmd = lista.findIndex(id => gmd[id] === null);
          const ultimoComGmd = lista.map(id => gmd[id] !== null).lastIndexOf(true);
          regra('por GMD: quem não tem GMD fica no fim das duas ordens',
            !comGmd.length || primeiroSemGmd < 0 || ultimoComGmd < primeiroSemGmd,
            modo + ': ' + lista.map(id => id + ':' + gmd[id]).join(' '));
          const ok = comGmd.every((id, i) => i === 0 || (modo === 'gmd-desc'
            ? gmd[comGmd[i - 1]] >= gmd[id] - 1e-9 : gmd[comGmd[i - 1]] <= gmd[id] + 1e-9));
          regra('por GMD: os GMD seguem a ordem escolhida', ok,
            modo + ': ' + comGmd.map(id => gmd[id]).join(' '));
        }
        if (modo === 'ident-asc' || modo === 'ident-desc') {
          const brinco = id => { const a = animals.find(x => x.id === id);
            return a && typeof a.ident === 'string' ? a.ident : null; };
          const comBrinco = lista.filter(id => brinco(id) !== null);
          const primeiroSem = lista.findIndex(id => brinco(id) === null);
          const ultimoCom = lista.map(id => brinco(id) !== null).lastIndexOf(true);
          // Registro estragado vai para o FIM nas duas direções: ele não é o
          // primeiro brinco nem o último, é um registro para consertar.
          regra('por brinco: quem não tem brinco fica no fim das duas ordens',
            primeiroSem < 0 || !comBrinco.length || ultimoCom < primeiroSem,
            modo + ': ' + lista.map(id => id + ':' + brinco(id)).join(' '));
          const cmp = (x, y) => x.localeCompare(y, 'pt-BR', { numeric: true });
          const ok = comBrinco.every((id, i) => i === 0 || (modo === 'ident-asc'
            ? cmp(brinco(comBrinco[i - 1]), brinco(id)) <= 0
            : cmp(brinco(comBrinco[i - 1]), brinco(id)) >= 0));
          regra('por brinco: os brincos seguem a ordem escolhida, contando número como número',
            ok, modo + ': ' + comBrinco.map(brinco).join(' '));
        }
      }
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} rebanhos` : caso));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
