// O RITMO DAS PARCELAS.
//
// Pedido do dono: "no pagamento a prazo ter opção para escolher data das
// parcelas ou opção para ser a cada 30 dias".
//
// Até aqui o carnê só sabia um ritmo: mesmo dia do mês seguinte, o ritmo do
// boleto. Só que o acerto do curral quase nunca é assim. "A cada trinta dias"
// anda com o calendário e descola do dia do mês — 31/01 vira 02/03, não 28/02.
// E compra combinada no leilão vem com data a data, cada uma onde deu.
//
// Impor o dia do mês a esses dois casos não era só incômodo: obrigava a abrir
// cada parcela depois de salvar e corrigir o vencimento uma por uma. Quem
// esquecesse uma ficava com o aviso do calendário tocando no dia errado, e com
// a conta no "A pagar" vencendo quando não era para vencer.
//
// Esta bateria confere as três coisas que um ritmo de parcela tem de acertar:
//
//   1. as DATAS saem onde foram pedidas, nos três ritmos;
//   2. o DINHEIRO não muda por causa do ritmo — a soma das parcelas continua
//      sendo o total, e nenhuma parcela a mais nasce no caminho;
//   3. a tela RECUSA o que não dá para cobrar: parcela sem data, ou parcela
//      que vence antes da anterior.
//
// E o caso que estraga tudo em silêncio: reabrir uma compra parcelada com
// datas combinadas e tocar em Salvar. Salvar refaz o carnê do zero — se a tela
// voltasse sempre em "todo mês", as datas combinadas seriam reescritas sem
// ninguém ver.
import { servir, abrirApp, placar } from './apoio.mjs';

// Contas de data feitas AQUI, sem usar as funções do aplicativo: conferir o
// app com o próprio app não confere nada.
const iso = d => d.toISOString().slice(0, 10);
const maisDias = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1, d + n)));
};
const maisMeses = (s, k) => {
  const [y, m, d] = s.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1 + k, Math.min(d, ultimo))));
};

