// A CONFERÊNCIA DO QUE JÁ FOI LANÇADO.
//
// Pergunta do dono: "verificar o que já foi lançado, se precisa de correção".
//
// A correção da leitura ("10.000" é dez mil, não R$ 10,00) vale de agora em
// diante. O que foi lançado antes está salvo com o número que foi lido na
// hora, e nenhum código sabe hoje o que o dedo quis dizer então — quem sabe é
// o dono. Então a tela não pode nem corrigir sozinha nem calar: ela aponta, e
// ele decide.
//
// Esta bateria cobra as duas coisas que uma tela assim tem de acertar:
//
//   1. ACHAR o que caiu na armadilha, sem deixar passar;
//   2. NÃO acusar o que está certo — uma lista cheia de alarme falso é uma
//      lista que ninguém lê, e aí o erro de verdade passa no meio.
//
// E a correção: um toque, com o de→para escrito antes; carnê inteiro de uma
// vez; e o que foi gerado por outra coisa (compra de estoque, venda de animal)
// se conserta na origem, nunca pelo reflexo.
import { servir, abrirApp, placar } from './apoio.mjs';

const LINHAS = `(function () {
  const ler = sel => [...document.querySelectorAll(sel)].map(l => ({
    quem: l.querySelector('.cv-quem b').textContent,
    valor: l.querySelector('.cv-valor').textContent,
    botao: l.querySelector('button').textContent,
    grave: l.classList.contains('cv-grave')
  }));
  return { todas: ler('#cv-resultado .cv-linha'), graves: ler('#cv-resultado .cv-linha.cv-grave'),
    limpo: !!document.querySelector('#cv-limpo, .cv-limpo'),
    texto: $('cv-resultado').textContent.replace(/\\s+/g, ' ') };
})()`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  pagina.on('dialog', d => d.accept().catch(() => {}));
  const t = placar('Conferir valores já lançados');

  // O cenário tem de ter as duas coisas lado a lado: o que caiu na armadilha e
  // o que está certo. Separar um do outro é o trabalho inteiro desta tela.
  await pagina.evaluate(() => {
    animals = [
      { id: 'a1', ident: '101', cat: 'Boi', entryDate: '2026-01-10', entryWeight: 300 },
      { id: 'a2', ident: '102', cat: 'Boi', sold: true, soldDate: '2026-05-20', soldPrice: 12 },
      { id: 'a3', ident: '103', cat: 'Boi', sold: true, soldDate: '2026-05-21', soldPrice: 9800 }
    ];
    weighings = [
      { id: 'w1', animalId: 'a1', date: '2026-03-01', weight: 410, jejum: false },
      { id: 'w2', animalId: 'a1', date: '2026-04-01', weight: 1.5, jejum: false },
      { id: 'w3', animalId: 'a3', date: '2026-04-01', weight: 480, jejum: false }
    ];
    bovT = [
      // caiu na armadilha: "12.345" lido como decimal
      { id: 't1', date: '2026-06-01', type: 'saida', amount: 12.345, category: 'Ração/insumos', notes: 'milho' },
      // caiu na armadilha: "10.000" lido como R$ 10,00
      { id: 't2', date: '2026-06-02', type: 'saida', amount: 10, category: 'Mão de obra', notes: 'vaqueiro' },
      // carnê inteiro torto: "3.750" em 3×
      { id: 't3', date: '2026-06-03', type: 'saida', amount: 1.25, category: 'Medicamentos/vacinas', grupo: 'g1', parcela: 1, parcelas: 3, venc: '2026-07-03' },
      { id: 't4', date: '2026-06-03', type: 'saida', amount: 1.25, category: 'Medicamentos/vacinas', grupo: 'g1', parcela: 2, parcelas: 3, venc: '2026-08-03' },
      { id: 't5', date: '2026-06-03', type: 'saida', amount: 1.25, category: 'Medicamentos/vacinas', grupo: 'g1', parcela: 3, parcelas: 3, venc: '2026-09-03' },
      // estes estão CERTOS e não podem aparecer na lista
      { id: 't6', date: '2026-06-04', type: 'saida', amount: 1250.5, category: 'Frete' },
      { id: 't7', date: '2026-06-05', type: 'entrada', amount: 98000, category: 'Venda de gado' },
      { id: 't8', date: '2026-06-06', type: 'saida', amount: 150, category: 'Combustível' },
      // reflexo de uma compra de estoque: não se conserta por aqui
      { id: 't9', date: '2026-06-07', type: 'saida', amount: 14, category: 'Ração/insumos', lock: 'stock' },
      // reflexo da venda do animal a2
      { id: 't10', date: '2026-05-20', type: 'entrada', amount: 12, category: 'Venda de gado', lock: 'animal' }
    ];
    avT = []; gerT = []; atividades = []; extraT = {}; recomputarLivros();
    items = [{ id: 'i1', name: 'Proteinado 30%', unit: 'kg' }, { id: 'i2', name: 'Sal mineral', unit: 'kg' }];
    moves = [
      // compra torta: o total não chega a R$ 100
      { id: 'm1', itemId: 'i1', date: '2026-06-07', type: 'entrada', qty: 40, cost: 0.35, linkTrans: 't9' },
      // compra CERTA de sal: preço unitário baixo de verdade, total alto
      { id: 'm2', itemId: 'i2', date: '2026-06-08', type: 'entrada', qty: 500, cost: 3.5 },
      // saída não tem valor: não entra na conferência
      { id: 'm3', itemId: 'i2', date: '2026-06-09', type: 'saida', qty: 30 }
    ];
    salvarEspelho(true); render();
  });

  await pagina.evaluate(() => { closeAllM(); renderConferir(); openM('modal-conferir'); });
  await pagina.waitForTimeout(150);
  const r = await pagina.evaluate(LINHAS);

  t.secao('acha o que caiu na armadilha');
  const tem = txt => r.todas.some(l => l.quem.indexOf(txt) >= 0);
  t.conferir('o centavo de três casas aparece', tem('milho'), r.todas.map(l => l.quem).join(' | '));
  t.conferir('o lançamento de R$ 10,00 aparece', tem('vaqueiro'));
  t.conferir('o carnê aparece', r.todas.some(l => /Medicamentos/.test(l.quem)));
  t.conferir('a compra de estoque de R$ 14 no total aparece', tem('Proteinado 30%'));
  t.conferir('a venda de animal por R$ 12 aparece', tem('Venda do animal 102'));
  t.conferir('a pesagem de 1,5 kg aparece', tem('Pesagem de 101'));

  t.secao('e não acusa o que está certo');
  const naoTem = txt => !r.todas.some(l => l.quem.indexOf(txt) >= 0);
  t.conferir('R$ 1.250,50 de frete fica fora', naoTem('Frete'), r.texto.slice(0, 120));
  t.conferir('a venda de R$ 98.000 fica fora', naoTem('Venda de gado'));
  t.conferir('R$ 150 de combustível fica fora', naoTem('Combustível'));
  t.conferir('a compra de sal — R$ 3,50/kg, R$ 1.750 no total — fica fora',
    naoTem('Sal mineral'), 'preço unitário baixo não é erro');
  t.conferir('a pesagem de 410 kg fica fora', naoTem('Pesagem de 103'));
  t.conferir('a venda de R$ 9.800 fica fora', naoTem('Venda do animal 103'));
  // O reflexo da compra e o da venda não podem virar uma segunda linha: duas
  // linhas para o mesmo erro faria o dono corrigir duas vezes — e dobrar.
  t.conferir('o lançamento gerado pelo estoque não vira linha própria',
    r.todas.filter(l => /Ração\/insumos/.test(l.quem)).length === 1,
    r.todas.filter(l => /Ração\/insumos/.test(l.quem)).map(l => l.quem).join(' | '));
  t.conferir('o lançamento gerado pela venda do animal também não',
    r.todas.filter(l => /Venda de gado/.test(l.quem)).length === 0);

  t.secao('separa o impossível do duvidoso');
  t.conferir('centavo de três casas é impossível, não "vale conferir"',
    r.graves.some(l => /milho/.test(l.quem)), r.graves.map(l => l.quem).join(' | '));
  t.conferir('bovino de 1,5 kg também', r.graves.some(l => /Pesagem de 101/.test(l.quem)));
  t.conferir('R$ 10,00 de mão de obra é só duvidoso',
    !r.graves.some(l => /vaqueiro/.test(l.quem)));
  t.conferir('a tela diz quanto procurou e por quê',
    /impossível/i.test(r.texto) && /conferir/i.test(r.texto), r.texto.slice(0, 90));

  t.secao('o que se conserta na origem não oferece atalho');
  const botao = txt => (r.todas.find(l => l.quem.indexOf(txt) >= 0) || {}).botao || '';
  t.conferir('a compra de estoque manda abrir a movimentação', /Abrir/.test(botao('Proteinado')), botao('Proteinado'));
  t.conferir('a venda do animal manda abrir o cadastro', /Abrir/.test(botao('Venda do animal 102')));
  t.conferir('a pesagem manda abrir a pesagem', /Abrir/.test(botao('Pesagem de 101')));
  t.conferir('o lançamento comum oferece o × 1.000', /1\.000/.test(botao('vaqueiro')), botao('vaqueiro'));
  t.conferir('e o carnê avisa que corrige as 3 parcelas de uma vez',
    /3 parcelas/.test(r.todas.find(l => /Medicamentos/.test(l.quem)).botao),
    r.todas.find(l => /Medicamentos/.test(l.quem)).botao);
  t.conferir('o carnê aparece numa linha só, não em três',
    r.todas.filter(l => /Medicamentos/.test(l.quem)).length === 1);

  t.secao('corrigir um lançamento');
  // Sem nuvem de propósito: a correção tem de passar pelo mesmo caminho seguro
  // de qualquer lançamento. Quem corrige um valor errado é bem capaz de estar
  // fazendo isso no celular, longe do sinal, olhando a lista.
  await pagina.evaluate(() => { db = null; pendentes = []; guardarFila(); });
  await pagina.click('[data-cv-mil="t2"]');
  await pagina.waitForTimeout(200);
  const depois = await pagina.evaluate(() => ({
    valor: bovT.find(x => x.id === 't2').amount,
    espelho: JSON.parse(localStorage.getItem('fjs-espelho')).bovT.find(x => x.id === 't2').amount,
    fila: (pendentes.find(p => p.id === 't2') || {}).obj
  }));
  t.conferir('R$ 10,00 virou R$ 10.000,00', depois.valor === 10000, String(depois.valor));
  t.conferir('a correção foi guardada no aparelho', depois.espelho === 10000, String(depois.espelho));
  t.conferir('e entrou na fila para subir, como todo o resto',
    depois.fila && depois.fila.amount === 10000, depois.fila ? String(depois.fila.amount) : 'sem op na fila');
  t.conferir('e a linha sai da lista na hora',
    !(await pagina.evaluate(LINHAS)).todas.some(l => /vaqueiro/.test(l.quem)));

  t.secao('corrigir um carnê inteiro');
  await pagina.click('[data-cv-mil="t3"]');
  await pagina.waitForTimeout(200);
  const carne = await pagina.evaluate(() => bovT.filter(x => x.grupo === 'g1').map(x => x.amount));
  t.conferir('as 3 parcelas foram multiplicadas, não só a primeira',
    carne.length === 3 && carne.every(v => v === 1250), carne.join(' · '));
  t.conferir('e o carnê continua somando 3× a parcela, sem sobra de centavo',
    Math.abs(carne.reduce((a, b) => a + b, 0) - 3750) < 1e-9, carne.reduce((a, b) => a + b, 0).toFixed(2));
  const naFila = await pagina.evaluate(() =>
    ['t3', 't4', 't5'].every(id => pendentes.some(p => p.id === id && p.obj.amount === 1250)));
  t.conferir('as 3 entraram na fila', naFila);

  t.secao('× 1.000 não cria centavo torto');
  // 0,07 × 1000 em ponto flutuante dá 70,00000000000001. Um centavo torto
  // dentro do lançamento é exatamente o tipo de sujeira que ninguém acha depois.
  const redondos = await pagina.evaluate(() =>
    [0.07, 1.25, 12.345, 0.01, 3.5, 999.999].map(v => vezesMil(v)));
  t.conferir('os valores saem redondos no centavo',
    redondos.every(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9), redondos.join(' · '));
  t.conferir('e valem mil vezes mais', redondos[0] === 70 && redondos[1] === 1250
    && redondos[2] === 12345 && redondos[5] === 999999, redondos.join(' · '));

  t.secao('abrir conserta na origem');
  await pagina.click('[data-cv-abrir="pesagem"]');
  await pagina.waitForTimeout(200);
  const aberta = await pagina.evaluate(() => ({
    modal: !$('modal-weighing').hidden, peso: $('w-weight').value,
    conferir: $('modal-conferir').hidden
  }));
  t.conferir('tocar em Abrir leva à pesagem errada, já preenchida',
    aberta.modal && aberta.peso === '1,5', `modal ${aberta.modal} · peso ${aberta.peso}`);
  t.conferir('e a tela de conferência sai da frente', aberta.conferir === true);
  await pagina.evaluate(() => { $('w-weight').value = '415'; });
  await pagina.click('#form-weighing button[type="submit"]');
  await pagina.waitForTimeout(200);
  t.conferir('corrigida ali, a pesagem sai da conferência',
    await pagina.evaluate(() => { renderConferir(); return !$('cv-resultado').textContent.includes('Pesagem de 101'); }));

  t.secao('o menu avisa que tem o que conferir');
  const noMenu = await pagina.evaluate(() => {
    closeAllM();
    bovT = [{ id: 'z1', date: '2026-06-01', type: 'saida', amount: 12.345, category: 'Frete' },
            { id: 'z2', date: '2026-06-02', type: 'saida', amount: 40, category: 'Mão de obra' }];
    avT = []; gerT = []; recomputarLivros();
    animals = []; weighings = []; items = []; moves = [];
    $('btn-menu').click();
    const com = { rot: $('menu-conferir-rot').textContent, destaque: $('menu-conferir').classList.contains('cv-tem') };
    bovT = [{ id: 'z3', date: '2026-06-01', type: 'saida', amount: 1250, category: 'Frete' }];
    recomputarLivros(); rotuloConferir();
    const sem = { rot: $('menu-conferir-rot').textContent, destaque: $('menu-conferir').classList.contains('cv-tem') };
    closeAllM();
    return { com, sem };
  });
  t.conferir('com 2 valores suspeitos, o menu mostra o número',
    /\(2\)/.test(noMenu.com.rot) && noMenu.com.destaque, noMenu.com.rot);
  // Alarme em quem não tem nada a corrigir é alarme que ensina a ignorar.
  t.conferir('sem nada suspeito, o menu não alarma nada',
    !/\(/.test(noMenu.sem.rot) && !noMenu.sem.destaque, noMenu.sem.rot);

  t.secao('fazenda sem nada errado');
  const limpo = await pagina.evaluate(() => {
    bovT = [{ id: 'x1', date: '2026-06-01', type: 'saida', amount: 1250.5, category: 'Frete' }];
    avT = []; gerT = []; recomputarLivros();
    animals = [{ id: 'a1', ident: '101' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-03-01', weight: 410 }];
    items = []; moves = [];
    renderConferir();
    return $('cv-resultado').textContent.replace(/\s+/g, ' ');
  });
  t.conferir('a tela diz claramente que está tudo certo',
    /Nada fora do lugar/.test(limpo), limpo.slice(0, 90));
  t.conferir('e diz quantos registros conferiu, para não parecer que não olhou',
    /1 lançamento/.test(limpo) && /1 pesagem/.test(limpo), limpo.slice(0, 160));
  t.conferir('sem nenhuma linha de alarme', (await pagina.evaluate(LINHAS)).todas.length === 0);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
