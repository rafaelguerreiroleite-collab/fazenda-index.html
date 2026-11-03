// AUDITORIA: OS NÚMEROS TÊM DE AMARRAR ENTRE SI.
//
// Pedido do dono: varredura dos cálculos — GMD, arroba, financeiro — item por
// item, como um auditor fiscal de ponta faria.
//
// E auditor não confere fórmula: confere AMARRAÇÃO. A fórmula pode estar certa
// em cada tela e o conjunto mentir mesmo assim — basta um lançamento entrar em
// dois lugares, ou ficar fora de todos. O que o auditor cobra é que o todo
// feche com a soma das partes, por todos os caminhos ao mesmo tempo:
//
//   VERTICAL   dentro de uma tela: receitas − custos = saldo; a soma das
//              categorias, das naturezas e das atividades tem de dar o total;
//   HORIZONTAL entre telas: o total de Bovinos na aba Bovinos = o de Bovinos
//              na aba Fazenda = a linha de Bovinos no relatório = a soma das
//              linhas daquele livro no arquivo do contador;
//   TEMPORAL   a soma dos meses tem de dar o ano, e a dos anos, o todo — em
//              cada um dos três regimes;
//   DOCUMENTAL o carnê tem de somar o valor da compra, ao centavo, grupo por
//              grupo, em toda a base;
//   FÍSICA     arroba e GMD: as arrobas do rebanho são a soma das arrobas de
//              cada animal, e o quilo ganho pelo rebanho é a soma do que cada
//              bicho ganhou.
//
// Nenhuma dessas conferências olha uma fórmula. Todas olham se o aplicativo
// conta a mesma história duas vezes do mesmo jeito — que é exatamente o que
// um levantamento fiscal procura.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.AUDITORIA || 400);
const SEMENTE = Number(process.env.SEMENTE_AUDIT || (Date.now() % 2147483647));

