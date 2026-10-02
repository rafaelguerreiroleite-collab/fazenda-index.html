// Os seis avisos de duplicidade, disparando.
//
// Existia cobertura para o caso NEGATIVO — "compra de valor diferente no mesmo
// dia não é acusada de duplicata" — e nenhuma para o positivo. Ou seja:
// estava provado que o aviso não incomoda à toa, e não estava provado que ele
// aparece quando precisa.
//
// Isso é pior do que não ter aviso nenhum. Um guarda que nunca dispara faz a
// pessoa lançar com confiança justamente onde não deveria, e o lançamento
// dobrado entra calado. Aqui cada um dos seis é obrigado a disparar, a dizer o
// que encontrou, e a OBEDECER o "não" — porque aviso que salva mesmo quando se
// responde "não" é só um susto inútil.
//
// Nenhum deles BLOQUEIA, de propósito, com uma exceção: duplicata legítima
// existe (dois abastecimentos de mesmo valor no mesmo dia), e quem decide é
// quem está lançando. A exceção é o brinco repetido, que não é duplicidade de
// lançamento e sim dois animais com a mesma identidade — esse é recusado.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Avisos de duplicidade');

  // Captura o que foi perguntado e responde o que o teste mandar.
  const prepararResposta = async resposta => pagina.evaluate(r => {
    window.__perguntas = [];
    window.confirm = m => { window.__perguntas.push(m); return r; };
    window.alert = m => { window.__perguntas.push(m); };
  }, resposta);
  const perguntas = () => pagina.evaluate(() => window.__perguntas || []);

  const zerar = () => pagina.evaluate(() => {
    bovT = []; avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    pendentes = []; LS.s('fjs-ics-auto', false);
    tab = 'bovinos'; seg = 'financeiro'; render();
  });

  const lancar = async ({ valor, data, categoria, tipo }) => {
    await pagina.evaluate(d => {
      openTrans('bov');
      document.querySelector(`input[name="t-type"][value="${d.tipo || 'saida'}"]`).checked = true;
      $('t-date').value = d.data; $('t-amount').value = d.valor;
      $('t-category').value = d.categoria;
    }, { valor, data, categoria, tipo });
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => closeAllM());
  };

  // ---------- 1. lançamento financeiro repetido ----------
  t.secao('lançamento financeiro igual, no mesmo dia');
  await zerar();
  await prepararResposta(true);
  await lancar({ valor: '850', data: '2026-05-10', categoria: 'Ração/insumos' });
  const semAviso = await perguntas();
  t.conferir('o primeiro lançamento não incomoda ninguém', semAviso.length === 0,
    semAviso.join(' | '));

  await prepararResposta(false);
  await lancar({ valor: '850', data: '2026-05-10', categoria: 'Ração/insumos' });
  const q1 = await perguntas();
  const apos1 = await pagina.evaluate(() => bovT.length);
  t.conferir('o segundo igual dispara o aviso',
    q1.length === 1 && /DUPLICIDADE/.test(q1[0]), q1.join(' | ').slice(0, 60));
  t.conferir('o aviso diz o valor e a data do que já existe',
    /850,00/.test(q1[0]) && /10\/05\/2026/.test(q1[0]), q1[0] && q1[0].split('\n')[2]);
  // Obedecer o "não" é o que separa um aviso de um susto inútil.
  t.conferir('responder "não" NÃO lança', apos1 === 1, `${apos1} lançamento(s)`);

  await prepararResposta(true);
  await lancar({ valor: '850', data: '2026-05-10', categoria: 'Ração/insumos' });
  const apos2 = await pagina.evaluate(() => bovT.length);
  // Duplicata legítima existe: dois abastecimentos de mesmo valor no mesmo dia.
  t.conferir('responder "sim" lança, porque quem decide é quem está no campo',
    apos2 === 2, `${apos2} lançamento(s)`);

  // E o aviso não pode disparar à toa.
  await prepararResposta(true);
  await lancar({ valor: '851', data: '2026-05-10', categoria: 'Ração/insumos' });
  await lancar({ valor: '850', data: '2026-05-11', categoria: 'Ração/insumos' });
  await lancar({ valor: '850', data: '2026-05-10', categoria: 'Frete' });
  const falsos = await perguntas();
  t.conferir('valor, dia ou categoria diferente não é acusado de duplicata',
    falsos.length === 0, falsos.join(' | '));

  // ---------- 2. carnê parcelado repetido ----------
  // O que se digita é o total; o que fica gravado são as parcelas. Comparar um
  // com o outro nunca bate, e o carnê dobrado entra calado dobrando a dívida.
  t.secao('compra parcelada lançada duas vezes');
  await zerar();
  const parcelar = async () => {
    await pagina.evaluate(() => {
      openTrans('bov');
      document.querySelector('input[name="t-type"][value="saida"]').checked = true;
      $('t-date').value = '2026-06-01'; $('t-amount').value = '900';
      $('t-category').value = 'Equipamentos';
      $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
      $('t-venc').value = '2026-07-01';
      $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
    });
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => closeAllM());
  };
  await prepararResposta(true);
  await parcelar();
  await prepararResposta(false);
  await parcelar();
  const q2 = await perguntas();
  const nParc = await pagina.evaluate(() => bovT.length);
  t.conferir('o carnê repetido dispara o aviso',
    q2.length === 1 && /DUPLICIDADE/.test(q2[0]), q2.join(' | ').slice(0, 60));
  t.conferir('comparando o TOTAL com a soma das parcelas, não parcela com total',
    /900,00/.test(q2[0]) && /3 parcelas/.test(q2[0]), (q2[0] || '').split('\n').slice(2, 4).join(' · '));
  t.conferir('e "não" deixa o carnê com as 3 parcelas de sempre',
    nParc === 3, `${nParc} registros`);

  // ---------- 3. pesagem no mesmo dia ----------
  t.secao('pesagem repetida no mesmo dia');
  await zerar();
  await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: 'BR001', cat: 'Boi' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-08-01', weight: 400 }];
    render();
  });
  await prepararResposta(false);
  await pagina.evaluate(() => {
    openWeighing('a1');
    $('w-date').value = '2026-08-01';
    $('w-weight').value = '412';
  });
  await pagina.click('#form-weighing button[type="submit"]');
  await pagina.waitForTimeout(200);
  const q3 = await perguntas();
  const nPes = await pagina.evaluate(() => weighings.length);
  t.conferir('avisa que o animal já tem pesagem naquele dia',
    q3.length >= 1 && /DUPLICIDADE/.test(q3[0]), (q3[0] || '').split('\n')[2]);
  t.conferir('e manda corrigir a existente em vez de criar outra',
    /edite a pesagem existente/i.test(q3[0] || ''), '');
  t.conferir('"não" não cria a segunda pesagem', nPes === 1, String(nPes));

  // ---------- 4. brinco repetido ----------
  // Único que RECUSA: não é duplicidade de lançamento, são dois animais com a
  // mesma identidade — e aí todo peso e todo GMD passam a ser de quem?
  t.secao('brinco repetido no rebanho');
  await pagina.evaluate(() => { closeAllM(); });
  await prepararResposta(true);
  await pagina.evaluate(() => { openAnimal(); $('an-ident').value = 'BR001'; });
  await pagina.click('#form-animal button[type="submit"]');
  await pagina.waitForTimeout(200);
  const nAnimais = await pagina.evaluate(() => ({
    n: animals.length, aviso: $('toast').textContent }));
  t.conferir('o brinco repetido é RECUSADO, não só avisado',
    nAnimais.n === 1, `${nAnimais.n} animal(is)`);
  t.conferir('e a tela diz por quê',
    /já existe animal ativo/i.test(nAnimais.aviso), nAnimais.aviso);

  // ---------- 5. venda de animal já lançada ----------
  t.secao('venda do animal já lançada no financeiro');
  await zerar();
  await pagina.evaluate(() => {
    animals = [{ id: 'a1', ident: 'BR001', cat: 'Boi' }];
    bovT = [{ id: 'm1', date: '2026-09-01', type: 'entrada', amount: 7000,
      category: 'Venda de gado', notes: 'lançada à mão' }];
    render();
  });
  await prepararResposta(false);
  await pagina.evaluate(() => {
    openAnimal(animals[0]);
    $('an-sold').checked = true; syncSoldWrap();
    $('an-sold-date').value = '2026-09-01';
    $('an-sold-weight').value = '480';
    $('an-sold-price').value = '7000';
  });
  await pagina.click('#form-animal button[type="submit"]');
  await pagina.waitForTimeout(250);
  const q5 = await perguntas();
  const aposVenda = await pagina.evaluate(() => ({
    lanc: bovT.length, vendido: !!animals[0].sold }));
  t.conferir('avisa que aquela venda já parece estar no Financeiro',
    q5.some(m => /DUPLICIDADE/.test(m) && /já parece estar lançada/.test(m)),
    (q5[0] || '').split('\n')[2]);
  // Aqui o "não" tem efeito diferente, e o aviso avisa disso: o animal é
  // marcado como vendido de qualquer jeito; o que não se cria é o lançamento.
  t.conferir('e não cria um segundo lançamento da mesma venda',
    aposVenda.lanc === 1, `${aposVenda.lanc} lançamento(s)`);

  // ---------- 6. movimentação de estoque repetida ----------
  t.secao('movimentação de estoque repetida');
  await zerar();
  await pagina.evaluate(() => {
    items = [{ id: 'i1', name: 'Sal mineral', unit: 'kg' }];
    moves = [{ id: 'mv1', itemId: 'i1', type: 'entrada', qty: 50, date: '2026-07-10' }];
    detailItem = 'i1'; seg = 'estoque'; render();
  });
  await prepararResposta(false);
  await pagina.evaluate(() => {
    openMove('i1', 'entrada');
    $('m-qty').value = '50'; $('m-date').value = '2026-07-10';
    $('m-postfin').checked = false;
  });
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(200);
  const q6 = await perguntas();
  const nMov = await pagina.evaluate(() => moves.length);
  t.conferir('avisa que já há movimentação igual naquele dia',
    q6.some(m => /DUPLICIDADE/.test(m)), (q6[0] || '').split('\n')[2]);
  t.conferir('"não" não duplica a movimentação', nMov === 1, String(nMov));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
