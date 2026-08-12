// ===== Fazenda JS — versão multi-aparelho (Firebase/Firestore) =====
const $ = id => document.getElementById(id);
const LS = {
  g: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  s: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fmtBR = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const fmtBRfull = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtN = (n, c = 2) => Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) : '—';
const fmtRS = n => 'R$ ' + fmtN(n, 2);
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = o => JSON.parse(JSON.stringify(o));
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._to); t._to = setTimeout(() => t.hidden = true, 2500); }

// ===== Estado (espelho local dos snapshots) =====
let animals = [], weighings = [], bovT = [], avT = [], items = [], moves = [];
let settings = { yield: 52 };
// Parâmetros da calculadora de custo da arroba (independentes das outras abas)
const CUSTO_VAZIO = {
  gmd: null, salConsumo: null, salPreco: null, sanidade: null, mo: null, terra: null, rend: null,
  pesoCompra: null, valorCompra: null, pesoVenda: null, precoArroba: null
};
const CUSTO_REND_PADRAO = 52; // próprio desta aba — não usa o rendimento do Rebanho
// Mês médio real (365/12). Usar 30 fixos cobraria ~1,4% de custo a mais num
// ciclo longo, porque o ano tem 12,17 meses de 30 dias.
const DIAS_MES = 365 / 12;
let custoParams = Object.assign({}, CUSTO_VAZIO);

// ===== Firebase =====
let db = null, farm = null, unsubs = [];
const COLS = { animals: a => animals = a, weighings: a => weighings = a, bovtrans: a => bovT = a, avtrans: a => avT = a, items: a => items = a, moves: a => moves = a };
const colRef = name => db.collection('farms').doc(farm).collection(name);
const upsert = (col, obj) => colRef(col).doc(obj.id).set(clean(obj)).catch(() => toast('Falha ao sincronizar — será reenviado'));
const remove = (col, id) => colRef(col).doc(id).delete().catch(() => {});
async function batchWrite(ops) { // ops: [{col, obj} | {col, del:id}]
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(op => {
      const ref = colRef(op.col).doc(op.del || op.obj.id);
      op.del ? b.delete(ref) : b.set(ref, clean(op.obj));
    });
    await b.commit();
  }
}

function parseConfig(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < 0) return null;
  let body = text.slice(s, e + 1)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*}/g, '}');
  try { const o = JSON.parse(body); return (o.apiKey && o.projectId) ? o : null; } catch (err) { return null; }
}

function setSync(on) { const d = $('sync-dot'); d.classList.toggle('on', on); d.classList.toggle('off', !on); }
window.addEventListener('online', () => setSync(true));
window.addEventListener('offline', () => setSync(false));

function connect(cfg, farmCode) {
  try { firebase.initializeApp(cfg); } catch (e) { /* já inicializado */ }
  db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  farm = farmCode;
  firebase.auth().onAuthStateChanged(user => {
    if (!user) return;
    setSync(navigator.onLine);
    subscribe();
  });
  firebase.auth().signInAnonymously().catch(err => {
    const msg = err && err.code === 'auth/operation-not-allowed'
      ? 'Login Anônimo não está ativado no Firebase.\nNo console: Authentication → Sign-in method → Anônimo → Ativar.'
      : 'Erro de conexão: ' + (err && err.message || err);
    const el = $('su-error');
    $('setup-screen').hidden = false;
    el.hidden = false; el.textContent = msg;
  });
}

let firstAnimalsSnap = true;
function subscribe() {
  unsubs.forEach(u => u()); unsubs = [];
  Object.keys(COLS).forEach(name => {
    unsubs.push(colRef(name).onSnapshot(snap => {
      COLS[name](snap.docs.map(d => d.data()));
      if (name === 'animals' && firstAnimalsSnap && !snap.metadata.fromCache) {
        firstAnimalsSnap = false;
        maybeOfferMigration();
      }
      render();
    }, err => { console.warn(name, err); }));
  });
  unsubs.push(db.collection('farms').doc(farm).onSnapshot(snap => {
    const d = snap.data() || {};
    settings.yield = Number.isFinite(d.yield) ? d.yield : 52;
    // Não sobrescreve o que está sendo digitado neste instante
    const digitando = document.activeElement && document.activeElement.closest && document.activeElement.closest('.calc-form');
    if (!digitando) custoParams = Object.assign({}, CUSTO_VAZIO, d.custo || {});
    render();
  }));
}

function maybeOfferMigration() {
  if (LS.g('fjs-migrated', false)) { updateMigrateBtn(); return; }
  const legacy = legacyData();
  if (!legacy.total) { updateMigrateBtn(); return; }
  if (animals.length === 0 && weighings.length === 0) {
    if (confirm(`Encontrei ${legacy.total} registros salvos neste aparelho (versão anterior do app). Enviar para a nuvem agora?`)) migrateLegacy();
  }
  updateMigrateBtn();
}
function legacyData() {
  const a = LS.g('fjs-animals', []), w = LS.g('fjs-weighings', []), bt = LS.g('fjs-bovtrans', []),
        at = LS.g('fjs-avtrans', []), it = LS.g('fjs-items', []), mv = LS.g('fjs-moves', []);
  return { a, w, bt, at, it, mv, total: a.length + w.length + bt.length + at.length + it.length + mv.length };
}
async function migrateLegacy() {
  const l = legacyData();
  const ops = [];
  l.a.forEach(x => ops.push({ col: 'animals', obj: x }));
  l.w.forEach(x => ops.push({ col: 'weighings', obj: x }));
  l.bt.forEach(x => ops.push({ col: 'bovtrans', obj: x }));
  l.at.forEach(x => ops.push({ col: 'avtrans', obj: x }));
  l.it.forEach(x => ops.push({ col: 'items', obj: x }));
  l.mv.forEach(x => ops.push({ col: 'moves', obj: x }));
  try {
    await batchWrite(ops);
    const s = LS.g('fjs-settings', null);
    if (s && Number.isFinite(s.yield)) await db.collection('farms').doc(farm).set({ yield: s.yield }, { merge: true });
    LS.s('fjs-migrated', true);
    toast(`${ops.length} registros enviados para a nuvem`);
  } catch (e) { toast('Falha na migração — tente pelo menu'); }
  updateMigrateBtn();
}
function updateMigrateBtn() {
  $('menu-migrate').hidden = LS.g('fjs-migrated', false) || !legacyData().total;
}

// LCDPR
const CLASSIF = {
  'Venda de gado': 'Receita', 'Venda de esterco': 'Receita', 'Pagamento Seara': 'Receita', 'Venda de cama': 'Receita',
  'Compra de gado (engorda)': 'Custeio', 'Compra de reprodutores': 'Investimento',
  'Ração/insumos': 'Custeio', 'Sal mineral/suplemento': 'Custeio', 'Medicamentos/vacinas': 'Custeio', 'Medicamentos': 'Custeio',
  'Mão de obra': 'Custeio', 'Combustível': 'Custeio', 'Manutenção': 'Custeio', 'Energia elétrica': 'Custeio',
  'Gás': 'Custeio', 'Frete': 'Custeio', 'Impostos/Funrural': 'Custeio',
  'Equipamentos': 'Investimento', 'Benfeitorias': 'Investimento', 'Outros': 'Custeio'
};
const classOf = (cat, type) => CLASSIF[cat] || (type === 'entrada' ? 'Receita' : 'Custeio');

// ===== Prevenção de duplicidade =====
// Avisa, sem bloquear: duplicatas legítimas existem (dois abastecimentos no
// mesmo dia, pelo mesmo valor). Quem decide é quem está lançando.
const sameMoney = (a, b) => Math.abs(a - b) < 0.005;
function askDuplicate(detalhe) {
  return confirm(`⚠️ POSSÍVEL DUPLICIDADE\n\n${detalhe}\n\nLançar mesmo assim?`);
}
// Lançamento financeiro já existente com mesma data, valor, tipo, categoria
// (e aviário, no caso dos aviários). Ignora o próprio registro ao editar.
function findDupTrans(list, data, book, ignoreId) {
  return list.find(t => t.id !== ignoreId
    && t.date === data.date
    && t.type === data.type
    && sameMoney(t.amount, data.amount)
    && (t.category || '') === (data.category || '')
    && (book !== 'av' || t.aviary === data.aviary));
}

// ===== Cálculos =====
const wOf = aid => weighings.filter(w => w.animalId === aid).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
function gmdBetween(a, b) { const d = daysBetween(a.date, b.date); return d > 0 ? (b.weight - a.weight) / d : null; }
function gmdTotal(ws) { return ws.length >= 2 ? gmdBetween(ws[0], ws[ws.length - 1]) : null; }
function gmdRecent(ws) { return ws.length >= 2 ? gmdBetween(ws[ws.length - 2], ws[ws.length - 1]) : null; }
const gmdCls = g => !Number.isFinite(g) ? '' : g < 0.4 ? 'gmd-low' : g < 0.8 ? 'gmd-mid' : g < 1.2 ? 'gmd-good' : 'gmd-great';

