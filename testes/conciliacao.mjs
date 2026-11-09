// AUDITORIA GERAL: AS CONCILIAÇÕES QUE NINGUÉM TINHA COBRADO.
//
// Pedido do dono: auditoria em cada item do aplicativo, como um auditor sênior
// faria, procurando erro.
//
// Auditor não refaz fórmula — isso as varreduras já fazem. Ele cobra três
// coisas que fórmula certa não garante:
//   EXISTÊNCIA   — nada é contado que não exista mais;
//   INTEGRIDADE  — nada fica para trás quando o dono apaga alguma coisa;
//   CONCILIAÇÃO  — dois livros que falam do mesmo dinheiro fecham um com o
//                  outro, e uma avaliação de estoque vale o que o estoque custou.
//
// TRÊS DEFEITOS ACHADOS, todos medidos no aplicativo rodando:
//
// 1. NOTA FISCAL ÓRFÃ. Apagar um animal vendido, ou desmarcar a venda, apagava
//    o lançamento dela no Financeiro e deixava a NOTA FISCAL na nuvem, sem
//    nenhum lançamento que a alcance. O movimento do estoque de gado, o item e
//    o lançamento avulso já limpavam; o animal era a única porta que não. Anexo
//    órfão não aparece em tela nenhuma, pesa quase 1 MB e entra em todo backup.
//
// 2. O ESTOQUE VALIA A MÉDIA DE TUDO QUE JÁ SE COMPROU. O custo médio era a
//    média ponderada de TODAS as entradas de sempre, as consumidas inclusive.
//    Medido: 100 kg a R$ 2 já gastos e 10 kg a R$ 8 no galpão davam R$ 2,55, e
//    o relatório avaliava em R$ 25 um estoque que custou R$ 80. Agora é média
//    MÓVEL — o custo do que está lá dentro.
//
// 3. ALARME DE DUPLICIDADE TOCANDO NO TRABALHO NORMAL. Vender três bois do
//    mesmo lote, no mesmo dia e pelo mesmo preço, disparava "POSSÍVEL
//    DUPLICIDADE" duas vezes. E a consequência estava medida: respondendo "já
//    está lançado" por reflexo, a aba Vendidas ficava com R$ 12.000 recebidos e
//    o Financeiro com R$ 6.000 — dois livros, dois números, nada explicando.
import { servir, abrirApp, placar } from './apoio.mjs';

