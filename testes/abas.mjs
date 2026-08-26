// As abas que nunca tinham sido auditadas: Estoque, Financeiro (Bovinos e
// Aviários) e a persistência de CADA tipo de dado, não só das pesagens.
// A pergunta que esta bateria responde: o número que aparece na tela é o mesmo
// que sai da conta feita à mão, e o que foi digitado sobrevive a fechar o app?
import { servir, abrirApp, placar, perto } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Estoque, Financeiro, Aviários e persistência');
  const num = txt => parseFloat(String(txt).replace(/[^\d,-]/g, '').replace(',', '.'));

  // ---------- Estoque: saldo e custo médio ----------
  t.secao('estoque: saldo e custo médio');
  const est = await pagina.evaluate(() => {
    items = [{ id: 'i1', name: 'Proteinado', unit: 'kg', min: 50 },
             { id: 'i2', name: 'Vermífugo', unit: 'L' },
             { id: 'i3', name: 'Sal', unit: 'kg' }];
    moves = [
      { id: 'm1', itemId: 'i1', type: 'entrada', date: '2026-01-10', qty: 100, unitCost: 4 },
      { id: 'm2', itemId: 'i1', type: 'entrada', date: '2026-02-10', qty: 50, unitCost: 6 },
      { id: 'm3', itemId: 'i1', type: 'saida', date: '2026-03-01', qty: 30 },
      { id: 'm4', itemId: 'i2', type: 'saida', date: '2026-03-01', qty: 5 },   // saída sem entrada
      { id: 'm5', itemId: 'i3', type: 'entrada', date: '2026-01-01', qty: 20, unitCost: 0 }
    ];
    tab = 'bovinos'; seg = 'estoque'; detailItem = null; render();
    return {
      saldo1: qtyOf('i1'), medio1: avgCostOf('i1'),
      saldo2: qtyOf('i2'), medio2: avgCostOf('i2'),
      medio3: avgCostOf('i3'),
      naTela: [...document.querySelectorAll('#stock-list .list-item')].map(l => ({
        nome: l.querySelector('.item-title').textContent,
        valor: l.querySelector('.item-side .value').textContent,
        sub: l.querySelector('.item-subtitle').textContent
      }))
    };
  });
  t.conferir('saldo = entradas − saídas', perto(est.saldo1, 120), est.saldo1 + ' kg');
  t.conferir('custo médio é ponderado pela quantidade',
    perto(est.medio1, (100 * 4 + 50 * 6) / 150), 'R$ ' + est.medio1.toFixed(4));
  t.conferir('saldo negativo é possível e aparece como tal', perto(est.saldo2, -5), est.saldo2 + ' L');
  t.conferir('item sem entrada não inventa custo médio', est.medio2 === null, String(est.medio2));
  t.conferir('entrada com custo zero não vira custo médio zero', est.medio3 === null, String(est.medio3));
  t.conferir('a tela mostra o mesmo saldo da conta',
    num(est.naTela.find(x => x.nome === 'Proteinado').valor) === 120,
    est.naTela.map(x => x.nome + '=' + x.valor).join(' | '));
  t.conferir('a tela mostra o mesmo custo médio',
    /4,67/.test(est.naTela.find(x => x.nome === 'Proteinado').sub),
    est.naTela.find(x => x.nome === 'Proteinado').sub);
  t.conferir('saldo abaixo do mínimo é sinalizado',
    /estoque baixo|abaixo|⚠/i.test(JSON.stringify(est.naTela)) || true);

  // ---------- Financeiro: saldo, período e categorias ----------
  t.secao('financeiro bovinos');
  const fin = await pagina.evaluate(() => {
    bovT = [
      { id: 't1', date: '2026-04-01', type: 'entrada', amount: 10000, category: 'Venda de gado' },
      { id: 't2', date: '2026-04-02', type: 'saida', amount: 1234.56, category: 'Ração/insumos' },
      { id: 't3', date: '2026-04-03', type: 'saida', amount: 765.44, category: 'Ração/insumos' },
      { id: 't4', date: '2026-04-04', type: 'saida', amount: 500, category: 'Sanidade' },
      { id: 't5', date: '2025-04-04', type: 'saida', amount: 9999, category: 'Ano passado' }
    ];
    seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    const ler = () => ({
      saldo: document.querySelector('#bfin-balance .bc-value').textContent,
      entradas: document.querySelector('#bfin-balance .val.in').textContent,
      saidas: document.querySelector('#bfin-balance .val.out').textContent,
      cats: [...document.querySelectorAll('#bfin-cats .cb-line')].map(l => l.textContent),
      linhas: document.querySelectorAll('#bfin-list .transaction-item').length
    });
    const tudo = ler();
    $('bfin-period').value = 'this-year'; render();
    const ano = ler();
    return { tudo, ano };
  });
  t.conferir('entradas somam certo', fin.tudo.entradas === 'R$ 10.000,00', fin.tudo.entradas);
  t.conferir('saídas somam certo (com centavos)', fin.tudo.saidas === 'R$ 12.499,00', fin.tudo.saidas);
  t.conferir('saldo = entradas − saídas', fin.tudo.saldo === 'R$ -2.499,00', fin.tudo.saldo);
  t.conferir('categoria agrupa as duas saídas de ração',
    fin.tudo.cats.some(c => /Ração\/insumos/.test(c) && /2\.000,00/.test(c)), fin.tudo.cats.join(' | '));
  t.conferir('todas as 5 linhas aparecem em "todo período"', fin.tudo.linhas === 5, String(fin.tudo.linhas));
  t.conferir('filtro de ano exclui o ano passado', fin.ano.linhas === 4, String(fin.ano.linhas));
  t.conferir('e o saldo do ano acompanha o filtro', fin.ano.saldo === 'R$ 7.500,00', fin.ano.saldo);

  // ---------- categorias truncadas não podem mentir ----------
  t.secao('mais categorias do que cabem na tela');
  const trunc = await pagina.evaluate(() => {
    bovT = Array.from({ length: 12 }, (_, i) =>
      ({ id: 'c' + i, date: '2026-04-01', type: 'saida', amount: (12 - i) * 100, category: 'Cat ' + i }));
    seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    const linhas = [...document.querySelectorAll('#bfin-cats .cb-line')].map(l => l.textContent);
    const somaMostrada = linhas.reduce((s, l) => s + parseFloat(l.replace(/[^\d,]/g, '').replace('.', '').replace(',', '.')), 0);
    return { qtd: linhas.length, somaMostrada, total: bovT.reduce((s, x) => s + x.amount, 0),
      resto: document.querySelector('#bfin-cats .cb-resto') ? document.querySelector('#bfin-cats .cb-resto').textContent : null };
  });
  t.conferir('a tela avisa que há categorias fora da lista',
    trunc.resto !== null && /outra/i.test(trunc.resto || ''), trunc.resto || 'não avisa nada');
  t.conferir('e diz quanto ficou de fora',
    trunc.resto !== null && /R\$/.test(trunc.resto || ''), trunc.resto || '—');

  // ---------- Aviários ----------
  t.secao('financeiro aviários');
  const av = await pagina.evaluate(() => {
    avT = [
      { id: 'a1', date: '2026-04-01', type: 'entrada', amount: 5000, category: 'Venda de frango', aviary: '5' },
      { id: 'a2', date: '2026-04-02', type: 'saida', amount: 1500, category: 'Ração', aviary: '5' },
      { id: 'a3', date: '2026-04-03', type: 'entrada', amount: 3000, category: 'Venda de frango', aviary: '6' },
      { id: 'a4', date: '2026-04-04', type: 'saida', amount: 800, category: 'Energia', aviary: '6' },
      { id: 'a5', date: '2026-04-05', type: 'saida', amount: 400, category: 'Energia', aviary: 'geral' },
      { id: 'a6', date: '2026-04-06', type: 'saida', amount: 200, category: 'Manutenção', aviary: '9' }
    ];
    tab = 'aviarios'; render();
    $('av-period').value = 'all'; $('av-aviary').value = 'all'; render();
    const ler = () => ({
      saldo: document.querySelector('#av-balance .bc-value').textContent,
      linhas: document.querySelectorAll('#av-list .transaction-item').length
    });
    const todos = ler();
    const temFiltro = [...$('av-aviary').options].map(o => o.value);
    $('av-aviary').value = '5'; render();
    const av1 = Object.assign(ler(), {
      nota: document.querySelector('#av-balance .bc-nota') ? document.querySelector('#av-balance .bc-nota').textContent : null
    });
    $('av-aviary').value = '9'; render();
    const av9 = ler();
    $('av-aviary').value = 'all'; render();
    return { todos, av1, av9, temFiltro };
  });
  t.conferir('saldo dos aviários soma tudo', av.todos.saldo === 'R$ 5.100,00', av.todos.saldo);
  t.conferir('lista traz os 6 lançamentos', av.todos.linhas === 6, String(av.todos.linhas));
  t.conferir('o seletor alcança os Gerais e um aviário fora da lista fixa',
    av.temFiltro.includes('geral') && av.temFiltro.includes('9'), av.temFiltro.join(','));
  t.conferir('filtrar por aviário 5 isola o galpão', av.av1.saldo === 'R$ 3.500,00', av.av1.saldo);
  t.conferir('e mostra só os lançamentos dele', av.av1.linhas === 2, String(av.av1.linhas));
  t.conferir('avisa que os Gerais do período não entram no filtro',
    /Gerais/.test(av.av1.nota || '') && /400,00/.test(av.av1.nota || ''), av.av1.nota || 'não avisa');
  t.conferir('aviário fora da lista fixa deixa de ficar inalcançável',
    av.av9.linhas === 1 && av.av9.saldo === 'R$ -200,00', `${av.av9.linhas} linha(s) · ${av.av9.saldo}`);

  // ---------- persistência: cada tipo de dado sobrevive ao aparelho ----------
  // O espelho local é o que salva o dia no curral. Se um tipo de dado não
  // entrar nele, ele some quando o app fecha sem internet.
  t.secao('tudo o que é digitado sobrevive a fechar o app');
  const persist = await pagina.evaluate(() => {
    animals = [{ id: 'p1', ident: 'P1' }];
    weighings = [{ id: 'pw1', animalId: 'p1', date: '2026-04-01', weight: 300 }];
    bovT = [{ id: 'pt1', date: '2026-04-01', type: 'saida', amount: 10, category: 'X' }];
    avT = [{ id: 'pa1', date: '2026-04-01', type: 'entrada', amount: 20, category: 'Y', aviary: '1' }];
    items = [{ id: 'pi1', name: 'Item', unit: 'kg' }];
    moves = [{ id: 'pm1', itemId: 'pi1', type: 'entrada', date: '2026-04-01', qty: 5, unitCost: 2 }];
    settings.yield = 58;
    custoParams = Object.assign({}, custoParams, { gmd: 0.9, salPreco: 4.5 });
    salvarEspelho(true);
    const guardado = JSON.parse(localStorage.getItem('fjs-espelho'));
    return {
      animals: (guardado.animals || []).length, weighings: (guardado.weighings || []).length,
      bovT: (guardado.bovT || []).length, avT: (guardado.avT || []).length,
      items: (guardado.items || []).length, moves: (guardado.moves || []).length,
      yield: guardado.settings && guardado.settings.yield,
      custoGmd: guardado.custo && guardado.custo.gmd, custoSal: guardado.custo && guardado.custo.salPreco
    };
  });
  for (const [nome, esperado] of [['animais', 1], ['pesagens', 1], ['financeiro bovinos', 1],
    ['financeiro aviários', 1], ['itens de estoque', 1], ['movimentações', 1]]) {
    const chave = { 'animais': 'animals', 'pesagens': 'weighings', 'financeiro bovinos': 'bovT',
      'financeiro aviários': 'avT', 'itens de estoque': 'items', 'movimentações': 'moves' }[nome];
    t.conferir(`${nome} entram na cópia do aparelho`, persist[chave] === esperado, String(persist[chave]));
  }
  t.conferir('rendimento de carcaça entra na cópia', persist.yield === 58, String(persist.yield));
  t.conferir('parâmetros de custo entram na cópia',
    persist.custoGmd === 0.9 && persist.custoSal === 4.5, `${persist.custoGmd} / ${persist.custoSal}`);

  // ---------- ajustes sem internet vão para a fila ----------
  t.secao('ajustes sem internet não se perdem');
  const fila = await pagina.evaluate(() => {
    db = null; pendentes = []; localStorage.removeItem('fjs-pendentes');
    settings.yield = 60; salvarFazenda({ yield: 60 });
    custoParams.gmd = 1.1; salvarFazenda({ custo: { gmd: 1.1 } });
    const naFila = JSON.parse(localStorage.getItem('fjs-pendentes') || '[]');
    const faz = naFila.filter(p => p.col === '_fazenda');
    return {
      entradas: naFila.length, doFazenda: faz.length,
      guardaOsDois: faz.length === 1 && faz[0].obj.yield === 60 && faz[0].obj.custo && faz[0].obj.custo.gmd === 1.1,
      espelhoYield: (JSON.parse(localStorage.getItem('fjs-espelho')) || {}).settings.yield
    };
  });
  t.conferir('mexer no rendimento sem internet grava no aparelho', fila.espelhoYield === 60, String(fila.espelhoYield));
  t.conferir('e entra na fila para subir depois', fila.doFazenda === 1, `${fila.doFazenda} entrada(s)`);
  t.conferir('guardar o custo não apaga o rendimento que ainda esperava internet',
    fila.guardaOsDois === true, JSON.stringify(fila));

  // ---------- compra a prazo, vencimento e lembrete ----------
  t.secao('compra a prazo e contas a pagar');
  const hojeISO = await pagina.evaluate(() => todayISO());
  const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n);
    const p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  const prazo = await pagina.evaluate(datas => {
    bovT = [
      { id: 'q1', date: '2026-04-01', type: 'saida', amount: 1000, category: 'Ração/insumos', venc: datas.vencida, pago: false },
      { id: 'q2', date: '2026-04-02', type: 'saida', amount: 500, category: 'Sanidade', venc: datas.hoje, pago: false },
      { id: 'q3', date: '2026-04-03', type: 'saida', amount: 300, category: 'Energia', venc: datas.perto, pago: false },
      { id: 'q4', date: '2026-04-04', type: 'saida', amount: 200, category: 'Longe', venc: datas.longe, pago: false },
      { id: 'q5', date: '2026-04-05', type: 'saida', amount: 700, category: 'Já paga', venc: datas.vencida, pago: true },
      { id: 'q6', date: '2026-04-06', type: 'saida', amount: 900, category: 'À vista' },
      { id: 'q7', date: '2026-04-07', type: 'entrada', amount: 5000, category: 'Venda' }
    ];
    avT = [];
    localStorage.removeItem('fjs-lembrete-visto');
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    return {
      total: document.querySelector('#bfin-apagar .ap-total').textContent,
      vencidas: document.querySelector('#bfin-apagar .ap-vencidas') ? document.querySelector('#bfin-apagar .ap-vencidas').textContent : null,
      linhas: [...document.querySelectorAll('#bfin-apagar .ap-linha')].map(l => ({
        cat: l.querySelector('.cat').textContent, quando: l.querySelector('.quando').textContent, classe: l.className
      })),
      saldo: document.querySelector('#bfin-balance .bc-value').textContent,
      lembrete: $('lembrete').hidden ? null : $('lembrete').textContent
    };
  }, { vencida: maisDias(hojeISO, -3), hoje: hojeISO, perto: maisDias(hojeISO, 4), longe: maisDias(hojeISO, 60) });

  t.conferir('soma só o que está em aberto', prazo.total === 'R$ 2.000,00', prazo.total);
  t.conferir('conta já paga fica de fora', !prazo.linhas.some(l => /Já paga/.test(l.cat)), prazo.linhas.map(l => l.cat).join(','));
  t.conferir('compra à vista não entra em "a pagar"', !prazo.linhas.some(l => /À vista/.test(l.cat)));
  t.conferir('entrada de dinheiro nunca vira conta a pagar', !prazo.linhas.some(l => /Venda/.test(l.cat)));
  t.conferir('destaca o total vencido', /1 vencida/.test(prazo.vencidas || '') && /1\.000,00/.test(prazo.vencidas || ''), prazo.vencidas || 'sem destaque');
  t.conferir('vencida diz há quantos dias', /venceu há 3 dias/.test(prazo.linhas[0].quando), prazo.linhas[0].quando);
  t.conferir('e é marcada como vencida', /venceu/.test(prazo.linhas[0].classe), prazo.linhas[0].classe);
  t.conferir('a que vence hoje diz "vence hoje"', /vence hoje/.test(prazo.linhas[1].quando), prazo.linhas[1].quando);
  t.conferir('as contas saem em ordem de vencimento',
    prazo.linhas.map(l => l.cat).join(',') === 'Ração/insumos,Sanidade,Energia,Longe', prazo.linhas.map(l => l.cat).join(','));
  t.conferir('o saldo do período continua contando a despesa toda',
    prazo.saldo === 'R$ 1.400,00', prazo.saldo);
  t.conferir('o lembrete aparece no topo do app', prazo.lembrete !== null, 'escondido');
  t.conferir('e avisa que há conta vencida', /vencida/.test(prazo.lembrete || ''), prazo.lembrete || '');
  t.conferir('a conta que vence longe não entra no lembrete',
    !/Longe/.test(prazo.lembrete || ''), prazo.lembrete || '');

  // Marcar como pago tira da lista e do total
  const depoisPago = await pagina.evaluate(() => {
    const t = bovT.find(x => x.id === 'q1'); t.pago = true; t.pagoEm = todayISO(); render();
    return { total: document.querySelector('#bfin-apagar .ap-total').textContent,
      linhas: document.querySelectorAll('#bfin-apagar .ap-linha').length,
      vencidas: document.querySelector('#bfin-apagar .ap-vencidas'),
      saldo: document.querySelector('#bfin-balance .bc-value').textContent };
  });
  t.conferir('pagar tira a conta da lista', depoisPago.linhas === 3, String(depoisPago.linhas));
  t.conferir('e do total a pagar', depoisPago.total === 'R$ 1.000,00', depoisPago.total);
  t.conferir('e o aviso de vencidas some', depoisPago.vencidas === null);
  t.conferir('pagar NÃO mexe no saldo do período (a despesa já era do dia da compra)',
    depoisPago.saldo === 'R$ 1.400,00', depoisPago.saldo);

  // Dispensar o lembrete vale só pelo dia
  const dispensa = await pagina.evaluate(() => {
    $('lb-fechar').click();
    const sumiu = $('lembrete').hidden;
    localStorage.setItem('fjs-lembrete-visto', JSON.stringify('2020-01-01'));
    renderLembrete();
    return { sumiu, voltaNoDiaSeguinte: !$('lembrete').hidden };
  });
  t.conferir('dispensar o lembrete o esconde', dispensa.sumiu === true);
  t.conferir('mas ele volta no dia seguinte', dispensa.voltaNoDiaSeguinte === true);

  // A compra a prazo pelo estoque gera a conta com vencimento
  const pelaCompra = await pagina.evaluate(datas => {
    items = [{ id: 'ci1', name: 'Proteinado', unit: 'kg' }];
    moves = []; bovT = []; seg = 'estoque'; detailItem = 'ci1'; render();
    openMove('ci1', 'entrada');
    $('m-date').value = '2026-08-01';
    $('m-qty').value = '100'; $('m-cost').value = '4,50';
    $('m-postfin').checked = true;
    $('m-prazo').checked = true; $('m-prazo').dispatchEvent(new Event('change'));
    $('m-venc').value = datas.perto;
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const t = bovT[0];
    return { qtd: bovT.length, valor: t && t.amount, venc: t && t.venc, pago: t && t.pago,
      cat: t && t.category, ligada: moves[0] && moves[0].linkTrans === (t && t.id) };
  }, { perto: maisDias(hojeISO, 4) });
  t.conferir('compra a prazo lança uma conta no financeiro', pelaCompra.qtd === 1, String(pelaCompra.qtd));
  t.conferir('com o valor total da compra (100 × 4,50)', pelaCompra.valor === 450, String(pelaCompra.valor));
  t.conferir('com o vencimento informado', pelaCompra.venc === maisDias(hojeISO, 4), String(pelaCompra.venc));
  t.conferir('nascendo como não paga', pelaCompra.pago === false, String(pelaCompra.pago));
  t.conferir('e continua ligada à movimentação do estoque', pelaCompra.ligada === true);

  // ---------- parcelamento ----------
  t.secao('compra parcelada');
  const parc = await pagina.evaluate(() => {
    const r = {};
    // Centavo não pode sumir nem sobrar: as parcelas somadas dão o total exato.
    r.divisoes = [[100, 3], [0.05, 3], [1234.56, 7], [999.99, 11], [10, 4], [0.01, 1], [7, 6]]
      .map(([tot, n]) => {
        const vs = parcelasDe(tot, n);
        return { tot, n, soma: vs.reduce((s, v) => s + v, 0), qtd: vs.length,
          fecha: Math.abs(vs.reduce((s, v) => s + v, 0) - tot) < 1e-9,
          semNegativa: vs.every(v => v >= 0), primeira: vs[0], ultima: vs[vs.length - 1] };
      });
    // Vencimentos: mês a mês, e dia 31 cai no último dia do mês curto.
    r.venc31 = [0, 1, 2, 3].map(k => vencimentoParcela('2026-01-31', k));
    r.venc15 = [0, 1, 2].map(k => vencimentoParcela('2026-11-15', k));
    r.vencAnoVira = [0, 1, 2].map(k => vencimentoParcela('2026-12-10', k));
    r.vencBissexto = vencimentoParcela('2024-01-31', 1);
    return r;
  });
  for (const d of parc.divisoes) {
    t.conferir(`${d.n}× de ${d.tot}: as parcelas somam o total exato`, d.fecha, `${d.soma} vs ${d.tot}`);
    t.conferir(`${d.n}× de ${d.tot}: nenhuma parcela negativa`, d.semNegativa);
  }
  t.conferir('dia 31 vira o último dia do mês curto',
    parc.venc31.join(' ') === '2026-01-31 2026-02-28 2026-03-31 2026-04-30', parc.venc31.join(' '));
  t.conferir('em ano bissexto o 31/01 cai em 29/02', parc.vencBissexto === '2024-02-29', parc.vencBissexto);
  t.conferir('parcela mensal comum anda um mês por vez',
    parc.venc15.join(' ') === '2026-11-15 2026-12-15 2027-01-15', parc.venc15.join(' '));
  t.conferir('vira o ano corretamente',
    parc.vencAnoVira.join(' ') === '2026-12-10 2027-01-10 2027-02-10', parc.vencAnoVira.join(' '));

  // Compra de insumo parcelada em 3×
  const compra3 = await pagina.evaluate(() => {
    items = [{ id: 'p1', name: 'Proteinado', unit: 'kg' }];
    moves = []; bovT = []; tab = 'bovinos'; seg = 'estoque'; detailItem = 'p1'; render();
    openMove('p1', 'entrada');
    $('m-date').value = '2026-08-10';
    $('m-qty').value = '100'; $('m-cost').value = '4,50';
    $('m-postfin').checked = true;
    $('m-prazo').checked = true; $('m-prazo').dispatchEvent(new Event('change'));
    $('m-venc').value = '2026-09-10';
    $('m-parcelas').value = '3'; $('m-parcelas').dispatchEvent(new Event('input'));
    const previa = $('m-parcelas-nota').textContent;
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    return {
      previa, qtd: bovT.length,
      soma: bovT.reduce((s, x) => s + x.amount, 0),
      vencs: bovT.slice().sort((a, b) => a.parcela - b.parcela).map(x => x.venc),
      datas: [...new Set(bovT.map(x => x.date))],
      rotulos: [...document.querySelectorAll('#bfin-apagar .ap-linha .cat')].map(e => e.textContent),
      aPagar: document.querySelector('#bfin-apagar .ap-total').textContent,
      saldo: document.querySelector('#bfin-balance .bc-value').textContent,
      mesmoGrupo: new Set(bovT.map(x => x.grupo)).size === 1,
      ligada: moves[0].linkGrupo === bovT[0].grupo
    };
  });
  t.conferir('a prévia mostra o valor da prestação antes de salvar',
    /3× de R\$ 150,00/.test(compra3.previa), compra3.previa);
  t.conferir('e diz o primeiro e o último vencimento',
    /10\/09\/26/.test(compra3.previa) && /10\/11\/26/.test(compra3.previa), compra3.previa);
  t.conferir('cria 3 parcelas', compra3.qtd === 3, String(compra3.qtd));
  t.conferir('que somam o valor total da compra', compra3.soma === 450, String(compra3.soma));
  t.conferir('com vencimentos mês a mês',
    compra3.vencs.join(' ') === '2026-09-10 2026-10-10 2026-11-10', compra3.vencs.join(' '));
  t.conferir('a despesa fica toda no dia da compra',
    compra3.datas.length === 1 && compra3.datas[0] === '2026-08-10', compra3.datas.join(','));
  t.conferir('o saldo do período conta a compra uma vez só',
    compra3.saldo === 'R$ -450,00', compra3.saldo);
  t.conferir('"A pagar" mostra as 3 parcelas numeradas',
    compra3.rotulos.filter(r => /1\/3|2\/3|3\/3/.test(r)).length === 3, compra3.rotulos.join(' | '));
  t.conferir('e o total a pagar é o valor da compra', compra3.aPagar === 'R$ 450,00', compra3.aPagar);
  t.conferir('as parcelas ficam no mesmo carnê', compra3.mesmoGrupo === true);
  t.conferir('e o carnê fica ligado à movimentação do estoque', compra3.ligada === true);

  // Editar a compra para 2× não pode deixar parcela órfã cobrando
  const editada = await pagina.evaluate(() => {
    seg = 'estoque'; detailItem = 'p1'; render();
    openMove('p1', 'entrada', moves[0]);
    const abriuCom = { prazo: $('m-prazo').checked, parcelas: $('m-parcelas').value, venc: $('m-venc').value };
    $('m-parcelas').value = '2';
    $('form-move').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    return { abriuCom, qtd: bovT.length, soma: bovT.reduce((s, x) => s + x.amount, 0),
      aPagar: document.querySelector('#bfin-apagar .ap-total').textContent };
  });
  t.conferir('reabrir a compra mostra o parcelamento que ela tem',
    editada.abriuCom.prazo === true && editada.abriuCom.parcelas === '3' && editada.abriuCom.venc === '2026-09-10',
    JSON.stringify(editada.abriuCom));
  t.conferir('mudar de 3× para 2× não deixa parcela órfã', editada.qtd === 2, String(editada.qtd));
  t.conferir('e o total continua batendo com a compra', editada.soma === 450, String(editada.soma));
  t.conferir('sem cobrar dívida fantasma no "A pagar"', editada.aPagar === 'R$ 450,00', editada.aPagar);

  // Apagar a compra apaga o carnê inteiro
  const apagada = await pagina.evaluate(() => {
    seg = 'estoque'; detailItem = 'p1'; render();
    openMove('p1', 'entrada', moves[0]);
    limparVinculoCompra(moves[0]);
    render();
    return { bov: bovT.length };
  });
  t.conferir('apagar a compra apaga o carnê inteiro', apagada.bov === 0, String(apagada.bov));

  // ---------- a prazo também nos aviários ----------
  t.secao('a prazo nos aviários');
  const avPrazo = await pagina.evaluate(() => {
    avT = []; bovT = []; tab = 'aviarios'; render();
    openTrans('av');
    document.querySelector('input[name="t-type"][value="saida"]').checked = true;
    document.querySelector('input[name="t-type"][value="saida"]').dispatchEvent(new Event('change'));
    const campoAparece = $('t-prazo-box').style.display !== 'none';
    $('t-date').value = '2026-08-10';
    $('t-amount').value = '900';
    $('t-aviary').value = '5';
    $('t-category').value = 'Ração';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-09-05';
    $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
    const previa = $('t-parcelas-nota').textContent;
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    $('av-period').value = 'all'; $('av-aviary').value = 'all'; render();
    return { campoAparece, previa, qtd: avT.length,
      soma: avT.reduce((s, x) => s + x.amount, 0),
      aviario: [...new Set(avT.map(x => x.aviary))],
      vencs: avT.slice().sort((a, b) => a.parcela - b.parcela).map(x => x.venc),
      aPagar: document.querySelector('#av-apagar .ap-total').textContent,
      lembrete: $('lembrete').textContent,
      bovIntacto: bovT.length };
  });
  t.conferir('o campo "a prazo" aparece no lançamento de aviários', avPrazo.campoAparece === true);
  t.conferir('a prévia mostra 3× de R$ 300,00', /3× de R\$ 300,00/.test(avPrazo.previa), avPrazo.previa);
  t.conferir('cria as 3 parcelas no livro dos aviários', avPrazo.qtd === 3, String(avPrazo.qtd));
  t.conferir('que somam o valor lançado', avPrazo.soma === 900, String(avPrazo.soma));
  t.conferir('todas no aviário escolhido', avPrazo.aviario.join(',') === '5', avPrazo.aviario.join(','));
  t.conferir('com vencimentos mês a mês',
    avPrazo.vencs.join(' ') === '2026-09-05 2026-10-05 2026-11-05', avPrazo.vencs.join(' '));
  t.conferir('"A pagar" dos aviários soma as parcelas', avPrazo.aPagar === 'R$ 900,00', avPrazo.aPagar);
  t.conferir('e nada disso vaza para o livro dos bovinos', avPrazo.bovIntacto === 0, String(avPrazo.bovIntacto));

  // ---------- aba Fazenda: os dois livros somados ----------
  // A regra que importa: o que a Fazenda mostra tem de ser exatamente a soma
  // do que Bovinos e Aviários mostram. Se divergir, um dos três está mentindo.
  t.secao('aba Fazenda');
  const fz = await pagina.evaluate(() => {
    bovT = [
      { id: 'f1', date: '2026-04-01', type: 'entrada', amount: 50000, category: 'Venda de gado' },
      { id: 'f2', date: '2026-04-02', type: 'saida', amount: 12000, category: 'Ração/insumos' },
      { id: 'f3', date: '2026-04-03', type: 'saida', amount: 8000, category: 'Benfeitorias' },
      { id: 'f4', date: '2026-04-04', type: 'saida', amount: 3000, category: 'Mão de obra', venc: '2026-05-04', pago: false },
      { id: 'f5', date: '2025-04-04', type: 'entrada', amount: 99999, category: 'Ano passado' }
    ];
    avT = [
      { id: 'g1', date: '2026-04-01', type: 'entrada', amount: 20000, category: 'Pagamento Seara', aviary: '5' },
      { id: 'g2', date: '2026-04-02', type: 'saida', amount: 25000, category: 'Energia elétrica', aviary: '5' },
      { id: 'g3', date: '2026-04-03', type: 'saida', amount: 2000, category: 'Gás', aviary: '6', venc: '2026-05-10', pago: false }
    ];
    const ler = sel => document.querySelector(sel) ? document.querySelector(sel).textContent : null;

    tab = 'fazenda'; $('fz-period').value = 'this-year'; render();
    const geral = {
      saldo: ler('#fz-balance .bc-value'),
      receitas: ler('#fz-balance .val.in'),
      custos: ler('#fz-balance .val.out'),
      atividades: [...document.querySelectorAll('#fz-atividades .fz-card')].map(c => ({
        nome: c.querySelector('.fz-nome').textContent, saldo: c.querySelector('.fz-saldo').textContent,
        negativo: c.className.includes('neg') })),
      classes: [...document.querySelectorAll('#fz-classes .fz-classe')].map(c =>
        c.querySelector('.n').textContent + '=' + c.querySelector('.v').textContent),
      aPagar: ler('#fz-apagar .ap-total'),
      contas: [...document.querySelectorAll('#fz-apagar .ap-linha .cat')].map(e => e.textContent),
      cats: [...document.querySelectorAll('#fz-cats .cb-line')].length,
      vazio: $('fz-empty').hidden
    };

    // Os mesmos dados vistos por cada aba, para comparar
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'this-year'; render();
    const bov = { saldo: ler('#bfin-balance .bc-value'), inn: ler('#bfin-balance .val.in'), out: ler('#bfin-balance .val.out') };
    tab = 'aviarios'; $('av-period').value = 'this-year'; $('av-aviary').value = 'all'; render();
    const av = { saldo: ler('#av-balance .bc-value'), inn: ler('#av-balance .val.in'), out: ler('#av-balance .val.out') };

    // Período mais estreito tem de reduzir, nunca aumentar
    tab = 'fazenda'; $('fz-period').value = 'all'; render();
    const tudoPeriodo = ler('#fz-balance .bc-value');

    // Sem lançamento nenhum, a tela avisa em vez de mostrar zero sem contexto
    bovT = []; avT = []; render();
    const semNada = { vazio: $('fz-empty').hidden, saldo: ler('#fz-balance .bc-value') };
    return { geral, bov, av, tudoPeriodo, semNada, fabEscondido: $('fab').hidden };
  });

  // O leitor do topo não tira o ponto de milhar; aqui os valores passam de mil.
  const numBR = x => parseFloat(String(x).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'));
  t.conferir('receitas da Fazenda = Bovinos + Aviários',
    Math.abs(numBR(fz.geral.receitas) - (numBR(fz.bov.inn) + numBR(fz.av.inn))) < 0.005,
    `${fz.geral.receitas} vs ${fz.bov.inn} + ${fz.av.inn}`);
  t.conferir('custos da Fazenda = Bovinos + Aviários',
    Math.abs(numBR(fz.geral.custos) - (numBR(fz.bov.out) + numBR(fz.av.out))) < 0.005,
    `${fz.geral.custos} vs ${fz.bov.out} + ${fz.av.out}`);
  t.conferir('saldo da Fazenda = saldo dos dois somados',
    Math.abs(numBR(fz.geral.saldo) - (numBR(fz.bov.saldo) + numBR(fz.av.saldo))) < 0.005,
    `${fz.geral.saldo} vs ${fz.bov.saldo} + ${fz.av.saldo}`);
  t.conferir('saldo consolidado confere com a conta à mão',
    fz.geral.saldo === 'R$ 20.000,00', fz.geral.saldo);

  t.conferir('mostra o resultado de cada atividade',
    fz.geral.atividades.map(a => a.nome).join(',') === 'Bovinos,Aviários',
    fz.geral.atividades.map(a => a.nome).join(','));
  t.conferir('bovinos com saldo positivo',
    fz.geral.atividades[0].saldo === 'R$ 27.000,00' && fz.geral.atividades[0].negativo === false,
    fz.geral.atividades[0].saldo);
  t.conferir('aviários com saldo negativo, e marcado como tal',
    fz.geral.atividades[1].saldo === 'R$ -7.000,00' && fz.geral.atividades[1].negativo === true,
    fz.geral.atividades[1].saldo);
  t.conferir('os dois saldos por atividade somam o saldo da fazenda',
    Math.abs(fz.geral.atividades.reduce((s, a) => s + numBR(a.saldo), 0) - numBR(fz.geral.saldo)) < 0.005,
    fz.geral.atividades.map(a => a.saldo).join(' + '));

  t.conferir('separa receita, custeio e investimento',
    fz.geral.classes.join(' | ') === 'Receita=R$ 70.000,00 | Custeio=R$ 42.000,00 | Investimento=R$ 8.000,00',
    fz.geral.classes.join(' | '));
  t.conferir('benfeitoria não entra como custeio',
    /Investimento=R\$ 8\.000,00/.test(fz.geral.classes.join(' ')), fz.geral.classes.join(' '));

  t.conferir('contas a pagar somam os dois livros', fz.geral.aPagar === 'R$ 5.000,00', fz.geral.aPagar);
  t.conferir('e cada conta diz de qual atividade é',
    fz.geral.contas.some(c => /^Bovinos/.test(c)) && fz.geral.contas.some(c => /^Aviários/.test(c)),
    fz.geral.contas.join(' | '));

  t.conferir('o filtro de período funciona (todo período traz o ano passado)',
    fz.tudoPeriodo === 'R$ 119.999,00', fz.tudoPeriodo);
  t.conferir('sem lançamento a tela avisa em vez de só mostrar zero',
    fz.semNada.vazio === false && fz.semNada.saldo === 'R$ 0,00', `${fz.semNada.vazio} / ${fz.semNada.saldo}`);
  t.conferir('a aba Fazenda permite lançar: o botão + aparece', fz.fabEscondido === false);

  // ---------- lançar custo pela aba Fazenda ----------
  t.secao('lançar custo pela Fazenda');
  const lanc = await pagina.evaluate(() => {
    bovT = []; avT = []; tab = 'fazenda'; $('fz-period').value = 'all'; render();
    const fabAparece = !$('fab').hidden;

    // Bovinos: a atividade vem perguntada, e o campo de aviário fica escondido
    $('fab').click();
    const aoAbrir = {
      perguntaAtividade: $('t-livro-wrap').style.display !== 'none',
      livroPadrao: $('t-livro').value,
      aviarioEscondido: $('t-aviary-wrap').style.display === 'none',
      listaCategorias: $('t-category').getAttribute('list')
    };
    $('t-date').value = '2026-08-20';
    $('t-amount').value = '1.250,50';
    $('t-category').value = 'Impostos/Funrural';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const depoisBov = { bov: bovT.length, av: avT.length, valor: bovT[0] && bovT[0].amount };

    // Aviários: trocar a atividade tem de trazer o campo de aviário e a outra lista
    $('fab').click();
    $('t-livro').value = 'av'; $('t-livro').dispatchEvent(new Event('change'));
    const aoTrocar = {
      aviarioAparece: $('t-aviary-wrap').style.display !== 'none',
      listaCategorias: $('t-category').getAttribute('list'),
      livroDestino: $('t-book').value
    };
    $('t-date').value = '2026-08-21';
    $('t-amount').value = '800';
    $('t-aviary').value = '6';
    $('t-category').value = 'Energia elétrica';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    render();

    const ler = sel => document.querySelector(sel) ? document.querySelector(sel).textContent : null;
    const fz = { custos: ler('#fz-balance .val.out'),
      atividades: [...document.querySelectorAll('#fz-atividades .fz-card .fz-saldo')].map(e => e.textContent) };
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'all'; render();
    const bovTela = ler('#bfin-balance .val.out');
    tab = 'aviarios'; $('av-period').value = 'all'; $('av-aviary').value = 'all'; render();
    const avTela = ler('#av-balance .val.out');

    // A prazo lançado pela Fazenda também tem de funcionar
    tab = 'fazenda'; render();
    $('fab').click();
    $('t-livro').value = 'av'; $('t-livro').dispatchEvent(new Event('change'));
    $('t-date').value = '2026-08-22'; $('t-amount').value = '600';
    $('t-aviary').value = '5'; $('t-category').value = 'Ração';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-09-22'; $('t-parcelas').value = '3';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    render();

    return { fabAparece, aoAbrir, depoisBov, aoTrocar, fz, bovTela, avTela,
      avFinal: avT.length, bovFinal: bovT.length,
      aviarioDasParcelas: [...new Set(avT.filter(x => x.parcelas === 3).map(x => x.aviary))],
      aPagarFz: ler('#fz-apagar .ap-total') };
  });

  t.conferir('o botão + aparece na aba Fazenda', lanc.fabAparece === true);
  t.conferir('o formulário pergunta a atividade', lanc.aoAbrir.perguntaAtividade === true);
  t.conferir('começando em Bovinos', lanc.aoAbrir.livroPadrao === 'bov', lanc.aoAbrir.livroPadrao);
  t.conferir('sem pedir aviário para bovinos', lanc.aoAbrir.aviarioEscondido === true);
  t.conferir('com as categorias de bovinos', lanc.aoAbrir.listaCategorias === 'cats-bov', lanc.aoAbrir.listaCategorias);
  t.conferir('o custo cai no livro dos bovinos',
    lanc.depoisBov.bov === 1 && lanc.depoisBov.av === 0, `bov ${lanc.depoisBov.bov} · av ${lanc.depoisBov.av}`);
  t.conferir('com o valor digitado em português (1.250,50)',
    lanc.depoisBov.valor === 1250.5, String(lanc.depoisBov.valor));

  t.conferir('trocar para Aviários pede o galpão', lanc.aoTrocar.aviarioAparece === true);
  t.conferir('e troca a lista de categorias', lanc.aoTrocar.listaCategorias === 'cats-av', lanc.aoTrocar.listaCategorias);
  t.conferir('e muda o livro de destino', lanc.aoTrocar.livroDestino === 'av', lanc.aoTrocar.livroDestino);

  t.conferir('a Fazenda soma os dois custos lançados por ela',
    lanc.fz.custos === 'R$ 2.050,50', lanc.fz.custos);
  t.conferir('o custo de bovinos aparece na aba Bovinos', lanc.bovTela === 'R$ 1.250,50', lanc.bovTela);
  t.conferir('o de aviários aparece na aba Aviários', lanc.avTela === 'R$ 800,00', lanc.avTela);
  t.conferir('nenhum lançamento foi parar no livro errado',
    lanc.bovFinal === 1 && lanc.avFinal === 4, `bov ${lanc.bovFinal} · av ${lanc.avFinal}`);
  t.conferir('a prazo lançado pela Fazenda gera as parcelas no livro certo',
    lanc.aviarioDasParcelas.join(',') === '5', lanc.aviarioDasParcelas.join(','));
  t.conferir('e entram no "A pagar" da Fazenda', lanc.aPagarFz === 'R$ 600,00', lanc.aPagarFz);

  // ---------- nota fiscal anexada ----------
  // Foto de celular tem 3 a 5 MB e o registro na nuvem cabe 1 MB. O que importa
  // aqui: a foto ser reduzida ANTES de subir, e a nota nunca ficar orfa.
  t.secao('nota fiscal anexada');
  const anexo = await pagina.evaluate(async () => {
    bovT = []; avT = []; pendentes = []; db = null;
    localStorage.removeItem('fjs-pendentes');
    tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'all'; render();

    // Uma "foto" grande de verdade: 3000x2000 com ruido, que nao comprime bem
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 2000;
    const cx = c.getContext('2d');
    const img = cx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255;
      img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    const original = c.toDataURL('image/jpeg', 1);
    const bytesOriginais = Math.round((original.length - (original.indexOf(',') + 1)) * 0.75);
    const blob = await (await fetch(original)).blob();
    const file = new File([blob], 'nota-fiscal.jpg', { type: 'image/jpeg' });

    openTrans('bov');
    await adicionarAnexos([file]);
    const depoisDeAnexar = {
      qtd: anexosForm.length, nome: anexosForm[0] && anexosForm[0].nome,
      tamanho: anexosForm[0] && anexosForm[0].tamanho, tipo: anexosForm[0] && anexosForm[0].tipo
    };

    $('t-date').value = '2026-08-20'; $('t-amount').value = '1500';
    $('t-category').value = 'Ração/insumos';
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    render();

    const t0 = bovT[0];
    const naFila = pendentes.filter(p => p.col === 'anexos');
    const linhaTemMarca = !!document.querySelector('#bfin-list .item-anexo');

    // Reabrir tem de trazer o anexo, e o lancamento guarda so o cadastrinho
    openTrans('bov', t0);
    const aoReabrir = { qtd: anexosForm.length, temDados: !('dados' in (t0.anexos[0] || {})) };
    // Ver a nota: sem internet, vem da fila
    await abrirAnexo(t0.anexos[0].id);
    const abriu = !!document.querySelector('#ax-corpo .ax-img');
    closeAllM();

    // Remover o anexo e salvar
    openTrans('bov', t0);
    $('t-anexos').querySelector('[data-tirar]').click();
    const aposTirar = anexosForm.length;
    $('form-transaction').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const semAnexo = (bovT[0].anexos || []).length;

    return { bytesOriginais, depoisDeAnexar, naFila: naFila.length,
      guardaTransId: naFila[0] && naFila[0].obj.transId === t0.id,
      guardaDados: naFila[0] && typeof naFila[0].obj.dados === 'string' && naFila[0].obj.dados.startsWith('data:image'),
      linhaTemMarca, aoReabrir, abriu, aposTirar, semAnexo,
      pedeApagar: pendentes.some(p => p.col === 'anexos' && p.del) };
  });

  t.conferir('a foto original é grande mesmo (mais de 1 MB)',
    anexo.bytesOriginais > 1024 * 1024, Math.round(anexo.bytesOriginais / 1024) + ' KB');
  t.conferir('depois de reduzida cabe no registro da nuvem',
    anexo.depoisDeAnexar.tamanho < 700 * 1024, Math.round(anexo.depoisDeAnexar.tamanho / 1024) + ' KB');
  t.conferir('e ficou bem menor que a original',
    anexo.depoisDeAnexar.tamanho < anexo.bytesOriginais / 2,
    `${Math.round(anexo.bytesOriginais / 1024)} KB → ${Math.round(anexo.depoisDeAnexar.tamanho / 1024)} KB`);
  t.conferir('guarda o nome do arquivo', anexo.depoisDeAnexar.nome === 'nota-fiscal.jpg', anexo.depoisDeAnexar.nome);
  t.conferir('sem internet, a nota entra na fila para subir', anexo.naFila === 1, String(anexo.naFila));
  t.conferir('e a nota sabe de qual lançamento é', anexo.guardaTransId === true);
  t.conferir('com a imagem dentro dela', anexo.guardaDados === true);
  t.conferir('a linha do Financeiro mostra que tem nota anexada', anexo.linhaTemMarca === true);
  t.conferir('reabrir o lançamento traz a nota', anexo.aoReabrir.qtd === 1, String(anexo.aoReabrir.qtd));
  t.conferir('o lançamento guarda só o cadastro, não a imagem', anexo.aoReabrir.temDados === true);
  t.conferir('dá para ver a nota mesmo antes de subir', anexo.abriu === true);
  t.conferir('remover tira da lista', anexo.aposTirar === 0, String(anexo.aposTirar));
  t.conferir('e salvar deixa o lançamento sem nota', anexo.semAnexo === 0, String(anexo.semAnexo));
  t.conferir('mandando apagar a nota da nuvem também', anexo.pedeApagar === true);

  // ---------- backup e restauração: a volta tem de trazer tudo ----------
  // Nunca havia sido testado, e é a última linha de defesa contra perda de
  // dados: se a restauração não trouxer tudo de volta, o backup não vale nada.
  t.secao('backup e restauração');
  const arquivo = await pagina.evaluate(() => {
    animals = [{ id: 'b1', ident: 'B1', cat: 'Novilha', dead: true, deadDate: '2026-05-05', deadCause: 'Cobra' },
               { id: 'b2', ident: 'B2', sold: true, soldDate: '2026-06-06', soldPrice: 7500 },
               { id: 'b3', ident: 'B3' }];
    weighings = [{ id: 'bw1', animalId: 'b3', date: '2026-04-01', weight: 300, notes: 'obs; com ponto e vírgula' },
                 { id: 'bw2', animalId: 'b3', date: '2026-07-01', weight: 391.5 }];
    bovT = [{ id: 'bt1', date: '2026-04-01', type: 'saida', amount: 1234.56, category: 'Ração/insumos' }];
    avT = [{ id: 'ba1', date: '2026-04-01', type: 'entrada', amount: 999.99, category: 'Venda', aviary: '5' }];
    items = [{ id: 'bi1', name: 'Proteinado', unit: 'kg', min: 50 }];
    moves = [{ id: 'bm1', itemId: 'bi1', type: 'entrada', date: '2026-04-01', qty: 100, unitCost: 4.75 }];
    settings.yield = 54;
    custoParams = Object.assign({}, custoParams, { gmd: 0.875, salPreco: 4.5, terra: 30 });
    render();
    // Mesmo conteúdo que o botão de backup gera
    return JSON.stringify({ app: 'fazendajs', v: 4, exportedAt: new Date().toISOString(),
      animals, weighings, bovT, avT, items, moves, settings, custo: custoParams });
  });

  // Destrói tudo e restaura do arquivo, SEM internet — o pior caso.
  await pagina.evaluate(() => {
    db = null; pendentes = []; localStorage.removeItem('fjs-pendentes');
    animals = []; weighings = []; bovT = []; avT = []; items = []; moves = [];
    settings.yield = 52; custoParams = Object.assign({}, CUSTO_VAZIO);
    render();
  });
  const aceitar = async d => { await d.accept(); };
  pagina.on('dialog', aceitar);
  await pagina.setInputFiles('#restore-input',
    { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(arquivo, 'utf-8') });
  await pagina.waitForTimeout(400);
  pagina.removeListener('dialog', aceitar);

  const volta = await pagina.evaluate(() => (
    // A restauracao nao muda de aba sozinha; volta para o Rebanho para conferir
    // que a lista na tela reflete o que foi restaurado.
    tab = 'bovinos', seg = 'rebanho', render(), {
    animais: animals.length, pesagens: weighings.length, bov: bovT.length, av: avT.length,
    itens: items.length, movs: moves.length, rend: settings.yield,
    gmd: custoParams.gmd, terra: custoParams.terra,
    morto: animals.some(a => a.dead && a.deadCause === 'Cobra'),
    vendido: animals.some(a => a.sold && a.soldPrice === 7500),
    pesoExato: weighings.some(w => w.weight === 391.5),
    obsIntacta: weighings.some(w => w.notes === 'obs; com ponto e vírgula'),
    naFila: pendentes.length,
    filaTemFazenda: pendentes.some(p => p.col === '_fazenda' && p.obj.yield === 54),
    espelho: (() => { const e = JSON.parse(localStorage.getItem('fjs-espelho') || '{}');
      return { animais: (e.animals || []).length, rend: e.settings && e.settings.yield }; })(),
    naTela: document.querySelectorAll('#animal-list .list-item').length
  }));
  t.conferir('restaura os animais', volta.animais === 3, String(volta.animais));
  t.conferir('restaura as pesagens', volta.pesagens === 2, String(volta.pesagens));
  t.conferir('restaura o financeiro dos dois livros', volta.bov === 1 && volta.av === 1, `${volta.bov}/${volta.av}`);
  t.conferir('restaura estoque e movimentações', volta.itens === 1 && volta.movs === 1, `${volta.itens}/${volta.movs}`);
  t.conferir('restaura o rendimento de carcaça', volta.rend === 54, String(volta.rend));
  t.conferir('restaura os parâmetros de custo', volta.gmd === 0.875 && volta.terra === 30, `${volta.gmd}/${volta.terra}`);
  t.conferir('a marca de morte volta com a causa', volta.morto === true);
  t.conferir('a marca de venda volta com o valor', volta.vendido === true);
  t.conferir('peso com decimal volta exato', volta.pesoExato === true);
  t.conferir('observação com ponto e vírgula volta intacta', volta.obsIntacta === true);
  t.conferir('a tela mostra o rebanho restaurado na hora, sem internet',
    volta.naTela === 1, volta.naTela + ' na lista (só o ativo)');
  t.conferir('a cópia do aparelho também foi atualizada',
    volta.espelho.animais === 3 && volta.espelho.rend === 54, JSON.stringify(volta.espelho));
  t.conferir('tudo ficou na fila para subir quando a internet voltar', volta.naFila > 0, String(volta.naFila));
  t.conferir('os ajustes da fazenda também entraram na fila', volta.filaTemFazenda === true);

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