const movesOf = iid => moves.filter(m => m.itemId === iid).sort((a, b) => a.date < b.date ? 1 : -1);
const qtyOf = iid => moves.filter(m => m.itemId === iid).reduce((s, m) => s + (m.type === 'entrada' ? m.qty : -m.qty), 0);
function avgCostOf(iid) {
  const ins = moves.filter(m => m.itemId === iid && m.type === 'entrada' && Number.isFinite(m.unitCost) && m.unitCost > 0);
  const q = ins.reduce((s, m) => s + m.qty, 0);
  if (!q) return null;
  return ins.reduce((s, m) => s + m.qty * m.unitCost, 0) / q;
}

function inPeriod(iso, sel) {
  if (sel === 'all') return true;
  const now = new Date(); const d = new Date(iso + 'T12:00');
  if (sel === 'this-month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (sel === 'last-month') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth(); }
  if (sel === 'this-year') return d.getFullYear() === now.getFullYear();
  return true;
}

// ===== Navegação =====
let tab = 'bovinos', seg = 'rebanho', detailAnimal = null, detailItem = null;
let bovSort = LS.g('fjs-sort-rebanho', 'ident-asc');

function render() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === tab));
  $('view-bovinos').classList.toggle('active', tab === 'bovinos');
  $('view-aviarios').classList.toggle('active', tab === 'aviarios');
  if (tab === 'bovinos') {
    document.querySelectorAll('#bov-segs .seg').forEach(s => s.classList.toggle('active', s.dataset.seg === seg));
    ['bov-rebanho', 'bov-detail', 'bov-vendidas', 'bov-estoque', 'stock-detail', 'bov-fin', 'bov-custos'].forEach(id => $(id).classList.remove('active'));
    if (seg === 'rebanho') { $(detailAnimal ? 'bov-detail' : 'bov-rebanho').classList.add('active'); detailAnimal ? renderAnimalDetail() : renderRebanho(); }
    if (seg === 'vendidas') { $('bov-vendidas').classList.add('active'); renderVendidas(); }
    if (seg === 'custos') { $('bov-custos').classList.add('active'); renderCustos(); }
    if (seg === 'estoque') { $(detailItem ? 'stock-detail' : 'bov-estoque').classList.add('active'); detailItem ? renderStockDetail() : renderEstoque(); }
    if (seg === 'financeiro') { $('bov-fin').classList.add('active'); renderFin('bov'); }
  } else { renderFin('av'); }
  // Vendidas e Custos não têm nada para adicionar pelo botão +
  $('fab').hidden = tab === 'bovinos' && (seg === 'vendidas' || seg === 'custos');
}