const LIMPAR = `(function () {
  bovT = []; avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
  pendentes = []; atividades = []; extraT = {}; recomputarLivros();
  LS.s('fjs-ics-auto', false);
  LS.s('fjs-ics-visto', true);
  tab = 'bovinos'; seg = 'financeiro'; render();
})()`;

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const avisos = [];
  pagina.on('dialog', d => { avisos.push(d.message().replace(/\s+/g, ' ')); d.accept().catch(() => {}); });
  const t = placar('Ritmo das parcelas');

  // Lança um carnê pelo financeiro, no ritmo pedido. Devolve as parcelas que
  // ficaram gravadas, em ordem de vencimento.
  const lancar = async ({ valor, parcelas, data, venc, ritmo, datas, notes }) => {
    await pagina.evaluate(d => {
      openTrans('bov', null);
      document.querySelector('input[name="t-type"][value="saida"]').checked = true;
      $('t-date').value = d.data;
      $('t-amount').value = d.valor;
      $('t-category').value = 'Ração/insumos';
      $('t-notes').value = d.notes || '';
      $('t-prazo').checked = true;
      $('t-prazo').dispatchEvent(new Event('change'));
      $('t-venc').value = d.venc;
      $('t-parcelas').value = String(d.parcelas);
      $('t-parcelas').dispatchEvent(new Event('input'));
      $('t-ritmo').value = d.ritmo;
      $('t-ritmo').dispatchEvent(new Event('change'));
      if (d.datas) {
        $('t-datas').querySelectorAll('.pd-data').forEach(el => {
          const i = Number(el.dataset.parcela);
          if (d.datas[i] !== undefined) el.value = d.datas[i];
        });
        $('t-datas').dispatchEvent(new Event('input'));
      }
    }, { valor, parcelas, data, venc, ritmo, datas, notes });
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => closeAllM());
    return pagina.evaluate(nt => bovT.filter(x => x.notes === nt)
      .sort((a, b) => a.parcela - b.parcela)
      .map(x => ({ venc: x.venc, valor: x.amount, parcela: x.parcela, parcelas: x.parcelas, grupo: x.grupo })),
      notes || '');
  };

  // ---------- 1. todo mês, no mesmo dia (o de sempre) ----------
  // Primeiro o que já funcionava: ritmo novo que mude o antigo de lugar seria
  // consertar uma coisa quebrando outra.
  t.secao('todo mês, no mesmo dia');
  await pagina.evaluate(LIMPAR);
  const mes = await lancar({ valor: '3.000', parcelas: 3, data: '2026-01-31', venc: '2026-01-31', ritmo: 'mes', notes: 'mensal' });
  t.conferir('3 parcelas, nem mais nem menos', mes.length === 3, mes.length + ' parcela(s)');
  t.conferir('cada uma no mesmo dia do mês seguinte',
    mes.map(p => p.venc).join(' · ') === [0, 1, 2].map(k => maisMeses('2026-01-31', k)).join(' · '),
    mes.map(p => p.venc).join(' · '));
  t.conferir('e dia 31 em mês de 28 cai no último dia, como faz o boleto',
    mes[1].venc === '2026-02-28', mes[1].venc);
  t.conferir('somando R$ 3.000, não R$ 3.000 por parcela',
    Math.abs(mes.reduce((a, p) => a + p.valor, 0) - 3000) < 1e-9,
    'R$ ' + mes.reduce((a, p) => a + p.valor, 0).toFixed(2));

  // ---------- 2. a cada 30 dias ----------
  t.secao('a cada 30 dias');
  await pagina.evaluate(LIMPAR);
  const trinta = await lancar({ valor: '3.000', parcelas: 3, data: '2026-01-31', venc: '2026-01-31', ritmo: '30', notes: 'trinta' });
  t.conferir('as datas andam de 30 em 30 dias, pelo calendário',
    trinta.map(p => p.venc).join(' · ') === [0, 1, 2].map(k => maisDias('2026-01-31', 30 * k)).join(' · '),
    trinta.map(p => p.venc).join(' · '));
  // É exatamente aqui que os dois ritmos deixam de ser a mesma coisa, e é por
  // isso que o pedido existe: 30 dias depois de 31/01 é março, não fevereiro.
  t.conferir('e isso NÃO é o mesmo que mês a mês',
    trinta[1].venc !== mes[1].venc && trinta[1].venc === '2026-03-02',
    `30 dias: ${trinta[1].venc} · mês a mês: ${mes[1].venc}`);
  t.conferir('o dinheiro não mudou por causa do ritmo',
    Math.abs(trinta.reduce((a, p) => a + p.valor, 0) - 3000) < 1e-9
    && trinta.length === 3, `${trinta.length} × somando R$ ${trinta.reduce((a, p) => a + p.valor, 0).toFixed(2)}`);

  // ---------- 3. escolher cada data ----------
  t.secao('escolher cada data');
  await pagina.evaluate(LIMPAR);
  const caixas = await pagina.evaluate(() => {
    openTrans('bov', null);
    $('t-amount').value = '3.000'; $('t-date').value = '2026-01-10';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-02-10';
    $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
    const escondidoAntes = $('t-datas').hidden;
    $('t-ritmo').value = 'livre'; $('t-ritmo').dispatchEvent(new Event('change'));
    const campos = [...$('t-datas').querySelectorAll('.pd-data')]
      .map(el => ({ parcela: Number(el.dataset.parcela), valor: el.value }));
    const rotulos = [...$('t-datas').querySelectorAll('label')].map(l => l.textContent);
    closeAllM();
    return { escondidoAntes, campos, rotulos };
  });
  t.conferir('em "todo mês" não aparece caixa de data nenhuma', caixas.escondidoAntes === true);
  t.conferir('escolhendo "cada data", aparece uma caixa por parcela, da 2ª em diante',
    caixas.campos.length === 2 && caixas.campos[0].parcela === 1 && caixas.campos[1].parcela === 2,
    caixas.campos.map(c => c.parcela).join(' · '));
  t.conferir('com o nome da parcela em cada uma, para não trocar as datas de lugar',
    caixas.rotulos.join(' · ') === '2ª parcela · 3ª parcela', caixas.rotulos.join(' · '));
  // Nascer em branco faria o dono digitar três datas para mudar uma.
  t.conferir('já vêm preenchidas com o padrão mensal, prontas para ajustar',
    caixas.campos[0].valor === maisMeses('2026-02-10', 1)
    && caixas.campos[1].valor === maisMeses('2026-02-10', 2),
    caixas.campos.map(c => c.valor).join(' · '));

  const livre = await lancar({ valor: '3.000', parcelas: 3, data: '2026-01-10', venc: '2026-02-10',
    ritmo: 'livre', datas: { 1: '2026-04-05', 2: '2026-09-30' }, notes: 'combinado' });
  t.conferir('as parcelas saem exatamente nas datas combinadas',
    livre.map(p => p.venc).join(' · ') === '2026-02-10 · 2026-04-05 · 2026-09-30',
    livre.map(p => p.venc).join(' · '));
  t.conferir('a 1ª continua sendo o "1º vencimento" do formulário',
    livre[0].venc === '2026-02-10', livre[0].venc);
  t.conferir('e o dinheiro segue intacto: 3 parcelas somando R$ 3.000',
    livre.length === 3 && Math.abs(livre.reduce((a, p) => a + p.valor, 0) - 3000) < 1e-9,
    `${livre.length} × somando R$ ${livre.reduce((a, p) => a + p.valor, 0).toFixed(2)}`);
  t.conferir('as três são do mesmo carnê',
    new Set(livre.map(p => p.grupo)).size === 1 && livre.every(p => p.parcelas === 3));

  // ---------- 4. o que a tela recusa ----------
  // Parcela sem vencimento deixa de ser conta a pagar: sai do "A pagar" e do
  // calendário sem avisar. Parcela que vence antes da anterior é erro de dedo
  // que só apareceria na hora da cobrança.
  t.secao('o que a tela recusa');
  await pagina.evaluate(LIMPAR);
  const recusa = async datas => {
    await pagina.evaluate(d => {
      openTrans('bov', null);
      $('t-date').value = '2026-01-10'; $('t-amount').value = '1.200';
      $('t-category').value = 'Frete'; $('t-notes').value = 'recusa';
      $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
      $('t-venc').value = '2026-02-10';
      $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
      $('t-ritmo').value = 'livre'; $('t-ritmo').dispatchEvent(new Event('change'));
      $('t-datas').querySelectorAll('.pd-data').forEach(el => {
        const i = Number(el.dataset.parcela);
        if (d[i] !== undefined) el.value = d[i];
      });
    }, datas);
    await pagina.click('#form-transaction button[type="submit"]');
    await pagina.waitForTimeout(200);
    const r = await pagina.evaluate(() => ({
      salvou: bovT.some(x => x.notes === 'recusa'),
      aviso: $('toast').textContent, aberto: !$('modal-transaction').hidden }));
    await pagina.evaluate(() => closeAllM());
    return r;
  };
  const vazia = await recusa({ 1: '' });
  t.conferir('data em branco não salva', vazia.salvou === false);
  t.conferir('e a tela diz QUAL parcela está sem data',
    /2ª parcela/.test(vazia.aviso), vazia.aviso);
  t.conferir('o formulário fica aberto, com o que foi digitado', vazia.aberto === true);

  const foraDeOrdem = await recusa({ 1: '2026-05-10', 2: '2026-03-01' });
  t.conferir('parcela que vence antes da anterior não salva', foraDeOrdem.salvou === false);
  t.conferir('e a tela explica o que está fora de ordem',
    /antes/.test(foraDeOrdem.aviso) && /3ª parcela/.test(foraDeOrdem.aviso), foraDeOrdem.aviso);
  // Mesma data duas vezes é estranho, mas não é erro: pode ser acerto de duas
  // metades no mesmo dia. Recusar isso seria inventar regra.
  const mesmoDia = await recusa({ 1: '2026-03-10', 2: '2026-03-10' });
  t.conferir('duas parcelas no mesmo dia são aceitas — não são erro', mesmoDia.salvou === true);

  // ---------- 5. o resumo mostra as datas antes de salvar ----------
  t.secao('o resumo antes de salvar');
  await pagina.evaluate(LIMPAR);
  const resumos = await pagina.evaluate(() => {
    const ler = () => $('t-parcelas-nota').textContent.replace(/\s+/g, ' ');
    openTrans('bov', null);
    $('t-amount').value = '3.000'; $('t-date').value = '2026-01-10';
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-01-31';
    $('t-parcelas').value = '1'; $('t-parcelas').dispatchEvent(new Event('input'));
    const uma = { texto: ler(), ritmoEscondido: $('t-ritmo-wrap').hidden };
    $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
    const tres = { texto: ler(), ritmoEscondido: $('t-ritmo-wrap').hidden };
    $('t-ritmo').value = '30'; $('t-ritmo').dispatchEvent(new Event('change'));
    const t30 = ler();
    $('t-parcelas').value = '12'; $('t-parcelas').dispatchEvent(new Event('input'));
    const doze = ler();
    closeAllM();
    return { uma, tres, t30, doze };
  });
  t.conferir('com uma parcela só, o ritmo não aparece — não há o que espaçar',
    resumos.uma.ritmoEscondido === true && resumos.uma.texto === '', resumos.uma.texto);
  t.conferir('com três, o ritmo aparece', resumos.tres.ritmoEscondido === false);
  t.conferir('o resumo mostra o valor da prestação e TODAS as datas',
    /3× de R\$ 1\.000,00/.test(resumos.tres.texto)
    && /31\/01\/26/.test(resumos.tres.texto) && /28\/02\/26/.test(resumos.tres.texto)
    && /31\/03\/26/.test(resumos.tres.texto), resumos.tres.texto);
  t.conferir('trocar para 30 dias muda as datas do resumo na hora',
    /02\/03\/26/.test(resumos.t30) && !/28\/02\/26/.test(resumos.t30), resumos.t30);
  t.conferir('com 12 parcelas mostra a primeira e a última, para não virar parede de texto',
    /1ª em/.test(resumos.doze) && /última em/.test(resumos.doze), resumos.doze);

  // ---------- 6. o calendário leva as datas escolhidas ----------
  // O lembrete no celular é o motivo de tudo isso: data errada no carnê é
  // alarme tocando no dia errado, e é ele que faz a conta ser paga.
  t.secao('o calendário leva as datas escolhidas');
  await pagina.evaluate(LIMPAR);
  await lancar({ valor: '3.000', parcelas: 3, data: '2026-01-10', venc: '2026-02-10',
    ritmo: 'livre', datas: { 1: '2026-04-05', 2: '2026-09-30' }, notes: 'agenda' });
  const ics = await pagina.evaluate(() => agendaICS(contasParaAgenda()));
  const datasICS = (ics.match(/DTSTART;VALUE=DATE:(\d{8})/g) || []).map(x => x.slice(-8));
  t.conferir('as três contas entraram no calendário nas datas combinadas',
    datasICS.join(' · ') === '20260210 · 20260405 · 20260930', datasICS.join(' · '));

  // ---------- 7. compra de estoque a prazo ----------
  t.secao('compra de estoque a prazo');
  await pagina.evaluate(LIMPAR);
  await pagina.evaluate(() => {
    items = [{ id: 'i1', name: 'Proteinado 30%', unit: 'kg' }];
    render();
  });
  const compra = async (ritmo, datas) => {
    await pagina.evaluate(d => {
      openMove('i1', 'entrada', null);
      $('m-date').value = '2026-01-10';
      $('m-qty').value = '1.000'; $('m-cost').value = '3';
      $('m-notes').value = 'carnê estoque';
      $('m-postfin').checked = true;
      $('m-prazo').checked = true; $('m-prazo').dispatchEvent(new Event('change'));
      $('m-venc').value = '2026-02-10';
      $('m-parcelas').value = '3'; $('m-parcelas').dispatchEvent(new Event('input'));
      $('m-ritmo').value = d.ritmo; $('m-ritmo').dispatchEvent(new Event('change'));
      if (d.datas) {
        $('m-datas').querySelectorAll('.pd-data').forEach(el => {
          const i = Number(el.dataset.parcela);
          if (d.datas[i] !== undefined) el.value = d.datas[i];
        });
      }
    }, { ritmo, datas });
    await pagina.click('#form-move button[type="submit"]');
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => closeAllM());
    return pagina.evaluate(() => bovT.filter(x => x.lock === 'stock')
      .sort((a, b) => a.parcela - b.parcela).map(x => ({ venc: x.venc, valor: x.amount })));
  };
  const estoque30 = await compra('30');
  t.conferir('a compra de ração em 3× a cada 30 dias sai nas datas certas',
    estoque30.map(p => p.venc).join(' · ') === [0, 1, 2].map(k => maisDias('2026-02-10', 30 * k)).join(' · '),
    estoque30.map(p => p.venc).join(' · '));
  t.conferir('e soma o total da compra: 1.000 kg × R$ 3,00 = R$ 3.000',
    Math.abs(estoque30.reduce((a, p) => a + p.valor, 0) - 3000) < 1e-9,
    'R$ ' + estoque30.reduce((a, p) => a + p.valor, 0).toFixed(2));

  // O caso que estraga em silêncio: reabrir a compra e salvar de novo.
  t.secao('reabrir a compra não reescreve as datas combinadas');
  await pagina.evaluate(LIMPAR);
  await pagina.evaluate(() => { items = [{ id: 'i1', name: 'Proteinado 30%', unit: 'kg' }]; render(); });
  const combinada = await compra('livre', { 1: '2026-05-20', 2: '2026-11-07' });
  t.conferir('as datas combinadas valem para a compra de estoque também',
    combinada.map(p => p.venc).join(' · ') === '2026-02-10 · 2026-05-20 · 2026-11-07',
    combinada.map(p => p.venc).join(' · '));
  const reaberta = await pagina.evaluate(() => {
    const m = moves.find(x => x.notes === 'carnê estoque');
    openMove(m.itemId, m.type, m);
    const r = { ritmo: $('m-ritmo').value,
      campos: [...$('m-datas').querySelectorAll('.pd-data')].map(el => el.value) };
    closeAllM();
    return r;
  });
  t.conferir('reabrindo, a tela já vem em "escolher cada data"',
    reaberta.ritmo === 'livre', reaberta.ritmo);
  t.conferir('e mostra as datas que a compra TEM, não o padrão mensal',
    reaberta.campos.join(' · ') === '2026-05-20 · 2026-11-07', reaberta.campos.join(' · '));
  // Salvar sem tocar em nada não pode mexer em data nenhuma.
  await pagina.evaluate(() => {
    const m = moves.find(x => x.notes === 'carnê estoque');
    openMove(m.itemId, m.type, m);
  });
  await pagina.waitForTimeout(120);
  await pagina.click('#form-move button[type="submit"]');
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => closeAllM());
  const depoisDeSalvar = await pagina.evaluate(() => bovT.filter(x => x.lock === 'stock')
    .sort((a, b) => a.parcela - b.parcela).map(x => x.venc));
  t.conferir('salvar de novo mantém as datas combinadas',
    depoisDeSalvar.join(' · ') === '2026-02-10 · 2026-05-20 · 2026-11-07', depoisDeSalvar.join(' · '));
  t.conferir('e não duplica o carnê: continuam 3 parcelas',
    depoisDeSalvar.length === 3, depoisDeSalvar.length + ' parcela(s)');

  // ---------- 8. reabrir uma compra mensal continua mensal ----------
  t.secao('o que era mensal continua mensal');
  await pagina.evaluate(LIMPAR);
  await pagina.evaluate(() => { items = [{ id: 'i1', name: 'Proteinado 30%', unit: 'kg' }]; render(); });
  await compra('mes');
  const mensalReaberta = await pagina.evaluate(() => {
    const m = moves.find(x => x.notes === 'carnê estoque');
    openMove(m.itemId, m.type, m);
    const r = { ritmo: $('m-ritmo').value, caixas: $('m-datas').hidden };
    closeAllM();
    return r;
  });
  t.conferir('reabrindo um carnê mensal, a tela volta em "todo mês"',
    mensalReaberta.ritmo === 'mes', mensalReaberta.ritmo);
  t.conferir('e não enche a tela de caixas de data sem motivo', mensalReaberta.caixas === true);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