const QTD = Number(process.env.CONCILIA_QTD || 600);
const SEMENTE = Number(process.env.SEMENTE_CONCILIA || (Date.now() % 2147483647));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Conciliações da auditoria (${QTD.toLocaleString('pt-BR')} sorteios · semente ${SEMENTE})`);

  let dialogos = [];
  let responder = true;
  pagina.on('dialog', async d => {
    dialogos.push(d.message());
    responder ? await d.accept() : await d.dismiss();
  });

  // ---------- 1. nada fica para trás quando o dono apaga ----------
  t.secao('a nota fiscal sai junto com o lançamento que a segurava');
  const comNota = `(function () {
    animals = [{ id: 'a1', ident: '292', cat: 'Novilha', sold: true, soldDate: '2026-10-01',
      soldWeight: 450, soldPrice: 5000, linkTrans: 't1' }];
    weighings = []; avT = []; gerT = []; items = []; moves = []; rebmov = [];
    extraT = {}; atividades = [];
    bovT = [{ id: 't1', date: '2026-10-01', type: 'entrada', amount: 5000,
      category: 'Venda de gado', notes: '292', lock: 'animal',
      anexos: [{ id: 'nf1', nome: 'nota.pdf', tipo: 'application/pdf' }] }];
    anexoCache.set('nf1', 'data:application/pdf;base64,AAA');
    recomputarLivros(); tab = 'bovinos'; seg = 'rebanho'; detailAnimal = null; render();
  })()`;
  const sobrou = `(function () {
    return { nota: anexoCache.has('nf1'), lanc: bovT.length, animais: animals.length };
  })()`;

  await pagina.evaluate(comNota);
  await pagina.evaluate(`(function () {
    openAnimal(animals[0]);
    document.getElementById('btn-delete-animal').click();
  })()`);
  await pagina.waitForTimeout(220);
  const apagado = await pagina.evaluate(sobrou);
  t.conferir('apagando o animal, o lançamento da venda sai',
    apagado.lanc === 0 && apagado.animais === 0, JSON.stringify(apagado));
  t.conferir('e a nota fiscal dele sai junto, sem ficar órfã na nuvem',
    !apagado.nota, `nota ainda presente: ${apagado.nota}`);

  await pagina.evaluate(comNota);
  await pagina.evaluate(`(function () {
    openAnimal(animals[0]);
    document.getElementById('an-sold').checked = false;
    document.getElementById('form-animal').dispatchEvent(new Event('submit', { cancelable: true }));
  })()`);
  await pagina.waitForTimeout(220);
  const desmarcado = await pagina.evaluate(sobrou);
  t.conferir('desmarcando a venda, o lançamento sai e o animal fica',
    desmarcado.lanc === 0 && desmarcado.animais === 1, JSON.stringify(desmarcado));
  t.conferir('e a nota também sai, pelo mesmo motivo',
    !desmarcado.nota, `nota ainda presente: ${desmarcado.nota}`);

  // A mesma nota presa a DOIS lançamentos não pode sair quando só um morre.
  await pagina.evaluate(`(function () {
    animals = [{ id: 'a1', ident: '292', cat: 'Novilha', sold: true, soldDate: '2026-10-01',
      soldPrice: 5000, linkTrans: 't1' }];
    bovT = [
      { id: 't1', date: '2026-10-01', type: 'entrada', amount: 5000, category: 'Venda de gado',
        notes: '292', lock: 'animal', anexos: [{ id: 'nf1', nome: 'nota.pdf' }] },
      { id: 't2', date: '2026-10-01', type: 'saida', amount: 200, category: 'Frete',
        notes: 'mesma nota', anexos: [{ id: 'nf1', nome: 'nota.pdf' }] }
    ];
    anexoCache.set('nf1', 'data:application/pdf;base64,AAA');
    recomputarLivros(); render();
    openAnimal(animals[0]);
    document.getElementById('btn-delete-animal').click();
  })()`);
  await pagina.waitForTimeout(220);
  const compartilhada = await pagina.evaluate(`(function () {
    return { nota: anexoCache.has('nf1'), lanc: bovT.length };
  })()`);
  t.conferir('nota usada por OUTRO lançamento não é apagada junto',
    compartilhada.nota && compartilhada.lanc === 1, JSON.stringify(compartilhada));

  // ---------- 2. o estoque vale o que o estoque custou ----------
  t.secao('custo médio é o do que está em estoque, não o de tudo que já se comprou');
  const custo = async mv => pagina.evaluate(`(function () {
    items = [{ id: 'i1', name: 'Sal mineral', unit: 'kg' }];
    moves = ${JSON.stringify(mv)};
    animals = []; weighings = []; bovT = []; rebmov = [];
    recomputarLivros();
    return { saldo: qtyOf('i1'), media: avgCostOf('i1') };
  })()`);
  const consumido = await custo([
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 100, unitCost: 2, date: '2026-01-10' },
    { id: 'm2', itemId: 'i1', type: 'saida', qty: 100, date: '2026-06-01' },
    { id: 'm3', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 8, date: '2026-10-01' }]);
  t.conferir('lote antigo consumido não puxa mais o custo do que está no galpão',
    consumido.saldo === 10 && Math.abs(consumido.media - 8) < 1e-9,
    `${consumido.saldo} kg a ${consumido.media} (a conta antiga dava 2,5455)`);
  t.conferir('e o valor do estoque passa a ser o que ele custou',
    Math.abs(consumido.saldo * consumido.media - 80) < 1e-9,
    `${consumido.saldo * consumido.media} (antes 25,45)`);
  const mistura = await custo([
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 2, date: '2026-01-10' },
    { id: 'm2', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 8, date: '2026-10-01' }]);
  t.conferir('sem saída nenhuma, a conta não muda: dois lotes misturam na média',
    Math.abs(mistura.media - 5) < 1e-9, String(mistura.media));
  const meio = await custo([
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 2, date: '2026-01-10' },
    { id: 'm2', itemId: 'i1', type: 'saida', qty: 5, date: '2026-02-01' },
    { id: 'm3', itemId: 'i1', type: 'entrada', qty: 5, unitCost: 8, date: '2026-10-01' }]);
  t.conferir('a saída sai pelo preço médio e NÃO mexe na média',
    Math.abs(meio.media - 5) < 1e-9, `${meio.media} (5 que custaram 2 + 5 que custaram 8)`);
  const semPreco = await custo([
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 5, date: '2026-01-10' },
    { id: 'm2', itemId: 'i1', type: 'entrada', qty: 10, date: '2026-02-01' }]);
  t.conferir('entrada sem preço entra pela média do momento e não a distorce',
    Math.abs(semPreco.media - 5) < 1e-9, String(semPreco.media));
  const soSemPreco = await custo([
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 10, date: '2026-01-10' },
    { id: 'm2', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 30, date: '2026-02-01' }]);
  t.conferir('entrada sem preço ANTES de qualquer compra não puxa a média para baixo',
    Math.abs(soSemPreco.media - 30) < 1e-9, `${soSemPreco.media} (zero daria 15)`);
  const nunca = await custo([{ id: 'm1', itemId: 'i1', type: 'entrada', qty: 10, date: '2026-01-10' }]);
  t.conferir('item que nunca teve preço não ganha custo inventado',
    nunca.media === null, String(nunca.media));
  const zerado = await custo([
    { id: 'm1', itemId: 'i1', type: 'entrada', qty: 10, unitCost: 7, date: '2026-01-10' },
    { id: 'm2', itemId: 'i1', type: 'saida', qty: 10, date: '2026-02-01' }]);
  t.conferir('saldo zerado com compra no passado mostra o último preço, não "sem preço"',
    zerado.saldo === 0 && Math.abs(zerado.media - 7) < 1e-9, JSON.stringify(zerado));

  // ---------- 3. os dois livros do mesmo dinheiro fecham ----------
  t.secao('a venda do lote não dispara alarme falso, e os dois livros fecham');
  const vender = (id, preco, data) => `(function () {
    openAnimal(animals.find(x => x.id === ${JSON.stringify(id)}));
    document.getElementById('an-sold').checked = true;
    document.getElementById('an-sold-date').value = ${JSON.stringify(data)};
    document.getElementById('an-sold-weight').value = '450';
    document.getElementById('an-sold-price').value = String(${preco});
    document.getElementById('form-animal').dispatchEvent(new Event('submit', { cancelable: true }));
  })()`;
  const livros = `(function () {
    return { lanc: bovT.length,
      receita: bovT.filter(x => x.type === 'entrada').reduce((s2, x) => s2 + x.amount, 0),
      recebido: animals.filter(a => a.sold).reduce((s2, a) => s2 + (a.soldPrice || 0), 0),
      semLanc: animals.filter(a => a.sold && !a.linkTrans).length };
  })()`;
  await pagina.evaluate(`(function () {
    animals = [{ id: 'a1', ident: '101', cat: 'Boi' }, { id: 'a2', ident: '102', cat: 'Boi' },
      { id: 'a3', ident: '103', cat: 'Boi' }];
    weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = []; rebmov = [];
    extraT = {}; atividades = []; recomputarLivros(); render();
  })()`);
  dialogos = []; responder = true;
  for (const id of ['a1', 'a2', 'a3']) {
    await pagina.evaluate(vender(id, 6000, '2026-10-20'));
    await pagina.waitForTimeout(140);
  }
  const lote = await pagina.evaluate(livros);
  t.conferir('vender três bois do mesmo lote não pergunta nada',
    dialogos.length === 0, dialogos.map(d => d.slice(0, 60)).join(' | '));
  t.conferir('cada boi vira um lançamento, e nenhum fica sem',
    lote.lanc === 3 && lote.semLanc === 0, JSON.stringify(lote));
  t.conferir('o Financeiro e a aba Vendidas fecham no mesmo número',
    lote.receita === lote.recebido && lote.receita === 18000,
    `financeiro ${lote.receita} · vendidas ${lote.recebido}`);

  // O aviso continua existindo para o caso que ele foi feito: o lançamento
  // digitado à mão no Financeiro, que não tem dono nenhum.
  await pagina.evaluate(`(function () {
    animals = [{ id: 'b1', ident: '201', cat: 'Boi' }];
    bovT = [{ id: 'manual', date: '2026-10-20', type: 'entrada', amount: 6000,
      category: 'Venda de gado', notes: 'lançado à mão' }];
    recomputarLivros(); render();
  })()`);
  dialogos = []; responder = true;
  await pagina.evaluate(vender('b1', 6000, '2026-10-20'));
  await pagina.waitForTimeout(160);
  t.conferir('mas o lançamento digitado à mão ainda dispara o aviso',
    dialogos.some(d => /DUPLICIDADE/.test(d)), dialogos.map(d => d.slice(0, 70)).join(' | '));

  // ---------- 4. varredura: as conciliações em fazendas sorteadas ----------
  t.secao(`as conciliações fecham em qualquer fazenda (${QTD.toLocaleString('pt-BR')} sorteios)`);
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
    const quase = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
    for (let k = 0; k < N; k++) {
      // --- estoque: a média móvel e as suas propriedades
      items = [{ id: 'i1', name: 'Sal', unit: 'kg' }];
      moves = [];
      const precos = [];
      let saldo = 0;
      const nM = ent(1, 14);
      for (let i = 0; i < nM; i++) {
        const entrada = saldo <= 0 ? true : rnd() < 0.6;
        const q = ent(1, 60);
        const comPreco = entrada && rnd() < 0.8;
        const preco = comPreco ? ent(100, 9000) / 100 : undefined;
        if (comPreco) precos.push(preco);
        moves.push({ id: 'm' + i, itemId: 'i1', type: entrada ? 'entrada' : 'saida',
          qty: q, unitCost: preco, date: '2026-' + p2(ent(1, 12)) + '-' + p2(ent(1, 28)) });
        saldo += entrada ? q : -q;
      }
      const med = avgCostOf('i1');
      regra('só há custo médio quando houve compra com preço',
        (med === null) === (precos.length === 0), med + ' com ' + precos.length + ' preços');
      if (precos.length) {
        // A propriedade que vale para qualquer método honesto de custeio, e que
        // pegou os dois defeitos do próprio conserto.
        regra('o custo médio fica entre o menor e o maior preço pago',
          med >= Math.min.apply(null, precos) - 1e-9 && med <= Math.max.apply(null, precos) + 1e-9,
          med + ' fora de [' + Math.min.apply(null, precos) + ', ' + Math.max.apply(null, precos) + ']');
        regra('o custo médio é positivo e finito',
          med > 0 && Number.isFinite(med), String(med));
        // Com um preço só, a média é esse preço, sempre — não importa quantas
        // entradas e saídas aconteceram no meio.
        if (new Set(precos).size === 1) {
          regra('com um preço só, a média é exatamente esse preço',
            quase(med, precos[0], 1e-9), med + ' vs ' + precos[0]);
        }
      }
      regra('o saldo do estoque não depende do custeio',
        quase(qtyOf('i1'), moves.reduce((x, m) => x + (m.type === 'entrada' ? m.qty : -m.qty), 0)),
        String(qtyOf('i1')));

      // --- os dois livros do rebanho: cabeças e fichas
      animals = []; weighings = []; bovT = []; rebmov = [];
      const nA = ent(0, 12);
      let recebido = 0;
      for (let i = 0; i < nA; i++) {
        const vendido = rnd() < 0.3, morto = !vendido && rnd() < 0.15;
        const preco = vendido ? ent(100000, 900000) / 100 : null;
        const a = { id: 'a' + i, ident: 'T' + i, cat: 'Boi',
          sold: vendido, soldDate: vendido ? '2026-10-20' : null,
          soldPrice: preco, dead: morto, deadDate: morto ? '2026-10-21' : null };
        animals.push(a);
        if (vendido && preco > 0) {
          const tr = { id: 'tv' + i, date: '2026-10-20', type: 'entrada', amount: preco,
            category: 'Venda de gado', notes: a.ident, lock: 'animal' };
          bovT.push(tr); a.linkTrans = tr.id;
          recebido += preco;
        }
      }
      rebmov.push({ id: 'r0', tipo: 'inicial', qtd: nA + ent(0, 20), date: '2026-01-01' });
      recomputarLivros();
      const R = saldoRebanho();
      regra('saldo de cabeças = entradas − saídas, sempre',
        quase(R.saldo, R.entradas - R.saidas), R.saldo + ' vs ' + (R.entradas - R.saidas));
      regra('as saídas somam o lote mais os que têm brinco',
        quase(R.saidas, R.saidasLote + R.vendidosComBrinco + R.mortosComBrinco), String(R.saidas));
      regra('animal vendido E morto conta uma saída só',
        R.vendidosComBrinco + R.mortosComBrinco
          === animals.filter(a => a.sold || a.dead).length,
        R.vendidosComBrinco + '+' + R.mortosComBrinco);
      regra('sem brinco = saldo de cabeças menos as fichas do rebanho',
        quase(R.semBrinco, R.saldo - R.comBrinco), String(R.semBrinco));
      regra('a ficha do rebanho não conta vendido nem morto',
        R.comBrinco === animals.filter(a => !a.sold && !a.dead).length, String(R.comBrinco));
      // Conciliação de dinheiro: a receita lançada é a soma do que as vendas
      // dizem ter recebido. Um lançamento a mais ou a menos aparece aqui.
      const receitaLancada = bovT.filter(x => x.lock === 'animal' && x.type === 'entrada')
        .reduce((x, tr) => x + tr.amount, 0);
      regra('a receita lançada fecha com o recebido das vendas',
        quase(receitaLancada, recebido, 0.01), receitaLancada + ' vs ' + recebido);
      regra('toda venda com preço tem um lançamento, e um só',
        animals.filter(a => a.sold && a.soldPrice > 0).every(a => a.linkTrans
          && bovT.filter(x => x.id === a.linkTrans).length === 1), 'links');
    }
    return falhas;
  })(${QTD})`);
  Object.entries(f).forEach(([nome, caso]) =>
    t.conferir(nome, caso === null, caso == null ? `${QTD.toLocaleString('pt-BR')} sorteios` : caso));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