function renderRebanho() {
  const activeAnimals = animals.filter(a => !a.sold);
  const activeIds = new Set(activeAnimals.map(a => a.id));
  const n = activeAnimals.length;
  const gmds = activeAnimals.map(a => gmdTotal(wOf(a.id))).filter(Number.isFinite);
  const avg = gmds.length ? gmds.reduce((s, g) => s + g, 0) / gmds.length : null;
  const lastDates = weighings.filter(w => activeIds.has(w.animalId)).map(w => w.date).sort();
  const weightById = new Map(activeAnimals.map(a => { const ws = wOf(a.id); return [a.id, ws.length ? ws[ws.length - 1].weight : null]; }));
  const lastWeights = [...weightById.values()].filter(Number.isFinite);
  const totalWeight = lastWeights.reduce((s, w) => s + w, 0);
  const avgWeight = lastWeights.length ? totalWeight / lastWeights.length : null;
  const arrobaOf = kg => kg * (settings.yield / 100) / 15;
  const avgArroba = avgWeight != null ? arrobaOf(avgWeight) : null;
  const totalArroba = lastWeights.length ? arrobaOf(totalWeight) : null;
  $('bov-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${n}</div><div class="stat-label">Animais</div></div>
    <div class="stat-card"><div class="stat-value">${avg != null ? fmtN(avg, 2) : '—'}</div><div class="stat-label">GMD médio</div></div>
    <div class="stat-card"><div class="stat-value">${lastDates.length ? fmtBR(lastDates[lastDates.length - 1]) : '—'}</div><div class="stat-label">Últ. pesagem</div></div>
    <div class="stat-card"><div class="stat-value">${avgWeight != null ? fmtN(avgWeight, 0) + ' kg' : '—'}</div><div class="stat-label">Peso médio</div></div>
    <div class="stat-card"><div class="stat-value">${avgArroba != null ? fmtN(avgArroba, 1) + ' @' : '—'}</div><div class="stat-label">Média em @</div></div>
    <div class="stat-card"><div class="stat-value">${totalArroba != null ? fmtN(totalArroba, 0) + ' @' : '—'}</div><div class="stat-label">Total do rebanho</div></div>`;
  const byIdent = (a, b) => a.ident.localeCompare(b.ident, 'pt-BR', { numeric: true });
  const sorted = [...activeAnimals].sort((a, b) => {
    if (bovSort === 'peso-desc' || bovSort === 'peso-asc') {
      const wa = weightById.get(a.id), wb = weightById.get(b.id);
      if (wa == null && wb == null) return byIdent(a, b);
      if (wa == null) return 1; // sem pesagem vai para o fim da lista
      if (wb == null) return -1;
      return bovSort === 'peso-desc' ? wb - wa : wa - wb;
    }
    return bovSort === 'ident-desc' ? byIdent(b, a) : byIdent(a, b);
  });
  $('animal-list').innerHTML = sorted.map(a => {
    const ws = wOf(a.id); const last = ws[ws.length - 1]; const g = gmdTotal(ws);
    return `<div class="list-item" data-animal="${a.id}">
      <div class="item-main">
        <div class="item-title">${esc(a.ident)}</div>
        <div class="item-subtitle">${esc(a.cat || 'Sem categoria')} · ${ws.length} pesag.${a.manejoData ? ' · manejo ' + fmtBR(a.manejoData) : ''}</div>
      </div>
      <div class="item-side">
        <div class="value">${last ? fmtN(last.weight, 0) + ' kg' : '—'}</div>
        <div class="aux ${gmdCls(g)}">${Number.isFinite(g) ? 'GMD ' + fmtN(g, 2) : ''}</div>
      </div>
    </div>`;
  }).join('');
  $('bov-empty').hidden = n > 0;
}

function renderVendidas() {
  const sold = animals.filter(a => a.sold).sort((a, b) => (b.soldDate || '').localeCompare(a.soldDate || ''));
  const totalRevenue = sold.reduce((s, a) => s + (Number.isFinite(a.soldPrice) ? a.soldPrice : 0), 0);
  $('vendidas-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${sold.length}</div><div class="stat-label">Vendidos</div></div>
    <div class="stat-card"><div class="stat-value">${fmtRS(totalRevenue)}</div><div class="stat-label">Total recebido</div></div>`;
  $('vendidas-list').innerHTML = sold.map(a => {
    const ws = wOf(a.id);
    const w = Number.isFinite(a.soldWeight) ? a.soldWeight : (ws.length ? ws[ws.length - 1].weight : null);
    return `<div class="list-item" data-animal-edit="${a.id}">
      <div class="item-main">
        <div class="item-title">${esc(a.ident)}</div>
        <div class="item-subtitle">${esc(a.cat || 'Sem categoria')}${a.soldDate ? ' · vendido em ' + fmtBR(a.soldDate) : ''}</div>
      </div>
      <div class="item-side">
        <div class="value">${w != null ? fmtN(w, 0) + ' kg' : '—'}</div>
        <div class="aux">${Number.isFinite(a.soldPrice) ? fmtRS(a.soldPrice) : ''}</div>
      </div>
    </div>`;
  }).join('');
  $('vendidas-empty').hidden = sold.length > 0;
}

// Custo de produzir uma arroba: gasto diário por animal ÷ arrobas ganhas por dia.
// Arroba = 15 kg de carcaça, então o ganho de peso vivo (GMD) entra corrigido
// pelo rendimento de carcaça.
function calcCusto() {
  const p = custoParams;
  const rend = Number.isFinite(p.rend) && p.rend > 0 && p.rend <= 100 ? p.rend : CUSTO_REND_PADRAO;
  const salDia = Number.isFinite(p.salConsumo) && Number.isFinite(p.salPreco) ? (p.salConsumo / 1000) * p.salPreco : 0;
  const sanDia = Number.isFinite(p.sanidade) ? p.sanidade / DIAS_MES : 0;
  const moDia = Number.isFinite(p.mo) ? p.mo / DIAS_MES : 0;
  const terraDia = Number.isFinite(p.terra) ? p.terra / DIAS_MES : 0;
  const custoDia = salDia + sanDia + moDia + terraDia;
  const arrobaDia = Number.isFinite(p.gmd) && p.gmd > 0 ? (p.gmd * rend / 100) / 15 : null;
  return {
    rend, salDia, sanDia, moDia, terraDia, custoDia, arrobaDia,
    custoArroba: arrobaDia && custoDia > 0 ? custoDia / arrobaDia : null
  };
}

// Simulação da operação: compra o animal, engorda até o peso alvo pagando o
// custo diário acima, e vende ao preço da arroba informado.
const arrobasDe = (kg, rend) => kg * (rend / 100) / 15;
function calcSimulacao(c) {
  const p = custoParams;
  const pc = p.pesoCompra, pv = p.pesoVenda;
  if (!Number.isFinite(pc) || pc <= 0 || !Number.isFinite(pv) || pv <= pc) return null;
  if (!Number.isFinite(p.gmd) || p.gmd <= 0) return null;

  const ganhoKg = pv - pc;
  const dias = ganhoKg / p.gmd;
  const meses = dias / DIAS_MES;
  const custoPeriodo = c.custoDia * dias;
  const arrobasCompra = arrobasDe(pc, c.rend);
  const arrobasVenda = arrobasDe(pv, c.rend);
  const arrobasProduzidas = arrobasVenda - arrobasCompra;

  const temCompra = Number.isFinite(p.valorCompra) && p.valorCompra >= 0;
  const temPreco = Number.isFinite(p.precoArroba) && p.precoArroba > 0;
  const investido = temCompra ? p.valorCompra + custoPeriodo : null;
  const receita = temPreco ? arrobasVenda * p.precoArroba : null;
  const resultado = investido != null && receita != null ? receita - investido : null;

  const margem = resultado != null && investido > 0 ? resultado / investido * 100 : null;
  return {
    ganhoKg, dias, meses, custoPeriodo, arrobasCompra, arrobasVenda, arrobasProduzidas,
    investido, receita, resultado, margem,
    // Retorno ao mês: o retorno do período dividido pelos meses da operação
    retornoMensal: margem != null && meses > 0 ? margem / meses : null,
    lucroMensal: resultado != null && meses > 0 ? resultado / meses : null,
    precoArrobaCompra: temCompra && arrobasCompra > 0 ? p.valorCompra / arrobasCompra : null,
    custoArrobaProduzida: arrobasProduzidas > 0 ? custoPeriodo / arrobasProduzidas : null,
    lucroArrobaProduzida: resultado != null && arrobasProduzidas > 0 ? resultado / arrobasProduzidas : null,
    lucroArrobaVendida: resultado != null && arrobasVenda > 0 ? resultado / arrobasVenda : null
  };
}

function renderSimulacao(c) {
  const s = calcSimulacao(c);
  const el = $('sim-valor'), hint = $('sim-hint');
  el.classList.remove('positive', 'negative');
  if (!s) {
    el.textContent = '—';
    hint.textContent = !Number.isFinite(custoParams.gmd) || custoParams.gmd <= 0
      ? 'Informe o GMD nos parâmetros acima'
      : 'Informe peso de compra e peso de venda (maior que o de compra)';
    $('sim-stats').innerHTML = '';
    return;
  }
  if (s.resultado != null) {
    el.textContent = fmtRS(s.resultado);
    el.classList.add(s.resultado >= 0 ? 'positive' : 'negative');
    hint.textContent = `${s.resultado >= 0 ? 'Compensa' : 'Não compensa'} · ${fmtN(s.margem, 1)}% no período · ${fmtN(s.retornoMensal, 2)}% ao mês · ${fmtN(s.dias, 0)} dias`;
  } else {
    el.textContent = '—';
    hint.textContent = 'Informe o valor pago e o preço da arroba na venda';
  }
  $('sim-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${fmtN(s.dias, 0)}</div><div class="stat-label">Dias de engorda</div></div>
    <div class="stat-card"><div class="stat-value">${fmtN(s.arrobasProduzidas, 2)} @</div><div class="stat-label">Arrobas produzidas</div></div>
    <div class="stat-card"><div class="stat-value">${s.investido != null ? fmtRS(s.investido) : '—'}</div><div class="stat-label">Total investido</div></div>
    <div class="stat-card"><div class="stat-value">${s.receita != null ? fmtRS(s.receita) : '—'}</div><div class="stat-label">Receita da venda</div></div>
    <div class="stat-card"><div class="stat-value">${s.precoArrobaCompra != null ? fmtRS(s.precoArrobaCompra) : '—'}</div><div class="stat-label">@ paga na compra</div></div>
    <div class="stat-card"><div class="stat-value">${s.custoArrobaProduzida != null ? fmtRS(s.custoArrobaProduzida) : '—'}</div><div class="stat-label">@ produzida custa</div></div>
    <div class="stat-card"><div class="stat-value ${s.lucroArrobaProduzida < 0 ? 'neg' : ''}">${s.lucroArrobaProduzida != null ? fmtRS(s.lucroArrobaProduzida) : '—'}</div><div class="stat-label">Lucro por @ produzida</div></div>
    <div class="stat-card"><div class="stat-value ${s.lucroArrobaVendida < 0 ? 'neg' : ''}">${s.lucroArrobaVendida != null ? fmtRS(s.lucroArrobaVendida) : '—'}</div><div class="stat-label">Lucro por @ vendida</div></div>
    <div class="stat-card"><div class="stat-value ${s.retornoMensal < 0 ? 'neg' : ''}">${s.retornoMensal != null ? fmtN(s.retornoMensal, 2) + '%' : '—'}</div><div class="stat-label">Retorno ao mês</div></div>
    <div class="stat-card"><div class="stat-value ${s.lucroMensal < 0 ? 'neg' : ''}">${s.lucroMensal != null ? fmtRS(s.lucroMensal) : '—'}</div><div class="stat-label">Lucro por mês</div></div>`;
}

function renderCustos() {
  const c = calcCusto();
  $('cst-arroba').textContent = c.custoArroba != null ? fmtRS(c.custoArroba) : '—';
  $('cst-hint').textContent = c.custoArroba != null
    ? `por @ produzida · rendimento ${fmtN(c.rend, 0)}%`
    : (c.arrobaDia == null ? 'Informe o GMD para calcular' : 'Informe ao menos um custo');

  $('cst-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${fmtRS(c.custoDia)}</div><div class="stat-label">Custo por dia</div></div>
    <div class="stat-card"><div class="stat-value">${fmtRS(c.custoDia * DIAS_MES)}</div><div class="stat-label">Custo por mês</div></div>
    <div class="stat-card"><div class="stat-value">${c.arrobaDia ? fmtN(c.arrobaDia * DIAS_MES, 2) + ' @' : '—'}</div><div class="stat-label">Ganho por mês</div></div>
    <div class="stat-card"><div class="stat-value">${c.arrobaDia ? fmtN(1 / c.arrobaDia, 0) : '—'}</div><div class="stat-label">Dias por @</div></div>`;

  const partes = [
    { nome: 'Sal', v: c.salDia },
    { nome: 'Sanidade', v: c.sanDia },
    { nome: 'Mão de obra', v: c.moDia },
    { nome: 'Terra', v: c.terraDia }
  ].filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const bd = $('cst-breakdown');
  bd.style.display = partes.length ? '' : 'none';
  if (partes.length) {
    const maxV = partes[0].v;
    bd.innerHTML = '<div class="cb-header">Composição do custo diário</div>' + partes.map(x => `
      <div class="cb-row">
        <div class="cb-line"><span>${x.nome}</span><span class="value">${fmtRS(x.v)} · ${fmtN(x.v / c.custoDia * 100, 0)}%</span></div>
        <div class="cb-bar"><div class="cb-fill saida" style="width:${Math.max(4, x.v / maxV * 100)}%"></div></div>
      </div>`).join('');
  }
  renderSimulacao(c);
  fillCustoInputs();
}

const CUSTO_CAMPOS = {
  'cst-gmd': 'gmd', 'cst-sal-consumo': 'salConsumo', 'cst-sal-preco': 'salPreco',
  'cst-sanidade': 'sanidade', 'cst-mo': 'mo', 'cst-terra': 'terra', 'cst-rend': 'rend',
  'cst-peso-compra': 'pesoCompra', 'cst-valor-compra': 'valorCompra',
  'cst-peso-venda': 'pesoVenda', 'cst-preco-arroba': 'precoArroba'
};
function fillCustoInputs() {
  Object.entries(CUSTO_CAMPOS).forEach(([id, key]) => {
    const el = $(id);
    if (document.activeElement === el) return; // não atropela quem está digitando
    const v = custoParams[key];
    el.value = Number.isFinite(v) ? v : '';
  });
}
let custoSaveTimer = null;
function saveCustoParams() {
  clearTimeout(custoSaveTimer);
  custoSaveTimer = setTimeout(() => {
    if (db && farm) db.collection('farms').doc(farm).set({ custo: clean(custoParams) }, { merge: true })
      .catch(() => toast('Falha ao salvar — será reenviado'));
  }, 700);
}
Object.entries(CUSTO_CAMPOS).forEach(([id, key]) => {
  $(id).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    // Peso, custo, GMD e rendimento negativos não existem — entrariam na conta
    // e produziriam um resultado falso.
    custoParams[key] = Number.isFinite(v) && v >= 0 ? v : null;
    saveCustoParams();
    renderCustos();
  });
});

