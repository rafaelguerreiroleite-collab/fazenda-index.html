// Ações que nenhum teste tocava.
//
// Contando os botões do aplicativo contra o que as baterias exercitam, 24 de
// 76 ações nunca tinham sido acionadas por teste nenhum. Nem todas pesam igual
// — "fechar o aviso de instalar" não quebra fazenda. Estas quatro pesam:
//
//   RENDIMENTO DE CARCAÇA — multiplica TODA arroba do aplicativo. Um valor
//   fora de faixa aqui erra o peso em arroba do rebanho inteiro, o preço da
//   arroba na venda e o custo da arroba produzida, de uma vez.
//
//   MOVIMENTAÇÃO DE ESTOQUE — é por onde entra e sai insumo, e a compra pode
//   virar despesa no financeiro. Mexe em quantidade e em dinheiro.
//
//   EXCLUIR PESAGEM — apaga peso medido. Muda GMD, peso médio e total do
//   rebanho, e não tem como desfazer.
//
//   DESCONECTAR O APARELHO — e aqui estava um defeito de verdade, criado por
//   mim: desde que o arranque passou a recuperar o código de dentro do espelho
//   local, apagar só a chave do código deixou de desconectar. A página
//   recarregava e voltava para a mesma fazenda.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Ações sem cobertura');
  pagina.on('dialog', d => d.accept());

  // ---------- rendimento de carcaça ----------
  t.secao('rendimento de carcaça');
  const rend = await pagina.evaluate(() => {
    const por = v => {
      $('set-yield').value = v;
      $('set-yield').dispatchEvent(new Event('change'));
      return { campo: $('set-yield').value, guardado: settings.yield };
    };
    return { vazio: por(''), texto: por('abc'), zero: por('0'), negativo: por('-30'),
      baixo: por('10'), alto: por('900'), normal: por('54'), quebrado: por('53,7') };
  });
  // Fora de faixa não pode virar arroba: 0% zeraria o rebanho inteiro e 900%
  // multiplicaria por dezoito, sem nada na tela acusando.
  t.conferir('campo vazio volta ao padrão', rend.vazio.guardado === 52, String(rend.vazio.guardado));
  t.conferir('texto não vira rendimento', rend.texto.guardado === 52, String(rend.texto.guardado));
  t.conferir('zero é recusado', rend.zero.guardado >= 40, String(rend.zero.guardado));
  t.conferir('negativo é recusado', rend.negativo.guardado >= 40, String(rend.negativo.guardado));
  t.conferir('valor baixo demais sobe para o mínimo', rend.baixo.guardado === 40, String(rend.baixo.guardado));
  t.conferir('valor alto demais desce para o máximo', rend.alto.guardado === 65, String(rend.alto.guardado));
  t.conferir('valor normal passa', rend.normal.guardado === 54, String(rend.normal.guardado));
  t.conferir('o campo mostra o que foi realmente guardado',
    rend.alto.campo === '65' && rend.normal.campo === '54',
    `${rend.alto.campo} / ${rend.normal.campo}`);

  // E a arroba acompanha: é o que faz esse número importar.
  const arroba = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: 'BR001', cat: 'Boi' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-09-01', weight: 450 }];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    const medir = v => {
      $('set-yield').value = String(v); $('set-yield').dispatchEvent(new Event('change'));
      tab = 'bovinos'; seg = 'rebanho'; render();
      return arrobasDe(450, settings.yield);
    };
    return { a50: medir(50), a60: medir(60) };
  });
  t.conferir('a arroba segue o rendimento',
    Math.abs(arroba.a50 - 450 * 0.5 / 15) < 1e-9 && arroba.a60 > arroba.a50,
    `50% → ${arroba.a50.toFixed(2)} @ · 60% → ${arroba.a60.toFixed(2)} @`);

  // ---------- movimentação de estoque ----------
  t.secao('entrada e saída de estoque');
  const est = await pagina.evaluate(() => {
    items = [{ id: 'i1', name: 'Sal mineral', unit: 'kg', minQty: 10 }];
    moves = []; bovT = [];
    detailItem = 'i1'; tab = 'bovinos'; seg = 'estoque'; render();
    const tipoMarcado = () => {
      const r = document.querySelector('input[name="m-type"]:checked');
      return r ? r.value : null;
    };
    $('btn-move-in').click();
    const abriuEntrada = { aberto: !$('modal-move').hidden, tipo: tipoMarcado() };
    closeAllM();
    $('btn-move-out').click();
    const abriuSaida = { aberto: !$('modal-move').hidden, tipo: tipoMarcado() };
    closeAllM();
    return { abriuEntrada, abriuSaida };
  });
  t.conferir('o botão de entrada abre a tela como ENTRADA',
    est.abriuEntrada.aberto && est.abriuEntrada.tipo === 'entrada',
    JSON.stringify(est.abriuEntrada));
  t.conferir('e o de saída, como SAÍDA',
    est.abriuSaida.aberto && est.abriuSaida.tipo === 'saida',
    JSON.stringify(est.abriuSaida));

  // Uma entrada com custo pode virar despesa no financeiro. Quantidade e
  // dinheiro têm de andar juntos — e cada um uma vez só.
  await pagina.evaluate(() => {
    detailItem = 'i1'; $('btn-move-in').click();
    $('m-qty').value = '100';
    $('m-date').value = todayISO();
    $('m-cost').value = '5';   // por unidade: 100 kg × R$ 5,00 = R$ 500,00
    $('m-postfin').checked = true;
    $('m-postfin').dispatchEvent(new Event('change'));
  });
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => closeAllM());
  const entrou = await pagina.evaluate(() => ({
    qtd: qtyOf('i1'), moves: moves.length,
    lanc: bovT.length, valor: bovT[0] && bovT[0].amount,
    ehSaida: bovT[0] && bovT[0].type === 'saida',
    amarrado: bovT[0] && bovT[0].lock === 'stock'
  }));
  t.conferir('a entrada soma no estoque', entrou.qtd === 100 && entrou.moves === 1,
    `${entrou.qtd} kg · ${entrou.moves} movimentação(ões)`);
  t.conferir('e vira UMA despesa, com o valor da compra',
    entrou.lanc === 1 && entrou.valor === 500 && entrou.ehSaida,
    `${entrou.lanc} lançamento(s) de ${entrou.valor}`);
  t.conferir('amarrada à movimentação que a gerou', entrou.amarrado);

  await pagina.evaluate(() => {
    detailItem = 'i1'; $('btn-move-out').click();
    $('m-qty').value = '30'; $('m-date').value = todayISO();
  });
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => closeAllM());
  const saiu = await pagina.evaluate(() => ({ qtd: qtyOf('i1'), lanc: bovT.length }));
  t.conferir('a saída desconta do estoque', saiu.qtd === 70, `${saiu.qtd} kg`);
  // Consumir o que já foi comprado não é despesa nova: pagar duas vezes pelo
  // mesmo saco de sal é o erro clássico de controle de estoque.
  t.conferir('e NÃO cria despesa nova — o insumo já foi pago na compra',
    saiu.lanc === 1, `${saiu.lanc} lançamento(s)`);

  // ---------- excluir pesagem ----------
  t.secao('excluir pesagem');
  const pes = await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: 'BR001', cat: 'Boi' }];
    weighings = [
      { id: 'w1', animalId: 'a1', date: '2026-06-01', weight: 400 },
      { id: 'w2', animalId: 'a1', date: '2026-09-01', weight: 490 }
    ];
    tab = 'bovinos'; seg = 'rebanho'; detailAnimal = 'a1'; render();
    const antes = { n: wOf('a1').length, gmd: gmdTotal(wOf('a1')) };
    openWeighing('a1', weighings[1]);
    $('btn-delete-weighing').click();
    const depois = { n: wOf('a1').length, gmd: gmdTotal(wOf('a1')),
      fechou: [...document.querySelectorAll('.modal')].every(m => m.hidden),
      sobrou: weighings.map(w => w.id) };
    return { antes, depois };
  });
  t.conferir('a pesagem some da lista',
    pes.depois.n === 1 && pes.depois.sobrou.join(',') === 'w1',
    pes.depois.sobrou.join(','));
  t.conferir('a tela fecha sozinha', pes.depois.fechou);
  // Com uma pesagem só não há intervalo: GMD não pode ser inventado nem herdado.
  t.conferir('e o GMD some junto, em vez de ficar o antigo',
    pes.antes.gmd !== null && pes.depois.gmd === null,
    `antes ${pes.antes.gmd} · depois ${pes.depois.gmd}`);

  // ---------- desconectar o aparelho ----------
  // O defeito que esta bateria existe para pegar.
  t.secao('desconectar este aparelho');
  const desligar = await pagina.evaluate(() => {
    LS.s('fjs-farm', 'fazenda-de-teste');
    LS.s(ESPELHO, { farm: 'fazenda-de-teste', animals: [], weighings: [] });
    // A fila que o botão consulta é a da MEMÓRIA; o localStorage é só o lugar
    // onde ela sobrevive a fechar o aplicativo.
    pendentes = [{ col: 'animals', id: 'x', obj: { id: 'x' } }];
    guardarFila();
    LS.s('fjs-fbconfig', { apiKey: 'a', projectId: 'p' });
    // O clique recarrega a página; aqui interessa o que ele APAGA antes disso.
    const original = window.confirm;
    let perguntou = '';
    window.confirm = m => { perguntou = m; return true; };
    const recarregar = location.reload;
    location.reload = () => {};
    $('menu-leave').click();
    location.reload = recarregar;
    window.confirm = original;
    // O arranque usa isto para decidir se reconecta.
    const esp = LS.g(ESPELHO, null);
    return { perguntou,
      farm: LS.g('fjs-farm', null),
      espelho: esp && esp.farm,
      fila: (LS.g('fjs-pendentes', []) || []).length,
      cfg: LS.g('fjs-fbconfig', null),
      // A conta que o arranque faz. Se sobrar código aqui, o botão não fez nada.
      voltaria: LS.g('fjs-farm', null) || (esp && esp.farm) || null };
  });
  t.conferir('avisa que há alteração sem sinal que vai se perder',
    /não subiram|NÃO subiram/i.test(desligar.perguntou), desligar.perguntou.split('\n').pop());
  t.conferir('a frase não pede mais a configuração, que hoje vem embutida',
    !/colar a configuração/i.test(desligar.perguntou));
  t.conferir('apaga o código da fazenda', desligar.farm === null);
  t.conferir('apaga também o espelho, que é de onde o código voltava',
    desligar.espelho == null, String(desligar.espelho));
  // Fila sobrevivente subiria dentro da fazenda SEGUINTE.
  t.conferir('e esvazia a fila, para ela não vazar na próxima fazenda',
    desligar.fila === 0, String(desligar.fila));
  t.conferir('o aparelho realmente desconecta',
    desligar.voltaria === null, String(desligar.voltaria));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
