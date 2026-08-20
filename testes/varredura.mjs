// Varredura por propriedades: em vez de repetir o mesmo caso, sorteia milhares
// de entradas diferentes para cada função e confere regras que TÊM de valer
// sempre. Um caso escrito à mão acha o erro que eu imaginei; o sorteio acha o
// que eu não imaginei — que é justamente o que derruba a conta no dia do uso.
import { servir, abrirApp, placar } from './apoio.mjs';

const N = Number(process.env.VARREDURA || 4000);

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar(`Varredura por propriedades (${N.toLocaleString('pt-BR')} sorteios por regra)`);

  const r = await pagina.evaluate(n => {
    // Sorteio com semente: quando uma regra quebra, o caso é reproduzível.
    let seed = 20260813;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const ent = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const dec = (a, b, c = 2) => Number((a + rnd() * (b - a)).toFixed(c));
    const dataAleatoria = () => {
      const d = new Date(2020, 0, 1 + ent(0, 3000));
      const p = x => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const falhas = {};
    const regra = (nome, ok, caso) => {
      if (!ok && !falhas[nome]) falhas[nome] = caso;
      if (!falhas[nome]) falhas[nome] = null;
    };

    for (let i = 0; i < n; i++) {
      // --- número digitado: escrever e reler tem de devolver o mesmo número ---
      const x = dec(-99999, 99999, ent(0, 3));
      regra('número digitado volta igual ao gravado',
        Math.abs(parseNum(numParaCampo(x)) - x) < 1e-9, `${x} → ${numParaCampo(x)} → ${parseNum(numParaCampo(x))}`);

      // --- contagem de dias ---
      const d1 = dataAleatoria(), d2 = dataAleatoria();
      const ida = daysBetween(d1, d2), volta = daysBetween(d2, d1);
      regra('dias de A para B é o oposto de B para A', ida === -volta, `${d1}→${d2}: ${ida} vs ${volta}`);
      regra('dias é sempre inteiro', Number.isInteger(ida), `${d1}→${d2}: ${ida}`);
      regra('mesmo dia dá zero', daysBetween(d1, d1) === 0, d1);

      // --- GMD ---
      const p1 = dec(20, 900, 1), p2 = dec(20, 900, 1);
      const a1 = { date: d1, weight: p1 }, a2 = { date: d2, weight: p2 };
      const g = gmdBetween(a1, a2);
      if (Number.isFinite(g) && ida > 0) {
        regra('GMD tem o sinal do ganho', (p2 > p1) === (g > 0) || p2 === p1, `${p1}→${p2} em ${ida}d = ${g}`);
        regra('GMD × dias devolve o ganho', Math.abs(g * ida - (p2 - p1)) < 1e-6, `${g}×${ida} vs ${p2 - p1}`);
      }
      regra('sem intervalo não inventa GMD', !(daysBetween(d1, d1) === 0 && gmdBetween(a1, { date: d1, weight: p2 }) !== null), d1);

      // --- arrobas ---
      const kg = dec(20, 900, 1), rend = ent(40, 65);
      const arr = arrobasDe(kg, rend);
      regra('arroba cresce com o peso', arrobasDe(kg + 1, rend) > arr, `${kg}kg ${rend}%`);
      regra('arroba é o peso de carcaça dividido por 15',
        Math.abs(arr * 15 - kg * rend / 100) < 1e-9, `${kg}kg ${rend}% = ${arr}@`);
      regra('dobrar o peso dobra a arroba',
        Math.abs(arrobasDe(kg * 2, rend) - arr * 2) < 1e-9, `${kg}kg`);

      // --- estoque ---
      const iid = 'v' + i;
      const nEnt = ent(0, 5), nSai = ent(0, 5);
      const mv = [];
      let somaEnt = 0, somaSai = 0, custoTotal = 0, qtdComCusto = 0;
      let menorCusto = Infinity, maiorCusto = -Infinity;
      for (let k = 0; k < nEnt; k++) {
        const q = dec(0.1, 500, 2), c = rnd() < 0.25 ? 0 : dec(0.01, 200, 2);
        mv.push({ id: `e${i}_${k}`, itemId: iid, type: 'entrada', date: dataAleatoria(), qty: q, unitCost: c });
        somaEnt += q;
        if (c > 0) { custoTotal += q * c; qtdComCusto += q; menorCusto = Math.min(menorCusto, c); maiorCusto = Math.max(maiorCusto, c); }
      }
      for (let k = 0; k < nSai; k++) {
        const q = dec(0.1, 200, 2);
        mv.push({ id: `s${i}_${k}`, itemId: iid, type: 'saida', date: dataAleatoria(), qty: q });
        somaSai += q;
      }
      moves = mv;
      regra('saldo do estoque = entradas − saídas',
        Math.abs(qtyOf(iid) - (somaEnt - somaSai)) < 1e-6, `${qtyOf(iid)} vs ${somaEnt - somaSai}`);
      const med = avgCostOf(iid);
      if (qtdComCusto > 0) {
        regra('custo médio é a média ponderada das compras',
          Math.abs(med - custoTotal / qtdComCusto) < 1e-6, `${med} vs ${custoTotal / qtdComCusto}`);
        regra('custo médio fica entre o mais barato e o mais caro',
          med >= menorCusto - 1e-9 && med <= maiorCusto + 1e-9, `${med} fora de [${menorCusto}, ${maiorCusto}]`);
      } else {
        regra('sem compra com preço não há custo médio', med === null, String(med));
      }

      // --- brinco ---
      const base = String(ent(1, 9999));
      const sujo = '  ' + base + ' ';
      regra('espaço em volta do brinco não muda o brinco', chaveBrinco(sujo) === chaveBrinco(base), `"${sujo}"`);

      // --- CSV: o que sai tem de poder voltar ---
      const txt = ['', 'a', 'x;y', 'com "aspas"', 'linha1\nlinha2', base][ent(0, 5)];
      const saida = csv(txt);
      const precisaAspas = /[";\n\r]/.test(txt);
      regra('CSV protege o que quebraria a planilha', !precisaAspas || (saida.startsWith('"') && saida.endsWith('"')), `"${txt}" → ${saida}`);
      regra('CSV dobra as aspas de dentro',
        !txt.includes('"') || saida.slice(1, -1).includes('""'), `"${txt}" → ${saida}`);

      // --- rebanho: as três listas somam o total, sempre ---
      const nA = ent(0, 12);
      animals = Array.from({ length: nA }, (_, k) => {
        const dado = rnd();
        const a = { id: `a${i}_${k}`, ident: String(ent(1, 999)) };
        if (dado < 0.2) a.sold = true;
        else if (dado < 0.4) { a.dead = true; a.deadDate = dataAleatoria(); }
        return a;
      });
      weighings = [];
      animals.forEach((a, k) => { if (rnd() < 0.7) weighings.push({ id: `w${i}_${k}`, animalId: a.id, date: dataAleatoria(), weight: dec(20, 900, 1) }); });
      const vivos = animals.filter(noRebanho).length;
      const vend = animals.filter(a => a.sold && !a.dead).length;
      const mortos = animals.filter(a => a.dead).length;
      regra('rebanho + vendidos + mortos = total de animais',
        vivos + vend + mortos === animals.length, `${vivos}+${vend}+${mortos} vs ${animals.length}`);

      // --- limpeza: nunca perde nem inventa animal, e nunca toca em quem já saiu ---
      const dias = new Set(weighings.filter(() => rnd() < 0.5).map(w => w.date));
      const sep = limpezaSeparar(dias);
      regra('limpeza: ficam + saem = rebanho',
        sep.ficam.length + sep.saem.length === vivos, `${sep.ficam.length}+${sep.saem.length} vs ${vivos}`);
      regra('limpeza nunca apaga vendido nem morto',
        ![...sep.saem, ...sep.ficam].some(a => a.sold || a.dead), sep.saem.map(a => a.ident).join(','));
      regra('limpeza: quem fica tem pesagem no dia marcado',
        sep.ficam.every(a => wOf(a.id).some(w => dias.has(w.date))), '');

      // --- dias de pesagem: as partes fecham com o total ---
      regra('dias de pesagem: curral + cadastro + importados = total',
        diasDePesagem().every(d => d.curral + d.entrada + d.importado === d.total), '');
      regra('dias de pesagem: nenhuma parte negativa',
        diasDePesagem().every(d => d.curral >= 0 && d.entrada >= 0 && d.importado >= 0), '');

      // --- período: "todo período" nunca exclui nada ---
      regra('todo período aceita qualquer data', inPeriod(dataAleatoria(), 'all') === true, '');

      // --- alarme de pesagem: nunca alarma um ganho normal ---
      const gOk = dec(0.2, 1.8, 3), pesoOk = dec(150, 600, 1), diasOk = ent(30, 300);
      regra('ganho normal não dispara alarme',
        pesagemSuspeita('x', pesoOk, gOk, { date: '2026-01-01', weight: pesoOk - gOk * diasOk }, diasOk) === null,
        `${gOk} kg/dia em ${diasOk}d`);

      // --- texto feio no campo de número: nunca pode virar número ---
      const lixo = ['', ' ', '-', ',', '.', 'abc', '1,2,3', '1..2', 'R$ 5', '5%', 'e10', 'Infinity',
        'NaN', '--5', '1e309', '0x10', '١٢٣', '5 5', '\n', '\t7'][ent(0, 18)];
      const lido = parseNum(lixo);
      regra('texto inválido nunca vira número',
        Number.isNaN(lido) || Number.isFinite(lido), `"${lixo}" → ${lido}`);
      regra('nenhum campo produz infinito', lido !== Infinity && lido !== -Infinity, `"${lixo}" → ${lido}`);

      // --- o que a tela mostra nunca pode ser "NaN" ---
      const qq = [NaN, Infinity, -Infinity, null, undefined, 0, -0, 1e15, -1e15, dec(-1e6, 1e6, 2)][ent(0, 9)];
      regra('a tela nunca escreve NaN nem Infinity',
        !/NaN|Infinity/.test(fmtN(qq, 2) + fmtRS(qq) + fmtN(qq, 0)), `${qq} → ${fmtN(qq, 2)} / ${fmtRS(qq)}`);

      // --- viradas de mês, ano e bissexto ---
      const viradas = [['2024-02-28', '2024-03-01', 2], ['2025-02-28', '2025-03-01', 1],
        ['2026-12-31', '2027-01-01', 1], ['2026-01-31', '2026-02-01', 1],
        ['2024-02-29', '2024-03-01', 1], ['2026-10-17', '2026-10-18', 1]][ent(0, 5)];
      regra('viradas de mês, ano e 29 de fevereiro contam certo',
        daysBetween(viradas[0], viradas[1]) === viradas[2],
        `${viradas[0]}→${viradas[1]}: ${daysBetween(viradas[0], viradas[1])} (esperado ${viradas[2]})`);

      // --- período: um filtro mais estreito nunca aceita o que o largo recusa ---
      const dq = dataAleatoria();
      regra('este mês está contido em este ano',
        !inPeriod(dq, 'this-month') || inPeriod(dq, 'this-year'), dq);
      regra('todo período contém qualquer filtro',
        !(inPeriod(dq, 'this-month') || inPeriod(dq, 'this-year') || inPeriod(dq, 'last-month')) || inPeriod(dq, 'all'), dq);

      // --- ordenar o rebanho nunca perde nem duplica animal ---
      const antes = animals.filter(noRebanho).map(a => a.id).sort().join(',');
      for (const modo of ['ident-asc', 'ident-desc', 'peso-desc', 'peso-asc', 'gmd-desc', 'gmd-asc', 'data-desc', 'data-asc']) {
        bovSort = modo; seg = 'rebanho'; tab = 'bovinos'; detailAnimal = null; render();
        const depois = [...document.querySelectorAll('#animal-list .list-item')].map(e => e.dataset.animal).sort().join(',');
        regra('nenhuma ordenação perde ou duplica animal', depois === antes, `${modo}: ${depois} vs ${antes}`);
      }

      // --- contas a pagar ---
      const cts = [];
      let emAbertoSoma = 0;
      for (let k = 0; k < ent(0, 6); k++) {
        const aberto = rnd() < 0.6, val = dec(1, 9999, 2);
        const c = { id: `c${i}_${k}`, date: dataAleatoria(), type: rnd() < 0.85 ? 'saida' : 'entrada',
          amount: val, category: 'C' + k };
        if (aberto) { c.venc = dataAleatoria(); c.pago = rnd() < 0.4; }
        if (c.venc && !c.pago && c.type === 'saida') emAbertoSoma += val;
        cts.push(c);
      }
      const ap = contasAPagar(cts);
      regra('a pagar soma exatamente o que está em aberto',
        Math.abs(ap.reduce((s, x) => s + x.amount, 0) - emAbertoSoma) < 1e-6,
        `${ap.reduce((s, x) => s + x.amount, 0)} vs ${emAbertoSoma}`);
      regra('conta já paga nunca entra em a pagar', !ap.some(x => x.pago), '');
      regra('entrada de dinheiro nunca entra em a pagar', !ap.some(x => x.type === 'entrada'), '');
      regra('conta sem vencimento nunca entra em a pagar', !ap.some(x => !x.venc), '');
      regra('a pagar sai em ordem de vencimento',
        ap.every((x, k) => k === 0 || ap[k - 1].venc <= x.venc), ap.map(x => x.venc).join(' '));
      regra('dias até o vencimento batem com a data',
        ap.every(x => x.dias === daysBetween(todayISO(), x.venc)), '');
    }
    return falhas;
  }, N);

  const nomes = Object.keys(r);
  t.secao(`${nomes.length} regras conferidas em ${N.toLocaleString('pt-BR')} sorteios cada`);
  for (const nome of nomes) t.conferir(nome, r[nome] === null, r[nome] || '');

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