function renderAnimalDetail() {
  const a = animals.find(x => x.id === detailAnimal);
  if (!a) { detailAnimal = null; render(); return; }
  const ws = wOf(a.id); const last = ws[ws.length - 1];
  const gT = gmdTotal(ws), gR = gmdRecent(ws);
  const arro = last ? last.weight * (settings.yield / 100) / 15 : null;
  $('animal-header').innerHTML = `
    <div class="animal-header">
      <div class="hrow">
        <h2>${esc(a.ident)}</h2>
        <button class="edit-link" id="btn-edit-animal">editar</button>
      </div>
      <div class="meta">${esc(a.cat || 'Sem categoria')}${a.entryDate ? ' · entrada ' + fmtBR(a.entryDate) : ''} · ${ws.length} pesagens${arro != null ? ' · ~' + fmtN(arro, 1) + ' @ (rend. ' + settings.yield + '%)' : ''}</div>
      ${a.manejoData ? `<div class="meta">Manejo sanitário: ${fmtBR(a.manejoData)}${a.manejoMedicamento ? ' — ' + esc(a.manejoMedicamento) : ''}</div>` : ''}
      <div class="metrics">
        <div class="metric"><div class="lbl">Peso atual</div><div class="val">${last ? fmtN(last.weight, 0) + ' kg' : '—'}</div></div>
        <div class="metric"><div class="lbl">GMD total</div><div class="val ${gmdCls(gT)}">${Number.isFinite(gT) ? fmtN(gT, 3) : '—'}</div></div>
        <div class="metric"><div class="lbl">GMD recente</div><div class="val ${gmdCls(gR)}">${Number.isFinite(gR) ? fmtN(gR, 3) : '—'}</div></div>
      </div>
    </div>`;
  $('btn-edit-animal').onclick = () => openAnimal(a);
  renderChart(ws);
  const rows = [...ws].reverse().map(w => {
    const idx = ws.indexOf(w);
    const prev = idx > 0 ? ws[idx - 1] : null;
    const g = prev ? gmdBetween(prev, w) : null;
    return `<div class="wt-row" data-weighing="${w.id}">
      <span class="date">${fmtBR(w.date)}</span>
      <span class="weight">${fmtN(w.weight, 1)} kg</span>
      <span class="flag">${w.jejum ? 'jejum' : ''}</span>
      <span class="gmd ${gmdCls(g)}">${Number.isFinite(g) ? fmtN(g, 3) : '—'}</span>
    </div>`;
  }).join('');
  $('weighings-table').innerHTML = `<div class="wt-header"><span>Data</span><span>Peso</span><span>Jejum</span><span style="text-align:right">GMD</span></div>` + (rows || '<div class="chart-empty">Sem pesagens</div>');
}