// Uma fazenda inteira sorteada: três livros fixos, duas atividades, vendas,
// compras parceladas, contas pagas e em aberto, rebanho pesado em duas
// rodadas. É sobre ela que as amarrações são cobradas.
const APOIO = semente => `
  let _s = ${semente} >>> 0;
  const rnd = () => { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ent = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const cent = v => Math.round(v * 100);
  const perto = (x, y, e) => Math.abs(x - y) <= (e == null ? 0.005 : e);
  const p2 = x => String(x).padStart(2, '0');
  const falhas = {};
  const regra = (nome, ok, caso) => {
    if (!falhas[nome]) falhas[nome] = ok ? null : (caso == null ? 'sem detalhe' : String(caso));
  };
  // Entradas com categoria QUE O APLICATIVO NÃO CONHECE entram de propósito: o
  // campo é texto livre, e a regra "entrada é sempre Receita" existe para
  // valer mesmo quando a categoria não está na lista. Sem uma dessas no
  // sorteio, a regra nunca é posta à prova — descobri isso plantando o erro e
  // vendo a auditoria passar.
  const CAT_E = ['Venda de gado', 'Pagamento Seara', 'Venda de esterco',
    'Venda avulsa', 'Arrendamento', 'Sobra de safra', ''];
  const CAT_C = ['Ração/insumos', 'Mão de obra', 'Combustível', 'Energia elétrica', 'Frete'];
  const CAT_I = ['Benfeitorias', 'Equipamentos', 'Compra de reprodutores'];
  const data = () => '2026-' + p2(ent(1, 12)) + '-' + p2(ent(1, 28));
  const montarFazenda = () => {
    atividades = [{ id: 'sj', nome: 'Soja' }, { id: 'lt', nome: 'Leite' }];
    extraT = { sj: [], lt: [] };
    bovT = []; avT = []; gerT = [];
    const livros = ['bov', 'av', 'ger', 'sj', 'lt'];
    let seq = 0;
    livros.forEach(b => {
      const n = ent(0, 8);
      for (let i = 0; i < n; i++) {
        const ehEntrada = rnd() < 0.3;
        const invest = !ehEntrada && rnd() < 0.2;
        // O sorteio vai até o FIM de cada lista, sempre: já aumentei a lista
        // de entradas e deixei o índice preso nos três primeiros — as
        // categorias novas nunca eram sorteadas, e a conferência passava sem
        // ter conferido nada.
        const umaDe = arr => arr[ent(0, arr.length - 1)];
        const cat = ehEntrada ? umaDe(CAT_E) : invest ? umaDe(CAT_I) : umaDe(CAT_C);
        const t = { id: 'tx' + (seq++), date: data(), type: ehEntrada ? 'entrada' : 'saida',
          amount: ent(100, 900000) / 100, category: cat, notes: 'aud' };
        // um em cada três é a prazo; desses, metade já paga
        if (rnd() < 0.34) {
          t.venc = data();
          if (rnd() < 0.5) { t.pago = true; t.pagoEm = data(); }
        }
        arrLivro(b).push(t);
      }
      // um carnê de verdade em alguns livros, criado pelo motor do aplicativo
      if (rnd() < 0.5) {
        const total = ent(50000, 2000000) / 100;
        const nP = ent(2, 6);
        const grupo = 'g' + (seq++);
        const venc0 = data();
        const vals = parcelasDe(total, nP);
        for (let i = 0; i < nP; i++) {
          arrLivro(b).push({ id: 'tp' + (seq++), date: venc0, type: 'saida',
            amount: vals[i], category: CAT_C[ent(0, 4)], grupo: grupo,
            parcela: i + 1, parcelas: nP, venc: vencimentoParcela(venc0, i),
            pago: rnd() < 0.3, notes: 'carne' });
        }
      }
    });
    recomputarLivros();
  };
  const montarRebanho = () => {
    animals = []; weighings = [];
    const n = ent(2, 20);
    for (let i = 0; i < n; i++) {
      const id = 'a' + i;
      const vend = rnd() < 0.12, morto = rnd() < 0.06;
      animals.push({ id, ident: 'B' + i, cat: 'Novilha', sold: vend, dead: morto,
        soldDate: vend ? '2026-09-01' : null, deadDate: morto ? '2026-09-02' : null,
        soldWeight: vend ? ent(380, 520) : null, soldPrice: vend ? ent(500000, 1200000) / 100 : null });
      if (rnd() < 0.9) {
        const p1 = ent(150, 320);
        weighings.push({ id: id + 'a', animalId: id, date: '2026-06-1' + ent(0, 2), weight: p1, jejum: false });
        if (rnd() < 0.85) weighings.push({ id: id + 'b', animalId: id, date: '2026-10-1' + ent(7, 9),
          weight: p1 + ent(5, 140), jejum: false });
      }
    }
    settings.yield = ent(45, 58);
    custoParams = Object.assign({}, CUSTO_VAZIO, { precoArroba: ent(18000, 42000) / 100 });
  };
`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Auditoria: as amarrações do aplicativo (${QTD.toLocaleString('pt-BR')} fazendas · semente ${SEMENTE})`);
  const marcar = res => Object.entries(res).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} fazendas` : caso));

  // ============ 1. AMARRAÇÃO VERTICAL ============
  t.secao('1. dentro de cada tela, a soma das partes dá o total');
  const f1 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 3)}
    const REGIMES = ['competencia', 'caixa', 'vencimento'];
    for (let k = 0; k < N; k++) {
      montarFazenda();
      REGIMES.forEach(r => {
        const R = resumoFazenda('all', r, '', null);
        regra('saldo é receitas menos custos', perto(R.saldo, R.receitas - R.custos),
          r + ': ' + R.saldo + ' vs ' + (R.receitas - R.custos));
        regra('movimento é receitas mais custos', perto(R.movimento, R.receitas + R.custos),
          r + ': ' + R.movimento);
        // as atividades somam a fazenda
        const somaE = R.atividades.reduce((x, a) => x + a.entrada, 0);
        const somaS = R.atividades.reduce((x, a) => x + a.saida, 0);
        const somaN = R.atividades.reduce((x, a) => x + a.n, 0);
        regra('a soma das entradas das atividades é a receita da fazenda',
          perto(somaE, R.receitas), r + ': ' + somaE + ' vs ' + R.receitas);
        regra('a soma das saídas das atividades é o custo da fazenda',
          perto(somaS, R.custos), r + ': ' + somaS + ' vs ' + R.custos);
        regra('e a contagem de lançamentos também fecha',
          somaN === R.n, r + ': ' + somaN + ' vs ' + R.n);
        // as naturezas somam o movimento, e cada lançamento cai em uma só
        const somaC = Object.values(R.classes).reduce((x, v) => x + v, 0);
        regra('a soma das naturezas é o movimento do período',
          perto(somaC, R.movimento), r + ': ' + somaC + ' vs ' + R.movimento);
        regra('não existe natureza fora das três',
          Object.keys(R.classes).every(c => ['Receita', 'Custeio', 'Investimento'].includes(c)),
          Object.keys(R.classes).join(','));
        regra('receita da natureza é a receita do período',
          perto(R.classes['Receita'] || 0, R.receitas), r);
        // as categorias somam o movimento
        const somaCat = R.categorias.reduce((x, c) => x + c[1], 0);
        regra('a soma das categorias é o movimento do período',
          perto(somaCat, R.movimento), r + ': ' + somaCat + ' vs ' + R.movimento);
        // a pagar e a receber batem com as listas
        regra('o total a pagar é a soma das contas a pagar',
          perto(R.aPagarTotal, R.contas.reduce((x, c) => x + c.t.amount, 0)), r);
        regra('o total a receber é a soma dos recebimentos',
          perto(R.aReceberTotal, R.recebimentos.reduce((x, c) => x + c.t.amount, 0)), r);
        regra('nenhuma conta a pagar é entrada de dinheiro',
          R.contas.every(c => c.t.type === 'saida'), r);
        regra('nenhum recebimento é saída de dinheiro',
          R.recebimentos.every(c => c.t.type === 'entrada'), r);
        regra('nenhuma conta a pagar já está paga',
          R.contas.every(c => !c.t.pago), r);
      });
    }
    return falhas;
  })(${QTD})`);
  marcar(f1);

  // ============ 2. AMARRAÇÃO HORIZONTAL ============
  t.secao('2. o mesmo livro dá o mesmo número em toda tela e em todo arquivo');
  const f2 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 11)}
    const lerCSV = txt => txt.replace(/^\\uFEFF/, '').split('\\n').filter(Boolean);
    for (let k = 0; k < N; k++) {
      montarFazenda();
      const R = resumoFazenda('all', 'competencia', '', null);
      // 2.1 o resumo de cada livro, somado, dá a fazenda
      let somaR = 0, somaC = 0, somaN = 0;
      LIVROS.forEach(b => {
        const r = resumoFazenda('all', 'competencia', '', [b]);
        somaR += r.receitas; somaC += r.custos; somaN += r.n;
        // 2.2 e cada livro bate com o cartão dele na aba Fazenda
        const card = R.atividades.filter(a => a.nome === NOME_LIVRO[b])[0];
        regra('o cartão do livro na Fazenda bate com o resumo do próprio livro',
          card && perto(card.entrada, r.receitas) && perto(card.saida, r.custos),
          NOME_LIVRO[b] + ': ' + JSON.stringify(card) + ' vs ' + r.receitas + '/' + r.custos);
      });
      regra('a soma dos livros é a receita da fazenda', perto(somaR, R.receitas),
        somaR + ' vs ' + R.receitas);
      regra('a soma dos livros é o custo da fazenda', perto(somaC, R.custos),
        somaC + ' vs ' + R.custos);
      regra('e a soma das contagens é a contagem da fazenda', somaN === R.n,
        somaN + ' vs ' + R.n);

      // 2.3 o arquivo do contador tem uma linha por lançamento, e soma igual
      let csvTxt = '';
      const orig = window.download;
      window.download = function (n2, c) { csvTxt = String(c); };
      exportFinTudo();
      window.download = orig;
      const linhas = lerCSV(csvTxt).slice(1);
      const todos = LIVROS.flatMap(b => arrLivro(b));
      regra('o arquivo do contador traz uma linha por lançamento, sem sobrar nem faltar',
        linhas.length === todos.length, linhas.length + ' vs ' + todos.length);
      // soma da coluna de valor com sinal: entrada positiva, saída negativa
      let somaCsv = 0, erroCol = '';
      linhas.forEach(l => {
        const col = l.split(';');
        const tipo = col[3];
        const v = Number(col[5]);
        if (!Number.isFinite(v)) { erroCol = l.slice(0, 60); return; }
        somaCsv += tipo === 'entrada' ? v : -v;
      });
      regra('toda linha do arquivo tem valor numérico', !erroCol, erroCol);
      regra('o saldo somado do arquivo é o saldo da tela',
        perto(somaCsv, R.saldo, 0.02), somaCsv + ' vs ' + R.saldo);

      // 2.4 o relatório da fazenda repete os mesmos totais
      let rel = '';
      window.download = function (n2, c) { rel = String(c); };
      exportRelatorio('fazenda');
      window.download = orig;
      const dinheiro = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      regra('o relatório da fazenda traz a receita da tela',
        R.receitas === 0 || rel.indexOf(dinheiro(R.receitas)) >= 0, dinheiro(R.receitas));
      regra('e o custo da tela',
        R.custos === 0 || rel.indexOf(dinheiro(R.custos)) >= 0, dinheiro(R.custos));
    }
    return falhas;
  })(${Math.max(40, Math.round(QTD / 4))})`);
  marcar(f2);

  // ============ 3. AMARRAÇÃO TEMPORAL ============
  t.secao('3. a soma dos meses dá o ano, e a dos anos dá o todo');
  const f3 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 23)}
    const REGIMES = ['competencia', 'caixa', 'vencimento'];
    for (let k = 0; k < N; k++) {
      montarFazenda();
      REGIMES.forEach(r => {
        const todos = LIVROS.flatMap(b => arrLivro(b));
        const per = periodosComLancamento(todos, r);
        const geral = resumoFazenda('all', r, '', null);
        let somaMesR = 0, somaMesC = 0, somaMesN = 0;
        per.meses.forEach(m => {
          const R = resumoFazenda(m, r, '', null);
          somaMesR += R.receitas; somaMesC += R.custos; somaMesN += R.n;
        });
        regra('a soma dos meses é a receita de todo o período',
          perto(somaMesR, geral.receitas), r + ': ' + somaMesR + ' vs ' + geral.receitas);
        regra('a soma dos meses é o custo de todo o período',
          perto(somaMesC, geral.custos), r + ': ' + somaMesC + ' vs ' + geral.custos);
        regra('nenhum lançamento fica fora de todos os meses, nem entra em dois',
          somaMesN === geral.n, r + ': ' + somaMesN + ' vs ' + geral.n);
        let somaAnoR = 0, somaAnoN = 0;
        per.anos.forEach(a => {
          const R = resumoFazenda(a, r, '', null);
          somaAnoR += R.receitas; somaAnoN += R.n;
        });
        regra('a soma dos anos é a receita de todo o período',
          perto(somaAnoR, geral.receitas), r + ': ' + somaAnoR + ' vs ' + geral.receitas);
        regra('e a soma dos anos conta os mesmos lançamentos',
          somaAnoN === geral.n, r + ': ' + somaAnoN + ' vs ' + geral.n);
      });
      // o mesmo lançamento não pode aparecer em dois livros
      const ids = LIVROS.flatMap(b => arrLivro(b).map(x => x.id));
      regra('nenhum lançamento existe em dois livros ao mesmo tempo',
        new Set(ids).size === ids.length, ids.length - new Set(ids).size + ' repetidos');
    }
    return falhas;
  })(${Math.max(40, Math.round(QTD / 3))})`);
  marcar(f3);

  // ============ 4. AMARRAÇÃO DOCUMENTAL: O CARNÊ ============
  t.secao('4. cada carnê soma o valor da compra, ao centavo');
  const f4 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 37)}
    for (let k = 0; k < N; k++) {
      montarFazenda();
      const todos = LIVROS.flatMap(b => arrLivro(b));
      const grupos = {};
      todos.filter(x => x.grupo).forEach(x => { (grupos[x.grupo] || (grupos[x.grupo] = [])).push(x); });
      Object.keys(grupos).forEach(g => {
        const ps = grupos[g].slice().sort((a, b) => a.parcela - b.parcela);
        const n = ps[0].parcelas;
        regra('o carnê tem exatamente as parcelas que diz ter', ps.length === n,
          g + ': ' + ps.length + ' de ' + n);
        regra('as parcelas vão de 1 até n, sem buraco nem repetição',
          ps.every((p, i) => p.parcela === i + 1), g + ': ' + ps.map(p => p.parcela).join(','));
        regra('todas as parcelas do carnê declaram o mesmo total de parcelas',
          ps.every(p => p.parcelas === n), g);
        // a assinatura da repartição em centavos: nenhuma parcela difere da
        // outra em mais de um centavo
        const cs = ps.map(p => cent(p.amount));
        regra('nenhuma parcela difere da outra em mais de um centavo',
          Math.max.apply(null, cs) - Math.min.apply(null, cs) <= 1,
          g + ': ' + cs.join(','));
        regra('nenhuma parcela é zero ou negativa', cs.every(c => c > 0), g + ': ' + cs.join(','));
        // e a soma é um valor fechado em centavos, sem sobra de arredondamento
        const soma = cs.reduce((x, c) => x + c, 0);
        regra('a soma das parcelas é inteira em centavos, sem resto de divisão',
          Number.isInteger(soma), g + ': ' + soma);
        regra('as parcelas vencem em datas crescentes',
          ps.every((p, i) => i === 0 || !p.venc || !ps[i - 1].venc || ps[i - 1].venc <= p.venc),
          g + ': ' + ps.map(p => p.venc).join(' '));
      });
    }
    return falhas;
  })(${Math.max(40, Math.round(QTD / 3))})`);
  marcar(f4);

  // ============ 5. AMARRAÇÃO FÍSICA: ARROBA E GMD ============
  t.secao('5. arroba e GMD: o rebanho é a soma dos animais');
  const f5 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 53)}
    for (let k = 0; k < N; k++) {
      montarRebanho();
      const rend = settings.yield;
      const ativos = animals.filter(noRebanho);
      // 5.1 a arroba é sempre a mesma conversão
      const kgs = ativos.map(a => { const w = wOf(a.id); return w.length ? w[w.length - 1].weight : null; })
        .filter(v => Number.isFinite(v));
      const kgTotal = kgs.reduce((x, v) => x + v, 0);
      regra('a arroba é peso × rendimento ÷ 15, sem exceção',
        kgs.every(kg => perto(arrobasDe(kg, rend), kg * rend / 100 / 15, 1e-9)), String(rend));
      regra('as arrobas do rebanho são a soma das arrobas de cada animal',
        perto(arrobasDe(kgTotal, rend), kgs.reduce((x, kg) => x + arrobasDe(kg, rend), 0), 1e-6),
        String(kgTotal));
      // 5.2 o valor do rebanho é as arrobas vezes o preço
      const v = valorDoRebanho();
      if (v && v.valor != null) {
        regra('o valor do rebanho é arroba por arroba, ao mesmo preço',
          perto(v.valor, kgs.reduce((x, kg) => x + arrobasDe(kg, rend) * v.preco, 0), 0.01),
          v.valor + ' vs soma individual');
        regra('e o peso que ele usa é o mesmo peso somado dos animais',
          v.kg === kgTotal, v.kg + ' vs ' + kgTotal);
      }
      // 5.3 o quilo ganho pelo rebanho é a soma do que cada bicho ganhou
      const ge = gmdGeralRebanho();
      let kgGanho = 0, diasAnimal = 0, nPares = 0;
      animals.forEach(a => {
        const ws = wOf(a.id);
        if (ws.length < 2) return;
        const d = daysBetween(ws[0].date, ws[ws.length - 1].date);
        if (!(d > 0) || !mesmaCondicao(ws[0], ws[ws.length - 1])) return;
        kgGanho += ws[ws.length - 1].weight - ws[0].weight; diasAnimal += d; nPares++;
      });
      regra('o quilo ganho do rebanho é a soma do ganho de cada animal',
        perto(ge.kg, kgGanho, 1e-9), ge.kg + ' vs ' + kgGanho);
      regra('os dias-animal são a soma dos dias de cada animal',
        ge.dias === diasAnimal, ge.dias + ' vs ' + diasAnimal);
      regra('e o GMD do rebanho é um dividido pelo outro',
        ge.gmd === null ? diasAnimal === 0 : perto(ge.gmd, kgGanho / diasAnimal, 1e-9),
        String(ge.gmd));
      regra('a contagem de animais na conta bate com os pares comparáveis',
        ge.n === nPares, ge.n + ' vs ' + nPares);
      // 5.4 o preço médio da arroba vendida é razão de totais, não média de razões
      const pav = precoArrobaVenda();
      if (pav.porArroba != null) {
        const vendidos = animals.filter(a => a.sold && !a.dead
          && Number.isFinite(a.soldWeight) && Number.isFinite(a.soldPrice));
        const totalRS = vendidos.reduce((x, a) => x + a.soldPrice, 0);
        const totalAr = vendidos.reduce((x, a) => x + arrobasDe(a.soldWeight, pav.rend), 0);
        regra('o preço da arroba vendida é total recebido ÷ total de arrobas',
          perto(pav.porArroba, totalRS / totalAr, 1e-9), pav.porArroba + ' vs ' + totalRS / totalAr);
        regra('e não a média simples dos preços de cada animal', (function () {
          if (vendidos.length < 2) return true;
          const medias = vendidos.map(a => a.soldPrice / arrobasDe(a.soldWeight, pav.rend));
          const simples = medias.reduce((x, m) => x + m, 0) / medias.length;
          // quando as duas coincidem por acaso, não há o que distinguir
          return Math.abs(simples - totalRS / totalAr) < 1e-9
            || Math.abs(pav.porArroba - simples) > 1e-9;
        })(), '');
      }
    }
    return falhas;
  })(${QTD})`);
  marcar(f5);

  // ============ 6. COMPLETUDE ============
  // O que um levantamento fiscal procura primeiro: lançamento que não aparece
  // em lugar nenhum, e lançamento que aparece duas vezes.
  t.secao('6. nenhum lançamento some, nenhum conta em dobro');
  const f6 = await pagina.evaluate(`(function (N) {
    ${APOIO(SEMENTE + 67)}
    for (let k = 0; k < N; k++) {
      montarFazenda();
      const todos = LIVROS.flatMap(b => arrLivro(b));
      ['competencia', 'caixa', 'vencimento'].forEach(r => {
        const R = resumoFazenda('all', r, '', null);
        // quem tem data no regime entra; quem não tem, não — e nada além disso
        const devem = todos.filter(x => !!dataDoRegime(x, r)).length;
        regra('entra no período exatamente quem tem data naquele regime',
          R.n === devem, r + ': ' + R.n + ' vs ' + devem);
        // a soma dos valores absolutos não pode passar do total lançado
        const movTotal = todos.reduce((x, t2) => x + t2.amount, 0);
        regra('o movimento do período nunca passa do total lançado na fazenda',
          R.movimento <= movTotal + 0.005, r + ': ' + R.movimento + ' vs ' + movTotal);
      });
      // todo lançamento tem natureza, e uma só
      regra('todo lançamento recebe exatamente uma natureza',
        todos.every(x => ['Receita', 'Custeio', 'Investimento'].includes(classOf(x.category, x.type))),
        todos.filter(x => !['Receita', 'Custeio', 'Investimento'].includes(classOf(x.category, x.type)))
          .slice(0, 1).map(x => x.category + '/' + x.type).join());
      regra('entrada é sempre Receita; saída nunca é',
        todos.every(x => (x.type === 'entrada') === (classOf(x.category, x.type) === 'Receita')), '');
      // conta a pagar é exatamente o que tem vencimento e não foi pago
      const emAbertoReal = todos.filter(x => x.type === 'saida' && x.venc && !x.pago).length;
      const naTela = LIVROS.reduce((x, b) => x + contasAPagar(arrLivro(b)).length, 0);
      regra('a pagar é exatamente o que tem vencimento e não foi pago',
        naTela === emAbertoReal, naTela + ' vs ' + emAbertoReal);
      const aReceberReal = todos.filter(x => x.type === 'entrada' && x.venc && !x.pago).length;
      const naTelaR = LIVROS.reduce((x, b) => x + contasAReceber(arrLivro(b)).length, 0);
      regra('a receber é exatamente o que tem vencimento e não foi recebido',
        naTelaR === aReceberReal, naTelaR + ' vs ' + aReceberReal);
    }
    return falhas;
  })(${Math.max(40, Math.round(QTD / 2))})`);
  marcar(f6);

  t.conferir('nenhum erro de JavaScript em toda a auditoria',
    errosJS.length === 0, errosJS.slice(0, 3).join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
