// Compra parcelada lançada pelo financeiro: o valor não pode dobrar.
//
// O medo é concreto e tem nome: lançar R$ 3.000,00 em 3× e o aplicativo
// guardar as três parcelas de R$ 1.000,00 E TAMBÉM o lançamento de R$ 3.000,00
// — ou guardar três parcelas de R$ 3.000,00. Nos dois casos a tela mostra um
// custo que não existe, e ninguém descobre somando no olho, porque a lista
// parece certa: as linhas estão lá, uma por parcela.
//
// Esta bateria confere as duas pontas ao mesmo tempo, que é o único jeito de
// pegar duplicação:
//   a) quantos REGISTROS existem, e quanto cada um carrega;
//   b) quanto a TELA soma, nos três regimes.
// Conferir só (a) deixaria passar um total somado duas vezes no resumo;
// conferir só (b) deixaria passar uma parcela com o valor cheio que se anula
// com outro erro.
import { servir, abrirApp, placar } from './apoio.mjs';

const soNumero = txt => parseFloat(String(txt || '')
  .replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

const LIMPAR = () => {
  bovT = []; avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
  pendentes = [];
  // A agenda automática abre uma tela por cima ao salvar conta a prazo (é o
  // comportamento certo no celular). Aqui ela só atrapalharia o clique
  // seguinte — e não é ela que está sendo conferida.
  LS.s('fjs-ics-auto', false);
  definirRegime('competencia');
  ['bfin-period'].forEach(id => { $(id).value = 'all'; guardarPeriodo(id); });
  tab = 'bovinos'; seg = 'financeiro'; render();
};

async function lancar(pagina, { valor, parcelas, data, venc, categoria }) {
  await pagina.evaluate(d => {
    openTrans('bov');
    document.querySelector('input[name="t-type"][value="saida"]').checked = true;
    $('t-date').value = d.data;
    $('t-amount').value = d.valor;
    $('t-category').value = d.categoria || 'Ração/insumos';
    $('t-prazo').checked = true;
    $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = d.venc;
    $('t-parcelas').value = String(d.parcelas);
    $('t-parcelas').dispatchEvent(new Event('input'));
  }, { valor, parcelas, data, venc, categoria });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(220);
  await pagina.evaluate(() => closeAllM());
}

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Compra parcelada: o valor não dobra');
  pagina.on('dialog', d => d.accept());

  // ---------- 3 × R$ 1.000,00 ----------
  t.secao('R$ 3.000,00 em 3 vezes');
  await pagina.evaluate(`(${LIMPAR.toString()})()`);
  await lancar(pagina, { valor: '3000', parcelas: 3, data: '2026-03-10', venc: '2026-04-10' });

  const r = await pagina.evaluate(() => ({
    n: bovT.length,
    valores: bovT.map(x => x.amount).sort((a, b) => a - b),
    soma: bovT.reduce((s2, x) => s2 + x.amount, 0),
    comValorCheio: bovT.filter(x => x.amount === 3000).length,
    grupos: [...new Set(bovT.map(x => x.grupo))].length,
    numeracao: bovT.slice().sort((a, b) => a.parcela - b.parcela).map(x => `${x.parcela}/${x.parcelas}`),
    vencs: bovT.slice().sort((a, b) => a.parcela - b.parcela).map(x => x.venc),
    datas: [...new Set(bovT.map(x => x.date))],
    abertas: bovT.filter(emAberto).length
  }));
  t.conferir('cria exatamente 3 registros, nem um a mais', r.n === 3, String(r.n));
  // O cerne: nenhum registro pode carregar o valor cheio ao lado das parcelas.
  t.conferir('nenhum registro guarda o valor total ao lado das parcelas',
    r.comValorCheio === 0, `${r.comValorCheio} registro(s) de R$ 3.000`);
  t.conferir('as três parcelas somam exatamente o total',
    Math.abs(r.soma - 3000) < 1e-9, String(r.soma));
  t.conferir('cada parcela vale um terço', JSON.stringify(r.valores) === '[1000,1000,1000]',
    r.valores.join(' · '));
  t.conferir('ficam no mesmo carnê', r.grupos === 1);
  t.conferir('numeradas 1/3, 2/3, 3/3', r.numeracao.join(' ') === '1/3 2/3 3/3', r.numeracao.join(' '));
  t.conferir('vencendo mês a mês',
    r.vencs.join(',') === '2026-04-10,2026-05-10,2026-06-10', r.vencs.join(','));
  // A despesa é do dia da compra: é isso que mantém o custo da arroba certo.
  t.conferir('todas com a data da compra', r.datas.length === 1 && r.datas[0] === '2026-03-10',
    r.datas.join(','));
  t.conferir('e as três nascem devendo', r.abertas === 3, String(r.abertas));

  // ---------- o que a TELA soma ----------
  t.secao('o que a tela soma, nos três regimes');
  const tela = async regime => await pagina.evaluate(reg => {
    definirRegime(reg);
    $('bfin-period').value = 'all'; guardarPeriodo('bfin-period');
    tab = 'bovinos'; seg = 'financeiro'; render();
    return $('bfin-balance').textContent;
  }, regime);
  const comp = soNumero((await tela('competencia')).match(/R\$ ?-?[\d.,]+/g).join(' ').split(' ').pop());
  const totalComp = await pagina.evaluate(() => {
    const m = $('bfin-balance').textContent.match(/SAÍDAS?\s*R\$ ?([\d.,]+)/i);
    return m ? m[1] : $('bfin-balance').textContent;
  });
  t.conferir('por competência a tela soma R$ 3.000,00, uma vez só',
    soNumero(totalComp) === 3000, String(totalComp));

  await tela('vencimento');
  const porVenc = await pagina.evaluate(() => {
    // Por vencimento cada parcela cai no mês dela: somando todo o período, o
    // total tem de continuar sendo o da compra — nem mais, nem menos.
    const m = $('bfin-balance').textContent.match(/SAÍDAS?\s*R\$ ?([\d.,]+)/i);
    return m ? m[1] : null;
  });
  t.conferir('por vencimento, somando o período todo, continua R$ 3.000,00',
    soNumero(porVenc) === 3000, String(porVenc));

  await tela('caixa');
  const porCaixa = await pagina.evaluate(() => {
    const m = $('bfin-balance').textContent.match(/SAÍDAS?\s*R\$ ?([\d.,]+)/i);
    return m ? soNumero2(m[1]) : null;
    function soNumero2(x) { return parseFloat(x.replace(/\./g, '').replace(',', '.')); }
  });
  t.conferir('por caixa nada saiu ainda — nenhuma parcela foi paga',
    porCaixa === 0, String(porCaixa));

  // Pagando UMA parcela, o caixa enxerga só ela.
  await pagina.evaluate(() => {
    const p1 = bovT.slice().sort((a, b) => a.parcela - b.parcela)[0];
    p1.pago = true; p1.pagoEm = '2026-04-10';
    upsert('bovtrans', p1);
    definirRegime('caixa'); render();
  });
  await pagina.waitForTimeout(150);
  const umaPaga = await pagina.evaluate(() => {
    const m = $('bfin-balance').textContent.match(/SAÍDAS?\s*R\$ ?([\d.,]+)/i);
    return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null;
  });
  t.conferir('pagar uma parcela faz o caixa enxergar só ela',
    umaPaga === 1000, String(umaPaga));

  // ---------- centavo quebrado ----------
  // R$ 100,00 em 3 não divide redondo. O centavo que sobra tem de ir para
  // alguma parcela, e a soma tem de bater exatamente — senão a conta a pagar
  // nunca fecha com a compra.
  t.secao('valor que não divide redondo');
  await pagina.evaluate(`(${LIMPAR.toString()})()`);
  await lancar(pagina, { valor: '100', parcelas: 3, data: '2026-03-10', venc: '2026-04-10' });
  const quebrado = await pagina.evaluate(() => ({
    valores: bovT.slice().sort((a, b) => a.parcela - b.parcela).map(x => x.amount),
    soma: Math.round(bovT.reduce((s2, x) => s2 + x.amount, 0) * 100) / 100,
    n: bovT.length
  }));
  t.conferir('R$ 100,00 em 3× soma exatamente R$ 100,00',
    quebrado.soma === 100 && quebrado.n === 3,
    `${quebrado.valores.join(' + ')} = ${quebrado.soma}`);
  t.conferir('o centavo que sobra vai para a primeira, que vence antes',
    quebrado.valores[0] >= quebrado.valores[2], quebrado.valores.join(' · '));

  // ---------- à vista virando carnê ----------
  // Aqui é onde a duplicação mais poderia nascer: o registro antigo de
  // R$ 900,00 continuar existindo ao lado das três parcelas de R$ 300,00.
  t.secao('lançamento à vista que vira parcelado');
  await pagina.evaluate(`(${LIMPAR.toString()})()`);
  await pagina.evaluate(() => {
    openTrans('bov');
    document.querySelector('input[name="t-type"][value="saida"]').checked = true;
    $('t-date').value = '2026-03-10';
    $('t-amount').value = '900';
    $('t-category').value = 'Frete';
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => closeAllM());
  const aVista = await pagina.evaluate(() => ({ n: bovT.length, soma: bovT.reduce((s2, x) => s2 + x.amount, 0) }));
  t.conferir('à vista nasce como um lançamento só',
    aVista.n === 1 && aVista.soma === 900, `${aVista.n} · ${aVista.soma}`);

  await pagina.evaluate(() => {
    openTrans('bov', bovT[0]);
    $('t-prazo').checked = true; $('t-prazo').dispatchEvent(new Event('change'));
    $('t-venc').value = '2026-04-10';
    $('t-parcelas').value = '3'; $('t-parcelas').dispatchEvent(new Event('input'));
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(220);
  await pagina.evaluate(() => closeAllM());
  const virou = await pagina.evaluate(() => ({
    n: bovT.length,
    soma: bovT.reduce((s2, x) => s2 + x.amount, 0),
    temOs900: bovT.filter(x => x.amount === 900).length,
    valores: bovT.map(x => x.amount)
  }));
  t.conferir('vira 3 parcelas e o lançamento antigo NÃO fica para trás',
    virou.n === 3 && virou.temOs900 === 0, `${virou.n} registros · ${virou.valores.join(',')}`);
  t.conferir('e o total continua R$ 900,00, não R$ 1.800,00',
    Math.abs(virou.soma - 900) < 1e-9, String(virou.soma));

  // ---------- editar uma parcela ----------
  t.secao('editar uma parcela mexe só nela');
  await pagina.evaluate(() => {
    const p2 = bovT.slice().sort((a, b) => a.parcela - b.parcela)[1];
    openTrans('bov', p2);
    $('t-amount').value = '350';
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(220);
  await pagina.evaluate(() => closeAllM());
  const editou = await pagina.evaluate(() => ({
    n: bovT.length,
    valores: bovT.slice().sort((a, b) => a.parcela - b.parcela).map(x => x.amount),
    soma: bovT.reduce((s2, x) => s2 + x.amount, 0)
  }));
  t.conferir('continua com 3 registros', editou.n === 3, String(editou.n));
  t.conferir('só a parcela editada muda',
    editou.valores[0] === 300 && editou.valores[1] === 350 && editou.valores[2] === 300,
    editou.valores.join(' · '));
  t.conferir('e o total passa a ser o que foi digitado, sem duplicar',
    Math.abs(editou.soma - 950) < 1e-9, String(editou.soma));

  // ---------- varredura ----------
  // Qualquer valor, qualquer número de parcelas: a soma tem de fechar sempre.
  t.secao('varredura da divisão');
  const varr = await pagina.evaluate(() => {
    let semente = 20261001;
    const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
    let piorErro = 0, negativa = 0, maiorQueTotal = 0, somaErrada = 0, casos = 0;
    for (let i = 0; i < 20000; i++) {
      const total = Math.round(rnd() * 5000000) / 100;   // até R$ 50.000,00
      const n = 1 + Math.floor(rnd() * 36);
      const vs = parcelasDe(total, n);
      casos++;
      if (vs.length !== n) somaErrada++;
      const soma = Math.round(vs.reduce((s2, v) => s2 + v, 0) * 100) / 100;
      const erro = Math.abs(soma - total);
      if (erro > piorErro) piorErro = erro;
      if (erro > 0.0001) somaErrada++;
      if (vs.some(v => v < 0)) negativa++;
      if (total > 0 && vs.some(v => v > total + 1e-9)) maiorQueTotal++;
    }
    return { casos, piorErro, negativa, maiorQueTotal, somaErrada };
  });
  t.conferir(`${varr.casos} divisões: a soma das parcelas é sempre o total exato`,
    varr.somaErrada === 0 && varr.piorErro < 0.0001, `pior erro ${varr.piorErro}`);
  t.conferir('nenhuma parcela negativa', varr.negativa === 0, String(varr.negativa));
  t.conferir('nenhuma parcela maior que a compra inteira',
    varr.maiorQueTotal === 0, String(varr.maiorQueTotal));

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