function renderChart(ws) {
  const wrap = $('chart-wrap');
  if (ws.length < 2) { wrap.innerHTML = '<div class="chart-empty">Registre 2+ pesagens para ver o gráfico</div>'; return; }
  const W = 320, H = 180, P = 24;
  const t0 = new Date(ws[0].date + 'T12:00').getTime(), t1 = new Date(ws[ws.length - 1].date + 'T12:00').getTime();
  let mn = Math.min(...ws.map(w => w.weight)), mx = Math.max(...ws.map(w => w.weight));
  if (mx - mn < 10) { mn -= 5; mx += 5; }
  const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  const X = t => t1 === t0 ? W / 2 : P + (t - t0) / (t1 - t0) * (W - 2 * P);
  const Y = w => H - P - (w - mn) / (mx - mn) * (H - 2 * P);
  const pts = ws.map(w => `${X(new Date(w.date + 'T12:00').getTime()).toFixed(1)},${Y(w.weight).toFixed(1)}`).join(' ');
  const dots = ws.map(w => `<circle cx="${X(new Date(w.date + 'T12:00').getTime()).toFixed(1)}" cy="${Y(w.weight).toFixed(1)}" r="3" fill="#225437"/>`).join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="#225437" stroke-width="2"/>${dots}
    <text x="${P}" y="12" font-size="9" fill="#78716c" font-family="monospace">${fmtN(mx, 0)} kg</text>
    <text x="${P}" y="${H - 6}" font-size="9" fill="#78716c" font-family="monospace">${fmtBR(ws[0].date)}</text>
    <text x="${W - P}" y="${H - 6}" font-size="9" fill="#78716c" font-family="monospace" text-anchor="end">${fmtBR(ws[ws.length - 1].date)}</text>
  </svg>`;
}

function renderEstoque() {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  $('stock-list').innerHTML = sorted.map(it => {
    const q = qtyOf(it.id); const ac = avgCostOf(it.id);
    const low = Number.isFinite(it.minQty) && it.minQty > 0 && q <= it.minQty;
    return `<div class="list-item" data-item="${it.id}">
      <div class="item-main">
        <div class="item-title">${esc(it.name)}</div>
        <div class="item-subtitle">${ac != null ? 'custo médio ' + fmtRS(ac) + '/' + it.unit : 'sem custo registrado'}${it.carencia ? ' · carência ' + it.carencia + 'd' : ''}</div>
      </div>
      <div class="item-side">
        <div class="value">${fmtN(q, q % 1 ? 2 : 0)} ${it.unit}</div>
        ${low ? '<div class="aux warn-low">⚠ estoque baixo</div>' : ''}
      </div>
    </div>`;
  }).join('');
  $('stock-empty').hidden = items.length > 0;
}

function renderStockDetail() {
  const it = items.find(x => x.id === detailItem);
  if (!it) { detailItem = null; render(); return; }
  const q = qtyOf(it.id); const ac = avgCostOf(it.id);
  const mv = movesOf(it.id);
  const spent30 = moves.filter(m => m.itemId === it.id && m.type === 'saida' && daysBetween(m.date, todayISO()) <= 30).reduce((s, m) => s + m.qty, 0);
  $('stock-header').innerHTML = `
    <div class="animal-header">
      <div class="hrow">
        <h2>${esc(it.name)}</h2>
        <button class="edit-link" id="btn-edit-item">editar</button>
      </div>
      <div class="meta">${it.carencia ? 'carência ' + it.carencia + ' dias · ' : ''}${esc(it.notes || '')}</div>
      <div class="metrics">
        <div class="metric"><div class="lbl">Em estoque</div><div class="val">${fmtN(q, q % 1 ? 2 : 0)} ${it.unit}</div></div>
        <div class="metric"><div class="lbl">Custo médio</div><div class="val">${ac != null ? fmtRS(ac) : '—'}</div></div>
        <div class="metric"><div class="lbl">Consumo 30d</div><div class="val">${fmtN(spent30, spent30 % 1 ? 1 : 0)} ${it.unit}</div></div>
      </div>
    </div>`;
  $('btn-edit-item').onclick = () => openItem(it);
  const rows = mv.map(m => `<div class="wt-row" data-move="${m.id}">
      <span class="date">${fmtBR(m.date)}</span>
      <span><span class="chip ${m.type}">${m.type === 'entrada' ? 'Entr.' : 'Saída'}</span></span>
      <span class="weight">${fmtN(m.qty, m.qty % 1 ? 2 : 0)}</span>
      <span class="gmd">${m.type === 'entrada' && Number.isFinite(m.unitCost) ? fmtRS(m.qty * m.unitCost) : ''}</span>
    </div>`).join('');
  $('stock-moves').innerHTML = `<div class="wt-header"><span>Data</span><span>Tipo</span><span>Qtd</span><span style="text-align:right">Total</span></div>` + (rows || '<div class="chart-empty">Sem movimentações</div>');
}

function renderFin(book) {
  const isAv = book === 'av';
  const list = isAv ? avT : bovT;
  const period = isAv ? $('av-period').value : $('bfin-period').value;
  const avSel = isAv ? $('av-aviary').value : null;
  const filtered = list.filter(t => inPeriod(t.date, period) && (!isAv || avSel === 'all' || t.aviary === avSel));
  const inn = filtered.filter(t => t.type === 'entrada').reduce((s, t) => s + t.amount, 0);
  const out = filtered.filter(t => t.type === 'saida').reduce((s, t) => s + t.amount, 0);
  const bal = inn - out;
  const balEl = isAv ? $('av-balance') : $('bfin-balance');
  balEl.innerHTML = `
    <div class="bc-label">Saldo do período</div>
    <div class="bc-value ${bal < 0 ? 'negative' : 'positive'}">${fmtRS(bal)}</div>
    <div class="bc-split">
      <div><div class="lbl">Entradas</div><div class="val in">${fmtRS(inn)}</div></div>
      <div><div class="lbl">Saídas</div><div class="val out">${fmtRS(out)}</div></div>
    </div>`;
  const agg = {};
  filtered.forEach(t => { const k = t.type + '|' + (t.category || 'Sem categoria'); agg[k] = (agg[k] || 0) + t.amount; });
  const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxV = entries.length ? entries[0][1] : 1;
  const catEl = isAv ? $('av-cats') : $('bfin-cats');
  catEl.innerHTML = entries.length ? `<div class="cb-header">Por categoria</div>` + entries.map(([k, v]) => {
    const [tp, cat] = k.split('|');
    return `<div class="cb-row">
      <div class="cb-line"><span>${esc(cat)}</span><span class="value ${tp}">${tp === 'saida' ? '−' : '+'} ${fmtRS(v)}</span></div>
      <div class="cb-bar"><div class="cb-fill ${tp}" style="width:${Math.max(4, v / maxV * 100)}%"></div></div>
    </div>`;
  }).join('') : '';
  catEl.style.display = entries.length ? '' : 'none';
  const listEl = isAv ? $('av-list') : $('bfin-list');
  const sorted = [...filtered].sort((a, b) => a.date < b.date ? 1 : -1);
  listEl.innerHTML = sorted.map(t => `<div class="list-item transaction-item" data-trans="${t.id}" data-book="${book}">
      <div class="item-main">
        <div class="item-title">${esc(t.category || (t.type === 'entrada' ? 'Entrada' : 'Saída'))}</div>
        <div class="item-subtitle">${fmtBR(t.date)}${isAv && t.aviary ? ' · Av. ' + esc(t.aviary) : ''}${t.notes ? ' · ' + esc(t.notes) : ''}</div>
      </div>
      <div class="item-side"><div class="value ${t.type}">${t.type === 'saida' ? '−' : '+'} ${fmtRS(t.amount)}</div></div>
    </div>`).join('');
  if (isAv) $('av-empty').hidden = avT.length > 0;
}

// ===== Modais =====
function openM(id) { $(id).hidden = false; }
function closeAllM() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAllM));

function openAnimal(a) {
  $('animal-modal-title').textContent = a ? 'Editar animal' : 'Novo animal';
  $('an-id').value = a ? a.id : '';
  $('an-ident').value = a ? a.ident : '';
  $('an-cat').value = a ? (a.cat || '') : '';
  $('an-entry-date').value = a ? (a.entryDate || '') : todayISO();
  $('an-entry-weight').value = a && a.entryWeight ? a.entryWeight : '';
  $('an-manejo-data').value = a ? (a.manejoData || '') : '';
  $('an-manejo-medicamento').value = a ? (a.manejoMedicamento || '') : '';
  $('an-notes').value = a ? (a.notes || '') : '';
  $('an-sold').checked = a ? !!a.sold : false;
  $('an-sold-date').value = a && a.soldDate ? a.soldDate : todayISO();
  $('an-sold-weight').value = a && Number.isFinite(a.soldWeight) ? a.soldWeight : '';
  $('an-sold-price').value = a && Number.isFinite(a.soldPrice) ? a.soldPrice : '';
  syncSoldWrap();
  $('btn-delete-animal').hidden = !a;
  openM('modal-animal');
}
function syncSoldWrap() {
  $('an-sold-wrap').style.display = $('an-sold').checked ? '' : 'none';
}
$('an-sold').addEventListener('change', syncSoldWrap);
function syncAnimalSaleTrans(a) {
  if (a.sold && Number.isFinite(a.soldPrice) && a.soldPrice > 0) {
    const saleData = { date: a.soldDate || todayISO(), type: 'entrada', amount: a.soldPrice, category: 'Venda de gado', notes: a.ident, lock: 'animal' };
    if (a.linkTrans) {
      const t = bovT.find(x => x.id === a.linkTrans);
      if (t) { Object.assign(t, saleData); upsert('bovtrans', t); return; }
    }
    // A venda já pode ter sido lançada à mão no Financeiro — não lança de novo
    // sem perguntar.
    const dup = findDupTrans(bovT, saleData, 'bov', null);
    if (dup && !askDuplicate(`Esta venda de ${fmtRS(saleData.amount)} em ${fmtBRfull(saleData.date)} já parece estar lançada no Financeiro${dup.notes ? `\nDescrição: ${dup.notes}` : ''}.\n\nO animal será marcado como vendido de qualquer forma.`)) {
      a.linkTrans = null;
      return;
    }
    const t = Object.assign({ id: uid() }, saleData);
    bovT.push(t); upsert('bovtrans', t);
    a.linkTrans = t.id;
  } else if (a.linkTrans) {
    bovT = bovT.filter(x => x.id !== a.linkTrans);
    remove('bovtrans', a.linkTrans);
    a.linkTrans = null;
  }
}
$('form-animal').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('an-id').value;
  const ident = $('an-ident').value.trim();
  if (!ident) return;
  const sold = $('an-sold').checked;
  // Brinco pode ser reutilizado depois da venda: só bloqueia se OUTRO animal
  // ativo já usa a identificação — e só quando este também ficará ativo.
  const dupe = !sold && animals.find(x => !x.sold && x.ident.toLowerCase() === ident.toLowerCase() && x.id !== id);
  if (dupe) { toast('Já existe animal ativo com essa identificação'); return; }
  const soldPriceRaw = parseFloat($('an-sold-price').value);
  const data = {
    ident, cat: $('an-cat').value.trim(),
    entryDate: $('an-entry-date').value || null,
    entryWeight: parseFloat($('an-entry-weight').value) || null,
    manejoData: $('an-manejo-data').value || null,
    manejoMedicamento: $('an-manejo-medicamento').value.trim() || null,
    notes: $('an-notes').value.trim(),
    sold,
    soldDate: sold ? ($('an-sold-date').value || todayISO()) : null,
    soldWeight: sold ? (parseFloat($('an-sold-weight').value) || null) : null,
    soldPrice: sold && Number.isFinite(soldPriceRaw) && soldPriceRaw > 0 ? soldPriceRaw : null
  };
  let a, isNew = false;
  if (id) {
    a = animals.find(x => x.id === id);
    Object.assign(a, data);
  } else {
    a = Object.assign({ id: uid() }, data);
    animals.push(a);
    isNew = true;
  }
  syncAnimalSaleTrans(a);
  upsert('animals', a);
  if (isNew && a.entryDate && a.entryWeight) {
    const w = { id: uid(), animalId: a.id, date: a.entryDate, weight: a.entryWeight, jejum: false, notes: 'Peso de entrada' };
    weighings.push(w); upsert('weighings', w);
  }
  closeAllM(); render(); toast('Animal salvo');
});
$('btn-delete-animal').addEventListener('click', () => {
  const id = $('an-id').value; if (!id) return;
  if (!confirm('Excluir o animal e TODAS as pesagens dele (em todos os aparelhos)?')) return;
  const a = animals.find(x => x.id === id);
  const ws = weighings.filter(w => w.animalId === id);
  const linkTrans = a && a.linkTrans;
  animals = animals.filter(x => x.id !== id);
  weighings = weighings.filter(w => w.animalId !== id);
  if (linkTrans) bovT = bovT.filter(x => x.id !== linkTrans);
  if (detailAnimal === id) detailAnimal = null;
  batchWrite([
    { col: 'animals', del: id },
    ...ws.map(w => ({ col: 'weighings', del: w.id })),
    ...(linkTrans ? [{ col: 'bovtrans', del: linkTrans }] : [])
  ]);
  closeAllM(); render(); toast('Animal excluído');
});

function openWeighing(animalId, w) {
  const a = animals.find(x => x.id === animalId);
  $('w-modal-title').textContent = w ? 'Editar pesagem' : 'Nova pesagem';
  $('w-context').textContent = 'Animal: ' + (a ? a.ident : '?');
  $('w-id').value = w ? w.id : '';
  $('w-animal-id').value = animalId;
  $('w-date').value = w ? w.date : todayISO();
  $('w-weight').value = w ? w.weight : '';
  $('w-jejum').checked = w ? !!w.jejum : false;
  $('w-notes').value = w ? (w.notes || '') : '';
  $('btn-delete-weighing').hidden = !w;
  openM('modal-weighing');
}
$('form-weighing').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('w-id').value, animalId = $('w-animal-id').value;
  const date = $('w-date').value, weight = parseFloat($('w-weight').value);
  if (!date || !Number.isFinite(weight) || weight <= 0) return;
  const dupW = weighings.find(x => x.id !== id && x.animalId === animalId && x.date === date);
  if (dupW) {
    const an = animals.find(x => x.id === animalId);
    if (!askDuplicate(`${an ? an.ident : 'Este animal'} já tem pesagem em ${fmtBRfull(dupW.date)}: ${fmtN(dupW.weight, 1)} kg.\n\nPara corrigir o peso, edite a pesagem existente em vez de criar outra.`)) return;
  }
  const data = { animalId, date, weight, jejum: $('w-jejum').checked, notes: $('w-notes').value.trim() };
  let w;
  if (id) { w = weighings.find(x => x.id === id); Object.assign(w, data); }
  else { w = Object.assign({ id: uid() }, data); weighings.push(w); }
  upsert('weighings', w);
  closeAllM(); render(); toast('Pesagem salva');
});
$('btn-delete-weighing').addEventListener('click', () => {
  const id = $('w-id').value; if (!id || !confirm('Excluir esta pesagem?')) return;
  weighings = weighings.filter(x => x.id !== id);
  remove('weighings', id);
  closeAllM(); render(); toast('Pesagem excluída');
});

function openTrans(book, t) {
  $('t-modal-title').textContent = t ? 'Editar lançamento' : 'Novo lançamento';
  $('t-id').value = t ? t.id : '';
  $('t-book').value = book;
  $('t-aviary-wrap').style.display = book === 'av' ? '' : 'none';
  $('t-category').setAttribute('list', book === 'av' ? 'cats-av' : 'cats-bov');
  document.querySelector(`input[name="t-type"][value="${t ? t.type : 'saida'}"]`).checked = true;
  $('t-date').value = t ? t.date : todayISO();
  $('t-amount').value = t ? t.amount : '';
  if (book === 'av') $('t-aviary').value = t && t.aviary ? t.aviary : '5';
  $('t-category').value = t ? (t.category || '') : '';
  $('t-notes').value = t ? (t.notes || '') : '';
  const ctx = $('t-context');
  if (t && t.lock === 'stock') { ctx.hidden = false; ctx.textContent = 'Gerado pelo estoque — prefira editar pela movimentação de estoque.'; }
  else if (t && t.lock === 'animal') { ctx.hidden = false; ctx.textContent = 'Gerado pela venda do animal — prefira editar pelo cadastro do animal.'; }
  else ctx.hidden = true;
  $('btn-delete-transaction').hidden = !t;
  openM('modal-transaction');
}
$('form-transaction').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('t-id').value, book = $('t-book').value;
  const amount = parseFloat($('t-amount').value);
  const date = $('t-date').value;
  if (!date || !Number.isFinite(amount) || amount <= 0) return;
  const data = {
    date, amount,
    type: document.querySelector('input[name="t-type"]:checked').value,
    category: $('t-category').value.trim(),
    notes: $('t-notes').value.trim()
  };
  if (book === 'av') data.aviary = $('t-aviary').value;
  const arr = book === 'av' ? avT : bovT;
  const col = book === 'av' ? 'avtrans' : 'bovtrans';
  const dup = findDupTrans(arr, data, book, id);
  if (dup) {
    const tipo = dup.type === 'entrada' ? 'entrada' : 'saída';
    const origem = dup.lock === 'stock' ? '\n(gerado por uma compra de estoque)'
      : dup.lock === 'animal' ? '\n(gerado pela venda de um animal)' : '';
    if (!askDuplicate(`Já existe uma ${tipo} de ${fmtRS(dup.amount)} em ${fmtBRfull(dup.date)}${dup.category ? `\nCategoria: ${dup.category}` : ''}${dup.notes ? `\nDescrição: ${dup.notes}` : ''}${origem}`)) return;
  }
  let t;
  if (id) { t = arr.find(x => x.id === id); Object.assign(t, data); }
  else { t = Object.assign({ id: uid() }, data); arr.push(t); }
  upsert(col, t);
  closeAllM(); render(); toast('Lançamento salvo');
});
$('btn-delete-transaction').addEventListener('click', () => {
  const id = $('t-id').value, book = $('t-book').value;
  if (!id || !confirm('Excluir este lançamento?')) return;
  if (book === 'av') { avT = avT.filter(x => x.id !== id); remove('avtrans', id); }
  else {
    bovT = bovT.filter(x => x.id !== id); remove('bovtrans', id);
    moves.forEach(m => { if (m.linkTrans === id) { delete m.linkTrans; upsert('moves', m); } });
    animals.forEach(a => { if (a.linkTrans === id) { delete a.linkTrans; upsert('animals', a); } });
  }
  closeAllM(); render(); toast('Lançamento excluído');
});

function openItem(it) {
  $('i-modal-title').textContent = it ? 'Editar item' : 'Novo item de estoque';
  $('i-id').value = it ? it.id : '';
  $('i-name').value = it ? it.name : '';
  $('i-unit').value = it ? it.unit : 'kg';
  $('i-min').value = it && it.minQty ? it.minQty : '';
  $('i-carencia').value = it && it.carencia ? it.carencia : '';
  $('i-notes').value = it ? (it.notes || '') : '';
  $('btn-delete-item').hidden = !it;
  openM('modal-item');
}
$('form-item').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('i-id').value;
  const name = $('i-name').value.trim();
  if (!name) return;
  const data = { name, unit: $('i-unit').value, minQty: parseFloat($('i-min').value) || null, carencia: parseInt($('i-carencia').value) || null, notes: $('i-notes').value.trim() };
  let it;
  if (id) { it = items.find(x => x.id === id); Object.assign(it, data); }
  else { it = Object.assign({ id: uid() }, data); items.push(it); }
  upsert('items', it);
  closeAllM(); render(); toast('Item salvo');
});
$('btn-delete-item').addEventListener('click', () => {
  const id = $('i-id').value;
  if (!id || !confirm('Excluir o item e todas as movimentações dele? Lançamentos financeiros vinculados também serão removidos.')) return;
  const mv = moves.filter(m => m.itemId === id);
  const linked = mv.filter(m => m.linkTrans).map(m => m.linkTrans);
  bovT = bovT.filter(t => !linked.includes(t.id));
  moves = moves.filter(m => m.itemId !== id);
  items = items.filter(x => x.id !== id);
  if (detailItem === id) detailItem = null;
  batchWrite([
    { col: 'items', del: id },
    ...mv.map(m => ({ col: 'moves', del: m.id })),
    ...linked.map(t => ({ col: 'bovtrans', del: t }))
  ]);
  closeAllM(); render(); toast('Item excluído');
});

function syncMoveCostUI() {
  const type = document.querySelector('input[name="m-type"]:checked').value;
  $('m-cost-wrap').style.display = type === 'entrada' ? '' : 'none';
}
document.querySelectorAll('input[name="m-type"]').forEach(r => r.addEventListener('change', syncMoveCostUI));
function openMove(itemId, presetType, m) {
  const it = items.find(x => x.id === itemId);
  if (!it) return;
  $('m-modal-title').textContent = m ? 'Editar movimentação' : (presetType === 'entrada' ? 'Entrada (compra)' : 'Saída (consumo)');
  $('m-context').textContent = `${it.name} — em estoque: ${fmtN(qtyOf(it.id), 1)} ${it.unit}`;
  $('m-id').value = m ? m.id : '';
  $('m-item-id').value = itemId;
  document.querySelector(`input[name="m-type"][value="${m ? m.type : presetType}"]`).checked = true;
  $('m-date').value = m ? m.date : todayISO();
  $('m-qty').value = m ? m.qty : '';
  $('m-cost').value = m && Number.isFinite(m.unitCost) ? m.unitCost : '';
  $('m-postfin').checked = m ? !!m.linkTrans : true;
  $('m-notes').value = m ? (m.notes || '') : '';
  $('btn-delete-move').hidden = !m;
  syncMoveCostUI();
  openM('modal-move');
}
$('form-move').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('m-id').value, itemId = $('m-item-id').value;
  const it = items.find(x => x.id === itemId);
  const type = document.querySelector('input[name="m-type"]:checked').value;
  const date = $('m-date').value, qty = parseFloat($('m-qty').value);
  const unitCost = parseFloat($('m-cost').value);
  const postFin = $('m-postfin').checked;
  if (!date || !Number.isFinite(qty) || qty <= 0) return;
  const dupMv = moves.find(x => x.id !== id && x.itemId === itemId && x.date === date && x.type === type && Math.abs(x.qty - qty) < 0.0001);
  if (dupMv) {
    const tipo = type === 'entrada' ? 'entrada' : 'saída';
    if (!askDuplicate(`Já existe uma ${tipo} de ${fmtN(dupMv.qty, dupMv.qty % 1 ? 2 : 0)} ${it.unit} de ${it.name} em ${fmtBRfull(dupMv.date)}${dupMv.notes ? `\nObs.: ${dupMv.notes}` : ''}`)) return;
  }
  let mv;
  if (id) { mv = moves.find(x => x.id === id); Object.assign(mv, { type, date, qty, notes: $('m-notes').value.trim() }); }
  else { mv = { id: uid(), itemId, type, date, qty, notes: $('m-notes').value.trim() }; moves.push(mv); }
  if (type === 'entrada') {
    mv.unitCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;
    const total = mv.unitCost ? qty * mv.unitCost : null;
    if (postFin && total) {
      if (mv.linkTrans) {
        const t = bovT.find(x => x.id === mv.linkTrans);
        if (t) { Object.assign(t, { date, amount: total, notes: it.name + (mv.notes ? ' — ' + mv.notes : '') }); upsert('bovtrans', t); }
        else mv.linkTrans = null;
      }
      if (!mv.linkTrans) {
        const t = { id: uid(), date, type: 'saida', amount: total, category: 'Ração/insumos', notes: it.name + (mv.notes ? ' — ' + mv.notes : ''), lock: 'stock' };
        bovT.push(t); upsert('bovtrans', t);
        mv.linkTrans = t.id;
      }
    } else if (mv.linkTrans) {
      bovT = bovT.filter(x => x.id !== mv.linkTrans);
      remove('bovtrans', mv.linkTrans);
      mv.linkTrans = null;
    }
  } else {
    delete mv.unitCost;
    if (mv.linkTrans) { bovT = bovT.filter(x => x.id !== mv.linkTrans); remove('bovtrans', mv.linkTrans); mv.linkTrans = null; }
  }
  upsert('moves', mv);
  closeAllM(); render(); toast('Movimentação salva');
});
$('btn-delete-move').addEventListener('click', () => {
  const id = $('m-id').value; if (!id || !confirm('Excluir esta movimentação?')) return;
  const mv = moves.find(x => x.id === id);
  if (mv && mv.linkTrans) { bovT = bovT.filter(x => x.id !== mv.linkTrans); remove('bovtrans', mv.linkTrans); }
  moves = moves.filter(x => x.id !== id);
  remove('moves', id);
  closeAllM(); render(); toast('Movimentação excluída');
});

// ===== Modo pesagem =====
let wmCount = 0;
function openWeighMode() {
  wmCount = 0;
  $('wm-date').value = todayISO();
  $('wm-jejum').checked = false;
  $('wm-ident').value = ''; $('wm-peso').value = '';
  $('wm-last').textContent = ''; $('wm-count').textContent = '';
  refreshIdentList();
  $('weigh-mode').hidden = false;
  setTimeout(() => $('wm-ident').focus(), 100);
}
function refreshIdentList() {
  $('wm-idents').innerHTML = animals.filter(a => !a.sold).map(a => `<option value="${esc(a.ident)}"></option>`).join('');
}
$('btn-weigh-mode').addEventListener('click', openWeighMode);
$('wm-close').addEventListener('click', () => { $('weigh-mode').hidden = true; render(); });
$('wm-save').addEventListener('click', () => {
  const ident = $('wm-ident').value.trim();
  const peso = parseFloat($('wm-peso').value);
  const date = $('wm-date').value;
  if (!ident || !Number.isFinite(peso) || peso <= 0 || !date) { toast('Preencha brinco e peso'); return; }
  let a = animals.find(x => !x.sold && x.ident.toLowerCase() === ident.toLowerCase());
  let createdNew = false;
  if (!a) {
    a = { id: uid(), ident, cat: '', entryDate: date, entryWeight: null, notes: '' };
    animals.push(a); upsert('animals', a); createdNew = true; refreshIdentList();
  }
  const jejum = $('wm-jejum').checked;
  const ws = wOf(a.id);
  const sameDay = ws.find(w => w.date === date);
  let replaced = false, w;
  if (sameDay) { w = sameDay; Object.assign(w, { weight: peso, jejum }); replaced = true; }
  else { w = { id: uid(), animalId: a.id, date, weight: peso, jejum, notes: '' }; weighings.push(w); }
  const prev = wOf(a.id).filter(x => x.date < date).pop();
  const g = prev ? gmdBetween(prev, { date, weight: peso }) : null;
  upsert('weighings', w);
  wmCount++;
  $('wm-count').textContent = `${wmCount} pesagen${wmCount > 1 ? 's' : ''} nesta sessão`;
  $('wm-last').textContent = `✓ ${a.ident} · ${fmtN(peso, 1)} kg` +
    (Number.isFinite(g) ? ` · GMD ${fmtN(g, 3)} (desde ${fmtBR(prev.date)})` : createdNew ? ' · novo animal' : replaced ? ' · atualizada' : ' · 1ª pesagem');
  $('wm-ident').value = ''; $('wm-peso').value = '';
  $('wm-ident').focus();
});

// ===== Importar CSV =====
let pendingRows = null;
function parseDateFlex(s) {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
$('menu-import').addEventListener('click', () => { closeAllM(); $('csv-input').value = ''; $('import-preview').hidden = true; pendingRows = null; openM('modal-import'); });
$('btn-template').addEventListener('click', () => download('modelo-pesagens.csv', 'identificacao,data,peso\nBR001,15/01/2025,320\nBR001,20/04/2025,415\n', 'text/csv'));
$('csv-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { toast('Arquivo vazio'); return; }
    const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    const rows = []; const errors = [];
    lines.forEach((line, i) => {
      const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
      if (i === 0 && /ident|animal|brinco/i.test(cols[0])) return;
      if (cols.length < 3) { errors.push(`Linha ${i + 1}: menos de 3 colunas`); return; }
      const ident = cols[0];
      const date = parseDateFlex(cols[1]);
      const peso = parseFloat(cols[2].replace(',', '.'));
      if (!ident) { errors.push(`Linha ${i + 1}: identificação vazia`); return; }
      if (!date) { errors.push(`Linha ${i + 1}: data inválida "${cols[1]}"`); return; }
      if (!Number.isFinite(peso) || peso <= 0) { errors.push(`Linha ${i + 1}: peso inválido "${cols[2]}"`); return; }
      rows.push({ ident, date, peso });
    });
    const existingIdents = new Set(animals.filter(a => !a.sold).map(a => a.ident.toLowerCase()));
    const newIdents = new Set(rows.map(r => r.ident.toLowerCase()).filter(x => !existingIdents.has(x)));
    let dupes = 0;
    rows.forEach(r => {
      const a = animals.find(x => !x.sold && x.ident.toLowerCase() === r.ident.toLowerCase());
      if (a && weighings.some(w => w.animalId === a.id && w.date === r.date)) dupes++;
    });
    pendingRows = rows;
    $('preview-stats').innerHTML = `<b>${rows.length}</b> pesagens válidas · <b>${newIdents.size}</b> animais novos serão criados · <b>${dupes}</b> duplicatas serão ignoradas${errors.length ? ` · <b>${errors.length}</b> linhas com erro` : ''}`;
    $('preview-errors').hidden = !errors.length;
    $('preview-errors').innerHTML = errors.slice(0, 10).join('<br>') + (errors.length > 10 ? `<br>… e mais ${errors.length - 10}` : '');
    $('import-preview').hidden = false;
  };
  reader.readAsText(f, 'utf-8');
});
$('btn-confirm-import').addEventListener('click', async () => {
  if (!pendingRows || !pendingRows.length) { toast('Nada para importar'); return; }
  let added = 0, dup = 0, newA = 0;
  const ops = [];
  pendingRows.forEach(r => {
    let a = animals.find(x => !x.sold && x.ident.toLowerCase() === r.ident.toLowerCase());
    if (!a) {
      a = { id: uid(), ident: r.ident, cat: '', entryDate: r.date, entryWeight: null, notes: '' };
      animals.push(a); ops.push({ col: 'animals', obj: a }); newA++;
    }
    if (weighings.some(w => w.animalId === a.id && w.date === r.date)) { dup++; return; }
    const w = { id: uid(), animalId: a.id, date: r.date, weight: r.peso, jejum: false, notes: 'Importado' };
    weighings.push(w); ops.push({ col: 'weighings', obj: w });
    added++;
  });
  closeAllM(); render();
  toast('Enviando para a nuvem…');
  try { await batchWrite(ops); toast(`${added} pesagens importadas${newA ? `, ${newA} animais criados` : ''}${dup ? `, ${dup} duplicadas ignoradas` : ''}`); }
  catch (err) { toast('Falha parcial no envio — verifique a conexão'); }
  pendingRows = null;
});

// ===== Exportações =====
function download(name, content, mime) {
  const blob = new Blob(['\ufeff' + content], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}
$('menu-exp-pes').addEventListener('click', () => {
  const rows = ['identificacao;data;peso_kg;jejum;observacoes'];
  weighings.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(w => {
    const a = animals.find(x => x.id === w.animalId);
    rows.push(`${a ? a.ident : '?'};${fmtBRfull(w.date)};${String(w.weight).replace('.', ',')};${w.jejum ? 'sim' : 'nao'};${(w.notes || '').replace(/;/g, ',')}`);
  });
  download('pesagens-fazendajs.csv', rows.join('\n'), 'text/csv');
  closeAllM(); toast('CSV de pesagens exportado');
});
function exportFin(book) {
  const list = book === 'av' ? avT : bovT;
  const rows = [book === 'av' ? 'data;tipo;valor;aviario;categoria;classificacao;descricao' : 'data;tipo;valor;categoria;classificacao;descricao'];
  list.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(t => {
    const val = fmtN(t.amount, 2);
    const cat = t.category || ''; const cls = classOf(cat, t.type);
    if (book === 'av') rows.push([fmtBRfull(t.date), t.type, val, t.aviary || '', cat, cls, (t.notes || '').replace(/;/g, ',')].join(';'));
    else rows.push([fmtBRfull(t.date), t.type, val, cat, cls, (t.notes || '').replace(/;/g, ',')].join(';'));
  });
  download(`financeiro-${book === 'av' ? 'aviarios' : 'bovinos'}-fazendajs.csv`, rows.join('\n'), 'text/csv');
  closeAllM(); toast('CSV financeiro exportado');
}
$('menu-exp-bfin').addEventListener('click', () => exportFin('bov'));
$('menu-exp-afin').addEventListener('click', () => exportFin('av'));

// ===== Backup / restauração =====
$('menu-backup').addEventListener('click', () => {
  const data = { app: 'fazendajs', v: 4, exportedAt: new Date().toISOString(), animals, weighings, bovT, avT, items, moves, settings, custo: custoParams };
  download(`backup-fazendajs-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
  closeAllM(); toast('Backup baixado');
});
$('menu-restore').addEventListener('click', () => $('restore-input').click());
$('restore-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = JSON.parse(String(reader.result));
      if (d.app !== 'fazendajs') { toast('Arquivo não é um backup do Fazenda JS'); return; }
      if (!confirm('Substituir TODOS os dados da fazenda (em todos os aparelhos) pelo backup?')) return;
      toast('Restaurando…');
      const delOps = [
        ...animals.map(x => ({ col: 'animals', del: x.id })),
        ...weighings.map(x => ({ col: 'weighings', del: x.id })),
        ...bovT.map(x => ({ col: 'bovtrans', del: x.id })),
        ...avT.map(x => ({ col: 'avtrans', del: x.id })),
        ...items.map(x => ({ col: 'items', del: x.id })),
        ...moves.map(x => ({ col: 'moves', del: x.id }))
      ];
      await batchWrite(delOps);
      const addOps = [
        ...(d.animals || []).map(x => ({ col: 'animals', obj: x })),
        ...(d.weighings || []).map(x => ({ col: 'weighings', obj: x })),
        ...(d.bovT || []).map(x => ({ col: 'bovtrans', obj: x })),
        ...(d.avT || []).map(x => ({ col: 'avtrans', obj: x })),
        ...(d.items || []).map(x => ({ col: 'items', obj: x })),
        ...(d.moves || []).map(x => ({ col: 'moves', obj: x }))
      ];
      await batchWrite(addOps);
      const farmDoc = {};
      if (d.settings && Number.isFinite(d.settings.yield)) farmDoc.yield = d.settings.yield;
      if (d.custo) farmDoc.custo = Object.assign({}, CUSTO_VAZIO, d.custo);
      if (Object.keys(farmDoc).length) await db.collection('farms').doc(farm).set(farmDoc, { merge: true });
      detailAnimal = null; detailItem = null; closeAllM();
      toast('Backup restaurado');
    } catch (err) { toast('Arquivo inválido ou falha de conexão'); }
  };
  reader.readAsText(f, 'utf-8');
  e.target.value = '';
});
$('menu-clear').addEventListener('click', async () => {
  if (!confirm('Apagar TODOS os dados da fazenda, em todos os aparelhos?\n\nRecomendado baixar um backup antes (menu → Backup completo).')) return;
  const typed = prompt('Esta ação NÃO pode ser desfeita.\n\nPara confirmar, digite a palavra:\n\nAPAGAR');
  if (typed == null) return;
  if (typed.trim().toUpperCase() !== 'APAGAR') { toast('Confirmação incorreta — nada foi apagado'); return; }
  const ops = [
    ...animals.map(x => ({ col: 'animals', del: x.id })),
    ...weighings.map(x => ({ col: 'weighings', del: x.id })),
    ...bovT.map(x => ({ col: 'bovtrans', del: x.id })),
    ...avT.map(x => ({ col: 'avtrans', del: x.id })),
    ...items.map(x => ({ col: 'items', del: x.id })),
    ...moves.map(x => ({ col: 'moves', del: x.id }))
  ];
  detailAnimal = null; detailItem = null; closeAllM();
  toast('Apagando…');
  try { await batchWrite(ops); toast('Dados apagados'); } catch (e) { toast('Falha ao apagar — verifique a conexão'); }
});
$('menu-migrate').addEventListener('click', () => { closeAllM(); migrateLegacy(); });
$('menu-leave').addEventListener('click', () => {
  if (!confirm('Desconectar este aparelho? Os dados na nuvem permanecem. Você precisará colar a configuração e o código da fazenda novamente.')) return;
  LS.del('fjs-fbconfig'); LS.del('fjs-farm');
  location.reload();
});

// ===== Ajustes =====
$('set-yield').addEventListener('change', e => {
  let v = parseInt(e.target.value);
  if (!Number.isFinite(v)) v = 52;
  v = Math.min(65, Math.max(40, v));
  e.target.value = v; settings.yield = v;
  if (db && farm) db.collection('farms').doc(farm).set({ yield: v }, { merge: true });
  render();
});

// ===== Navegação global =====
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.view; render(); }));
document.querySelectorAll('#bov-segs .seg').forEach(s => s.addEventListener('click', () => { seg = s.dataset.seg; detailAnimal = null; detailItem = null; render(); }));
document.querySelectorAll('.back-btn').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.back === 'animal') detailAnimal = null;
  if (b.dataset.back === 'item') detailItem = null;
  render();
}));
$('btn-menu').addEventListener('click', () => {
  $('set-yield').value = settings.yield;
  $('menu-farm-info').textContent = farm ? `Fazenda: ${farm} · ${navigator.onLine ? 'on-line' : 'off-line (sincroniza depois)'}` : 'Não conectado';
  updateMigrateBtn();
  openM('modal-menu');
});
$('btn-move-in').addEventListener('click', () => openMove(detailItem, 'entrada'));
$('btn-move-out').addEventListener('click', () => openMove(detailItem, 'saida'));
$('bfin-period').addEventListener('change', render);
$('av-period').addEventListener('change', render);
$('av-aviary').addEventListener('change', render);
$('bov-sort').value = bovSort;
$('bov-sort').addEventListener('change', e => { bovSort = e.target.value; LS.s('fjs-sort-rebanho', bovSort); render(); });

document.addEventListener('click', e => {
  const aed = e.target.closest('[data-animal-edit]');
  if (aed) { const a = animals.find(x => x.id === aed.dataset.animalEdit); if (a) openAnimal(a); return; }
  const ai = e.target.closest('[data-animal]');
  if (ai) { detailAnimal = ai.dataset.animal; render(); return; }
  const si = e.target.closest('[data-item]');
  if (si) { detailItem = si.dataset.item; render(); return; }
  const wr = e.target.closest('[data-weighing]');
  if (wr) { const w = weighings.find(x => x.id === wr.dataset.weighing); if (w) openWeighing(w.animalId, w); return; }
  const mr = e.target.closest('[data-move]');
  if (mr) { const m = moves.find(x => x.id === mr.dataset.move); if (m) openMove(m.itemId, m.type, m); return; }
  const tr = e.target.closest('[data-trans]');
  if (tr) {
    const book = tr.dataset.book;
    const t = (book === 'av' ? avT : bovT).find(x => x.id === tr.dataset.trans);
    if (t) openTrans(book, t);
  }
});

$('fab').addEventListener('click', () => {
  if (tab === 'aviarios') return openTrans('av');
  if (seg === 'vendidas' || seg === 'custos') return;
  if (seg === 'rebanho' && detailAnimal) return openWeighing(detailAnimal);
  if (seg === 'rebanho') return openAnimal();
  if (seg === 'estoque' && detailItem) return openMove(detailItem, 'entrada');
  if (seg === 'estoque') return openItem();
  return openTrans('bov');
});

// ===== Setup =====
$('su-connect').addEventListener('click', () => {
  const err = $('su-error'); err.hidden = true;
  const cfg = parseConfig($('su-config').value);
  const farmCode = $('su-farm').value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!cfg) { err.hidden = false; err.textContent = 'Configuração inválida. Cole o bloco firebaseConfig completo, com apiKey e projectId.'; return; }
  if (!farmCode || farmCode.length < 4) { err.hidden = false; err.textContent = 'Código da fazenda precisa de pelo menos 4 caracteres.'; return; }
  LS.s('fjs-fbconfig', cfg); LS.s('fjs-farm', farmCode);
  $('setup-screen').hidden = true;
  connect(cfg, farmCode);
});

// ===== PWA =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  if (!localStorage.getItem('fjs-install-dismissed')) $('install-banner').hidden = false;
});
$('install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  $('install-banner').hidden = true; deferredPrompt = null;
});
$('close-banner').addEventListener('click', () => { $('install-banner').hidden = true; localStorage.setItem('fjs-install-dismissed', '1'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => {
  // updateViaCache: 'none' impede que o próprio sw.js seja lido do cache do
  // navegador — sem isso, uma versão nova pode demorar a chegar ao aparelho.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(() => {});
});

// ===== Início =====
(function init() {
  render();
  const cfg = LS.g('fjs-fbconfig', null);
  const savedFarm = LS.g('fjs-farm', null);
  if (cfg && savedFarm) { connect(cfg, savedFarm); }
  else { $('setup-screen').hidden = false; }
})();
