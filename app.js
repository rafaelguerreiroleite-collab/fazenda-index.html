// ===== Fazenda JS — versão multi-aparelho (Firebase/Firestore) =====
// Sobe junto com o número no sw.js e no index.html a cada publicação. Fica
// visível no menu: quando um recurso novo "não aparece", é este número que
// diz se o aparelho está atrasado ou se o defeito é do aplicativo.
const VERSAO = 100;
const $ = id => document.getElementById(id);
const LS = {
  g: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  // devolve false quando não conseguiu gravar (memória do aparelho cheia, por
  // exemplo) — quem chama precisa saber, senão o dado some sem ninguém ver
  s: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} }
};
// IDENTIDADE DE REGISTRO. Era carimbo de tempo mais cinco caracteres de
// Math.random() — e cinco caracteres base36 são sessenta milhões de
// combinações, o que parece muito até alguém criar mil registros no mesmo
// instante. Medido: um lote de MIL ids sorteados no mesmo milissegundo tem
// 0,9% de chance de conter dois iguais. Importar uma planilha com 500 pesagens
// cria exatamente isso — 500 animais e 500 pesagens num laço só.
//
// E id repetido não dá erro em lugar nenhum. A gravação é por id: o segundo
// registro simplesmente SOBRESCREVE o primeiro na nuvem, e a pesagem some sem
// rastro, sem aviso, sem nada na tela que denuncie. É o pior tipo de defeito
// que este aplicativo pode ter.
//
// Agora vão três coisas juntas:
//   · o instante, que separa as sessões no tempo;
//   · um CONTADOR que não repete dentro desta sessão — garantia absoluta para
//     criação em lote, que é justamente onde o risco morava;
//   · bytes do sorteador criptográfico do navegador, que separam um aparelho
//     do outro quando os dois criam registros no mesmo milissegundo.
// Math.random fica só como último recurso, se o sorteador não existir.
let uidSeq = 0;
function uid() {
  let r;
  try {
    const b = new Uint8Array(5);
    crypto.getRandomValues(b);
    r = Array.from(b, x => x.toString(36).padStart(2, '0')).join('');
  } catch (e) {
    r = Math.random().toString(36).slice(2).padEnd(8, '0').slice(0, 8);
  }
  return Date.now().toString(36) + (++uidSeq).toString(36) + r;
}
const todayISO = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fmtBR = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const fmtBRfull = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtN = (n, c = 2) => Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) : '—';
const fmtRS = n => 'R$ ' + fmtN(n, 2);
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = o => JSON.parse(JSON.stringify(o));
// Lê número digitado em português: aceita vírgula decimal e ponto de milhar.
// Campos type="number" descartavam a vírgula em silêncio ("4,50" virava 450).
const MILHAR = /^-?[1-9]\d{0,2}(\.\d{3})+$/;
function parseNum(txt) {
  if (typeof txt !== 'string') return NaN;
  let s = txt.trim().replace(/\s/g, '');
  if (!s) return NaN;
  const v = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (v > -1 && d > -1) {
    // o separador que vem por último é o decimal; o outro é de milhar
    const dec = Math.max(v, d);
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
  } else if (v > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (MILHAR.test(s)) {
    // Ponto SEM vírgula nenhuma, em grupos exatos de três: é milhar, não
    // decimal. "10.000" era lido como R$ 10,00 — erro de mil vezes, calado,
    // dentro do lançamento; e "1.000.000" era recusado como texto inválido,
    // porque dois pontos não passavam pela peneira do fim.
    //
    // A peneira é estreita de propósito, para não atropelar o decimal de quem
    // digita no teclado numérico: exige parte inteira que NÃO começa com zero
    // e exatamente três dígitos por grupo. Assim "4.50" continua 4,50 e
    // "0.850" continua 0,850 — centavo não tem três casas, e dose e GMD se
    // escrevem com o zero na frente.
    s = s.replace(/\./g, '');
  }
  return /^-?\d*\.?\d*$/.test(s) ? parseFloat(s) : NaN;
}
// Mostra o número de volta no campo em português (2,5 em vez de 2.5)
const numParaCampo = n => Number.isFinite(n) ? String(n).replace('.', ',') : '';
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._to); t._to = setTimeout(() => t.hidden = true, 2500); }

// ===== Estado (espelho local dos snapshots) =====
let animals = [], weighings = [], bovT = [], avT = [], gerT = [], items = [], moves = [];
// MOVIMENTO DO REBANHO, em CABEÇAS.
//
// O rebanho sempre foi contado um a um, pelo brinco — e isso é o que permite
// pesar, acompanhar GMD e saber de cada bicho. Mas lote comprado não chega com
// brinco: chegam 50 bezerros, e eles só vão sendo identificados aos poucos.
// Até então o aplicativo não tinha como responder "quantas cabeças eu tenho",
// que é a pergunta mais simples que se faz sobre uma fazenda de gado.
//
// Este livro responde por CABEÇA, não por animal: saldo inicial, compras e
// nascimentos entram; vendas e mortes em lote saem. E as vendas e as mortes
// dos animais COM BRINCO saem sozinhas, lidas do cadastro — é o que mantém um
// número só em vez de dois que discordam.
let rebmov = [];
// Três livros de dinheiro: Bovinos, Aviários e Geral. Geral é o custo da
// fazenda que não pertence a nenhuma das duas atividades — contador, imposto,
// energia da sede, trator. Ratear no chute entre as duas falsearia o resultado
// de cada uma; deixar de fora esconderia despesa real da fazenda.
// Tudo que percorre livro passa por estes apelidos, e não por "if" espalhado:
// esquecer um lugar é um lançamento sumindo de um total sem ninguém notar.
// Bovinos, Aviários e Geral são fixos: os dois primeiros têm tela própria
// (rebanho, pesagem, estoque) e o Geral é o custo que não é de nenhum dos dois.
// Além deles, a pessoa cria as atividades dela — soja, leite, maquinário. Uma
// atividade criada é um LIVRO DE DINHEIRO e só isso: entra no lançamento, nos
// filtros, no resumo da Fazenda e no backup, mas não ganha rebanho nem
// pesagem, que são coisas de boi e de frango.
const LIVROS_FIXOS = ['bov', 'av', 'ger'];
const NOME_FIXO = { bov: 'Bovinos', av: 'Aviários', ger: 'Geral' };
const COL_LIVRO = { bov: 'bovtrans', av: 'avtrans', ger: 'gertrans' };
let atividades = [];    // [{ id, nome }] — as criadas pela pessoa
let extraT = {};        // { id: [lançamentos] }
let LIVROS = LIVROS_FIXOS.slice();
let NOME_LIVRO = Object.assign({}, NOME_FIXO);
const ehExtra = b => Object.prototype.hasOwnProperty.call(extraT, b);
function recomputarLivros() {
  LIVROS = LIVROS_FIXOS.concat(atividades.map(a => a.id));
  NOME_LIVRO = Object.assign({}, NOME_FIXO);
  atividades.forEach(a => {
    NOME_LIVRO[a.id] = a.nome;
    if (!extraT[a.id]) extraT[a.id] = [];
  });
}
// A queda para bovT quando o livro é desconhecido é de propósito e vem de
// antes: livro em branco tem de cair em ALGUM lugar de verdade, e devolver um
// array novo faria o lançamento sumir sem erro nenhum.
const arrLivro = b => b === 'av' ? avT : b === 'ger' ? gerT : ehExtra(b) ? extraT[b] : bovT;
const colLivro = b => COL_LIVRO[b] || (ehExtra(b) ? 'at_' + b : 'bovtrans');
function setLivro(b, v) {
  if (b === 'av') avT = v;
  else if (b === 'ger') gerT = v;
  else if (ehExtra(b)) extraT[b] = v;
  else bovT = v;
}
let settings = { yield: 52 };
// Parâmetros da calculadora de custo da arroba (independentes das outras abas)
const CUSTO_VAZIO = {
  gmd: null, salPct: null, salPreco: null, sanidade: null, mo: null, terra: null, rend: null,
  pesoCompra: null, valorCompra: null, pesoVenda: null, precoArroba: null,
  rendCompra: null, rendVenda: null
};
const CUSTO_REND_PADRAO = 52; // próprio desta aba — não usa o rendimento do Rebanho
// Mês médio real (365/12). Usar 30 fixos cobraria ~1,4% de custo a mais num
// ciclo longo, porque o ano tem 12,17 meses de 30 dias.
const DIAS_MES = 365 / 12;
const SAL_PCT_PADRAO = 0.3; // consumo de sal como % do peso vivo por dia
let custoParams = Object.assign({}, CUSTO_VAZIO);

// ===== Firebase =====
let db = null, farm = null, unsubs = [];
const COLS = { animals: a => animals = a, weighings: a => weighings = a, bovtrans: a => bovT = a, avtrans: a => avT = a, gertrans: a => gerT = a, items: a => items = a, moves: a => moves = a, rebmov: a => rebmov = a };
const colRef = name => db.collection('farms').doc(farm).collection(name);

// ===== Funciona sem internet =====
// Cópia local de tudo, gravada no próprio aparelho. É ela que garante que o
// app abra com os dados no curral mesmo que a nuvem esteja fora de alcance —
// inclusive quando o próprio SDK do Firebase não pôde ser carregado.
const ESPELHO = 'fjs-espelho';
let espelhoTimer = null, espelhoFalhou = false;
function salvarEspelho(agora) {
  clearTimeout(espelhoTimer);
  const gravar = () => {
    const ok = LS.s(ESPELHO, { farm, animals, weighings, bovT, avT, gerT, items, moves,
      rebmov, atividades, extraT, settings, custo: custoParams });
    // Falhar aqui significa que o aparelho não está guardando nada — o pior
    // cenário possível no campo. Precisa ser gritado, não engolido.
    if (!ok && !espelhoFalhou) {
      espelhoFalhou = true;
      alert('⚠️ ATENÇÃO\n\nO aparelho não está conseguindo guardar os dados (memória cheia).\n\nO que você registrar agora pode se perder ao fechar o app. Libere espaço no aparelho ou faça um backup pelo menu (⋯) antes de continuar.');
    } else if (ok && espelhoFalhou) {
      espelhoFalhou = false;
      toast('Voltou a guardar os dados neste aparelho');
    }
  };
  agora ? gravar() : (espelhoTimer = setTimeout(gravar, 600));
}
function carregarEspelho(codigo) {
  const e = LS.g(ESPELHO, null);
  if (!e || e.farm !== codigo) return false;
  animals = e.animals || []; weighings = e.weighings || []; bovT = e.bovT || [];
  avT = e.avT || []; gerT = e.gerT || []; items = e.items || []; moves = e.moves || [];
  rebmov = e.rebmov || [];
  // As atividades vêm antes dos lançamentos delas: sem a lista, extraT não
  // tem dono e arrLivro devolveria Bovinos para todos.
  extraT = {};
  aplicarAtividades(e.atividades);
  Object.keys(e.extraT || {}).forEach(id => { if (ehExtra(id)) extraT[id] = e.extraT[id] || []; });
  if (e.settings && Number.isFinite(e.settings.yield)) settings.yield = e.settings.yield;
  if (e.custo) custoParams = Object.assign({}, CUSTO_VAZIO, e.custo);
  return true;
}

// Escritas que não alcançaram a nuvem ficam nesta fila até conseguirem subir.
let pendentes = LS.g('fjs-pendentes', []);
let filaFalhou = false;
function guardarFila() {
  const ok = LS.s('fjs-pendentes', pendentes);
  // Fila que não é gravada não é fila: ao fechar o app, o que não subiu some.
  // É o pior estado possível e não pode passar em silêncio.
  if (!ok && !filaFalhou) {
    filaFalhou = true;
    alert('⚠️ ATENÇÃO\n\nO aparelho não está conseguindo guardar a fila de envio '
      + '(memória cheia).\n\nO que você registrar agora pode se perder ao fechar o app. '
      + 'Libere espaço ou faça um backup pelo menu (⋯) antes de continuar.');
  } else if (ok) filaFalhou = false;
  return ok;
}
function enfileirar(op) {
  // uma escrita nova substitui a anterior do mesmo registro
  pendentes = pendentes.filter(p => !(p.col === op.col && p.id === op.id));
  pendentes.push(op);
  guardarFila();
  atualizarPendentes();
}
// O documento da fazenda guarda o rendimento de carcaça e os parâmetros de
// custo. Ele não é uma coleção, então precisa de caminho próprio na fila. E os
// pedaços têm de se somar: guardar o rendimento não pode apagar os parâmetros
// de custo que ainda estavam esperando internet.
function enfileirarFazenda(patch) {
  const atual = pendentes.find(p => p.col === '_fazenda');
  const obj = Object.assign({ id: '_fazenda' }, atual ? atual.obj : {}, patch);
  pendentes = pendentes.filter(p => p.col !== '_fazenda');
  pendentes.push({ col: '_fazenda', id: '_fazenda', obj });
  guardarFila();
  atualizarPendentes();
}
// Todo ajuste passa por aqui: grava no aparelho PRIMEIRO, para não se perder ao
// fechar o app, e só então tenta a nuvem — caindo na fila se não houver sinal.
// Antes, mexer no rendimento de carcaça sem internet não gravava em lugar
// nenhum: ao reabrir o app o valor antigo voltava, e com ele todas as arrobas.
function salvarFazenda(patch) {
  salvarEspelho(true);
  if (!db || !farm) return enfileirarFazenda(patch);
  db.collection('farms').doc(farm).set(clean(patch), { merge: true })
    .catch(() => enfileirarFazenda(patch));
}
function atualizarPendentes() {
  const d = $('sync-dot');
  if (!d) return;
  const recusados = pendentes.filter(p => p.recusado);
  // O title é dica de mouse: no iPhone NUNCA aparece. Quem tinha lançamento
  // preso na fila não tinha como saber. O número vai para o próprio ponto.
  d.dataset.n = pendentes.length;
  d.classList.toggle('recusado', recusados.length > 0);
  d.title = !pendentes.length ? 'Sincronização'
    // Dizer "aguardando a internet" quando a nuvem está recusando o registro é
    // mandar a pessoa esperar por algo que nunca vai acontecer.
    : recusados.length ? `${recusados.length} registro(s) que a nuvem RECUSOU — faça um backup pelo menu`
    : `${pendentes.length} registro(s) aguardando a internet`;
}
const opDaFila = p => p.del ? { col: p.col, del: p.id } : { col: p.col, obj: p.obj };
async function enviarPendentes() {
  if (!db || !pendentes.length) return;
  const fila = pendentes.slice();
  // Remove POR IDENTIDADE do item enfileirado, não por col+id do registro.
  // Enquanto o lote sobe, o dedo continua trabalhando: se o mesmo lançamento
  // for corrigido durante o envio, enfileirar troca o item por um NOVO, e
  // apagar por col+id levaria a correção junto. A tela seguiria certa, o
  // aparelho também, e a nuvem ficaria com o valor velho para sempre.
  const feito = op => { pendentes = pendentes.filter(p => p !== op); };
  try {
    await escreverLote(fila.map(opDaFila));
    fila.forEach(feito);
    guardarFila(); atualizarPendentes();
    toast(`${fila.length} registro(s) enviados para a nuvem`);
    return;
  } catch (e) { /* o lote inteiro caiu por causa de algum item — descobre qual */ }

  // Um lote falha INTEIRO por um único registro (documento grande demais, campo
  // inválido, permissão mudada). Reenviando sempre em lote, esse um segura
  // TODOS os outros para sempre e nada mais sincroniza. Um a um, o resto passa.
  let subiram = 0;
  for (const op of fila) {
    try { await escreverLote([opDaFila(op)]); feito(op); subiram++; }
    catch (e) { /* fica na fila */ }
  }
  // Se outros subiram na mesma rodada, o que ficou não é falta de internet: é
  // este registro que a nuvem não aceita. A diferença muda o que dizer ao dono.
  if (subiram) fila.forEach(op => { if (pendentes.includes(op)) op.recusado = true; });
  guardarFila(); atualizarPendentes();
  if (subiram) toast(`${subiram} registro(s) enviados para a nuvem`);
}

// Sai da fila só quando a NUVEM CONFIRMOU. Confere identidade: se uma edição
// nova substituiu esta enquanto a antiga subia, a confirmação da antiga não
// pode levar a nova junto.
function confirmado(op) {
  if (!pendentes.includes(op)) return;
  pendentes = pendentes.filter(p => p !== op);
  guardarFila(); atualizarPendentes();
}
// Toda gravação entra na fila ANTES de tentar a nuvem, e só sai de lá quando o
// servidor confirma. Antes só ia para a fila quando db era nulo — e o caso do
// curral é outro: o SDK carregado, a autenticação valendo pelo token guardado,
// e o sinal caindo. Nesse estado set() NÃO REJEITA, fica pendente para sempre,
// então o .catch nunca disparava e a escrita não entrava na fila. Ela existia
// só dentro do Firestore; sem a persistência dele, só na MEMÓRIA. Fechou o app
// no brete, perdeu a pesagem — e a cópia local ainda mostrava tudo certo.
// Gravar duas vezes o mesmo registro não faz mal: set() por id é idempotente.
// Anexo é o único registro pesado do app — foto em base64, até quase 1 MB.
// Guardar uma cópia dele na fila a cada gravação encheria o armazenamento do
// aparelho, e um armazenamento cheio derruba a fila INTEIRA. Ele fica de fora
// da caixa de saída: entra na fila quando não há nuvem, como sempre foi.
const PESADO = 'anexos';
function upsert(col, obj) {
  salvarEspelho(true);   // ação do usuário: grava já, para nada se perder
  const op = { col, id: obj.id, obj: clean(obj) };
  if (col === PESADO) {
    if (!db) return enfileirar(op);
    colRef(col).doc(obj.id).set(op.obj).catch(() => enfileirar(op));
    return;
  }
  enfileirar(op);
  if (!db) return;
  colRef(col).doc(obj.id).set(op.obj).then(() => confirmado(op)).catch(() => {});
}
// Grava vários registros de uma vez. Cada um passa pelo mesmo caminho seguro do
// upsert, então sem internet o carnê inteiro entra na fila em vez de sumir.
function escreverVarias(col, objs) { objs.forEach(o => upsert(col, o)); }
function remove(col, id) {
  salvarEspelho(true);
  const op = { col, id, del: true };
  enfileirar(op);
  if (!db) return;
  colRef(col).doc(id).delete().then(() => confirmado(op)).catch(() => {});
}
async function escreverLote(ops) { // ops: [{col, obj} | {col, del:id}]
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(op => {
      if (op.col === '_fazenda') {   // ajustes da fazenda: merge, não substitui
        const payload = Object.assign({}, op.obj); delete payload.id;
        b.set(db.collection('farms').doc(farm), clean(payload), { merge: true });
        return;
      }
      const ref = colRef(op.col).doc(op.del || op.obj.id);
      op.del ? b.delete(ref) : b.set(ref, clean(op.obj));
    });
    await b.commit();
  }
}
const itemDeFila = op => op.del ? { col: op.col, id: op.del, del: true }
  : { col: op.col, id: op.obj.id, obj: clean(op.obj) };
// Operação em massa (restaurar backup, apagar tudo, importar, apagar item) é
// feita com o usuário olhando, já é aguardada e já avisa quando falha. Por isso
// ela enfileira só NA FALHA, e não antes: pôr milhares de registros na fila —
// com anexos em base64 entre eles — estouraria a cota do aparelho, e aí a fila
// deixaria de ser gravada. Seria trocar a garantia por uma ilusão dela.
async function batchWrite(ops) {
  salvarEspelho(true);
  if (!db) { ops.forEach(op => enfileirar(itemDeFila(op))); return; }
  try {
    await escreverLote(ops);
  } catch (e) {
    ops.forEach(op => enfileirar(itemDeFila(op)));
    throw e;
  }
}

// Configuração do Firebase que o aplicativo já usa. Ela NÃO é segredo: o
// próprio Firebase Hosting a publica em /__/firebase/init.json, de onde
// qualquer um que abra o site pode lê-la, e ela vai dentro de todo aplicativo
// web que usa Firebase. Quem protege os dados é a REGRA do Firestore mais o
// código da fazenda — nunca este bloco.
//
// Estava sendo exigida na mão, e isso trancou o dono do aplicativo do lado de
// fora quando os dados do site foram limpos do celular: para voltar a ver o
// próprio rebanho ele teria de achar um bloco de configuração no console do
// Google, de pé, no celular. Agora vem embutida, e a tela pede só o código.
const CONFIG_PADRAO = {
  apiKey: 'AIzaSyDFdvoEP6eklxgWLH5jKO1D741LLaKS3kA',
  authDomain: 'fazenda-e3652.firebaseapp.com',
  projectId: 'fazenda-e3652',
  storageBucket: 'fazenda-e3652.firebasestorage.app',
  messagingSenderId: '893414271627',
  appId: '1:893414271627:web:1c8f93bb26fa0b9761c28e'
};

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
window.addEventListener('online', () => { setSync(true); enviarPendentes(); });
window.addEventListener('offline', () => setSync(false));

let semPersistencia = false;
function avisarSemPersistencia(e) {
  if (semPersistencia) return;
  semPersistencia = true;
  console.warn('persistência do Firestore indisponível', e);
  // A fila do próprio app continua guardando tudo no aparelho, então nada se
  // perde — mas quem estiver com o app aberto em duas abas precisa saber.
  toast('Este aparelho não guarda cache da nuvem — feche outras abas do app');
  atualizarPendentes();
}
function connect(cfg, farmCode) {
  farm = farmCode;
  if (typeof firebase === 'undefined') {
    // Sem o SDK (primeira abertura sem sinal, por exemplo) o app segue local:
    // tudo o que for feito agora fica na fila e sobe quando a internet voltar.
    setSync(false);
    toast('Sem conexão — trabalhando neste aparelho');
    return;
  }
  try { firebase.initializeApp(cfg); } catch (e) { /* já inicializado */ }
  db = firebase.firestore();
  // Recusada — outra aba segurando, modo privado, armazenamento negado — o
  // Firestore passa a guardar só na memória. Engolir isso em silêncio era o
  // pior caso: no curral tudo parece salvo e fecha-se o app sem saber.
  db.enablePersistence({ synchronizeTabs: true }).catch(e => avisarSemPersistencia(e));
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) return;
    setSync(navigator.onLine);
    await enviarPendentes();   // o que foi feito sem sinal sobe antes de tudo
    subscribe();
  });
  firebase.auth().signInAnonymously().catch(err => {
    const code = err && err.code;
    // Falta de sinal não pode devolver o usuário à tela de configuração: sem o
    // código da fazenda em mãos ele ficaria trancado fora dos próprios dados.
    // O app segue com o cache local e sincroniza quando a internet voltar.
    if (code === 'auth/network-request-failed' || !navigator.onLine) {
      setSync(false);
      toast('Sem conexão — usando os dados salvos neste aparelho');
      return;
    }
    const msg = code === 'auth/operation-not-allowed'
      ? 'Login Anônimo não está ativado no Firebase.\nNo console: Authentication → Sign-in method → Anônimo → Ativar.'
      : 'Erro de conexão: ' + (err && err.message || err);
    const el = $('su-error');
    $('setup-screen').hidden = false;
    el.hidden = false; el.textContent = msg;
  });
}

let firstAnimalsSnap = true;
// O iOS despeja o IndexedDB de um site depois de dias sem uso, e um app de
// fazenda aberto uma vez por semana cai nisso. Voltando com o cache despejado,
// o Firestore entrega um snapshot VAZIO marcado como "do cache". Aplicá-lo
// apagava o rebanho da tela e — pior — sobrescrevia a cópia local com o vazio,
// destruindo a última defesa que existia. Vazio do SERVIDOR é outra coisa: aí
// a fazenda foi mesmo apagada, e tem de ser respeitado.
const listaDaColecao = { animals: () => animals, weighings: () => weighings,
  bovtrans: () => bovT, avtrans: () => avT, gertrans: () => gerT,
  items: () => items, moves: () => moves, rebmov: () => rebmov };
// As coleções das atividades criadas não cabem num mapa fixo: o nome delas só
// existe depois que a pessoa cria a atividade.
const colDeAtividade = name => name.indexOf('at_') === 0 ? name.slice(3) : null;
const lerColecao = name => {
  const id = colDeAtividade(name);
  if (id) return extraT[id] || [];
  return listaDaColecao[name] ? listaDaColecao[name]() : [];
};
const gravarColecao = (name, lista) => {
  const id = colDeAtividade(name);
  if (id) { extraT[id] = lista; return; }
  if (COLS[name]) COLS[name](lista);
};
function aplicarSnapshot(name, docs, metadata) {
  const tinha = lerColecao(name).length;
  if (!docs.length && tinha && metadata && metadata.fromCache) {
    console.warn(name + ': snapshot vazio do cache ignorado — mantendo o que está no aparelho');
    return;
  }
  // O snapshot é a verdade DO SERVIDOR, e o servidor ainda não sabe do que
  // está na fila. Aplicando-o cru, o animal cadastrado no curral sumia da
  // tela — e a próxima pesagem do mesmo brinco não o encontrava, criava outro
  // animal, gravava outra pesagem e não mostrava GMD. Um brinco virava dois.
  // Por isso o que está na fila é reposto por cima: já foi gravado aqui, só
  // não chegou lá ainda. E o que está na fila para APAGAR fica fora, senão o
  // snapshot ressuscitaria o que acabou de ser excluído sem sinal.
  const mapa = new Map(docs.filter(d => d && d.id != null).map(d => [d.id, d]));
  pendentes.filter(p => p.col === name).forEach(p => {
    if (p.del) mapa.delete(p.id);
    else if (p.obj) mapa.set(p.id, p.obj);
  });
  gravarColecao(name, [...mapa.values()]);
  salvarEspelho();
  if (name === 'animals' && firstAnimalsSnap && metadata && !metadata.fromCache) {
    firstAnimalsSnap = false;
    maybeOfferMigration();
  }
  render();
}
function aplicarFazenda(d) {
  // Mesma regra das coleções, e pelo mesmo motivo: o snapshot é a verdade DO
  // SERVIDOR, e o servidor não sabe do que está na fila. Aplicado cru, mudar o
  // rendimento de carcaça sem sinal era desfeito no primeiro snapshot — a tela
  // voltava ao valor antigo, a cópia local era gravada com ele, e o rendimento
  // manda em TODA arroba do aplicativo. O mesmo valia para os parâmetros de
  // custo da arroba.
  const naFila = pendentes.find(p => p.col === '_fazenda');
  if (naFila && naFila.obj) d = Object.assign({}, d, naFila.obj);
  settings.yield = Number.isFinite(d.yield) ? d.yield : 52;
  // A lista de atividades vem junto com os ajustes da fazenda, e por isso
  // acompanha todos os aparelhos. Mudou a lista? Há coleção nova para ouvir —
  // mas só assina de novo quando o CONJUNTO muda, senão cada snapshot
  // derrubaria a própria escuta que o entregou.
  if (aplicarAtividades(d.atividades) && db && farm) subscribe();
  salvarEspelho();
  // Não sobrescreve o que está sendo digitado neste instante
  const digitando = document.activeElement && document.activeElement.closest && document.activeElement.closest('.calc-form');
  if (!digitando) custoParams = Object.assign({}, CUSTO_VAZIO, d.custo || {});
  render();
}
// Devolve true quando o CONJUNTO de atividades mudou — é o que decide se vale
// assinar as coleções de novo.
function aplicarAtividades(lista) {
  const limpa = (Array.isArray(lista) ? lista : [])
    .filter(a => a && typeof a.id === 'string' && a.id && typeof a.nome === 'string')
    // Uma atividade com o id de um livro fixo sequestraria os lançamentos de
    // Bovinos, Aviários ou Geral. Não entra.
    .filter(a => LIVROS_FIXOS.indexOf(a.id) < 0)
    .map(a => ({ id: a.id, nome: a.nome }));
  const antes = atividades.map(a => a.id + '|' + a.nome).join(',');
  const depois = limpa.map(a => a.id + '|' + a.nome).join(',');
  if (antes === depois) return false;
  const idsAntes = atividades.map(a => a.id).sort().join(',');
  atividades = limpa;
  recomputarLivros();
  return idsAntes !== limpa.map(a => a.id).sort().join(',');
}

function subscribe() {
  unsubs.forEach(u => u()); unsubs = [];
  atividades.forEach(a => {
    const nome = colLivro(a.id);
    unsubs.push(colRef(nome).onSnapshot(snap => {
      aplicarSnapshot(nome, snap.docs.map(d => d.data()), snap.metadata);
    }, err => { console.warn(nome, err); }));
  });
  Object.keys(COLS).forEach(name => {
    unsubs.push(colRef(name).onSnapshot(snap => {
      aplicarSnapshot(name, snap.docs.map(d => d.data()), snap.metadata);
    }, err => { console.warn(name, err); }));
  });
  unsubs.push(db.collection('farms').doc(farm).onSnapshot(snap => aplicarFazenda(snap.data() || {})));
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
  // Comissão de leilão é despesa da VENDA, não investimento: entra como
  // custeio no livro-caixa, ao lado do frete do caminhão que levou o boi.
  'Comissão de leilão': 'Custeio', 'Arrendamento': 'Custeio', 'Contador/serviços': 'Custeio',
  // Lavoura: o que SAI é custeio (semente, adubo, colheita). O que ENTRA
  // já é receita pelo sentido do dinheiro, sem depender desta tabela.
  'Soja': 'Custeio', 'Trigo': 'Custeio',
  'Equipamentos': 'Investimento', 'Benfeitorias': 'Investimento', 'Outros': 'Custeio'
};
// Quem manda é o SENTIDO do dinheiro, não a categoria escrita. Antes a
// categoria vencia, e o resultado aparecia na tela: uma ENTRADA de R$ 7.300,00
// com categoria "Outros" era somada como Custeio, porque CLASSIF['Outros'] é
// 'Custeio' e o tipo nem era consultado. No livro-caixa isso é receita virando
// despesa — inflava o custo e escondia o faturamento, e as três somas
// continuavam fechando com o movimento, então nada na tela denunciava.
// Dinheiro que entra é sempre Receita. Dinheiro que sai é Custeio ou
// Investimento, nunca Receita.
const classOf = (cat, type) => {
  if (type === 'entrada') return 'Receita';
  const c = CLASSIF[cat];
  return c === 'Investimento' ? 'Investimento' : 'Custeio';
};

// ===== Prevenção de duplicidade =====
// Avisa, sem bloquear: duplicatas legítimas existem (dois abastecimentos no
// mesmo dia, pelo mesmo valor). Quem decide é quem está lançando.
const sameMoney = (a, b) => Math.abs(a - b) < 0.005;
// O registro pode ter sido apagado em outro aparelho enquanto este o editava
function sumiu(frase) {
  toast(`${frase} em outro aparelho`);
  closeAllM(); render();
  return true;
}
function askDuplicate(detalhe) {
  return confirm(`⚠️ POSSÍVEL DUPLICIDADE\n\n${detalhe}\n\nLançar mesmo assim?`);
}
// Lançamento financeiro já existente com mesma data, valor, tipo e categoria.
// Ignora o próprio registro ao editar.
function findDupTrans(list, data, ignoreId) {
  return list.find(t => t.id !== ignoreId
    && t.date === data.date
    && t.type === data.type
    && sameMoney(t.amount, data.amount)
    && (t.category || '') === (data.category || '')
  );
}
// A mesma compra PARCELADA lançada duas vezes escapava do aviso: o que se
// digita é o total (R$ 900) e o que está gravado são as parcelas (3 de R$ 300).
// Comparando um com o outro nunca batia, e o carnê duplicado entrava calado —
// dobrando a dívida no "A pagar" sem ninguém perceber.
function findDupCarne(list, data, total, ignoreGrupo) {
  const porGrupo = new Map();
  list.forEach(t => {
    if (!t.grupo) return;
    const g = porGrupo.get(t.grupo) || { itens: [], soma: 0 };
    g.itens.push(t); g.soma += t.amount;
    porGrupo.set(t.grupo, g);
  });
  for (const [grupo, g] of porGrupo) {
    if (grupo === ignoreGrupo) continue;
    const p = g.itens[0];
    if (p.date === data.date && p.type === data.type
      && (p.category || '') === (data.category || '')
      && sameMoney(g.soma, total)) return { soma: g.soma, n: g.itens.length, p };
  }
  return null;
}

// ===== Cálculos =====
const wOf = aid => weighings.filter(w => w.animalId === aid).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// Quem está no rebanho de verdade: nem vendido, nem morto. Um único lugar
// decide isso, porque contagem, peso médio, arrobas, GMD médio e busca por
// brinco precisam concordar — se cada tela filtrasse por conta própria, o
// animal morto sumiria de uma e continuaria somando na outra.
const noRebanho = a => !a.sold && !a.dead;
// Categoria e raça andam juntas na lista: "Novilho · Nelore" responde de
// relance o que o curral pergunta. Sem raça cadastrada, a linha fica igual
// ao que era — nada de separador sobrando.
const catERaca = a => (a.cat || 'Sem categoria') + (a.raca ? ' · ' + a.raca : '');

// "292", " 292" e "292 " são o mesmo brinco. Sem normalizar, um espaço a mais
// digitado no curral criava um animal novo e o GMD desaparecia.
const chaveBrinco = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
// Acha o animal do brinco digitado. Quando existe mais de um com o mesmo brinco
// — um vendido e outro ativo, ou uma duplicata criada por engano — fica com o
// que tem histórico de pesagem, porque é dele que sai o GMD. Antes a busca
// pegava o primeiro da lista e ignorava os vendidos: a pesagem grudava num
// animal sem passado e a tela mostrava "—" no lugar do ganho.
function animalDoBrinco(ident) {
  const chave = chaveBrinco(ident);
  if (!chave) return null;
  const iguais = animals.filter(a => chaveBrinco(a.ident) === chave);
  if (!iguais.length) return null;
  const ativos = iguais.filter(noRebanho);
  return (ativos.length ? ativos : iguais)
    .slice()
    .sort((a, b) => wOf(b.id).length - wOf(a.id).length)[0];
}
function gmdBetween(a, b) { const d = daysBetween(a.date, b.date); return d > 0 ? (b.weight - a.weight) / d : null; }
// Peso em jejum é menor que o mesmo animal cheio (rúmen vazio). Comparar as
// duas condições distorce o ganho, então isso precisa ficar visível.
const mesmaCondicao = (a, b) => !!a.jejum === !!b.jejum;
function gmdTotal(ws) { return ws.length >= 2 ? gmdBetween(ws[0], ws[ws.length - 1]) : null; }
// O MESMO número, mais a informação que decide se ele pode ser comparado com o
// do vizinho. Dois animais de 452 kg hoje: um pesado em JEJUM na primeira vez
// (380 kg) aparece com GMD 0,78; o outro, pesado cheio (400 kg), com 0,57.
// Trinta e oito por cento de diferença que não existe no pasto — e, numa tela
// onde se escolhe quem vende, é o bastante para guardar o animal errado.
// O bloco "GMD do rebanho" já deixava essas comparações de fora; a LISTA e o
// cartão "GMD médio" não deixavam, e os três números discordavam na mesma tela.
function gmdInfo(ws) {
  if (!ws || ws.length < 2) return { gmd: null, misto: false };
  const pri = ws[0], ult = ws[ws.length - 1];
  return { gmd: gmdBetween(pri, ult), misto: !mesmaCondicao(pri, ult) };
}
function gmdRecent(ws) { return ws.length >= 2 ? gmdBetween(ws[ws.length - 2], ws[ws.length - 1]) : null; }
const gmdCls = g => !Number.isFinite(g) ? '' : g < 0.4 ? 'gmd-low' : g < 0.8 ? 'gmd-mid' : g < 1.2 ? 'gmd-good' : 'gmd-great';

// Projeção de peso a partir de um GMD informado à mão. Vive aqui, sozinha,
// porque o cartão do rebanho e a linha de cada animal mostram o MESMO número
// em dois lugares da mesma tela: duas cópias da conta é como um deles passa a
// mentir sem ninguém descobrir qual.
// Projeta da última balança DE CADA ANIMAL, não do peso médio, porque cada um
// foi pesado num dia diferente.
function projetar(a, gmdSim, hoje) {
  if (!Number.isFinite(gmdSim)) return null;
  const ws = wOf(a.id);
  if (!ws.length) return null;
  const ultima = ws[ws.length - 1];
  // Pesagem com data no futuro (digitação errada) não projeta para trás.
  const dias = Math.max(0, daysBetween(ultima.date, hoje || todayISO()));
  const peso = ultima.weight + gmdSim * dias;
  if (!Number.isFinite(peso) || peso <= 0) return null;
  return { peso, dias, base: ultima.weight, ganho: peso - ultima.weight };
}

// ===== Estoque de gado, em cabeças =====
// O rebanho com brinco responde "quais animais eu tenho". Este livro responde
// "QUANTAS CABEÇAS eu tenho" — e são perguntas diferentes assim que entra um
// lote: chegam 50 bezerros sem brinco, e eles existem muito antes de serem
// identificados um a um.
//
// Os dois sistemas se encontram aqui, e o encontro tem uma regra só, que é o
// que impede o número de mentir: ENTRADA vem do livro de lotes; SAÍDA vem dos
// dois lados. A venda e a morte de um animal COM BRINCO saem sozinhas, lidas
// do cadastro — não precisam ser registradas de novo aqui, e registrar seria
// descontar duas vezes a mesma cabeça. A tela diz isso em letra miúda,
// embaixo do saldo, porque é a única coisa que alguém poderia errar.
//
// Saldo inicial existe porque ninguém começa do zero: quem já tem o rebanho
// cadastrado lança o que tem hoje e segue daí.
const REB_TIPOS = {
  inicial: { nome: 'Saldo inicial', sinal: 1, rotulo: 'Saldo inicial' },
  compra: { nome: 'Compra', sinal: 1, rotulo: 'Compras' },
  nascimento: { nome: 'Nascimento', sinal: 1, rotulo: 'Nascimentos' },
  venda: { nome: 'Venda em lote', sinal: -1, rotulo: 'Vendas em lote' },
  morte: { nome: 'Morte em lote', sinal: -1, rotulo: 'Mortes em lote' }
};
const ehTipoReb = t => Object.prototype.hasOwnProperty.call(REB_TIPOS, t);
const cabecasDe = m => {
  const q = Number(m && m.qtd);
  return Number.isFinite(q) && q > 0 ? Math.round(q) : 0;
};
const rebmovOrdenado = () => rebmov.slice().sort((a, b) =>
  String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)));
function saldoRebanho() {
  const porTipo = {};
  Object.keys(REB_TIPOS).forEach(k => { porTipo[k] = { cabecas: 0, n: 0 }; });
  rebmov.forEach(m => {
    if (!ehTipoReb(m.tipo)) return;
    porTipo[m.tipo].cabecas += cabecasDe(m);
    porTipo[m.tipo].n++;
  });
  // As saídas que o cadastro já conhece. Vendido E morto conta uma vez só, do
  // lado da morte: o animal saiu do rebanho uma vez, e somar os dois tiraria
  // duas cabeças por um bicho.
  const mortosComBrinco = animals.filter(a => a.dead).length;
  const vendidosComBrinco = animals.filter(a => a.sold && !a.dead).length;
  const entradas = porTipo.inicial.cabecas + porTipo.compra.cabecas + porTipo.nascimento.cabecas;
  const saidasLote = porTipo.venda.cabecas + porTipo.morte.cabecas;
  const saldo = entradas - saidasLote - vendidosComBrinco - mortosComBrinco;
  const comBrinco = animals.filter(noRebanho).length;
  return {
    porTipo, entradas, saidasLote, vendidosComBrinco, mortosComBrinco,
    saidas: saidasLote + vendidosComBrinco + mortosComBrinco,
    saldo, comBrinco,
    // Quantas cabeças existem sem ficha individual. É o número que diz quanto
    // do rebanho ainda não passou pelo brinco — e, quando fica negativo, que
    // há mais ficha do que cabeça: falta lançar uma compra ou sobra um animal.
    semBrinco: saldo - comBrinco,
    temMovimento: rebmov.length > 0
  };
}
// Valor da compra em dinheiro: o lançamento no Financeiro nasce daqui, como já
// nasce da venda do animal e da compra de estoque. lock: 'rebanho' marca que a
// origem é outra tela — editar por lá avisaria para voltar aqui.
function syncCompraTrans(m) {
  const temValor = Number.isFinite(m.valor) && m.valor > 0;
  if (temValor && m.postFin) {
    const cabecas = cabecasDe(m);
    const dados = { date: m.date, type: m.tipo === 'venda' ? 'entrada' : 'saida',
      amount: m.valor, category: m.tipo === 'venda' ? 'Venda de gado' : 'Compra de gado (engorda)',
      notes: `${REB_TIPOS[m.tipo].nome} · ${cabecas} cabeça(s)` + (m.notes ? ' · ' + m.notes : ''),
      lock: 'rebanho' };
    if (m.linkTrans) {
      const t = bovT.find(x => x.id === m.linkTrans);
      if (t) { Object.assign(t, dados); upsert('bovtrans', t); return; }
    }
    const dup = findDupTrans(bovT, dados, null);
    if (dup && !askDuplicate(`Já existe um lançamento de ${fmtRS(dados.amount)} em ${fmtBRfull(dados.date)}${dup.notes ? `\nDescrição: ${dup.notes}` : ''}.\n\nO movimento do rebanho será registrado de qualquer forma.`)) {
      m.linkTrans = null;
      return;
    }
    const t = Object.assign({ id: uid() }, dados);
    bovT.push(t); upsert('bovtrans', t);
    m.linkTrans = t.id;
  } else if (m.linkTrans) {
    const t = bovT.find(x => x.id === m.linkTrans);
    if (t) apagarAnexosDe(t);
    bovT = bovT.filter(x => x.id !== m.linkTrans);
    remove('bovtrans', m.linkTrans);
    m.linkTrans = null;
  }
}

// ===== Carência de medicamento =====
// O cadastro do item guarda a carência em dias. O cadastro do animal guarda a
// data do último manejo e o produto usado. Os dois existiam desde sempre e
// NINGUÉM cruzava os dois — então o aplicativo não sabia responder a única
// pergunta que importa antes de mandar boi para o abate: este animal já pode
// sair? Errar isso é resíduo de medicamento na carne, e é a pessoa que
// responde por isso, não o aplicativo.
const somarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00');
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// Casar o que foi DIGITADO no manejo com um item do estoque. Igualdade primeiro;
// depois o item cujo nome contém o texto digitado como palavra inteira, que é o
// caso de "Ivermectina" digitado e "Vermífugo (Ivermectina)" cadastrado.
// Pedaço solto não serve: "sal" não pode casar com "Salmonela".
function itemDoMedicamento(texto) {
  const alvo = semAcento(texto).trim();
  if (alvo.length < 3) return null;
  const comCarencia = items.filter(it => Number.isFinite(it.carencia) && it.carencia > 0);
  const exato = comCarencia.find(it => semAcento(it.name).trim() === alvo);
  if (exato) return exato;
  const palavras = n => semAcento(n).split(/[^a-z0-9]+/).filter(Boolean);
  return comCarencia.find(it => {
    const ps = palavras(it.name);
    return palavras(alvo).every(p => ps.includes(p));
  }) || null;
}
// null quando não há como saber (sem manejo, sem produto, produto fora do
// estoque, item sem carência cadastrada). Não inventar é parte do trabalho:
// um "liberado" falso é pior do que um "não sei".
function carenciaDoAnimal(a, hoje) {
  if (!a || !a.manejoData || !a.manejoMedicamento) return null;
  const it = itemDoMedicamento(a.manejoMedicamento);
  if (!it) return null;
  const liberadoEm = somarDias(a.manejoData, it.carencia);
  if (!liberadoEm) return null;
  const faltam = daysBetween(hoje || todayISO(), liberadoEm);
  return { item: it, dias: it.carencia, liberadoEm, faltam, bloqueado: faltam > 0 };
}
const animaisEmCarencia = hoje => animals.filter(noRebanho)
  .map(a => ({ a, c: carenciaDoAnimal(a, hoje) }))
  .filter(x => x.c && x.c.bloqueado)
  .sort((x, y) => y.c.faltam - x.c.faltam);

// ===== GMD mês a mês =====
// O GMD de uma pesagem para a outra continua onde estava — é o que serve no
// curral, com o animal na balança. Este aqui responde outra coisa: em que MÊS
// o gado ganhou, para comparar a seca com as águas, um trato com outro.
//
// O intervalo entre duas pesagens quase nunca cabe num mês só: pesou em
// janeiro e em abril, o ganho aconteceu ao longo de noventa dias. Jogá-lo
// inteiro em abril diria que janeiro e fevereiro não renderam nada — e diria
// que abril rendeu o triplo do que rendeu. Por isso o ganho é espalhado pelos
// DIAS que ele durou, cada mês ficando com a parte dele.
//
// Anda de mês em mês, e não de dia em dia: um intervalo de dois anos são 24
// voltas em vez de 730, e a varredura sorteia intervalos bem maiores que isso.
function diasPorMes(ini, fim) {
  const out = {};
  let cur = new Date(ini + 'T12:00');
  const f = new Date(fim + 'T12:00');
  let voltas = 0;
  while (cur < f && voltas++ < 1200) {
    // O fim do mês que interessa é o do mês do DIA SEGUINTE a "cur". Olhando o
    // mês do próprio "cur", quando ele já é o último dia do mês a conta devolve
    // ele mesmo, o passo dá zero e o intervalo para no primeiro mês.
    const prox = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 12);
    const fimDoMes = new Date(prox.getFullYear(), prox.getMonth() + 1, 0, 12);
    const ate = fimDoMes < f ? fimDoMes : f;
    const dias = Math.round((ate - cur) / 86400000);
    if (dias <= 0) break;
    // Os dias contados vão do dia SEGUINTE a "cur" até "ate" — todos dentro do
    // mês de "ate", que é por isso o mês que fica com eles.
    const m = `${ate.getFullYear()}-${String(ate.getMonth() + 1).padStart(2, '0')}`;
    out[m] = (out[m] || 0) + dias;
    cur = ate;
  }
  return out;
}
// ===== Blocos que abrem e fecham =====
// A tela cresceu por empilhamento. Medido num iPhone com uma fazenda de 60
// animais e dois anos de lançamentos: a lista de animais começava a 1147 px e a
// de lançamentos da Fazenda a 1997 px, numa tela de 900. Duas telas de rolagem
// de resumo antes do conteúdo — e o conteúdo é o que a pessoa veio ver.
//
// Fechado não é escondido: o número que importa fica NA LINHA do cabeçalho, e o
// detalhe está a um toque. Cada bloco guarda o próprio estado, e nada abre nem
// fecha sozinho — um padrão previsível vale mais que um padrão esperto.
const dobraAberta = id => LS.g('fjs-dobra-' + id, false) === true;
function dobravel(id, resumo, corpo) {
  if (!corpo) return '';
  return `<details class="dobra"${dobraAberta(id) ? ' open' : ''} data-dobra="${id}">`
    + `<summary class="dobra-cab">${resumo}</summary>`
    + `<div class="dobra-corpo">${corpo}</div></details>`;
}
// O evento "toggle" não sobe na árvore: sem a fase de captura, o clique não
// chegaria aqui e o estado não seria guardado.
document.addEventListener('toggle', e => {
  const d = e.target && e.target.closest && e.target.closest('[data-dobra]');
  if (d) LS.s('fjs-dobra-' + d.dataset.dobra, d.open);
}, true);
// Cabeçalho de bloco: título, o número que resume, e uma linha de apoio.
const cabecaDobra = (titulo, valor, apoio, alerta) =>
  `<span class="dc-tit mono">${titulo}</span>`
  // Sem número, a coluna dele sai do caminho e a linha de apoio ganha a
  // largura inteira — um espaço vazio à direita empurraria o texto para duas
  // linhas sem nada para mostrar ali.
  + (valor ? `<span class="dc-num${alerta ? ' dc-alerta' : ''}">${valor}</span>` : '')
  + (apoio ? `<span class="dc-sub mono">${apoio}</span>` : '')
  // A seta vive aqui, e não em dobravel(): o bloco da estimativa é feito em
  // HTML e só troca o cabeçalho, e sem isto ficava sem a seta — parecendo a
  // única caixa da tela que não abre.
  + '<span class="dobra-seta" aria-hidden="true"></span>';
// Dinheiro curto para caber no cabeçalho: sem "R$" e sem centavos, que no
// resumo não decidem nada e custam metade da linha.
const curto = v => (v < 0 ? '−' : '') + fmtN(Math.abs(v), 0);

// ===== GMD do rebanho: entre pesagens, e do começo até agora =====
// Os números que existiam eram por ANIMAL. Estes são do rebanho:
//   - de uma pesagem para a outra, que é a lida que se faz no curral
//   - da primeira pesagem de cada bicho até a mais recente dele
//
// O curral não pesa tudo no mesmo dia: um lote leva dois ou três. Datas
// coladas são a MESMA lida, e separá-las produziria linhas de um dia só com
// números sem sentido. Dez dias de janela separa bem uma pesagem mensal da
// seguinte e junta os dias de um mesmo mutirão.
const JANELA_RODADA = 10;
function rodadasDePesagem(lista) {
  const datas = [...new Set((lista || weighings).map(w => w.date).filter(Boolean))].sort();
  const rodadas = [];
  datas.forEach(d => {
    const ult = rodadas[rodadas.length - 1];
    if (ult && daysBetween(ult.fim, d) <= JANELA_RODADA) { ult.fim = d; }
    else rodadas.push({ ini: d, fim: d });
  });
  return rodadas;
}
const rodadaDe = (rodadas, data) => rodadas.findIndex(r => data >= r.ini && data <= r.fim);
// O ganho de cada intervalo é jogado na rodada em que ele FECHOU — é assim que
// se lê no curral: "na pesagem de setembro o lote fez 0,620 desde a anterior".
// Animal que faltou a uma rodada não se perde: o intervalo dele simplesmente
// fecha numa rodada mais adiante.
function gmdEntrePesagens(lista) {
  const rodadas = rodadasDePesagem();
  const por = {};
  let intervalos = 0, misturados = 0;
  (lista || animals).forEach(a => {
    const ws = wOf(a.id);
    for (let i = 1; i < ws.length; i++) {
      const ant = ws[i - 1], atual = ws[i];
      const dias = daysBetween(ant.date, atual.date);
      if (!(dias > 0)) continue;
      intervalos++;
      if (!mesmaCondicao(ant, atual)) { misturados++; continue; }
      const k = rodadaDe(rodadas, atual.date);
      if (k < 0) continue;
      const e = por[k] || (por[k] = { kg: 0, dias: 0, animais: new Set(), r: rodadas[k] });
      e.kg += atual.weight - ant.weight;
      e.dias += dias;
      e.animais.add(a.id);
    }
  });
  // Quilo total sobre dia-animal total, como no mês a mês: a média dos GMDs
  // de cada bicho daria peso igual a quem ficou 90 dias e a quem ficou 20.
  const linhas = Object.values(por).map(e => ({
    ini: e.r.ini, fim: e.r.fim, kg: e.kg, dias: e.dias, animais: e.animais.size,
    gmd: e.dias > 0 ? e.kg / e.dias : null,
    diasMedia: e.animais.size ? e.dias / e.animais.size : 0
  })).sort((a, b) => b.fim.localeCompare(a.fim));
  return { linhas, intervalos, misturados, rodadas: rodadas.length };
}
// Da PRIMEIRA pesagem de cada animal até a mais recente dele. Não é a primeira
// data do rebanho até a última: cada bicho entrou num dia, e medir o tempo de
// um pelo calendário do outro inventaria dias em que ele nem estava aqui.
function gmdGeralRebanho(lista) {
  let kg = 0, dias = 0, n = 0, fora = 0, primeira = null, ultima = null;
  (lista || animals).forEach(a => {
    const ws = wOf(a.id);
    if (ws.length < 2) return;
    const p = ws[0], u = ws[ws.length - 1];
    const d = daysBetween(p.date, u.date);
    if (!(d > 0)) return;
    if (!mesmaCondicao(p, u)) { fora++; return; }
    kg += u.weight - p.weight; dias += d; n++;
    if (!primeira || p.date < primeira) primeira = p.date;
    if (!ultima || u.date > ultima) ultima = u.date;
  });
  return { gmd: dias > 0 ? kg / dias : null, kg, dias, n, fora, primeira, ultima };
}
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMesCurto = m => {
  const [a, mm] = String(m).split('-');
  return `${MES_CURTO[Number(mm) - 1] || mm}/${a.slice(2)}`;
};
function gmdPorMes(lista) {
  const porMes = {};
  let intervalos = 0, misturados = 0;
  // Entram os animais TODOS, inclusive vendidos e mortos: o ganho daquele mês
  // aconteceu, e tirá-lo agora mudaria o passado. Um mês fechado não pode
  // mudar de valor porque um boi foi vendido depois.
  (lista || animals).forEach(a => {
    const ws = wOf(a.id);
    for (let i = 1; i < ws.length; i++) {
      const ant = ws[i - 1], atual = ws[i];
      const dias = daysBetween(ant.date, atual.date);
      if (!(dias > 0)) continue;
      intervalos++;
      // Jejum contra cheio distorce o ganho, e num número que existe para
      // comparar meses a distorção passaria por diferença de pasto.
      if (!mesmaCondicao(ant, atual)) { misturados++; continue; }
      const ganho = atual.weight - ant.weight;
      if (!Number.isFinite(ganho)) continue;
      Object.entries(diasPorMes(ant.date, atual.date)).forEach(([m, d]) => {
        const e = porMes[m] || (porMes[m] = { kg: 0, dias: 0, animais: new Set() });
        e.kg += ganho * d / dias;
        e.dias += d;
        e.animais.add(a.id);
      });
    }
  });
  // O GMD do mês é o total de quilos dividido pelo total de dias-animal, e não
  // a média dos GMDs de cada bicho: um animal pesado em dois dias do mês não
  // pode pesar o mesmo que outro que ficou os trinta.
  const meses = Object.entries(porMes)
    .map(([mes, e]) => ({ mes, kg: e.kg, dias: e.dias, animais: e.animais.size,
      gmd: e.dias > 0 ? e.kg / e.dias : null }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
  return { meses, intervalos, misturados };
}

const movesOf = iid => moves.filter(m => m.itemId === iid).sort((a, b) => a.date < b.date ? 1 : -1);
const qtyOf = iid => moves.filter(m => m.itemId === iid).reduce((s, m) => s + (m.type === 'entrada' ? m.qty : -m.qty), 0);
function avgCostOf(iid) {
  const ins = moves.filter(m => m.itemId === iid && m.type === 'entrada' && Number.isFinite(m.unitCost) && m.unitCost > 0);
  const q = ins.reduce((s, m) => s + m.qty, 0);
  if (!q) return null;
  return ins.reduce((s, m) => s + m.qty * m.unitCost, 0) / q;
}

// Além dos períodos móveis, o filtro aceita um mês ("2026-03") ou um ano
// ("2026") escolhido a dedo. A comparação é feita em TEXTO, no formato do
// próprio campo, e não montando Date: "2026-03-10".startsWith("2026-03") não
// tem fuso, não tem virada de mês e não tem 29 de fevereiro para errar.
const MES_ESCOLHIDO = /^\d{4}-\d{2}$/;
const ANO_ESCOLHIDO = /^\d{4}$/;
function inPeriod(iso, sel) {
  if (sel === 'all') return true;
  if (!iso) return false;
  if (MES_ESCOLHIDO.test(sel)) return String(iso).slice(0, 7) === sel;
  if (ANO_ESCOLHIDO.test(sel)) return String(iso).slice(0, 4) === sel;
  const now = new Date(); const d = new Date(iso + 'T12:00');
  if (sel === 'this-month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (sel === 'last-month') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth(); }
  if (sel === 'this-year') return d.getFullYear() === now.getFullYear();
  return true;
}
// Só oferece mês e ano que TÊM lançamento: um mês vazio na lista é um beco.
// Entram as duas datas de cada lançamento — a da compra e a do pagamento —
// porque no regime de caixa é a segunda que decide onde ele aparece.
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const rotuloMes = m => {
  const [a, mm] = m.split('-');
  const nome = NOME_MES[Number(mm) - 1] || mm;
  return nome.charAt(0).toUpperCase() + nome.slice(1) + ' de ' + a;
};
function periodosComLancamento(lista, regime) {
  const datas = [];
  // As opções seguem o REGIMEescolhido, e não um apanhado de todas as datas
  // possíveis. Misturar as três produzia becos: por competência a lista
  // oferecia "Novembro de 2026" porque existe uma parcela vencendo lá, e
  // escolher esse mês abria uma tela vazia — por competência a parcela está no
  // mês da compra. Cada mês oferecido aqui tem lançamento no regime em uso.
  const r = REGIMES_VALIDOS.includes(regime) ? regime : regimeAtual();
  lista.forEach(t => {
    const d = dataDoRegime(t, r);
    if (d) datas.push(d);
  });
  const meses = [...new Set(datas.map(d => String(d).slice(0, 7)))].sort().reverse();
  const anos = [...new Set(datas.map(d => String(d).slice(0, 4)))].sort().reverse();
  return { meses, anos };
}
// Reconstrói as opções só quando o conjunto muda: refazer o seletor a cada
// desenho fecharia a lista na mão de quem está escolhendo.
const FIXOS = ['this-month', 'last-month', 'this-year', 'all'];
const assinaturaPeriodo = {};
function atualizarOpcoesPeriodo(id, lista, regime) {
  const el = $(id);
  if (!el) return;
  const r = REGIMES_VALIDOS.includes(regime) ? regime : regimeAtual();
  const { meses, anos } = periodosComLancamento(lista, r);
  // O regime entra na assinatura: trocar de regime muda o conjunto de meses, e
  // sem ele a lista continuaria a do regime anterior até algum lançamento mudar.
  const assinatura = r + '|' + meses.join(',') + '|' + anos.join(',');
  if (assinaturaPeriodo[id] === assinatura) return;
  assinaturaPeriodo[id] = assinatura;
  const escolhido = el.value;
  const fixos = [...el.options].filter(o => FIXOS.includes(o.value))
    .map(o => `<option value="${o.value}">${esc(o.textContent)}</option>`).join('');
  const opMes = meses.map(m => `<option value="${m}">${esc(rotuloMes(m))}</option>`).join('');
  const opAno = anos.length > 1
    ? anos.map(a => `<option value="${a}">Ano de ${esc(a)}</option>`).join('') : '';
  el.innerHTML = fixos
    + (opMes ? `<optgroup label="Mês">${opMes}</optgroup>` : '')
    + (opAno ? `<optgroup label="Ano">${opAno}</optgroup>` : '');
  // O valor guardado pode ser um mês que só existe depois que os dados chegam:
  // é aqui, e não no arranque, que ele volta a ser aplicável.
  //
  // Quem ganha depende de quem escolheu. Antes de o usuário mexer nesta sessão,
  // o guardado tem de vencer — senão o mês escolhido ontem NUNCA volta, porque
  // na abertura o seletor está no padrão do HTML e esse padrão sempre existe.
  // Depois que ele mexeu, a escolha da sessão vence: um mês reaparecendo por
  // causa de um lançamento novo não pode sequestrar a tela que ele está vendo.
  // O GUARDADO vem primeiro, sempre. Ele é a última escolha que o dedo do
  // usuário fez — guardarPeriodo só é chamado quando ele mexe no seletor —,
  // enquanto o valor atual pode ser uma QUEDA: quando o mês escolhido deixa de
  // existir, o código põe "Este mês" ali.
  //
  // Antes o valor atual vencia depois da primeira escolha da sessão, e isso
  // tinha uma consequência que não se via: bastava uma queda para a escolha
  // guardada ficar sombreada até o app fechar. Escolher "Novembro de 2026" por
  // vencimento, trocar para competência (onde novembro não existe, e o seletor
  // cai em "Este mês") e voltar devolvia "Este mês", com novembro de volta na
  // lista e o usuário sem entender por que a tela dele sumiu.
  const guardado = LS.g(PERIODO_GUARDADO[id], null);
  const alvo = [guardado, escolhido].find(v => v && [...el.options].some(o => o.value === v));
  el.value = alvo || 'this-month';
}

// ===== Busca por palavra =====
// "Quanto gastei com vacina?" não é uma pergunta que período e regime respondem.
//
// O termo NÃO fica guardado no aparelho, de propósito. Uma busca que sobrevive
// ao fechamento deixaria o aplicativo abrindo com metade dos lançamentos
// escondidos, e quem não lembra de ter digitado nada concluiria que perdeu
// dado. Período fica guardado porque é uma postura; busca é um gesto.
const termoBusca = { 'bfin-busca': '', 'av-busca': '', 'fz-busca': '',
  'bov-busca': '', 'vend-busca': '', 'mort-busca': '', 'est-busca': '' };
// Sem acento e sem maiúscula dos dois lados: quem digita no curral escreve
// "racao", e "Ração" tem de aparecer. O NFD separa a letra do acento, e o
// intervalo apagado é exatamente o dos acentos.
const semAcento = v => String(v == null ? '' : v)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Tudo o que a linha mostra entra no que se procura, e mais o que ela esconde:
// o valor escrito como aparece (1.234,50) e como foi digitado (1234.5), as duas
// datas, a parcela e a atividade. Procurar "1234" ou "10/11" tem de achar.
function textoDoLancamento(t, livro) {
  return semAcento([
    t.category, t.notes, livro,
    // Três formas do mesmo valor: como a tela mostra (R$ 1.234,50), como foi
    // digitado (1234.5) e como se escreve aqui (1234,50). Havia uma quarta, o
    // valor ARREDONDADO, e ela mentia: procurar "1235" trazia um lançamento de
    // R$ 1.234,50 — e, como a busca muda o saldo, um total com um lançamento
    // que a pessoa não pediu é um número errado na cabeça dela.
    fmtRS(t.amount), String(t.amount),
    Number.isFinite(t.amount) ? t.amount.toFixed(2).replace('.', ',') : '',
    fmtBRfull(t.date), t.venc ? fmtBRfull(t.venc) : '', t.pagoEm ? fmtBRfull(t.pagoEm) : '',
    t.parcelas > 1 ? `${t.parcela}/${t.parcelas}` : '',
    t.type === 'entrada' ? 'entrada receita' : 'saida gasto despesa custo',
    emAberto(t) ? 'a pagar em aberto devendo' : '',
    aReceber(t) ? 'a receber em aberto pendente recebimento' : '',
    (t.venc && t.pago) ? (t.type === 'entrada' ? 'recebido' : 'pago quitado') : '',
    (t.anexos || []).map(x => x.nome).join(' ')
  ].filter(Boolean).join(' '));
}
// Todas as palavras têm de aparecer, em qualquer ordem e em qualquer campo:
// "vacina 2026" acha a vacina daquele ano. Exigir a frase inteira junto faria
// a busca falhar por causa da ordem em que a pessoa lembrou das coisas.
// O termo é quebrado UMA vez por busca, não uma vez por lançamento. Com
// milhares de lançamentos, normalizar e dividir o mesmo texto a cada linha é
// trabalho repetido que se paga a cada tecla digitada.
let partesCache = { termo: null, partes: [] };
function partesDaBusca(termo) {
  if (partesCache.termo !== termo) {
    partesCache = { termo, partes: semAcento(termo).split(/\s+/).filter(Boolean) };
  }
  return partesCache.partes;
}
function casaBusca(t, termo, livro) {
  const partes = termo ? partesDaBusca(termo) : [];
  if (!partes.length) return true;
  // Categoria e observação primeiro, que é onde a busca típica acha. Só se
  // algum termo não estiver neles é que o texto completo é montado — e é ele
  // que custa, porque formatar o valor em reais passa pela tabela de idioma do
  // aparelho, o trabalho mais caro de toda a comparação. Numa fazenda com
  // milhares de lançamentos, esse desvio é a diferença entre a lista responder
  // enquanto se digita e ela travar a cada letra.
  const barato = semAcento((t.category || '') + ' ' + (t.notes || ''));
  if (partes.every(p => barato.includes(p))) return true;
  const alvo = textoDoLancamento(t, livro);
  return partes.every(p => alvo.includes(p));
}
// Achar UM animal numa lista de sessenta era rolar com o dedo até ver o
// brinco. No curral, com o bicho no tronco, isso é o gesto mais repetido e o
// mais lento do aplicativo. Entra tudo o que a linha mostra e mais o que ela
// esconde — raça, categoria, medicamento do último manejo, causa da morte.
function textoDoAnimal(a) {
  const ws = wOf(a.id);
  const ultima = ws.length ? ws[ws.length - 1] : null;
  return semAcento([
    a.ident, a.cat, a.raca, a.notes,
    a.manejoMedicamento, a.manejoData ? fmtBRfull(a.manejoData) : '',
    (() => { const c = carenciaDoAnimal(a); return c && c.bloqueado
      ? 'carencia bloqueado nao pode abate ' + fmtBRfull(c.liberadoEm) : ''; })(),
    ultima ? fmtBRfull(ultima.date) : 'nunca pesado',
    ultima ? fmtN(ultima.weight, 0) : '',
    a.dead ? 'morto ' + (a.deadCause || '') + ' ' + (a.deadDate ? fmtBRfull(a.deadDate) : '') : '',
    vendidoDeVerdade(a) ? 'vendido ' + (a.soldDate ? fmtBRfull(a.soldDate) : '') : ''
  ].filter(Boolean).join(' '));
}
function casaAnimal(a, termo) {
  const partes = termo ? partesDaBusca(termo) : [];
  if (!partes.length) return true;
  // O brinco é o que se digita em nove de cada dez buscas: conferir ele
  // sozinho primeiro evita montar o texto inteiro do animal por linha.
  const barato = semAcento(a.ident || '');
  if (partes.every(p => barato.includes(p))) return true;
  return partes.every(p => textoDoAnimal(a).includes(p));
}
function casaItem(it, termo) {
  const partes = termo ? partesDaBusca(termo) : [];
  if (!partes.length) return true;
  const alvo = semAcento([it.name, it.unit, it.notes,
    it.carencia ? 'carencia ' + it.carencia : ''].filter(Boolean).join(' '));
  return partes.every(p => alvo.includes(p));
}
// Quando a busca esconde linhas, o número do que sobrou tem de estar escrito:
// uma lista mais curta sem explicação parece dado perdido.
// O plural vem escrito, não montado com "+s": em português isso produz
// "animals" e "items", que é exatamente o que apareceu na primeira versão.
function avisoDaBuscaLista(escondidos, id, singular, plural) {
  if (!escondidos) return '';
  return `<button type="button" class="fora-periodo" data-limpar-busca="${id}">
    <span class="fp-texto mono">+ ${escondidos} ${escondidos > 1 ? plural : singular} fora da busca</span>
    <span class="fp-acao mono">Limpar busca</span>
  </button>`;
}
const buscaDe = id => (termoBusca[id] || '').trim();
// O rótulo do saldo responde de uma vez "está filtrado" e "achou quantos" —
// sem isso a contagem só existia somando as linhas da lista com o dedo.
const rotuloBusca = (termo, n) => !termo ? ''
  : ` · busca · ${n} encontrado${n === 1 ? '' : 's'}`;
// A busca esconde lançamento, e nesta tela o que esconde tem de se anunciar.
// Ela ainda muda o SALDO — some do total o que não casa —, e um total menor
// sem explicação é pior que nenhum total.
function avisoDaBusca(escondidos, id) {
  if (!escondidos.length) return '';
  const soma = escondidos.reduce((s, t) => s + t.amount, 0);
  return `<button type="button" class="fora-periodo" data-limpar-busca="${id}">
    <span class="fp-texto mono">+ ${escondidos.length} lançamento${escondidos.length > 1 ? 's' : ''} fora da busca · ${fmtRS(soma)}</span>
    <span class="fp-acao mono">Limpar busca</span>
  </button>`;
}

// Lançamento com data fora do período escolhido sumia da tela sem deixar
// rastro: quem acabou de lançar concluía que o lançamento se perdeu. Acontece
// sobretudo com data futura, porque "Este mês" e "Este ano" a excluem — uma
// parcela de 2027 lançada hoje não aparece em nenhum dos dois. O aviso conta
// quantos ficaram de fora e leva para "Todo período" num toque.
function avisoForaDoPeriodo(fora, seletor) {
  if (!fora.length) return '';
  const hoje = todayISO();
  const soma = fora.reduce((s, t) => s + t.amount, 0);
  const futuros = fora.filter(t => t.quando > hoje).length;
  const quantos = `${fora.length} lançamento${fora.length > 1 ? 's' : ''}`;
  const onde = futuros === fora.length ? 'com data futura'
    : futuros ? `em outro período (${futuros} com data futura)`
    : 'em outro período';
  return `<button type="button" class="fora-periodo" data-ver-tudo="${seletor}">
    <span class="fp-texto mono">+ ${quantos} ${onde} · ${fmtRS(soma)}</span>
    <span class="fp-acao mono">Ver todo período</span>
  </button>`;
}

// O período escolhido não era guardado: a cada abertura o Financeiro voltava
// para "Este mês" e escondia de novo o que estava fora dele.
const PERIODO_GUARDADO = {
  'bfin-period': 'fjs-periodo-bov',
  'av-period': 'fjs-periodo-av',
  'fz-period': 'fjs-periodo-fz'
};
// Só é chamado quando o usuário mexe no seletor: o que está aqui é escolha
// dele, nunca um valor que o código pôs.
function guardarPeriodo(id) { LS.s(PERIODO_GUARDADO[id], $(id).value); }
function restaurarPeriodos() {
  Object.entries(PERIODO_GUARDADO).forEach(([id, chave]) => {
    const v = LS.g(chave, null);
    // valor guardado por uma versão antiga não pode deixar o seletor num
    // estado que não existe mais
    if (v && [...$(id).options].some(o => o.value === v)) $(id).value = v;
  });
}

// ===== Navegação =====
let tab = 'bovinos', seg = 'rebanho', detailAnimal = null, detailItem = null;
let bovSort = LS.g('fjs-sort-rebanho', 'ident-asc');

// A linha de segmentos rola de lado e não cabe inteira num celular. Duas
// coisas faltavam: o segmento escolhido podia ficar fora da tela — sem nenhum
// sinal de qual está ativo —, e não havia pista de que existisse mais coisa à
// direita. Quem nunca rolou aquela linha não sabia que Financeiro e Custos
// existiam.
let segRolado = null;
function mostrarSegAtivo() {
  const fila = $('bov-segs'), env = $('bov-segs-wrap');
  if (!fila || !env) return;
  const ativo = fila.querySelector('.seg.active');
  // Só quando o segmento MUDA. A cada desenho, a rolagem brigaria com quem
  // acabou de arrastar a linha para olhar o que tem adiante.
  if (ativo && ativo.offsetParent !== null && segRolado !== seg) {
    segRolado = seg;
    const e = ativo.offsetLeft, d = e + ativo.offsetWidth;
    if (e < fila.scrollLeft) fila.scrollLeft = Math.max(0, e - 12);
    else if (d > fila.scrollLeft + fila.clientWidth) fila.scrollLeft = d - fila.clientWidth + 12;
  }
  atualizarSombraSeg();
}
// A sombra só existe enquanto há o que ver adiante: mantida no fim da rolagem,
// ela viraria uma mancha permanente prometendo algo que não está lá.
function atualizarSombraSeg() {
  const fila = $('bov-segs'), env = $('bov-segs-wrap');
  if (!fila || !env) return;
  const temMais = fila.scrollWidth - fila.clientWidth - fila.scrollLeft > 4;
  env.classList.toggle('tem-mais', temMais);
}
(() => { const f = $('bov-segs'); if (f) f.addEventListener('scroll', atualizarSombraSeg); })();

function render() {
  sincronizarBusca();
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === tab));
  $('view-bovinos').classList.toggle('active', tab === 'bovinos');
  $('view-aviarios').classList.toggle('active', tab === 'aviarios');
  $('view-fazenda').classList.toggle('active', tab === 'fazenda');
  if (tab === 'bovinos') {
    document.querySelectorAll('#bov-segs .seg').forEach(s => s.classList.toggle('active', s.dataset.seg === seg));
    mostrarSegAtivo();
    ['bov-rebanho', 'bov-detail', 'bov-compras', 'bov-vendidas', 'bov-mortes', 'bov-estoque', 'stock-detail', 'bov-fin', 'bov-custos'].forEach(id => $(id).classList.remove('active'));
    if (seg === 'rebanho') { $(detailAnimal ? 'bov-detail' : 'bov-rebanho').classList.add('active'); detailAnimal ? renderAnimalDetail() : renderRebanho(); }
    if (seg === 'compras') { $('bov-compras').classList.add('active'); renderCompras(); }
    if (seg === 'vendidas') { $('bov-vendidas').classList.add('active'); renderVendidas(); }
    if (seg === 'mortes') { $('bov-mortes').classList.add('active'); renderMortes(); }
    if (seg === 'custos') { $('bov-custos').classList.add('active'); renderCustos(); }
    if (seg === 'estoque') { $(detailItem ? 'stock-detail' : 'bov-estoque').classList.add('active'); detailItem ? renderStockDetail() : renderEstoque(); }
    if (seg === 'financeiro') { $('bov-fin').classList.add('active'); renderFin('bov'); }
  } else if (tab === 'aviarios') { renderFin('av'); }
  else { renderFazenda(); }
  posicionarResultados();
  renderLembrete();
  // O selo do ícone acompanha o que a tela acabou de desenhar: quem abre o
  // aplicativo e paga uma conta vê o número do ícone cair junto.
  atualizarSelo();
  // Vendidas, Mortalidade e Custos não têm nada para adicionar pelo botão +.
  // A aba Fazenda é só leitura: o lançamento se faz na atividade a que pertence.
  $('fab').hidden = tab === 'bovinos' && ['vendidas', 'mortes', 'custos'].includes(seg);
}

function renderRebanho() {
  const activeAnimals = animals.filter(noRebanho);
  const activeIds = new Set(activeAnimals.map(a => a.id));
  const n = activeAnimals.length;
  // Média de GMD só pode somar números comparáveis entre si: a comparação
  // jejum↔cheio fica de fora, igual ao bloco do GMD do rebanho logo abaixo.
  const gmdsInfo = activeAnimals.map(a => gmdInfo(wOf(a.id)));
  const gmds = gmdsInfo.filter(x => Number.isFinite(x.gmd) && !x.misto).map(x => x.gmd);
  const gmdsMistos = gmdsInfo.filter(x => Number.isFinite(x.gmd) && x.misto).length;
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
  // Número que saiu de uma média tem de ser contado em voz alta. Duas coisas
  // encolhem esses cartões em silêncio, e as duas mudam decisão de venda:
  //
  // 1. ANIMAL SEM PESAGEM. "ANIMAIS 10" em cima de "TOTAL DO REBANHO 94 @" lê-se
  //    como o rebanho inteiro, e o total é só o dos pesados. Com 4 de 10 sem
  //    balança, o total aparece 40% menor do que o rebanho vale, e nada na tela
  //    diz de onde veio a diferença.
  // 2. COMPARAÇÃO JEJUM↔CHEIO, que sai da média do GMD pelo mesmo motivo que já
  //    saía do bloco do GMD do rebanho.
  const semPeso = [...weightById.values()].filter(v => !Number.isFinite(v)).length;
  const ressalvas = [];
  if (semPeso) ressalvas.push(`${semPeso} ${semPeso > 1 ? 'animais' : 'animal'} sem pesagem `
    + `${semPeso > 1 ? 'não entram' : 'não entra'} no peso médio nem no total do rebanho.`);
  if (gmdsMistos) ressalvas.push(`GMD médio: ${gmdsMistos} ${gmdsMistos > 1 ? 'animais ficaram' : 'animal ficou'} `
    + 'de fora — a primeira e a última pesagem foram em condições diferentes (jejum e cheio).');
  $('bov-gmd-nota').textContent = ressalvas.join(' ');
  $('bov-gmd-nota').hidden = !ressalvas.length;

  // Estimativa do rebanho inteiro: onde ele estaria HOJE com um GMD informado
  // à mão. Os cartões acima mostram a última balança; entre uma pesagem e a
  // próxima o gado continuou ganhando, e é esse número que se leva para uma
  // negociação. Projeta animal por animal a partir da última pesagem de cada
  // um — não do peso médio —, porque cada um foi pesado num dia diferente.
  const hoje = todayISO();
  const gmdSim = parseNum($('bov-gmd-sim').value);
  const pesosEst = activeAnimals.map(a => projetar(a, gmdSim, hoje))
    .filter(Boolean).map(x => x.peso);
  const temEst = Number.isFinite(gmdSim) && pesosEst.length > 0;
  const totalEst = pesosEst.reduce((s, p) => s + p, 0);
  const diasDesde = lastDates.length ? Math.max(0, daysBetween(lastDates[lastDates.length - 1], hoje)) : 0;
  // ---- GMD do rebanho: entre pesagens, e do começo até agora ----
  const ge = gmdGeralRebanho();
  const ep = gmdEntrePesagens();
  const caixaP = $('bov-gmd-pes');
  caixaP.hidden = !ep.linhas.length && ge.gmd == null;
  if (!caixaP.hidden) {
    const maiorP = Math.max(...ep.linhas.map(l => Math.abs(l.gmd)), 0.001);
    const linhasP = ep.linhas.slice(0, 12).map(l => {
      const larg = Math.max(2, Math.round(Math.abs(l.gmd) / maiorP * 100));
      const rot = l.ini === l.fim ? fmtBR(l.fim) : fmtBR(l.ini) + '–' + fmtBR(l.fim);
      return `<div class="gm-linha gm-linha-pes">
        <span class="gm-mes">${esc(rot)}</span>
        <span class="gm-barra"><i class="${l.gmd < 0 ? 'gm-neg' : gmdCls(l.gmd)}" style="width:${larg}%"></i></span>
        <span class="gm-val ${l.gmd < 0 ? 'gm-neg-txt' : ''}">${fmtN(l.gmd, 3)}</span>
        <span class="gm-n">${l.animais}</span>
      </div>`;
    }).join('');
    // O número do começo até agora vai NO CABEÇALHO: é o que resume o rebanho,
    // e não faria sentido precisar abrir o bloco para vê-lo.
    const corpoP = `<div class="gm-geral" id="bov-gmd-geral">` + (ge.gmd == null ? '' : `
        <div class="gg-rot mono">Da 1ª pesagem de cada animal até a mais recente</div>
        <div class="gg-val ${ge.gmd < 0 ? 'gm-neg-txt' : gmdCls(ge.gmd)}">${fmtN(ge.gmd, 3)}</div>
        <div class="gg-det mono">${ge.n} animal(is) · ${fmtN(ge.kg, 0)} kg em ${ge.dias} dias-animal`
      + `${ge.primeira ? ' · ' + fmtBR(ge.primeira) + ' a ' + fmtBR(ge.ultima) : ''}</div>`) + `</div>`
      + `<div class="gm-linhas" id="bov-gmd-pes-lista">${linhasP}</div>`
      + `<p class="est-nota mono" id="bov-gmd-pes-nota">`
      + 'Cada linha é uma pesagem: o ganho desde a pesagem anterior de cada animal. '
      + 'Dias de curral seguidos contam como a mesma pesagem. Entram todos os animais '
      + 'com duas pesagens, inclusive os já vendidos — o ganho deles aconteceu.'
      + (ge.fora || ep.misturados
        ? ` <b>${ge.fora + ep.misturados} comparação(ões) entre jejum e cheio ficaram de fora.</b>` : '')
      + '<br>O cartão "GMD médio" lá em cima é a média dos animais, um a um; estes aqui '
      + 'são do rebanho, e pesam cada animal pelos dias que ele ficou. Com bichos de '
      + 'tempos diferentes os dois não batem, e é este que corresponde ao quilo que entrou.'
      + '</p>';
    caixaP.innerHTML = dobravel('gmd-pes',
      cabecaDobra('GMD do rebanho', ge.gmd == null ? '—' : fmtN(ge.gmd, 3),
        (ge.gmd == null ? 'sem par de pesagens' : `desde ${fmtBR(ge.primeira)} · ${ge.n} animal(is)`)
        + (ep.linhas.length ? ` · última pesagem ${fmtN(ep.linhas[0].gmd, 3)}` : '')),
      corpoP);
  }

  // ---- GMD mês a mês ----
  const gm = gmdPorMes();
  const meses = gm.meses.slice(0, 12);
  const caixa = $('bov-gmd-mes');
  caixa.hidden = !meses.length;
  if (meses.length) {
    // A barra é proporcional ao maior do período: comparar meses é comparar
    // entre si, e uma escala fixa esconderia a diferença quando todos forem
    // baixos — que é justamente quando ela precisa aparecer.
    const maior = Math.max(...meses.map(m => Math.abs(m.gmd)), 0.001);
    const linhasM = meses.map(m => {
      const larg = Math.max(2, Math.round(Math.abs(m.gmd) / maior * 100));
      return `<div class="gm-linha">
        <span class="gm-mes">${esc(rotuloMesCurto(m.mes))}</span>
        <span class="gm-barra"><i class="${m.gmd < 0 ? 'gm-neg' : gmdCls(m.gmd)}" style="width:${larg}%"></i></span>
        <span class="gm-val ${m.gmd < 0 ? 'gm-neg-txt' : ''}">${fmtN(m.gmd, 3)}</span>
        <span class="gm-n">${m.animais}</span>
      </div>`;
    }).join('');
    const corpoM = `<div class="gm-linhas" id="bov-gmd-mes-lista">${linhasM}</div>`
      + `<p class="est-nota mono" id="bov-gmd-mes-nota">`
      + 'O ganho de cada intervalo é espalhado pelos dias que ele durou — '
      + 'pesagem de janeiro a abril rende para os três meses, não só para abril. '
      + 'O número da direita é quantos animais entraram no mês.'
      + (gm.misturados ? ` <b>${gm.misturados} intervalo(s) comparando jejum com cheio ficaram de fora.</b>` : '')
      + '</p>';
    // Os dois últimos meses no cabeçalho: comparar é o que este bloco faz, e
    // uma comparação precisa de dois números para existir.
    const doisUltimos = meses.slice(0, 2).map(m => `${rotuloMesCurto(m.mes)} ${fmtN(m.gmd, 3)}`).join(' · ');
    caixa.innerHTML = dobravel('gmd-mes',
      cabecaDobra('GMD mês a mês', fmtN(meses[0].gmd, 3), doisUltimos),
      corpoM);
  }

  $('bov-stats-est').hidden = !temEst;
  // O total estimado vai para o cabeçalho: é o número que se leva para a
  // negociação, e não faria sentido precisar abrir o bloco para vê-lo.
  $('bov-est-cab').innerHTML = cabecaDobra('Estimativa do rebanho hoje',
    temEst ? fmtN(arrobaOf(totalEst), 0) + ' @' : '',
    temEst ? `${fmtN(totalEst / pesosEst.length, 0)} kg médios · GMD ${fmtN(gmdSim, 3)} · ${diasDesde}d`
      : 'informe o GMD do lote para projetar');
  $('bov-est-nota').textContent = !Number.isFinite(gmdSim)
    ? 'Informe o GMD que o lote vem fazendo para ver onde o rebanho estaria hoje.'
    : !pesosEst.length ? 'Sem pesagem para projetar.'
    : `${pesosEst.length} animal(is) com pesagem · projetado da última balança de cada um até ${fmtBR(hoje)}`;
  if (temEst) {
    const mediaEst = totalEst / pesosEst.length;
    const ganho = arrobaOf(totalEst) - (totalArroba || 0);
    $('bov-stats-est').innerHTML = `
      <div class="stat-card est"><div class="stat-value">${fmtN(mediaEst, 0)} kg</div><div class="stat-label">Peso médio hoje (est.)</div></div>
      <div class="stat-card est"><div class="stat-value">${fmtN(arrobaOf(totalEst), 0)} @</div><div class="stat-label">Total hoje (est.)</div></div>
      <div class="stat-card est"><div class="stat-value ${ganho < 0 ? 'neg' : ''}">${ganho >= 0 ? '+' : ''}${fmtN(ganho, 1)} @</div><div class="stat-label">Ganho em ${diasDesde} dias</div></div>`;
  } else $('bov-stats-est').innerHTML = '';
  const byIdent = (a, b) => a.ident.localeCompare(b.ident, 'pt-BR', { numeric: true });
  // A busca filtra a LISTA, e não os cartões: eles respondem "como está o
  // rebanho", que é um fato da fazenda e não muda porque alguém digitou um
  // brinco. Mudá-los faria o total de animais oscilar a cada letra.
  const termoBov = buscaDe('bov-busca');
  const naBuscaBov = activeAnimals.filter(a2 => casaAnimal(a2, termoBov));
  const sorted = [...naBuscaBov].sort((a, b) => {
    if (bovSort === 'peso-desc' || bovSort === 'peso-asc') {
      const wa = weightById.get(a.id), wb = weightById.get(b.id);
      if (wa == null && wb == null) return byIdent(a, b);
      if (wa == null) return 1; // sem pesagem vai para o fim da lista
      if (wb == null) return -1;
      return bovSort === 'peso-desc' ? wb - wa : wa - wb;
    }
    // Por GMD: é a ordem que mostra quem está pagando o pasto e quem não está.
    // Mesmo GMD do cartão da direita — o total, da primeira à última pesagem.
    // Animal com uma pesagem só não tem GMD e vai para o fim nas duas ordens:
    // ele não é o pior do rebanho, é o que ainda não dá para julgar.
    if (bovSort === 'gmd-desc' || bovSort === 'gmd-asc') {
      const ga = gmdTotal(wOf(a.id)), gb = gmdTotal(wOf(b.id));
      const va = Number.isFinite(ga), vb = Number.isFinite(gb);
      if (!va && !vb) return byIdent(a, b);
      if (!va) return 1;
      if (!vb) return -1;
      if (ga === gb) return byIdent(a, b);
      return bovSort === 'gmd-desc' ? gb - ga : ga - gb;
    }
    // Por data da última pesagem: agrupa de um lado quem passou pela balança no
    // dia e do outro quem não passou — é assim que se enxerga o que sobrou de
    // um lote vendido sem precisar apagar nada para descobrir.
    if (bovSort === 'data-desc' || bovSort === 'data-asc') {
      const ua = wOf(a.id), ub = wOf(b.id);
      const da = ua.length ? ua[ua.length - 1].date : null, dbb = ub.length ? ub[ub.length - 1].date : null;
      if (da == null && dbb == null) return byIdent(a, b);
      if (da == null) return 1; // nunca pesado vai para o fim
      if (dbb == null) return -1;
      if (da === dbb) return byIdent(a, b);
      return bovSort === 'data-desc' ? dbb.localeCompare(da) : da.localeCompare(dbb);
    }
    return bovSort === 'ident-desc' ? byIdent(b, a) : byIdent(a, b);
  });
  $('animal-list').innerHTML = sorted.map(a => {
    const ws = wOf(a.id); const last = ws[ws.length - 1]; const gi = gmdInfo(ws);
    return `<div class="list-item" data-animal="${a.id}">
      <div class="item-main">
        <div class="item-title">${esc(a.ident)}</div>
        <div class="item-subtitle">${esc(catERaca(a))} · ${ws.length} pesag.${a.manejoData ? ' · manejo ' + fmtBR(a.manejoData) : ''}</div>
        ${(() => { const c = carenciaDoAnimal(a); return c && c.bloqueado
          ? `<div class="car-tarja mono">⚠ carência até ${fmtBR(c.liberadoEm)} · faltam ${c.faltam} dia${c.faltam > 1 ? 's' : ''}</div>` : ''; })()}
        <div class="item-quando mono">${last ? 'última ' + fmtBR(last.date) : 'nunca pesado'}</div>
      </div>
      <div class="item-side">
        <div class="value">${last ? fmtN(last.weight, 0) + ' kg' : '—'}</div>
        <div class="aux ${gi.misto ? 'gmd-misto' : gmdCls(gi.gmd)}"${gi.misto
          ? ' title="A primeira e a última pesagem deste animal foram em condições diferentes (jejum e cheio). O ganho real não é este."'
          : ''}>${Number.isFinite(gi.gmd) ? 'GMD ' + fmtN(gi.gmd, 2) + (gi.misto ? ' ⚠' : '') : ''}</div>
        ${(() => { const e = projetar(a, gmdSim, hoje); return e
          ? `<div class="aux est-linha">~${fmtN(e.peso, 0)} kg hoje</div>` : ''; })()}
      </div>
    </div>`;
  }).join('');
  const emCar = animaisEmCarencia();
  $('bov-carencia').innerHTML = !emCar.length ? '' : dobravel('carencia',
    cabecaDobra('Em carência de medicamento', String(emCar.length),
      'não podem ir para o abate', true),
    emCar.map(({ a, c }) => `<div class="car-linha">
      <span class="car-brinco">${esc(a.ident)}</span>
      <span class="car-med mono">${esc(c.item.name)} · ${c.dias}d</span>
      <span class="car-quando mono">libera ${fmtBR(c.liberadoEm)}</span>
    </div>`).join(''));
  $('bov-carencia').hidden = !emCar.length;
  $('bov-busca-aviso').innerHTML =
    avisoDaBuscaLista(activeAnimals.length - naBuscaBov.length, 'bov-busca', 'animal', 'animais');
  $('bov-empty').hidden = n > 0;
  // "Nenhum animal cadastrado" seria mentira quando existem sessenta e a
  // busca escondeu todos: manda a pessoa cadastrar o que ela já tem.
  if (n > 0 && !sorted.length && termoBov) {
    $('animal-list').innerHTML = `<p class="busca-vazia mono">Nenhum animal com "${esc(termoBov)}" entre os ${n} do rebanho.</p>`;
  }
}

// Mortalidade. O peso perdido é o último peso conhecido de cada animal morto:
// é exatamente o que saiu do total do rebanho quando ele foi marcado.
function renderMortes() {
  const mortos = animals.filter(a => a.dead).sort((a, b) => (b.deadDate || '').localeCompare(a.deadDate || ''));
  const vivos = animals.filter(noRebanho).length;
  // Denominador = quem está no rebanho hoje + quem morreu. Vendido saiu vivo,
  // então não entra: incluí-lo diluiria a taxa e esconderia o problema.
  const base = vivos + mortos.length;
  const taxa = base ? (mortos.length / base) * 100 : null;
  const pesoDe = a => { const ws = wOf(a.id); return ws.length ? ws[ws.length - 1].weight : null; };
  const pesos = mortos.map(pesoDe).filter(Number.isFinite);
  const kgPerdidos = pesos.reduce((s, w) => s + w, 0);
  const arrobasPerdidas = kgPerdidos * (settings.yield / 100) / 15;
  $('mortes-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${mortos.length}</div><div class="stat-label">Mortes</div></div>
    <div class="stat-card"><div class="stat-value">${taxa != null ? fmtN(taxa, 1) + '%' : '—'}</div><div class="stat-label">Taxa</div></div>
    <div class="stat-card"><div class="stat-value">${vivos}</div><div class="stat-label">No rebanho</div></div>`;
  $('mortes-stats2').innerHTML = `
    <div class="stat-card"><div class="stat-value">${pesos.length ? fmtN(kgPerdidos, 0) + ' kg' : '—'}</div><div class="stat-label">Peso perdido</div></div>
    <div class="stat-card"><div class="stat-value">${pesos.length ? fmtN(arrobasPerdidas, 1) + ' @' : '—'}</div><div class="stat-label">Arrobas perdidas</div></div>`;
  const termoMort = buscaDe('mort-busca');
  const naBuscaMort = mortos.filter(a2 => casaAnimal(a2, termoMort));
  $('mortes-list').innerHTML = naBuscaMort.map(a => {
    const peso = pesoDe(a);
    return `<div class="list-item" data-animal-edit="${a.id}">
      <div class="item-main">
        <div class="item-title">${esc(a.ident)}</div>
        <div class="item-subtitle">${a.deadDate ? fmtBR(a.deadDate) : 'sem data'} · ${esc(a.deadCause || 'causa não informada')}</div>
        <div class="item-quando mono">${esc(catERaca(a))}</div>
      </div>
      <div class="item-side">
        <div class="value">${peso != null ? fmtN(peso, 0) + ' kg' : '—'}</div>
        <div class="aux">${peso != null ? fmtN(peso * (settings.yield / 100) / 15, 1) + ' @' : ''}</div>
      </div>
    </div>`;
  }).join('');
  $('mort-busca-aviso').innerHTML =
    avisoDaBuscaLista(mortos.length - naBuscaMort.length, 'mort-busca', 'registro', 'registros');
  $('mortes-empty').hidden = mortos.length > 0;
  if (mortos.length && !naBuscaMort.length && termoMort) {
    $('mortes-list').innerHTML = `<p class="busca-vazia mono">Nenhum registro com "${esc(termoMort)}".</p>`;
  }
}

// ===== Preço da arroba na venda =====
// O custo da arroba já era calculado; o preço RECEBIDO por ela não existia em
// lugar nenhum. Sem os dois lados, "a arroba me custa R$ 280" é meia conta —
// a que decide é a diferença, e ela ficava na cabeça.
//
// O rendimento usado é o DA VENDA, que pode ser diferente do da compra nos
// parâmetros de custo: é carcaça vendida que se está medindo.
const rendDaVenda = () => rendimentosDe(custoParams, settings.yield).rendVenda;
const vendidoDeVerdade = a => a.sold && !a.dead;
// Só entra na conta a venda que tem PESO e PREÇO. Sem o peso não há arroba;
// sem o preço não há valor. Quantas ficaram de fora é dito na tela, senão a
// média pareceria valer para todas.
const temPrecoEPeso = a => Number.isFinite(a.soldPrice) && a.soldPrice > 0
  && Number.isFinite(a.soldWeight) && a.soldWeight > 0;
function arrobaDoAnimal(a, rend) {
  if (!temPrecoEPeso(a)) return null;
  const arr = arrobasDe(a.soldWeight, rend == null ? rendDaVenda() : rend);
  return arr > 0 ? a.soldPrice / arr : null;
}
function precoArrobaVenda(lista) {
  const rend = rendDaVenda();
  const vendidos = (lista || animals).filter(vendidoDeVerdade);
  const naConta = vendidos.filter(temPrecoEPeso);
  // A média é o TOTAL recebido dividido pelo TOTAL de arrobas, e não a média
  // dos preços de cada animal. Média de razões não é razão de médias: com um
  // boi de 20@ vendido a R$ 300 e um de 10@ a R$ 360, a média simples daria
  // R$ 330 e o que entrou no bolso foi R$ 320 por arroba. O número errado é o
  // que parece mais justo, e é por isso que engana.
  const arrobas = naConta.reduce((s, a) => s + arrobasDe(a.soldWeight, rend), 0);
  const total = naConta.reduce((s, a) => s + a.soldPrice, 0);
  return {
    rend, n: naConta.length, foraDaConta: vendidos.length - naConta.length,
    arrobas, total, porArroba: arrobas > 0 ? total / arrobas : null
  };
}
function renderVendidas() {
  const sold = animals.filter(a => a.sold && !a.dead).sort((a, b) => (b.soldDate || '').localeCompare(a.soldDate || ''));
  const totalRevenue = sold.reduce((s, a) => s + (Number.isFinite(a.soldPrice) ? a.soldPrice : 0), 0);
  const pa = precoArrobaVenda();
  $('vendidas-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${sold.length}</div><div class="stat-label">Vendidos</div></div>
    <div class="stat-card"><div class="stat-value">${fmtRS(totalRevenue)}</div><div class="stat-label">Total recebido</div></div>
    <div class="stat-card"><div class="stat-value">${pa.porArroba != null ? fmtRS(pa.porArroba) : '—'}</div><div class="stat-label">Por arroba</div></div>
    <div class="stat-card"><div class="stat-value">${pa.arrobas > 0 ? fmtN(pa.arrobas, 1) + ' @' : '—'}</div><div class="stat-label">Arrobas vendidas</div></div>`;
  // O que ficou de fora da conta tem de estar escrito: uma média calculada
  // sobre metade das vendas, anunciada como se fosse de todas, é um número
  // errado com cara de certo.
  const nota = $('vendidas-nota');
  if (nota) {
    const faltam = pa.foraDaConta;
    nota.hidden = !sold.length;
    nota.innerHTML = !sold.length ? '' : pa.porArroba == null
      ? 'Preencha peso e preço de venda no animal para calcular o preço por arroba.'
      : `Rendimento de carcaça ${fmtN(pa.rend, 1)}% · ${pa.n} venda(s) na conta`
        + (faltam ? ` · <b>${faltam} sem peso ou preço ficaram de fora</b>` : '');
  }
  const termoVend = buscaDe('vend-busca');
  const naBuscaVend = sold.filter(a2 => casaAnimal(a2, termoVend));
  $('vendidas-list').innerHTML = naBuscaVend.map(a => {
    const ws = wOf(a.id);
    const w = Number.isFinite(a.soldWeight) ? a.soldWeight : (ws.length ? ws[ws.length - 1].weight : null);
    return `<div class="list-item" data-animal-edit="${a.id}">
      <div class="item-main">
        <div class="item-title">${esc(a.ident)}</div>
        <div class="item-subtitle">${esc(catERaca(a))}${a.soldDate ? ' · vendido em ' + fmtBR(a.soldDate) : ''}</div>
      </div>
      <div class="item-side">
        <div class="value">${w != null ? fmtN(w, 0) + ' kg' : '—'}</div>
        <div class="aux">${Number.isFinite(a.soldPrice) ? fmtRS(a.soldPrice) : ''}${
          arrobaDoAnimal(a) != null ? ' · ' + fmtRS(arrobaDoAnimal(a)) + '/@' : ''}</div>
      </div>
    </div>`;
  }).join('');
  $('vend-busca-aviso').innerHTML =
    avisoDaBuscaLista(sold.length - naBuscaVend.length, 'vend-busca', 'venda', 'vendas');
  $('vendidas-empty').hidden = sold.length > 0;
  if (sold.length && !naBuscaVend.length && termoVend) {
    $('vendidas-list').innerHTML = `<p class="busca-vazia mono">Nenhuma venda com "${esc(termoVend)}".</p>`;
  }
}

// Custo de produzir uma arroba: gasto diário por animal ÷ arrobas ganhas por dia.
// Arroba = 15 kg de carcaça, então o ganho de peso vivo (GMD) entra corrigido
// pelo rendimento de carcaça.
const arrobasDe = (kg, rend) => kg * (rend / 100) / 15;
// Rendimento de cada ponta: o informado, ou o geral quando em branco/inválido
function rendimentosDe(p, rendGeral) {
  const ok = v => Number.isFinite(v) && v > 0 && v <= 100;
  return {
    rendCompra: ok(p.rendCompra) ? p.rendCompra : rendGeral,
    rendVenda: ok(p.rendVenda) ? p.rendVenda : rendGeral
  };
}

function calcCusto() {
  const p = custoParams;
  const rend = Number.isFinite(p.rend) && p.rend > 0 && p.rend <= 100 ? p.rend : CUSTO_REND_PADRAO;

  // O animal come sal em proporção ao próprio peso, que muda ao longo da
  // engorda — por isso o consumo sai do peso médio entre entrada e saída.
  const pesos = [p.pesoCompra, p.pesoVenda].filter(x => Number.isFinite(x) && x > 0);
  const pesoMedio = pesos.length ? pesos.reduce((a, b) => a + b, 0) / pesos.length : null;
  const salPct = Number.isFinite(p.salPct) && p.salPct >= 0 ? p.salPct : SAL_PCT_PADRAO;
  const salKgDia = pesoMedio != null ? pesoMedio * salPct / 100 : null;
  const salDia = salKgDia != null && Number.isFinite(p.salPreco) ? salKgDia * p.salPreco : 0;
  const sanDia = Number.isFinite(p.sanidade) ? p.sanidade / DIAS_MES : 0;
  const moDia = Number.isFinite(p.mo) ? p.mo / DIAS_MES : 0;
  const terraDia = Number.isFinite(p.terra) ? p.terra / DIAS_MES : 0;
  const custoDia = salDia + sanDia + moDia + terraDia;

  // Arrobas ganhas por dia. Havendo os dois pesos, usa as arrobas realmente
  // produzidas no período (cada ponta com o seu rendimento) — assim este
  // número e o da simulação são sempre o mesmo. Sem os pesos, cai no cálculo
  // direto pelo GMD e pelo rendimento geral.
  const { rendCompra, rendVenda } = rendimentosDe(p, rend);
  let arrobaDia = null;
  if (Number.isFinite(p.gmd) && p.gmd > 0) {
    const pc = p.pesoCompra, pv = p.pesoVenda;
    if (Number.isFinite(pc) && pc > 0 && Number.isFinite(pv) && pv > pc) {
      arrobaDia = (arrobasDe(pv, rendVenda) - arrobasDe(pc, rendCompra)) / ((pv - pc) / p.gmd);
    } else {
      arrobaDia = (p.gmd * rend / 100) / 15;
    }
  }
  return {
    rend, rendCompra, rendVenda, salPct, pesoMedio, salKgDia, salDia, sanDia, moDia, terraDia,
    custoDia, arrobaDia,
    custoArroba: arrobaDia > 0 && custoDia > 0 ? custoDia / arrobaDia : null
  };
}

// Simulação da operação: compra o animal, engorda até o peso alvo pagando o
// custo diário acima, e vende ao preço da arroba informado.
function calcSimulacao(c) {
  const p = custoParams;
  const pc = p.pesoCompra, pv = p.pesoVenda;
  if (!Number.isFinite(pc) || pc <= 0 || !Number.isFinite(pv) || pv <= pc) return null;
  if (!Number.isFinite(p.gmd) || p.gmd <= 0) return null;

  // Mesmos rendimentos usados no custo da arroba, para os dois baterem
  const { rendCompra, rendVenda } = rendimentosDe(p, c.rend);

  const ganhoKg = pv - pc;
  const dias = ganhoKg / p.gmd;
  const meses = dias / DIAS_MES;
  const custoPeriodo = c.custoDia * dias;
  const arrobasCompra = arrobasDe(pc, rendCompra);
  const arrobasVenda = arrobasDe(pv, rendVenda);
  const arrobasProduzidas = arrobasVenda - arrobasCompra;

  const temCompra = Number.isFinite(p.valorCompra) && p.valorCompra >= 0;
  const temPreco = Number.isFinite(p.precoArroba) && p.precoArroba > 0;
  const investido = temCompra ? p.valorCompra + custoPeriodo : null;
  const receita = temPreco ? arrobasVenda * p.precoArroba : null;
  const resultado = investido != null && receita != null ? receita - investido : null;

  const margem = resultado != null && investido > 0 ? resultado / investido * 100 : null;
  return {
    ganhoKg, dias, meses, custoPeriodo, arrobasCompra, arrobasVenda, arrobasProduzidas,
    rendCompra, rendVenda, investido, receita, resultado, margem,
    valorKgCompra: temCompra && pc > 0 ? p.valorCompra / pc : null,
    valorKgVenda: receita != null && pv > 0 ? receita / pv : null,
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
    <div class="stat-card"><div class="stat-value">${s.valorKgCompra != null ? fmtRS(s.valorKgCompra) : '—'}</div><div class="stat-label">Kg na compra</div></div>
    <div class="stat-card"><div class="stat-value">${s.valorKgVenda != null ? fmtRS(s.valorKgVenda) : '—'}</div><div class="stat-label">Kg na venda</div></div>
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
  const rendTxt = c.rendCompra === c.rendVenda
    ? `rendimento ${fmtN(c.rendCompra, 1)}%`
    : `rendimento ${fmtN(c.rendCompra, 1)}% na compra e ${fmtN(c.rendVenda, 1)}% na venda`;
  $('cst-hint').textContent = c.custoArroba != null
    ? `por @ produzida · ${rendTxt}`
    : (c.arrobaDia == null ? 'Informe o GMD para calcular'
      : c.arrobaDia <= 0 ? 'O rendimento da compra está alto demais em relação ao da venda'
      : 'Informe ao menos um custo');

  // O custo da arroba sozinho é meia conta. Ao lado dele, o que ela REALMENTE
  // rendeu nas vendas já feitas — e a diferença, que é a pergunta que decide
  // se o negócio está de pé. Só aparece quando existe venda com peso e preço:
  // inventar uma margem a partir de dado faltando seria pior que não mostrar.
  const pav = precoArrobaVenda();
  const elV = $('cst-venda');
  if (!pav.porArroba) {
    elV.hidden = true;
    elV.innerHTML = '';
  } else {
    elV.hidden = false;
    const margem = c.custoArroba != null ? pav.porArroba - c.custoArroba : null;
    elV.innerHTML = `Vendida a <b>${fmtRS(pav.porArroba)}</b> por @ · ${pav.n} venda(s)`
      + (margem == null ? ' · informe o GMD e os custos para ver a margem'
        : ` · <b class="${margem >= 0 ? 'mg-ok' : 'mg-ruim'}">${margem >= 0 ? 'sobra' : 'falta'} `
          + `${fmtRS(Math.abs(margem))} por @</b>`);
  }

  $('cst-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${c.pesoMedio != null ? fmtN(c.pesoMedio, 0) + ' kg' : '—'}</div><div class="stat-label">Peso médio</div></div>
    <div class="stat-card"><div class="stat-value">${c.salKgDia != null ? fmtN(c.salKgDia, 3) + ' kg' : '—'}</div><div class="stat-label">Sal por dia</div></div>
    <div class="stat-card"><div class="stat-value">${fmtRS(c.custoDia)}</div><div class="stat-label">Custo por dia</div></div>
    <div class="stat-card"><div class="stat-value">${fmtRS(c.custoDia * DIAS_MES)}</div><div class="stat-label">Custo por mês</div></div>
    <div class="stat-card"><div class="stat-value">${c.arrobaDia > 0 ? fmtN(c.arrobaDia * DIAS_MES, 2) + ' @' : '—'}</div><div class="stat-label">Ganho por mês</div></div>
    <div class="stat-card"><div class="stat-value">${c.arrobaDia > 0 ? fmtN(1 / c.arrobaDia, 0) : '—'}</div><div class="stat-label">Dias por @</div></div>`;

  const pc = custoParams.pesoCompra, pv = custoParams.pesoVenda;
  $('cst-sal-calc').textContent = c.pesoMedio == null
    ? 'Informe os pesos de compra e venda na simulação abaixo para calcular o consumo.'
    : `${fmtN(c.salPct, 2)}% de ${fmtN(c.pesoMedio, 0)} kg = ${fmtN(c.salKgDia, 3)} kg/dia`
      + (Number.isFinite(pc) && Number.isFinite(pv) ? ` · média entre ${fmtN(pc, 0)} e ${fmtN(pv, 0)} kg` : ' · com um só peso informado');

  const partes = [
    { nome: c.salKgDia != null ? `Sal (${fmtN(c.salKgDia, 2)} kg/dia)` : 'Sal', v: c.salDia },
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
  'cst-gmd': 'gmd', 'cst-sal-pct': 'salPct', 'cst-sal-preco': 'salPreco',
  'cst-sanidade': 'sanidade', 'cst-mo': 'mo', 'cst-terra': 'terra', 'cst-rend': 'rend',
  'cst-peso-compra': 'pesoCompra', 'cst-valor-compra': 'valorCompra',
  'cst-peso-venda': 'pesoVenda', 'cst-preco-arroba': 'precoArroba',
  'cst-rend-compra': 'rendCompra', 'cst-rend-venda': 'rendVenda'
};
function fillCustoInputs() {
  Object.entries(CUSTO_CAMPOS).forEach(([id, key]) => {
    const el = $(id);
    if (document.activeElement === el) return; // não atropela quem está digitando
    el.value = numParaCampo(custoParams[key]);
  });
}
let custoSaveTimer = null;
function saveCustoParams() {
  clearTimeout(custoSaveTimer);
  custoSaveTimer = setTimeout(() => {
    salvarFazenda({ custo: clean(custoParams) });
  }, 700);
}
Object.entries(CUSTO_CAMPOS).forEach(([id, key]) => {
  $(id).addEventListener('input', e => {
    const v = parseNum(e.target.value);
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
      <div class="meta">${esc(catERaca(a))}${a.entryDate ? ' · entrada ' + fmtBR(a.entryDate) : ''} · ${ws.length} pesagens${arro != null ? ' · ~' + fmtN(arro, 1) + ' @ (rend. ' + settings.yield + '%)' : ''}</div>
      ${a.manejoData ? `<div class="meta">Manejo sanitário: ${fmtBR(a.manejoData)}${a.manejoMedicamento ? ' — ' + esc(a.manejoMedicamento) : ''}</div>` : ''}
      ${(() => { const c = carenciaDoAnimal(a); if (!c) return '';
        return c.bloqueado
          ? `<div class="car-aviso mono">⚠ EM CARÊNCIA — ${esc(c.item.name)}, ${c.dias} dias. Libera em ${fmtBR(c.liberadoEm)} (faltam ${c.faltam}).</div>`
          : `<div class="car-ok mono">✓ Carência de ${esc(c.item.name)} cumprida em ${fmtBR(c.liberadoEm)}.</div>`; })()}
      ${vendidoDeVerdade(a) ? `<div class="meta">Vendido${a.soldDate ? ' em ' + fmtBR(a.soldDate) : ''}${
        Number.isFinite(a.soldWeight) ? ' · ' + fmtN(a.soldWeight, 0) + ' kg' : ''}${
        Number.isFinite(a.soldPrice) ? ' · ' + fmtRS(a.soldPrice) : ''}${
        arrobaDoAnimal(a) != null ? ' · <b>' + fmtRS(arrobaDoAnimal(a)) + ' por @</b>' : ''}</div>` : ''}
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
    const misto = prev && !mesmaCondicao(prev, w);
    return `<div class="wt-row" data-weighing="${w.id}">
      <span class="date">${fmtBR(w.date)}</span>
      <span class="weight">${fmtN(w.weight, 1)} kg</span>
      <span class="flag">${w.jejum ? 'jejum' : ''}</span>
      <span class="gmd ${gmdCls(g)}" ${misto ? 'title="comparação entre jejum e cheio"' : ''}>${Number.isFinite(g) ? fmtN(g, 3) + (misto ? ' ⚠' : '') : '—'}</span>
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
  const termoEst = buscaDe('est-busca');
  const naBuscaEst = items.filter(it => casaItem(it, termoEst));
  const sorted = [...naBuscaEst].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  $('stock-list').innerHTML = sorted.map(it => {
    const q = qtyOf(it.id); const ac = avgCostOf(it.id);
    const low = Number.isFinite(it.minQty) && it.minQty > 0 && q <= it.minQty;
    return `<div class="list-item" data-item="${it.id}">
      <div class="item-main">
        <div class="item-title">${esc(it.name)}</div>
        <div class="item-subtitle">${ac != null ? 'custo médio ' + fmtRS(ac) + '/' + esc(it.unit) : 'sem custo registrado'}${it.carencia ? ' · carência ' + esc(it.carencia) + 'd' : ''}</div>
      </div>
      <div class="item-side">
        <div class="value${q < 0 ? ' qtd-neg' : ''}">${fmtN(q, q % 1 ? 2 : 0)} ${esc(it.unit)}</div>
        ${q < 0 ? '<div class="aux estoque-erro">⚠ saiu mais do que entrou</div>'
          : low ? '<div class="aux warn-low">⚠ estoque baixo</div>' : ''}
      </div>
    </div>`;
  }).join('');
  $('est-busca-aviso').innerHTML =
    avisoDaBuscaLista(items.length - naBuscaEst.length, 'est-busca', 'item', 'itens');
  $('stock-empty').hidden = items.length > 0;
  if (items.length && !sorted.length && termoEst) {
    $('stock-list').innerHTML = `<p class="busca-vazia mono">Nenhum item com "${esc(termoEst)}" entre os ${items.length} do estoque.</p>`;
  }
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
        <div class="metric"><div class="lbl">Em estoque</div><div class="val">${fmtN(q, q % 1 ? 2 : 0)} ${esc(it.unit)}</div></div>
        <div class="metric"><div class="lbl">Custo médio</div><div class="val">${ac != null ? fmtRS(ac) : '—'}</div></div>
        <div class="metric"><div class="lbl">Consumo 30d</div><div class="val">${fmtN(spent30, spent30 % 1 ? 1 : 0)} ${esc(it.unit)}</div></div>
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

// ===== Contas a pagar =====
// Uma compra a prazo já é despesa no dia da compra (é assim que o custo da
// arroba fica certo), mas o dinheiro só sai no vencimento. Por isso o saldo do
// período continua contando tudo, e o que está em aberto ganha bloco próprio:
// misturar as duas coisas num número só esconderia uma das duas.
const AVISO_DIAS = 7;
// Divide o valor em N parcelas sem perder nem inventar centavo: o que sobra da
// divisão vai para as primeiras, que vencem antes. Somadas, devolvem o total
// exato — se sobrasse um centavo, a conta a pagar nunca fecharia com a compra.
function parcelasDe(total, n) {
  const cent = Math.round(total * 100);
  const base = Math.floor(cent / n);
  const resto = cent - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}
// Vencimento da parcela seguinte: mesmo dia no mês seguinte. Dia 31 em mês de
// 30 cai no último dia do mês, como fazem os boletos.
function vencimentoParcela(iso, k) {
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(y, m - 1 + k, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  const p = x => String(x).padStart(2, '0');
  return `${alvo.getFullYear()}-${p(alvo.getMonth() + 1)}-${p(alvo.getDate())}`;
}
// O RITMO das parcelas. Eram sempre mês a mês, no mesmo dia — o ritmo do
// boleto. Mas o acerto do curral quase nunca é assim: "a cada trinta dias"
// anda com o calendário e descola do dia do mês, e compra de gado combinada no
// leilão vem com data a data, cada uma onde deu. Impor o dia do mês a esses
// dois casos obrigava a corrigir parcela por parcela depois de salvar — e quem
// esquecesse ficava com o aviso do calendário tocando no dia errado.
//
//   mes   = mesmo dia do mês seguinte (dia 31 em mês de 30 cai no último dia,
//           como fazem os boletos)
//   30    = exatamente 30 dias entre uma e outra
//   livre = as datas que o dono escolheu, uma por uma
//
// A primeira parcela é sempre o "1º vencimento" do formulário, nos três casos:
// é o campo obrigatório, e é dela que as outras saem.
function vencimentosDe(venc, n, ritmo, datas) {
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return venc;
    // Data em branco no modo livre cai no padrão mensal em vez de ficar vazia:
    // parcela sem vencimento deixaria de ser conta a pagar e sumiria do "A
    // pagar" e do calendário sem avisar ninguém. O formulário ainda recusa a
    // data em branco antes de chegar aqui — isto é a última rede.
    if (ritmo === 'livre') return (datas && datas[i]) || vencimentoParcela(venc, i);
    if (ritmo === '30') return somarDias(venc, 30 * i);
    return vencimentoParcela(venc, i);
  });
}
// Monta as parcelas de uma compra. A despesa inteira fica no dia da compra —
// é o que mantém o custo da arroba certo — e cada parcela carrega só o seu
// vencimento, para o lembrete avisar uma de cada vez.
function montarParcelas({ base, total, venc, n, grupo, ritmo, datas }) {
  const valores = parcelasDe(total, n);
  const vencs = vencimentosDe(venc, n, ritmo, datas);
  // pagoEm: null junto com pago: false. Sem isso, a data de pagamento do
  // formulário vazava para parcelas que nascem devendo — e o CSV sairia com
  // "pago_em" preenchido numa conta que ainda não foi paga.
  return valores.map((v, i) => Object.assign({}, base, {
    id: uid(), amount: v, venc: vencs[i], pago: false, pagoEm: null,
    grupo, parcela: i + 1, parcelas: n
  }));
}
// Recusa o que não dá para cobrar: parcela sem data, ou parcela que vence antes
// da anterior. Devolve a frase do aviso, ou vazio quando está tudo de pé.
function erroDasDatas(venc, n, ritmo, datas) {
  if (ritmo !== 'livre' || n < 2) return '';
  const ordinal = i => `${i + 1}ª parcela`;
  let anterior = venc;
  for (let i = 1; i < n; i++) {
    const d = datas && datas[i];
    if (!d) return `Falta a data da ${ordinal(i)}.`;
    if (d < anterior) return `A ${ordinal(i)} vence antes da ${ordinal(i - 1)} — confira as datas.`;
    anterior = d;
  }
  return '';
}
const rotuloParcela = t => t.parcelas > 1 ? ` ${t.parcela}/${t.parcelas}` : '';
// A conta no bloco "A pagar" cabe em uma linha e meia: categoria e vencimento.
// O resto — a descrição inteira, a nota fiscal, o valor original, de qual
// compra ela veio — está no lançamento, e não havia como chegar nele daqui.
// Para ver a nota de um boleto que vence em três dias era preciso sair do
// bloco, abrir o Financeiro, achar o mesmo lançamento na lista e tocar nele.
//
// Agora a linha inteira abre o lançamento. O botão de dar baixa continua
// dentro dela e tem prioridade: quem toca em "Pagar" não quer abrir nada.
const marcaAnexo = t => (t.anexos || []).length
  ? `<span class="ap-nf" title="${(t.anexos || []).length} nota(s) anexada(s)">📎</span>` : '';
const DICA_ABRIR = '<p class="ap-dica mono">Toque na conta para ver a nota fiscal e a descrição.</p>';
// Três conceitos, e a diferença entre eles importa.
// pendente  = tem vencimento e ainda não foi liquidado, nos DOIS sentidos.
//             É o que o regime de caixa precisa saber: dinheiro que ainda não
//             passou pela conta, seja ele a pagar ou a receber.
// emAberto  = conta A PAGAR. Nome antigo, significado inalterado de propósito:
//             o calendário, o bloco "A pagar" e meia dúzia de outros lugares
//             dependem dele significando exatamente saída devendo.
// aReceber  = o espelho dele, do lado da receita.
const pendente = t => !!t.venc && !t.pago;
const emAberto = t => pendente(t) && t.type === 'saida';
const aReceber = t => pendente(t) && t.type === 'entrada';
const comDias = (lista, filtro) => {
  const hoje = todayISO();
  return lista.filter(filtro)
    .map(t => Object.assign({}, t, { dias: daysBetween(hoje, t.venc) }))
    .sort((a, b) => a.venc.localeCompare(b.venc));
};
function contasAPagar(lista) { return comDias(lista, emAberto); }
function contasAReceber(lista) { return comDias(lista, aReceber); }
// A receber: o espelho do "A pagar". Mesma forma, outro sentido — quem deve
// para você. Verde, e sem botão de "pagar": o que se faz com um recebimento é
// dar baixa quando o dinheiro cai, e isso é o mesmo gesto, com outro nome.
function renderAReceber(book, el) {
  if (!el) return;
  const contas = contasAReceber(arrLivro(book));
  if (!contas.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const soma = c => c.reduce((s, t) => s + t.amount, 0);
  const atrasadas = contas.filter(t => t.dias < 0);
  el.innerHTML = dobravel('areceber-' + book,
    cabecaDobra('A receber', fmtRS(soma(contas)),
      `${contas.length} recebimento(s)`
        + (atrasadas.length ? ` · ${atrasadas.length} atrasado(s) · ${fmtRS(soma(atrasadas))}` : ''),
      atrasadas.length > 0),
    contas.map(t => {
      const estado = t.dias < 0 ? 'venceu' : t.dias === 0 ? 'hoje' : t.dias <= AVISO_DIAS ? 'perto' : '';
      const quando = t.dias < 0 ? `atrasado ${-t.dias} dia${-t.dias > 1 ? 's' : ''}`
        : t.dias === 0 ? 'previsto hoje' : `em ${t.dias} dia${t.dias > 1 ? 's' : ''}`;
      return `<div class="ap-linha ar-linha ${estado}" data-trans="${t.id}" data-book="${book}">
        <div class="ap-quem">
          <span class="cat">${marcaAnexo(t)}${esc(t.category || 'Sem categoria')}${rotuloParcela(t)}${t.notes ? ' · ' + esc(t.notes) : ''}</span>
          <span class="quando mono">${fmtBR(t.venc)} · ${quando}</span>
        </div>
        <span class="ap-valor ar-valor">${fmtRS(t.amount)}</span>
        <button type="button" class="ap-pagar ar-receber" data-pagar="${t.id}" data-livro="${book}">Recebi</button>
      </div>`;
    }).join('') + DICA_ABRIR);
}
function renderAPagar(book) {
  const el = $(book === 'av' ? 'av-apagar' : 'bfin-apagar');
  renderAReceber(book, $(book === 'av' ? 'av-areceber' : 'bfin-areceber'));
  const contas = contasAPagar(arrLivro(book));
  if (!contas.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const soma = c => c.reduce((s, t) => s + t.amount, 0);
  const vencidas = contas.filter(t => t.dias < 0);
  const total = soma(contas);
  // Este era o bloco que mais empurrava a lista para baixo: 618 px em Bovinos e
  // 908 px na Fazenda. O que a pessoa precisa saber de relance — quanto deve e
  // quantas venceram — cabe numa linha; a lista de cada conta fica a um toque.
  el.innerHTML = dobravel('apagar-' + book,
    cabecaDobra('A pagar', fmtRS(total),
      `${contas.length} conta(s)`
        + (vencidas.length ? ` · ${vencidas.length} vencida(s) · ${fmtRS(soma(vencidas))}` : ''),
      vencidas.length > 0),
    `${contas.map(t => {
      const estado = t.dias < 0 ? 'venceu' : t.dias === 0 ? 'hoje' : t.dias <= AVISO_DIAS ? 'perto' : '';
      const quando = t.dias < 0 ? `venceu há ${-t.dias} dia${-t.dias > 1 ? 's' : ''}`
        : t.dias === 0 ? 'vence hoje' : `em ${t.dias} dia${t.dias > 1 ? 's' : ''}`;
      return `<div class="ap-linha ${estado}" data-trans="${t.id}" data-book="${book}">
        <div class="ap-quem">
          <span class="cat">${marcaAnexo(t)}${esc(t.category || 'Sem categoria')}${rotuloParcela(t)}${t.notes ? ' · ' + esc(t.notes) : ''}</span>
          <span class="quando mono">${fmtBR(t.venc)} · ${quando}</span>
        </div>
        <span class="ap-valor">${fmtRS(t.amount)}</span>
        <button type="button" class="ap-pagar" data-pagar="${t.id}" data-livro="${book}">Pagar</button>
      </div>`;
    }).join('')}${DICA_ABRIR}`);
}
// O lembrete fica no topo do app, visível de qualquer aba: quem abre o
// aplicativo para pesar não vai procurar por uma conta no Financeiro.
function renderLembrete() {
  const el = $('lembrete');
  if (!el) return;
  const todas = LIVROS.flatMap(b => contasAPagar(arrLivro(b)).map(t => ({ t, livro: b })))
    .filter(x => x.t.dias <= AVISO_DIAS)
    .sort((a, b) => a.t.venc.localeCompare(b.t.venc));
  if (!todas.length || LS.g('fjs-lembrete-visto', '') === todayISO()) { el.hidden = true; return; }
  const vencidas = todas.filter(x => x.t.dias < 0);
  const soma = todas.reduce((s, x) => s + x.t.amount, 0);
  const p = todas[0].t;
  el.className = 'lembrete' + (vencidas.length ? ' urgente' : '');
  el.innerHTML = `<div class="lb-texto">
      <b>${vencidas.length ? `${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}` : 'Vence em breve'}</b>
      <span class="mono">${todas.length > 1 ? `${todas.length} contas · ${fmtRS(soma)}` : `${esc(p.category || 'Conta')} · ${fmtRS(p.amount)} · ${fmtBR(p.venc)}`}</span>
    </div>
    <button type="button" class="lb-ver" id="lb-ver">Ver</button>
    <button type="button" class="lb-fechar" id="lb-fechar" aria-label="Dispensar por hoje">×</button>`;
  el.hidden = false;
}
$('lembrete').addEventListener('click', e => {
  if (e.target.closest('#lb-fechar')) { LS.s('fjs-lembrete-visto', todayISO()); renderLembrete(); return; }
  // O lembrete junta os TRÊS livros. Levar para o Financeiro de Bovinos deixava
  // quem tinha conta vencida de Aviário ou Geral numa tela onde ela não estava:
  // o aviso dizia "1 conta vencida" e a tela não mostrava conta nenhuma.
  // A Fazenda é a única que lista os três de uma vez.
  if (!e.target.closest('#lb-ver')) return;
  // "Ver" prometia levar até a conta e não levava. Trocava de aba e de
  // período, e parava aí — então, para quem JÁ ESTAVA na Fazenda, o botão não
  // mudava absolutamente nada na tela. E mesmo vindo de outra aba, a conta
  // continuava escondida: o bloco "A pagar" nasce recolhido, e ninguém rolava
  // a tela até ele. Três coisas faltavam, e as três estão aqui.
  tab = 'fazenda';
  $('fz-period').value = 'all'; guardarPeriodo('fz-period');
  // 1. o bloco precisa estar ABERTO, senão a conta segue dobrada
  LS.s('fjs-dobra-apagar-fz', true);
  render();
  // 2. e a tela precisa ANDAR até ele. Depois do desenho, senão o elemento
  //    ainda nem existe para ser alcançado.
  requestAnimationFrame(() => {
    const alvo = $('fz-apagar');
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 3. e piscar, porque entre treze contas a vencida não se acha sozinha.
    alvo.classList.remove('lb-achei');
    void alvo.offsetWidth;            // reinicia a animação se clicar de novo
    alvo.classList.add('lb-achei');
    setTimeout(() => alvo.classList.remove('lb-achei'), 2000);
  });
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pagar]');
  if (!b) return;
  const livro = b.dataset.livro;
  const lista = arrLivro(livro);
  const t = lista.find(x => x.id === b.dataset.pagar);
  if (!t) return sumiu('Este lançamento foi removido');
  // A data entra no aviso porque ela DECIDE coisa: é a data que o regime de
  // caixa usa. Carimbar hoje em silêncio numa conta paga semana passada joga o
  // gasto no mês errado, e ninguém veria de onde veio.
  const ehRec = t.type === 'entrada';
  if (!confirm(`Marcar como ${ehRec ? 'RECEBIDO' : 'PAGO'} em ${fmtBRfull(todayISO())}?\n\n`
    + `${t.category || 'Lançamento'}${rotuloParcela(t)} · ${fmtRS(t.amount)}\n`
    + `${ehRec ? 'Previsto para' : 'Vencimento'} ${fmtBRfull(t.venc)}\n\n`
    + `Se ${ehRec ? 'recebeu' : 'pagou'} em outro dia, abra o lançamento e corrija a data.`)) return;
  t.pago = true; t.pagoEm = todayISO();
  // colLivro e não um "se é aviário": com três livros, o ternário mandava a
  // conta do Geral para dentro de Bovinos — a marca de paga se perdia e ainda
  // nascia um lançamento duplicado no livro errado.
  upsert(colLivro(livro), t);
  render(); toast('Marcado como pago');
  // Este é o caminho MAIS usado para quitar uma conta — mais que abrir o
  // formulário. Sem o cancelamento aqui, o alarme dela seguiria tocando no
  // celular justamente para quem usa o aplicativo do jeito mais natural.
  agendarMudanca([t], livro);
});

// ===== Fazenda: os dois livros somados =====
// Bovinos e Aviários separados dizem se cada atividade paga. Só somados dizem
// se a FAZENDA paga — e qual das duas está sustentando a outra, que é a conta
// que ninguém faz de cabeça.
// A CONTA da fazenda inteira, separada da tela. Assim ela pode ser conferida
// aos milhares por sorteio sem redesenhar nada, e a tela fica com um trabalho
// só: mostrar o que esta função devolve.
// Dois jeitos de olhar o mesmo dinheiro, e os dois são certos — para perguntas
// diferentes.
//
// COMPETÊNCIA (padrão): a despesa conta no dia da compra. A ração comprada em
// março foi comida em março, então é custo de março, mesmo paga em três vezes.
// É a visão que mantém o custo da arroba honesto e responde "quanto custou
// produzir neste mês".
//
// CAIXA: a despesa conta no dia em que o dinheiro SAIU. Responde "quanto saiu
// do bolso neste mês" — é o que o extrato do banco mostra, e o que o contador
// usa quando declara por caixa.
//
// Conta a prazo ainda não paga não aparece em caixa nenhum: o dinheiro não
// saiu. Ela continua inteira no "A pagar", que não depende de regime nenhum —
// dívida é dívida.
const REGIMES = ['bfin-regime', 'av-regime', 'fz-regime'];
// O regime é UM SÓ para o app inteiro, de propósito. Ele não é um filtro de
// tela — é a resposta a "o que eu chamo de custo do mês". Se Bovinos estivesse
// por caixa e a Fazenda por competência, somar um com o outro deixaria de
// fazer sentido e ninguém veria por quê.
const REGIMES_VALIDOS = ['competencia', 'caixa', 'vencimento'];
function regimeAtual() {
  const v = LS.g('fjs-regime', 'competencia');
  return REGIMES_VALIDOS.includes(v) ? v : 'competencia';
}
function definirRegime(v) {
  if (!REGIMES_VALIDOS.includes(v)) v = 'competencia';
  LS.s('fjs-regime', v);
  REGIMES.forEach(id => { const el = $(id); if (el) el.value = v; });
}
// A mesma explicação nas três abas: o que o regime conta e, no caixa, QUANTO
// ficou de fora por não estar pago. Sem isso a pessoa lê um custo menor e
// conclui que gastou menos do que gastou.
function notaDoRegime(idNota, regime, lista) {
  const el = $(idNota);
  if (!el) return;
  const aberto = lista.filter(emAberto);
  const soma = aberto.reduce((s, t) => s + t.amount, 0);
  if (regime === 'vencimento') {
    // Aqui nada fica de fora — o que interessa é o CONTRÁRIO do caixa: quanto
    // ainda está agendado para os meses que vêm. Sem esse número, quem abre
    // outubro vê o mês e não sabe se ele é o único que tem conta marcada.
    const hoje = todayISO();
    const futuras = aberto.filter(t => t.venc > hoje);
    const somaFut = futuras.reduce((s, t) => s + t.amount, 0);
    el.innerHTML = 'Pela data de vencimento — cada parcela cai no mês em que vence.'
      + (futuras.length ? ` <b>${futuras.length} conta(s) já agendada(s) para depois de hoje (${fmtRS(somaFut)}).</b>` : '');
    return;
  }
  // Nos dois regimes antigos o que fica escondido é sempre a mesma coisa — a
  // parcela que ainda vai vencer — e agora existe onde vê-la. Dizer isso aqui
  // é o que torna o regime novo encontrável: ele aparece justamente na frase
  // que explica por que a conta não está na tela.
  const ondeVer = aberto.length
    ? ` Escolha <b>“Por vencimento”</b> para ver em que mês cada uma cai.` : '';
  el.innerHTML = regime === 'caixa'
    ? 'Pela data em que o dinheiro saiu.'
      + (aberto.length ? ` <b>${aberto.length} conta(s) a pagar (${fmtRS(soma)}) ficam de fora até serem pagas.</b>` : '')
      + ondeVer
    : 'Pela data da compra — a parcelada conta inteira no mês da compra.' + ondeVer;
}
// O rótulo do saldo precisa dizer por qual régua ele foi somado. "Saldo do
// período" sozinho, com três réguas possíveis, é um número sem unidade.
const SUFIXO_REGIME = { caixa: ' · caixa', vencimento: ' · agenda' };
const sufixoRegime = regime => SUFIXO_REGIME[regime] || '';
// E cada linha da lista precisa dizer que data está mostrando, senão a pessoa
// lê a data da compra em uma linha e a do pagamento na outra sem perceber.
function marcaDaData(t, regime, quando) {
  if (!quando || quando === t.date) return '';
  if (regime === 'caixa') return ' (pago)';
  if (regime === 'vencimento') return t.pago ? ' (venceu · pago)' : ' (vence)';
  return '';
}
function dataDoRegime(t, regime) {
  // Agenda de pagamentos: cada parcela aparece no mês em que VENCE, paga ou
  // não. É o único regime que enxerga o futuro — por competência as doze
  // parcelas se amontoam no mês da compra, e por caixa as que ainda não foram
  // pagas não existem em lugar nenhum. Quem precisa saber "o que tenho para
  // pagar em novembro" não era atendido por nenhum dos dois.
  //
  // Vale a data do vencimento mesmo depois de paga, e não a do pagamento: a
  // pergunta que este regime responde é sobre o compromisso, não sobre o
  // extrato. Uma conta de outubro paga com três dias de atraso continua sendo
  // a conta de outubro. Quem quer o extrato tem o regime de caixa ao lado.
  if (regime === 'vencimento') return t.venc || t.date;
  if (regime !== 'caixa') return t.date;
  // emAberto e não uma cópia da condição dele. Escrever "venc && !pago" aqui de
  // novo já custou caro: faltou o teste de tipo, e uma ENTRADA que carregasse
  // vencimento — dado que o formulário de hoje não cria, mas que um backup
  // antigo ou uma edição interrompida deixam no banco — era lida como "ainda
  // não paga". A receita sumia do total, e sumia sem rastro, porque o A pagar
  // só aceita saída e ela não reaparecia em lugar nenhum. Com a chamada, as
  // duas telas não têm como discordar sobre o que ainda está em aberto.
  // Vale para os dois sentidos desde que existe recebimento a prazo: boi
  // vendido para receber em 30 dias não entrou no caixa hoje, e fingir que
  // entrou mostraria um saldo que não está na conta do banco.
  if (pendente(t)) return null;                        // ainda não passou pelo caixa
  if (t.venc) return t.pagoEm || t.venc;               // liquidado: vale o dia em que passou
  return t.date;                                       // à vista: no dia
}
// A busca entra aqui dentro, e não só na lista: saldo, atividades, naturezas e
// categorias têm de contar a MESMA coisa que as linhas mostram. É por isso que
// ela é um parâmetro e não uma leitura de tela — resumoFazenda é chamado pelos
// testes e pela varredura, onde não existe tela nenhuma.
// livros: quais atividades entram na conta. Nulo = a fazenda inteira, que é o
// que a aba Fazenda mostra. Os relatórios de auditoria passam um livro só, e é
// isso que permite ao mesmo cálculo servir para os três — sem uma segunda
// versão das somas, que é onde relatório e tela começam a discordar.
function resumoFazenda(period, regime, termo, livros) {
  const noEscopo = livros || LIVROS;
  const doLivro = (lista, nome) => lista
    .filter(t => { const d = dataDoRegime(t, regime); return d && inPeriod(d, period); })
    .filter(t => casaBusca(t, termo, nome))
    .map(t => ({ t, livro: nome }));
  const tudo = noEscopo.flatMap(b => doLivro(arrLivro(b), NOME_LIVRO[b]));
  const soma = (arr, tipo) => arr.filter(x => x.t.type === tipo).reduce((s, x) => s + x.t.amount, 0);
  const receitas = soma(tudo, 'entrada'), custos = soma(tudo, 'saida');
  const atividades = noEscopo.map(b => NOME_LIVRO[b]).map(nome => {
    const doNome = tudo.filter(x => x.livro === nome);
    const e = soma(doNome, 'entrada'), sd = soma(doNome, 'saida');
    return { nome, entrada: e, saida: sd, saldo: e - sd, n: doNome.length };
  });
  // Cada lançamento cai em exatamente uma natureza: Receita, Custeio ou
  // Investimento. Se um deles ficasse de fora, as três somas não fechariam
  // com o movimento do período e ninguém perceberia.
  const classes = {};
  tudo.forEach(x => {
    const cl = classOf(x.t.category, x.t.type);
    classes[cl] = (classes[cl] || 0) + x.t.amount;
  });
  const contas = noEscopo.flatMap(b => contasAPagar(arrLivro(b))
    .map(t => ({ t, livro: NOME_LIVRO[b], book: b })))
    .sort((a, b) => a.t.venc.localeCompare(b.t.venc));
  // A fazenda recebe de um bolso só, igual ao que paga.
  const recebimentos = noEscopo.flatMap(b => contasAReceber(arrLivro(b))
    .map(t => ({ t, livro: NOME_LIVRO[b], book: b })))
    .sort((a, b) => a.t.venc.localeCompare(b.t.venc));
  const categorias = Object.entries(tudo.reduce((acc, x) => {
    const k = x.t.type + '|' + (x.t.category || 'Sem categoria');
    acc[k] = (acc[k] || 0) + x.t.amount;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  return {
    n: tudo.length, receitas, custos, saldo: receitas - custos,
    atividades, classes, contas, categorias, recebimentos,
    aPagarTotal: contas.reduce((s, x) => s + x.t.amount, 0),
    aReceberTotal: recebimentos.reduce((s, x) => s + x.t.amount, 0),
    movimento: receitas + custos
  };
}
function renderFazenda() {
  const regime = regimeAtual();
  atualizarOpcoesPeriodo('fz-period', LIVROS.flatMap(b => arrLivro(b)), regime);
  const period = $('fz-period').value;
  const termo = buscaDe('fz-busca');
  const R = resumoFazenda(period, regime, termo);
  // A lista embaixo tem de mostrar exatamente o que o saldo somou, e no regime
  // de caixa a data que vale é outra. Mostrando pela data da compra, o saldo
  // diria uma coisa e a lista, outra.
  const noPeriodo = LIVROS.flatMap(b => arrLivro(b)
    .map(t => ({ t, livro: NOME_LIVRO[b], book: b, quando: dataDoRegime(t, regime) }))
    .filter(x => x.quando && inPeriod(x.quando, period)));
  const tudo = [], foraDaBusca = [];
  noPeriodo.forEach(x => (casaBusca(x.t, termo, x.livro) ? tudo : foraDaBusca).push(x));
  $('fz-empty').hidden = R.n > 0;
  // "Nenhum lançamento" seria mentira no regime de caixa quando existem
  // lançamentos e nenhum foi pago ainda: eles existem, só não saíram do caixa.
  const existemNoPeriodo = LIVROS.flatMap(b => arrLivro(b)).some(t => inPeriod(t.date, period));
  // A busca vem primeiro entre as explicações: quando é ela que esvaziou a
  // tela, culpar o regime seria mandar a pessoa mexer no lugar errado.
  if (R.n === 0 && termo && noPeriodo.length) {
    $('fz-empty-titulo').textContent = `Nada encontrado para "${termo}"`;
    $('fz-empty-texto').textContent = `Há ${noPeriodo.length} lançamento(s) neste período, `
      + 'mas nenhum com essa palavra. Apague a busca para ver todos.';
  } else if (R.n === 0 && regime === 'caixa' && existemNoPeriodo) {
    $('fz-empty-titulo').textContent = 'Nada saiu nem entrou no caixa neste período';
    $('fz-empty-texto').textContent = 'Há lançamentos no período, mas nenhum pago ainda. '
      + 'Troque para "Por vencimento" para ver quando eles vencem.';
  } else if (R.n === 0 && regime === 'vencimento' && existemNoPeriodo) {
    $('fz-empty-titulo').textContent = 'Nada vence neste período';
    $('fz-empty-texto').textContent = 'Há lançamentos com data de compra neste mês, mas nenhum vence aqui — '
      + 'as parcelas venceram antes ou vencem depois.';
  } else {
    $('fz-empty-titulo').textContent = 'Nenhum lançamento no período';
    $('fz-empty-texto').textContent = 'Os lançamentos de Bovinos, Aviários e Geral aparecem somados aqui.';
  }
  const inn = R.receitas, out = R.custos, bal = R.saldo;

  // O que o regime escolhido deixa DE FORA precisa estar escrito, senão a
  // pessoa lê um custo menor e conclui que gastou menos do que gastou.
  notaDoRegime('fz-regime-nota', regime, LIVROS.flatMap(b => arrLivro(b)));

  $('fz-balance').innerHTML = `
    <div class="bc-label">Fazenda inteira · saldo do período${sufixoRegime(regime)}${rotuloBusca(termo, R.n)}</div>
    <div class="bc-value ${bal < 0 ? 'negative' : 'positive'}">${fmtRS(bal)}</div>
    <div class="bc-split">
      <div><div class="lbl">Receitas</div><div class="val in">${fmtRS(inn)}</div></div>
      <div><div class="lbl">Custos</div><div class="val out">${fmtRS(out)}</div></div>
    </div>`;

  // Cada atividade com o seu resultado, lado a lado.
  const atividades = R.atividades;
  // O saldo de cada atividade cabe na linha do cabeçalho: é o que se olha de
  // relance para saber qual delas está sustentando a outra.
  $('fz-atividades').innerHTML = dobravel('fz-atividades',
    cabecaDobra('Resultado por atividade', '',
      atividades.map(a => `${a.nome} ${curto(a.saldo)}`).join(' · ')),
    `<div class="fz-grade">${atividades.map(a => `
      <div class="fz-card ${a.saldo < 0 ? 'neg' : ''}">
        <div class="fz-nome">${a.nome}</div>
        <div class="fz-saldo">${fmtRS(a.saldo)}</div>
        <div class="fz-detalhe mono">+${fmtN(a.entrada, 0)} · −${fmtN(a.saida, 0)}</div>
      </div>`).join('')}</div>`);

  // Custeio x Investimento: dinheiro que some no ciclo não é o mesmo que
  // dinheiro que vira benfeitoria. Somar os dois esconde a diferença.
  const porClasse = R.classes;
  const ordem = ['Receita', 'Custeio', 'Investimento'];
  const classes = ordem.filter(c => porClasse[c]);
  $('fz-classes').innerHTML = !classes.length ? '' : dobravel('fz-classes',
    cabecaDobra('Por natureza', '',
      classes.map(c => `${c} ${curto(porClasse[c])}`).join(' · ')),
    `<div class="fz-classes">${classes.map(c => `
      <div class="fz-classe ${c === 'Receita' ? 'rec' : c === 'Investimento' ? 'inv' : 'cus'}">
        <span class="n">${c}</span><span class="v">${fmtRS(porClasse[c])}</span>
      </div>`).join('')}</div>`);

  const elAr = $('fz-areceber');
  if (elAr) {
    const recs = R.recebimentos;
    if (!recs.length) { elAr.innerHTML = ''; elAr.style.display = 'none'; }
    else {
      elAr.style.display = '';
      const atrasados = recs.filter(x => x.t.dias < 0);
      elAr.innerHTML = dobravel('areceber-fz',
        cabecaDobra('A receber · fazenda inteira', fmtRS(R.aReceberTotal),
          `${recs.length} recebimento(s)`
            + (atrasados.length ? ` · ${atrasados.length} atrasado(s) · ${fmtRS(atrasados.reduce((s, x) => s + x.t.amount, 0))}` : ''),
          atrasados.length > 0),
        recs.map(({ t, livro, book }) => {
          const estado = t.dias < 0 ? 'venceu' : t.dias === 0 ? 'hoje' : t.dias <= AVISO_DIAS ? 'perto' : '';
          const quando = t.dias < 0 ? `atrasado ${-t.dias} dia${-t.dias > 1 ? 's' : ''}`
            : t.dias === 0 ? 'previsto hoje' : `em ${t.dias} dia${t.dias > 1 ? 's' : ''}`;
          return `<div class="ap-linha ar-linha ${estado}" data-trans="${t.id}" data-book="${book}">
            <div class="ap-quem">
              <span class="cat">${marcaAnexo(t)}${esc(livro)} · ${esc(t.category || 'Sem categoria')}${rotuloParcela(t)}${t.notes ? ' · ' + esc(t.notes) : ''}</span>
              <span class="quando mono">${fmtBR(t.venc)} · ${quando}</span>
            </div>
            <span class="ap-valor ar-valor">${fmtRS(t.amount)}</span>
            <button type="button" class="ap-pagar ar-receber" data-pagar="${t.id}" data-livro="${book}">Recebi</button>
          </div>`;
        }).join('') + DICA_ABRIR);
    }
  }
  // Contas a pagar dos dois livros juntas: a fazenda paga de um bolso só.
  const contas = R.contas;
  const elAp = $('fz-apagar');
  if (!contas.length) { elAp.innerHTML = ''; elAp.style.display = 'none'; }
  else {
    elAp.style.display = '';
    const vencidas = contas.filter(x => x.t.dias < 0);
    elAp.innerHTML = dobravel('apagar-fz',
      cabecaDobra('A pagar · fazenda inteira',
        fmtRS(contas.reduce((s, x) => s + x.t.amount, 0)),
        `${contas.length} conta(s)`
          + (vencidas.length ? ` · ${vencidas.length} vencida(s) · ${fmtRS(vencidas.reduce((s, x) => s + x.t.amount, 0))}` : ''),
        vencidas.length > 0),
      `${contas.map(({ t, livro, book }) => {
        const estado = t.dias < 0 ? 'venceu' : t.dias === 0 ? 'hoje' : t.dias <= AVISO_DIAS ? 'perto' : '';
        const quando = t.dias < 0 ? `venceu há ${-t.dias} dia${-t.dias > 1 ? 's' : ''}`
          : t.dias === 0 ? 'vence hoje' : `em ${t.dias} dia${t.dias > 1 ? 's' : ''}`;
        // Esta é a única tela que mostra as contas dos TRÊS livros juntas: é
        // aqui que se paga olhando a fazenda inteira. Sem o botão, era preciso
        // descobrir de qual atividade era a conta e ir procurá-la na aba dela.
        return `<div class="ap-linha ${estado}" data-trans="${t.id}" data-book="${book}">
          <div class="ap-quem">
            <span class="cat">${marcaAnexo(t)}${esc(livro)} · ${esc(t.category || 'Sem categoria')}${rotuloParcela(t)}${t.notes ? ' · ' + esc(t.notes) : ''}</span>
            <span class="quando mono">${fmtBR(t.venc)} · ${quando}</span>
          </div>
          <span class="ap-valor">${fmtRS(t.amount)}</span>
          <button type="button" class="ap-pagar" data-pagar="${t.id}" data-livro="${book}">Pagar</button>
        </div>`;
      }).join('')}${DICA_ABRIR}`);
  }

  // Categorias dos dois livros somadas, com o resto sempre declarado.
  const todas = R.categorias;
  const mostrar = todas.slice(0, 8), sobra = todas.slice(8);
  const maxV = mostrar.length ? mostrar[0][1] : 1;
  // A maior categoria é o que se quer saber de relance; o resto é detalhe.
  const topoFz = mostrar.length ? mostrar[0][0].split('|')[1] : '';
  $('fz-cats').innerHTML = !mostrar.length ? '' : dobravel('fz-cats',
    cabecaDobra('Por categoria', fmtRS(mostrar[0][1]),
      `maior: ${esc(topoFz)} · ${todas.length} no total`),
    mostrar.map(([k, v]) => {
      const [tp, cat] = k.split('|');
      return `<div class="cb-row">
        <div class="cb-line"><span>${esc(cat)}</span><span class="value ${tp}">${tp === 'saida' ? '−' : '+'} ${fmtRS(v)}</span></div>
        <div class="cb-bar"><div class="cb-fill ${tp}" style="width:${Math.max(4, v / maxV * 100)}%"></div></div>
      </div>`;
    }).join('')
    + (sobra.length ? `<div class="cb-resto mono">+ ${sobra.length} outra${sobra.length > 1 ? 's' : ''} categoria${sobra.length > 1 ? 's' : ''} · ${fmtRS(sobra.reduce((s, [, v]) => s + v, 0))}</div>` : ''));
  $('fz-cats').style.display = mostrar.length ? '' : 'none';
  $('fz-cats').classList.add('so-dobra');

  // Sem esta lista, um lançamento Geral só existiria dentro de somatórios: não
  // haveria como vê-lo, corrigi-lo nem apagá-lo, porque Geral não tem aba
  // própria. Aqui aparecem os três livros, cada linha dizendo de qual é.
  const ordenados = [...tudo].sort((a, b) => a.quando < b.quando ? 1 : -1);
  $('fz-lista-titulo').textContent = regime === 'caixa' ? 'Pagamentos e recebimentos do período'
    : regime === 'vencimento' ? 'O que vence no período'
    : 'Lançamentos do período';
  $('fz-lista-titulo').hidden = !ordenados.length;
  $('fz-lista').innerHTML = ordenados.map(({ t, livro, book, quando }) => `
    <div class="list-item transaction-item" data-trans="${t.id}" data-book="${book}">
      <div class="item-main">
        <div class="item-title">${esc(t.category || (t.type === 'entrada' ? 'Entrada' : 'Saída'))}${rotuloParcela(t)}</div>
        <div class="item-subtitle">${fmtBR(quando)}${marcaDaData(t, regime, quando)} · ${esc(livro)}${t.notes ? ' · ' + esc(t.notes) : ''}</div>
        ${(t.anexos || []).length ? `<div class="item-anexo">📎 ${t.anexos.length} nota${t.anexos.length > 1 ? 's' : ''} anexada${t.anexos.length > 1 ? 's' : ''}</div>` : ''}
      </div>
      <div class="item-side"><div class="value ${t.type}">${t.type === 'saida' ? '−' : '+'} ${fmtRS(t.amount)}</div></div>
    </div>`).join('')
    // Mesmo aviso do Financeiro, pela data que o regime escolhido usa: no
    // caixa, o que conta é a data do pagamento, não a da compra.
    + avisoDaBusca(foraDaBusca.map(x => x.t), 'fz-busca')
    + avisoForaDoPeriodo(
        LIVROS.flatMap(b => arrLivro(b)
          .map(t => ({ t, livro: NOME_LIVRO[b], amount: t.amount, quando: dataDoRegime(t, regime) })))
          .filter(x => x.quando && !inPeriod(x.quando, period)
            && casaBusca(x.t, termo, x.livro)),
        'fz-period');
}
$('fz-period').addEventListener('change', () => { guardarPeriodo('fz-period'); render(); });

// A busca redesenha a cada letra. Redesenhar a tela inteira a cada tecla numa
// fazenda com milhares de lançamentos engasgaria no meio da palavra, então o
// desenho espera a digitação parar — 200 ms é curto o bastante para parecer
// instantâneo e longo o bastante para não redesenhar sete vezes em "vacina".
let buscaTimer = null;
function aoDigitarBusca(id) {
  termoBusca[id] = $(id).value;
  sincronizarBusca();
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(render, 200);
}
// O "×" aparece ou some por causa do ESTADO da busca, não por causa do evento
// que a mudou. Preso ao evento de digitar, ele ficava para trás em qualquer
// outro caminho — e um botão de limpar que não está lá quando há o que limpar
// é pior que não ter botão nenhum.
function sincronizarBusca() {
  Object.keys(termoBusca).forEach(id => {
    const el = $(id);
    if (el && el.value !== termoBusca[id]) el.value = termoBusca[id];
    const x = document.querySelector(`.busca-x[data-limpar-busca="${id}"]`);
    if (x) x.hidden = !termoBusca[id];
  });
}
Object.keys(termoBusca).forEach(id => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('input', () => aoDigitarBusca(id));
  // O "×" do teclado do iPhone dispara "search", não "input"
  el.addEventListener('search', () => aoDigitarBusca(id));
});
// Buscando, o resultado sobe para logo abaixo do saldo.
//
// Sem isto ele nascia no fim da tela: em Bovinos, depois do saldo, do "A pagar"
// e das categorias; na Fazenda, depois de SEIS blocos. Quem digitava uma
// palavra via a tela mudar em cima e tinha de rolar para descobrir o que achou
// — e o que achou é a única coisa que ele pediu.
//
// Sobe para depois do SALDO, não para antes: o saldo com a busca ativa já é a
// resposta de "quanto gastei com isso", e ele tem de vir antes da lista que o
// compõe. Nada é escondido — o resto da tela continua embaixo, inteiro.
const RESULTADO = {
  'bfin-busca': { ancora: 'bfin-balance', partes: ['bfin-list'] },
  'av-busca': { ancora: 'av-balance', partes: ['av-list'] },
  // O aviso de "nada encontrado" sobe junto: quando a busca não acha nada, a
  // frase que explica por quê é justamente o que a pessoa precisa ler, e
  // deixá-la no fim da tela seria esconder a explicação atrás de tudo.
  'fz-busca': { ancora: 'fz-balance', partes: ['fz-lista-titulo', 'fz-lista', 'fz-empty'] }
};
// O lugar de casa de cada peça, lido uma vez, antes de qualquer mudança.
const lugarOriginal = {};
Object.values(RESULTADO).forEach(r => r.partes.forEach(id => {
  const el = $(id);
  if (el) lugarOriginal[id] = { pai: el.parentNode, proximo: el.nextElementSibling };
}));
function posicionarResultados() {
  Object.entries(RESULTADO).forEach(([idBusca, r]) => {
    const ancora = $(r.ancora);
    if (!ancora) return;
    if (buscaDe(idBusca)) {
      let ref = ancora;
      r.partes.forEach(id => {
        const el = $(id);
        if (!el) return;
        // Só mexe quando está fora do lugar: mover um elemento que já está
        // onde deveria refaria o desenho dele a cada tecla, sem precisar.
        if (el.previousElementSibling !== ref) ancora.parentNode.insertBefore(el, ref.nextSibling);
        ref = el;
      });
    } else {
      // De trás para a frente: o vizinho que o título usa como referência é a
      // própria lista, que precisa ter voltado antes dele.
      [...r.partes].reverse().forEach(id => {
        const el = $(id), lug = lugarOriginal[id];
        if (!el || !lug) return;
        if (el.parentNode !== lug.pai || el.nextElementSibling !== lug.proximo) {
          lug.pai.insertBefore(el, lug.proximo);
        }
      });
    }
  });
}
function limparBusca(id) {
  termoBusca[id] = '';
  clearTimeout(buscaTimer);
  render();
}
// A escolha do regime fica guardada: quem trabalha por caixa não quer voltar
// para competência toda vez que abre o aplicativo.
REGIMES.forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', () => { definirRegime(el.value); render(); });
});

// ===== Nota fiscal anexada =====
// A nuvem guarda no máximo 1 MB por registro, e foto de celular tem 3 a 5 MB.
// Por isso a imagem é reduzida NO APARELHO antes de subir, e o arquivo fica num
// registro só dele: o lançamento guarda apenas o nome e o tamanho, para a lista
// do Financeiro continuar leve e não baixar foto que ninguém pediu para ver.
const ANEXO_MAX = 700 * 1024;      // limite do que sobe (o registro na nuvem é 1 MB)
const ANEXO_ALVO = 380 * 1024;     // alvo da compressão, com folga para o base64
const ANEXO_LADO = 1600;           // lado maior da foto reduzida
const anexoCache = new Map();      // dados já carregados nesta sessão
let anexosForm = [], anexosRemover = [];
// Endereços temporários criados para abrir PDF; soltos ao fechar a tela, senão
// cada nota aberta segura memória do aparelho até recarregar o app.
let anexoURLs = [];

const kb = n => n >= 1024 * 1024 ? fmtN(n / 1024 / 1024, 1) + ' MB' : Math.round(n / 1024) + ' KB';
const tamanhoDeDataURL = s => Math.round((s.length - (s.indexOf(',') + 1)) * 0.75);

// Reduz a foto até caber, baixando primeiro o tamanho e depois a qualidade.
// Nota fiscal precisa ser LEGÍVEL, então o lado maior só cai até 1600 px.
function comprimirImagem(file) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('não deu para ler o arquivo'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('arquivo não é uma imagem válida'));
      img.onload = () => {
        const escala = Math.min(1, ANEXO_LADO / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * escala));
        c.height = Math.max(1, Math.round(img.height * escala));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // PNG transparente não vira preto
        ctx.drawImage(img, 0, 0, c.width, c.height);
        let q = 0.82, saida = c.toDataURL('image/jpeg', q);
        while (tamanhoDeDataURL(saida) > ANEXO_ALVO && q > 0.35) {
          q -= 0.12;
          saida = c.toDataURL('image/jpeg', q);
        }
        resolve(saida);
      };
      img.src = String(leitor.result);
    };
    leitor.readAsDataURL(file);
  });
}
const lerArquivo = file => new Promise((resolve, reject) => {
  const l = new FileReader();
  l.onerror = () => reject(new Error('não deu para ler o arquivo'));
  l.onload = () => resolve(String(l.result));
  l.readAsDataURL(file);
});

// Busca o arquivo só quando alguém quer ver. Guardado na sessão para não
// baixar de novo, e servido da fila quando ainda não subiu.
async function carregarAnexo(id) {
  if (anexoCache.has(id)) return anexoCache.get(id);
  const naFila = pendentes.find(p => p.col === 'anexos' && p.id === id);
  if (naFila && naFila.obj) { anexoCache.set(id, naFila.obj.dados); return naFila.obj.dados; }
  if (!db) return null;
  try {
    const doc = await colRef('anexos').doc(id).get();
    const d = doc.exists ? doc.data() : null;
    if (d && d.dados) { anexoCache.set(id, d.dados); return d.dados; }
  } catch (e) { /* sem sinal: quem chamou avisa */ }
  return null;
}
function renderAnexosForm() {
  const el = $('t-anexos');
  if (!el) return;
  el.innerHTML = anexosForm.map(a => `
    <div class="anexo-linha" data-anexo="${esc(a.id)}">
      <span class="ax-icone">${a.tipo === 'application/pdf' ? '📄' : '🖼️'}</span>
      <span class="ax-nome">${esc(a.nome)}</span>
      <span class="ax-tam mono">${kb(a.tamanho)}${a.novo ? ' · novo' : ''}</span>
      <button type="button" class="ax-tirar" data-tirar="${esc(a.id)}" aria-label="Remover">×</button>
    </div>`).join('');
}
// Nota de várias páginas, em PDF, quase nunca cabe no limite de um registro:
// o PDF sobe INTEIRO, e um documento escaneado de três páginas passa de um
// megabyte sem esforço. A resposta antiga era recusar e mandar fotografar a
// nota — o que, numa nota de cinco páginas, é mandar fotografar cinco vezes e
// torcer para não faltar uma.
//
// Agora o próprio aplicativo faz isso: desenha cada página do PDF e guarda uma
// foto por página, com a mesma compressão das fotos tiradas à mão. O leitor de
// PDF que faz o desenho já vinha embarcado, para abrir as notas sem sinal.
//
// O PDF pequeno continua sendo guardado como PDF, de propósito: ali o texto é
// desenho vetorial, amplia sem borrar, e trocá-lo por foto só pioraria.
const ANEXO_PAGINAS_MAX = 20;
async function paginasDoPdf(file) {
  const pdfjs = await carregarPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const quantas = Math.min(doc.numPages, ANEXO_PAGINAS_MAX);
  const paginas = [];
  for (let n = 1; n <= quantas; n++) {
    const pag = await doc.getPage(n);
    const base = pag.getViewport({ scale: 1 });
    // Mesmo lado máximo das fotos: é o que mantém o CNPJ e o valor legíveis.
    const escala = Math.max(0.1, ANEXO_LADO / Math.max(base.width, base.height));
    const vp = pag.getViewport({ scale: escala });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(vp.width));
    cv.height = Math.max(1, Math.floor(vp.height));
    const ctx = cv.getContext('2d');
    // Página de PDF é transparente por baixo; sem o branco, vira foto preta.
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await pag.render({ canvasContext: ctx, viewport: vp }).promise;
    let q = 0.82, saida = cv.toDataURL('image/jpeg', q);
    while (tamanhoDeDataURL(saida) > ANEXO_ALVO && q > 0.35) {
      q -= 0.12;
      saida = cv.toDataURL('image/jpeg', q);
    }
    paginas.push(saida);
  }
  return { paginas, total: doc.numPages, cortou: doc.numPages > quantas };
}
async function adicionarAnexos(files) {
  for (const file of files) {
    try {
      const ehPdf = file.type === 'application/pdf';
      const dados = ehPdf ? await lerArquivo(file) : await comprimirImagem(file);
      const tam = tamanhoDeDataURL(dados);
      if (tam > ANEXO_MAX) {
        if (!ehPdf) { toast(`${file.name}: não coube nem reduzida (${kb(tam)})`); continue; }
        // Grande demais para subir inteiro: separa em uma foto por página.
        toast(`${file.name}: ${kb(tam)} — separando em páginas…`);
        let r;
        try { r = await paginasDoPdf(file); }
        catch (e) {
          toast(`${file.name}: não deu para separar as páginas (${e.message}). Tire uma foto da nota.`);
          continue;
        }
        const base = String(file.name || 'nota fiscal').replace(/\.pdf$/i, '');
        r.paginas.forEach((dadosPag, i) => {
          const idPag = uid();
          anexoCache.set(idPag, dadosPag);
          anexosForm.push({ id: idPag,
            nome: `${base} · página ${i + 1} de ${r.total}`,
            tipo: 'image/jpeg', tamanho: tamanhoDeDataURL(dadosPag), novo: true });
        });
        toast(r.cortou
          ? `${r.paginas.length} primeiras páginas anexadas (de ${r.total})`
          : `${r.paginas.length} página(s) anexada(s)`);
        continue;
      }
      const id = uid();
      anexoCache.set(id, dados);
      anexosForm.push({ id, nome: file.name || 'nota fiscal', tipo: ehPdf ? 'application/pdf' : 'image/jpeg',
        tamanho: tam, novo: true });
    } catch (e) { toast(`${file.name}: ${e.message}`); }
  }
  renderAnexosForm();
}
$('t-anexo-btn').addEventListener('click', () => $('t-anexo-input').click());
$('t-anexo-input').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) { toast('Preparando o arquivo…'); await adicionarAnexos(files); }
});
$('t-anexos').addEventListener('click', async e => {
  const tirar = e.target.closest('[data-tirar]');
  if (tirar) {
    const id = tirar.dataset.tirar;
    const a = anexosForm.find(x => x.id === id);
    if (a && !a.novo) anexosRemover.push(id);   // já está na nuvem: some ao salvar
    anexosForm = anexosForm.filter(x => x.id !== id);
    renderAnexosForm();
    return;
  }
  const linha = e.target.closest('[data-anexo]');
  if (linha) abrirAnexo(linha.dataset.anexo);
});
// ===== Zoom da nota =====
// O app desliga o zoom do próprio navegador (user-scalable=no) de propósito:
// no curral, um toque de dois dedos sem querer desconfigurava a tela no meio da
// pesagem. Só que nota fiscal se lê justamente ampliando o campo pequeno — o
// valor, o CNPJ, a data. Então a nota tem o zoom dela, que vale só aqui dentro.
const ZOOM_MIN = 1, ZOOM_MAX = 6;
let axZoom = 1;
const axEl = () => ({ caixa: $('ax-zoom'), dentro: $('ax-conteudo') });
// Amplia mantendo debaixo do dedo o ponto que estava debaixo do dedo. Sem isso
// o zoom "foge": você mira no valor e ele sai da tela.
function zoomPara(z, px, py) {
  const { caixa, dentro } = axEl();
  if (!caixa || !dentro) return;
  const antesL = dentro.offsetWidth || caixa.clientWidth || 1;
  const antesA = dentro.offsetHeight || caixa.clientHeight || 1;
  const alvoX = px == null ? caixa.clientWidth / 2 : px;
  const alvoY = py == null ? caixa.clientHeight / 2 : py;
  const fx = (caixa.scrollLeft + alvoX) / antesL;
  const fy = (caixa.scrollTop + alvoY) / antesA;
  axZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  dentro.style.width = (axZoom * 100) + '%';
  // lido DEPOIS de mudar a largura: é o tamanho novo que reposiciona a rolagem
  caixa.scrollLeft = fx * dentro.offsetWidth - alvoX;
  caixa.scrollTop = fy * dentro.offsetHeight - alvoY;
  const nivel = $('ax-nivel');
  if (nivel) nivel.textContent = Math.round(axZoom * 100) + '%';
  const ajustar = $('ax-ajustar');
  if (ajustar) ajustar.hidden = axZoom <= 1.001;
  agendarNitidez();
}
// Prende os gestos e os botões à área da nota. Chamado toda vez que o corpo do
// visualizador é remontado, porque os elementos são outros.
function ligarZoom() {
  const { caixa } = axEl();
  if (!caixa) return;
  axZoom = 1;
  const botao = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  botao('ax-mais', () => zoomPara(axZoom * 1.5));
  botao('ax-menos', () => zoomPara(axZoom / 1.5));
  botao('ax-ajustar', () => zoomPara(1));

  const pontos = new Map();
  let baseDist = 0, baseZoom = 1, ultimoToque = 0;
  const dist = () => {
    const [a, b] = [...pontos.values()];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  caixa.addEventListener('pointerdown', e => {
    pontos.set(e.pointerId, e);
    if (pontos.size === 2) { baseDist = dist(); baseZoom = axZoom; }
  });
  caixa.addEventListener('pointermove', e => {
    if (!pontos.has(e.pointerId)) return;
    pontos.set(e.pointerId, e);
    if (pontos.size !== 2 || !baseDist) return;
    e.preventDefault();
    const r = caixa.getBoundingClientRect();
    const [a, b] = [...pontos.values()];
    zoomPara(baseZoom * (dist() / baseDist),
      (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
  });
  const soltar = e => {
    const era = pontos.size;
    pontos.delete(e.pointerId);
    if (pontos.size < 2) baseDist = 0;
    if (era !== 1 || e.type !== 'pointerup') return;
    // Dois toques rápidos: aproxima e volta. É o gesto que a mão já conhece, e
    // funciona de luva, quando a pinça de dois dedos não pega.
    const agora = Date.now();
    if (agora - ultimoToque < 320) {
      const r = caixa.getBoundingClientRect();
      zoomPara(axZoom > 1.05 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top);
      ultimoToque = 0;
    } else ultimoToque = agora;
  };
  caixa.addEventListener('pointerup', soltar);
  caixa.addEventListener('pointercancel', soltar);
  // No computador, a roda com Ctrl é o zoom de sempre
  caixa.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = caixa.getBoundingClientRect();
    zoomPara(axZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
}

async function abrirAnexo(id) {
  const meta = anexosForm.find(x => x.id === id)
    || LIVROS.flatMap(b => arrLivro(b)).flatMap(t => t.anexos || []).find(x => x.id === id);
  $('ax-titulo').textContent = meta ? meta.nome : 'Nota fiscal';
  $('ax-corpo').innerHTML = '<p class="ax-carregando mono">Carregando…</p>';
  axPdfDoc = null; axZoom = 1;
  openM('modal-anexo');
  const dados = await carregarAnexo(id);
  if (!dados) {
    $('ax-corpo').innerHTML = '<p class="ax-carregando mono">Não foi possível abrir. Sem internet, só dá para ver o que ainda está na fila deste aparelho.</p>';
    return;
  }
  if (meta && meta.tipo === 'application/pdf') {
    // O iOS em modo aplicativo bloqueia TODOS os caminhos que dependem do
    // navegador: não navega para data:, não resolve blob: em aba nova, e não
    // desenha PDF dentro de moldura. Então o app para de pedir ao sistema e
    // DESENHA o documento por conta própria, página por página, num canvas.
    const blob = dataURLparaBlob(dados);
    const url = URL.createObjectURL(blob);
    anexoURLs.push(url);
    const nomeArq = (meta.nome || 'nota-fiscal') + (/\.pdf$/i.test(meta.nome || '') ? '' : '.pdf');
    const arquivo = new File([blob], nomeArq, { type: 'application/pdf' });
    $('ax-corpo').innerHTML = `
      <div class="ax-zoom" id="ax-zoom">
        <div class="ax-conteudo" id="ax-conteudo">
          <div id="ax-paginas"><p class="ax-carregando mono">Desenhando o documento…</p></div>
        </div>
      </div>
      ${barraZoom()}
      <div class="ax-acoes">
        <button type="button" class="btn-primary" id="ax-share">Compartilhar / Salvar</button>
        <a class="btn-secondary ax-baixar" id="ax-baixar" href="${url}" download="${esc(nomeArq)}">Baixar</a>
      </div>`;
    ligarZoom();
    $('ax-share').addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({ files: [arquivo], title: meta.nome || 'Nota fiscal' });
        else toast('Este aparelho não oferece compartilhar — use Baixar');
      } catch (e) { if (e && e.name !== 'AbortError') toast('Não deu para compartilhar: ' + (e.message || e.name)); }
    });
    desenharPdf(blob, meta);
    return;
  }
  // Imagem: o "data:" dentro de <img> funciona em todo lugar; só a NAVEGAÇÃO
  // para data: é que é bloqueada. Mesmo assim vai o botão de compartilhar.
  const blobImg = dataURLparaBlob(dados);
  const arqImg = new File([blobImg], meta && meta.nome ? meta.nome : 'nota-fiscal.jpg', { type: blobImg.type });
  const podeImg = !!(navigator.canShare && navigator.canShare({ files: [arqImg] }));
  $('ax-corpo').innerHTML = `
    <div class="ax-zoom" id="ax-zoom">
      <div class="ax-conteudo" id="ax-conteudo">
        <img class="ax-img" src="${dados}" alt="Nota fiscal" />
      </div>
    </div>
    ${barraZoom()}`
    + (podeImg ? '<div class="ax-acoes"><button type="button" class="btn-secondary" id="ax-share-img">Compartilhar / Salvar</button></div>' : '');
  ligarZoom();
  if (podeImg) $('ax-share-img').addEventListener('click', async () => {
    try { await navigator.share({ files: [arqImg], title: (meta && meta.nome) || 'Nota fiscal' }); }
    catch (e) { if (e && e.name !== 'AbortError') toast('Não deu para compartilhar'); }
  });
}
// Leitor de PDF, buscado só quando alguém abre um PDF pela primeira vez — não
// faz sentido pesar a abertura do aplicativo no curral por causa de uma nota.
// Depois de carregado uma vez, fica guardado no aparelho e funciona sem sinal.
// Servido pelo PRÓPRIO aplicativo, não por um site de fora. Vindo de fora, o
// service worker guardava o arquivo mas nunca o devolvia — ele só intercepta
// endereços que conhece — e o PDF não abria no curral sem sinal. Sendo do
// próprio app, entra na mesma regra de tudo o mais: rede primeiro, cache como
// reserva, e fica guardado desde a instalação.
const PDFJS_JS = 'vendor/pdf.min.js?v=89';
const PDFJS_WORKER = 'vendor/pdf.worker.min.js?v=89';
let pdfjsPronto = null;
function carregarPdfJs() {
  if (pdfjsPronto) return pdfjsPronto;
  pdfjsPronto = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const tag = document.createElement('script');
    tag.src = PDFJS_JS;
    tag.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('o leitor não iniciou'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };
    tag.onerror = () => { pdfjsPronto = null; reject(new Error('o leitor de PDF não carregou')); };
    document.head.appendChild(tag);
  });
  return pdfjsPronto;
}
const barraZoom = () => `
  <div class="ax-lupa">
    <button type="button" class="ax-lupa-btn" id="ax-menos" aria-label="Diminuir">−</button>
    <span class="ax-nivel mono" id="ax-nivel">100%</span>
    <button type="button" class="ax-lupa-btn" id="ax-mais" aria-label="Ampliar">+</button>
    <button type="button" class="ax-lupa-btn ax-cabe" id="ax-ajustar" hidden>Caber na tela</button>
  </div>
  <p class="ax-dica mono">Pinça de dois dedos ou dois toques para ampliar</p>`;

// PDF é desenhado, não é foto: ampliar o desenho pronto só deixa a letra grande
// e borrada. Então, quando o zoom para de mexer, as páginas são redesenhadas na
// resolução nova — é aí que o CNPJ e o valor ficam legíveis de verdade.
let axPdfDoc = null, axNitidezTimer = null, axDesenhando = false, axZoomDesenhado = 1;
const PX_MAX_CANVAS = 12e6;  // teto de segurança: iPhone recusa canvas gigante
function agendarNitidez() {
  if (!axPdfDoc) return;
  clearTimeout(axNitidezTimer);
  axNitidezTimer = setTimeout(() => {
    // Redesenhar custa caro; só vale quando a diferença é visível de fato.
    if (Math.abs(axZoom - axZoomDesenhado) / axZoomDesenhado > 0.25) desenharPaginas();
  }, 350);
}
async function desenharPaginas() {
  const alvo = $('ax-paginas');
  if (!alvo || !axPdfDoc || axDesenhando) return;
  axDesenhando = true;
  const doc = axPdfDoc, zoom = axZoom;
  try {
    const caixa = $('ax-zoom');
    const largura = Math.min((caixa && caixa.clientWidth) || alvo.clientWidth || 640, 900);
    const densidade = window.devicePixelRatio > 1 ? 2 : 1.5;
    const paginas = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pag = await doc.getPage(n);
      const base = pag.getViewport({ scale: 1 });
      let escala = (largura / base.width) * densidade * zoom;
      // Sem o teto, ampliar muito uma página grande estoura a memória do
      // aparelho e a nota simplesmente não aparece.
      const px = (base.width * escala) * (base.height * escala);
      if (px > PX_MAX_CANVAS) escala *= Math.sqrt(PX_MAX_CANVAS / px);
      const vp = pag.getViewport({ scale: escala });
      const cv = document.createElement('canvas');
      cv.className = 'ax-pagina';
      cv.width = Math.max(1, Math.floor(vp.width));
      cv.height = Math.max(1, Math.floor(vp.height));
      cv.style.width = '100%';
      await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      paginas.push(cv);
    }
    // Troca só no fim: a nota nunca pisca nem some da tela enquanto redesenha.
    alvo.innerHTML = '';
    if (doc.numPages > 1) {
      const p = document.createElement('p');
      p.className = 'ax-carregando mono';
      p.textContent = `${doc.numPages} páginas`;
      alvo.appendChild(p);
    }
    paginas.forEach(cv => alvo.appendChild(cv));
    axZoomDesenhado = zoom;
  } catch (e) {
    if (!alvo.querySelector('.ax-pagina')) {
      alvo.innerHTML = `<p class="ax-carregando mono">Não deu para desenhar o PDF aqui (${esc(e.message || 'erro')}).<br>Use Compartilhar ou Baixar.</p>`;
    }
  } finally {
    axDesenhando = false;
    // O dedo pode ter continuado ampliando enquanto isto desenhava
    if (Math.abs(axZoom - axZoomDesenhado) / axZoomDesenhado > 0.25) agendarNitidez();
  }
}
async function desenharPdf(blob, meta) {
  const alvo = $('ax-paginas');
  if (!alvo) return;
  try {
    const lib = await carregarPdfJs();
    const buf = await blob.arrayBuffer();
    axPdfDoc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    axZoomDesenhado = 1;
    await desenharPaginas();
  } catch (e) {
    axPdfDoc = null;
    alvo.innerHTML = `<p class="ax-carregando mono">Não deu para desenhar o PDF aqui (${esc(e.message || 'erro')}).<br>Use Compartilhar ou Baixar.</p>`;
  }
}
// Converte o arquivo guardado (base64) em blob, que é o que o navegador aceita
// abrir e compartilhar.
function dataURLparaBlob(dataURL) {
  const virgula = dataURL.indexOf(',');
  const cabeca = dataURL.slice(0, virgula);
  const tipo = (cabeca.match(/data:([^;]+)/) || [, 'application/octet-stream'])[1];
  const bin = atob(dataURL.slice(virgula + 1));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: tipo });
}
// Grava os arquivos novos e apaga os retirados. Passa pelo mesmo caminho
// seguro das outras gravações: sem internet, entra na fila.
function aplicarAnexos(t, col) {
  anexosForm.forEach(a => {
    if (!a.novo) return;
    upsert('anexos', { id: a.id, transId: t.id, col, nome: a.nome, tipo: a.tipo,
      tamanho: a.tamanho, criadoEm: todayISO(), dados: anexoCache.get(a.id) });
    delete a.novo;
  });
  anexosRemover.forEach(id => { remove('anexos', id); anexoCache.delete(id); });
  anexosRemover = [];
  t.anexos = anexosForm.map(a => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho }));
  espalharAnexosNoCarne(t, col);
}
// De qual livro é uma coleção. Preciso disto para achar as irmãs de uma
// parcela a partir do nome da coleção, que é o que aplicarAnexos recebe.
const livroDaCol = col => colDeAtividade(col)
  || Object.keys(COL_LIVRO).find(b => COL_LIVRO[b] === col) || 'bov';
// A NOTA FISCAL VALE PARA O CARNÊ INTEIRO.
//
// A nota ficava só na primeira parcela — e com razão: o arquivo pesa, e
// guardar uma cópia dele por prestação encheria o armazenamento do aparelho.
// Só que o dono abre a parcela 3/8 que vence esta semana, e ali não há nota
// nenhuma: a compra tem documento, a parcela não tem como alcançá-lo.
//
// O que se repete agora é só a REFERÊNCIA — nome, tipo, tamanho e o id do
// arquivo. O documento continua sendo UM registro na nuvem, com um id só.
// Assim qualquer parcela abre a nota da compra, e o peso não muda.
//
// Tirar a nota de uma parcela tira do carnê inteiro, e é o que se espera: a
// nota é da compra, não da prestação.
function espalharAnexosNoCarne(t, col) {
  if (!t.grupo) return;
  const irmas = arrLivro(livroDaCol(col)).filter(x => x.grupo === t.grupo && x.id !== t.id);
  if (!irmas.length) return;
  const ref = t.anexos || [];
  irmas.forEach(x => { x.anexos = ref.map(a => Object.assign({}, a)); });
  escreverVarias(col, irmas);
}
// saindo: os ids que estão sendo apagados agora. Sem isto, apagar UMA parcela
// levaria junto a nota que as outras ainda apontam — e elas ficariam
// anunciando um documento que não existe mais.
function apagarAnexosDe(t, saindo) {
  const fora = saindo instanceof Set ? saindo : new Set([t.id]);
  (t.anexos || []).forEach(a => {
    const aindaUsada = LIVROS.some(b => arrLivro(b).some(x =>
      !fora.has(x.id) && (x.anexos || []).some(y => y.id === a.id)));
    if (aindaUsada) return;
    remove('anexos', a.id); anexoCache.delete(a.id);
  });
}

function renderFin(book) {
  const isAv = book === 'av';
  const list = isAv ? avT : bovT;
  // As opções de mês vêm dos lançamentos DESTE livro: oferecer "Março" numa aba
  // que não teve nada em março é um beco.
  const regime = regimeAtual();
  atualizarOpcoesPeriodo(isAv ? 'av-period' : 'bfin-period', list, regime);
  const period = isAv ? $('av-period').value : $('bfin-period').value;
  // Aviários virou uma atividade só: o galpão não separa mais nada. Lançamento
  // antigo mantém o campo gravado, mas ninguém filtra nem exibe por ele — o
  // dado fica lá, caso um dia a separação volte a fazer falta.
  // A data que vale depende do regime: por competência é a da compra, por
  // caixa é a do pagamento — e conta a prazo em aberto não entra em caixa
  // nenhum, porque o dinheiro não saiu.
  const comQuando = list.map(t => ({ t, quando: dataDoRegime(t, regime) }));
  // A busca entra ANTES das somas. Filtrando só a lista, o saldo diria uma
  // coisa e as linhas embaixo dele, outra — e quem procurou "vacina" leria o
  // total da fazenda inteira achando que era o da vacina.
  const idBusca = isAv ? 'av-busca' : 'bfin-busca';
  const termo = buscaDe(idBusca);
  const nomeLivro = NOME_LIVRO[book];
  const noPeriodo = comQuando.filter(x => x.quando && inPeriod(x.quando, period));
  // Uma passada só: separar aqui evita refazer a comparação de texto de cada
  // lançamento mais adiante, na lista e nos dois avisos.
  const naBusca = [], foraDaBusca = [];
  noPeriodo.forEach(x => (casaBusca(x.t, termo, nomeLivro) ? naBusca : foraDaBusca).push(x));
  const filtered = naBusca.map(x => x.t);
  notaDoRegime(isAv ? 'av-regime-nota' : 'bfin-regime-nota', regime, list);
  const inn = filtered.filter(t => t.type === 'entrada').reduce((s, t) => s + t.amount, 0);
  const out = filtered.filter(t => t.type === 'saida').reduce((s, t) => s + t.amount, 0);
  const bal = inn - out;
  const balEl = isAv ? $('av-balance') : $('bfin-balance');
  balEl.innerHTML = `
    <div class="bc-label">Saldo do período${sufixoRegime(regime)}${rotuloBusca(termo, filtered.length)}</div>
    <div class="bc-value ${bal < 0 ? 'negative' : 'positive'}">${fmtRS(bal)}</div>
    <div class="bc-split">
      <div><div class="lbl">Entradas</div><div class="val in">${fmtRS(inn)}</div></div>
      <div><div class="lbl">Saídas</div><div class="val out">${fmtRS(out)}</div></div>
    </div>`;
  const agg = {};
  filtered.forEach(t => { const k = t.type + '|' + (t.category || 'Sem categoria'); agg[k] = (agg[k] || 0) + t.amount; });
  const todasCats = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const entries = todasCats.slice(0, 7);
  // Mostrar 7 e calar sobre o resto faz a soma das barras não bater com o
  // saldo, e quem lê conclui errado. O que sobra vira uma linha própria.
  const sobra = todasCats.slice(7);
  const somaSobra = sobra.reduce((s, [, v]) => s + v, 0);
  const maxV = entries.length ? entries[0][1] : 1;
  const catEl = isAv ? $('av-cats') : $('bfin-cats');
  catEl.innerHTML = !entries.length ? '' : dobravel('cats-' + book,
    cabecaDobra('Por categoria', fmtRS(entries[0][1]),
      `maior: ${esc(entries[0][0].split('|')[1])} · ${todasCats.length} no total`),
    entries.map(([k, v]) => {
    const [tp, cat] = k.split('|');
    return `<div class="cb-row">
      <div class="cb-line"><span>${esc(cat)}</span><span class="value ${tp}">${tp === 'saida' ? '−' : '+'} ${fmtRS(v)}</span></div>
      <div class="cb-bar"><div class="cb-fill ${tp}" style="width:${Math.max(4, v / maxV * 100)}%"></div></div>
    </div>`;
  }).join('') + (sobra.length
    ? `<div class="cb-resto mono">+ ${sobra.length} outra${sobra.length > 1 ? 's' : ''} categoria${sobra.length > 1 ? 's' : ''} · ${fmtRS(somaSobra)}</div>`
    : ''));
  catEl.style.display = entries.length ? '' : 'none';
  catEl.classList.add('so-dobra');
  renderAPagar(book);
  const listEl = isAv ? $('av-list') : $('bfin-list');
  // Ordena e data pela MESMA data que o saldo somou: mostrando a da compra num
  // saldo de caixa, a lista contaria uma história diferente do total acima.
  const sorted = naBusca.slice().sort((a, b) => a.quando < b.quando ? 1 : -1);
  listEl.innerHTML = sorted.map(({ t, quando }) => `<div class="list-item transaction-item" data-trans="${t.id}" data-book="${book}">
      <div class="item-main">
        <div class="item-title">${esc(t.category || (t.type === 'entrada' ? 'Entrada' : 'Saída'))}${rotuloParcela(t)}</div>
        <div class="item-subtitle">${fmtBR(quando)}${marcaDaData(t, regime, quando)}${t.notes ? ' · ' + esc(t.notes) : ''}</div>
        ${(t.anexos || []).length ? `<div class="item-anexo">📎 ${t.anexos.length} nota${t.anexos.length > 1 ? 's' : ''} anexada${t.anexos.length > 1 ? 's' : ''}</div>` : ''}
      </div>
      <div class="item-side"><div class="value ${t.type}">${t.type === 'saida' ? '−' : '+'} ${fmtRS(t.amount)}</div></div>
    </div>`).join('')
    // Só entra aqui o que o PERÍODO escondeu. O que o regime deixa de fora é
    // outra coisa — conta a pagar — e já tem aviso próprio logo acima.
    // Dois avisos diferentes, porque são duas causas diferentes e cada uma tem
    // o seu remédio: o período se abre em "Todo período", a busca se apaga.
    + avisoDaBusca(foraDaBusca.map(x => x.t), idBusca)
    // O aviso do período conta só o que CASA COM A BUSCA. Contando tudo, ele
    // prometia "+2 lançamentos · R$ 1.299,00" e o toque revelava um só — o
    // outro continuava escondido pela busca, que o clique não mexe. Aviso que
    // promete errado é pior que aviso nenhum: ensina a não confiar nos dois.
    + avisoForaDoPeriodo(
        comQuando.filter(x => x.quando && !inPeriod(x.quando, period)
          && casaBusca(x.t, termo, nomeLivro))
          .map(x => ({ amount: x.t.amount, quando: x.quando })),
        isAv ? 'av-period' : 'bfin-period');
  if (isAv) $('av-empty').hidden = avT.length > 0;
}

// ===== Modais =====
function openM(id) { $(id).hidden = false; }
// Fecha o MENU, e só ele. "Fechar tudo" depois de exportar fechava também a
// tela de saída que a própria exportação tinha acabado de abrir — o arquivo
// ficava pronto e a tela piscava e sumia, que é o mesmo que não fazer nada.
function fecharMenu() { const m = $('modal-menu'); if (m) m.hidden = true; }
function closeAllM() {
  document.querySelectorAll('.modal').forEach(m => m.hidden = true);
  anexoURLs.forEach(u => URL.revokeObjectURL(u));
  anexoURLs = [];
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAllM));

// Os fixos continuam na lista para quem ainda não cadastrou nada no estoque;
// os do estoque vêm na frente, e os que têm carência trazem o prazo escrito.
const MEDICAMENTOS_FIXOS = ['Vacina aftosa', 'Vacina brucelose', 'Vermífugo (Ivermectina)',
  'Antibiótico', 'Carrapaticida', 'Suplemento mineral'];
function preencherMedicamentos() {
  const dl = $('medicamentos-manejo');
  if (!dl) return;
  const doEstoque = items.slice()
    .sort((x, y) => (Number.isFinite(y.carencia) ? 1 : 0) - (Number.isFinite(x.carencia) ? 1 : 0)
      || x.name.localeCompare(y.name, 'pt-BR'));
  const vistos = new Set();
  const linhas = [];
  doEstoque.forEach(it => {
    const k = semAcento(it.name);
    if (vistos.has(k)) return;
    vistos.add(k);
    const rot = Number.isFinite(it.carencia) && it.carencia > 0
      ? `carência ${it.carencia} dias` : 'do estoque';
    linhas.push(`<option value="${esc(it.name)}">${rot}</option>`);
  });
  MEDICAMENTOS_FIXOS.forEach(n => {
    if (vistos.has(semAcento(n))) return;
    vistos.add(semAcento(n));
    linhas.push(`<option value="${esc(n)}"></option>`);
  });
  dl.innerHTML = linhas.join('');
}
function openAnimal(a) {
  $('animal-modal-title').textContent = a ? 'Editar animal' : 'Novo animal';
  $('an-id').value = a ? a.id : '';
  $('an-ident').value = a ? a.ident : '';
  $('an-cat').value = a ? (a.cat || '') : '';
  $('an-raca').value = a ? (a.raca || '') : '';
  $('an-entry-date').value = a ? (a.entryDate || '') : todayISO();
  $('an-entry-weight').value = a ? numParaCampo(a.entryWeight) : '';
  $('an-manejo-data').value = a ? (a.manejoData || '') : '';
  $('an-manejo-medicamento').value = a ? (a.manejoMedicamento || '') : '';
  // Os medicamentos DO ESTOQUE entram na sugestão, os com carência primeiro.
  // Sem isto o nome era digitado à mão e quase nunca casava com o item — e a
  // carência, que depende desse encontro, nunca disparava. Sugerir o nome
  // exato é o que faz o cruzamento acontecer.
  preencherMedicamentos();
  $('an-notes').value = a ? (a.notes || '') : '';
  $('an-sold').checked = a ? !!a.sold : false;
  $('an-sold-date').value = a && a.soldDate ? a.soldDate : todayISO();
  $('an-sold-weight').value = a ? numParaCampo(a.soldWeight) : '';
  $('an-sold-price').value = a ? numParaCampo(a.soldPrice) : '';
  $('an-dead').checked = a ? !!a.dead : false;
  $('an-dead-date').value = a && a.deadDate ? a.deadDate : todayISO();
  $('an-dead-cause').value = a && a.deadCause ? a.deadCause : '';
  syncSoldWrap(); syncDeadWrap();
  $('btn-delete-animal').hidden = !a;
  openM('modal-animal');
}
function syncSoldWrap() {
  $('an-sold-wrap').style.display = $('an-sold').checked ? '' : 'none';
}
function syncDeadWrap() {
  $('an-dead-wrap').style.display = $('an-dead').checked ? '' : 'none';
}
$('an-sold').addEventListener('change', () => {
  // Vendido e morto se excluem: o animal saiu do rebanho por um motivo só.
  if ($('an-sold').checked) { $('an-dead').checked = false; syncDeadWrap(); }
  syncSoldWrap();
});
$('an-dead').addEventListener('change', () => {
  if ($('an-dead').checked) { $('an-sold').checked = false; syncSoldWrap(); }
  syncDeadWrap();
});
function syncAnimalSaleTrans(a) {
  if (a.sold && Number.isFinite(a.soldPrice) && a.soldPrice > 0) {
    const saleData = { date: a.soldDate || todayISO(), type: 'entrada', amount: a.soldPrice, category: 'Venda de gado', notes: a.ident, lock: 'animal' };
    if (a.linkTrans) {
      const t = bovT.find(x => x.id === a.linkTrans);
      if (t) { Object.assign(t, saleData); upsert('bovtrans', t); return; }
    }
    // A venda já pode ter sido lançada à mão no Financeiro — não lança de novo
    // sem perguntar.
    const dup = findDupTrans(bovT, saleData, null);
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
  const dead = $('an-dead').checked;
  const ativo = !sold && !dead;
  // Brinco pode ser reutilizado depois que o animal sai do rebanho: só bloqueia
  // se OUTRO animal ativo já usa a identificação — e só quando este ficará ativo.
  const dupe = ativo && animals.find(x => noRebanho(x) && chaveBrinco(x.ident) === chaveBrinco(ident) && x.id !== id);
  if (dupe) { toast('Já existe animal ativo com essa identificação'); return; }
  // Marcar como vendido é o momento em que a carência deixa de ser aviso e
  // passa a ser consequência. A conta é feita com a DATA DA VENDA, não com
  // hoje: vender daqui a um mês pode estar liberado, vender agora não.
  if (sold) {
    const dataVenda = $('an-sold-date').value || todayISO();
    const prov = { manejoData: $('an-manejo-data').value || null,
      manejoMedicamento: $('an-manejo-medicamento').value.trim() || null };
    const c = carenciaDoAnimal(prov, dataVenda);
    if (c && c.bloqueado && !confirm(
        `⚠️ ESTE ANIMAL ESTÁ EM CARÊNCIA\n\n`
        + `${c.item.name} — carência de ${c.dias} dias, aplicada em ${fmtBR(prov.manejoData)}.\n`
        + `Só libera em ${fmtBR(c.liberadoEm)} — faltam ${c.faltam} dia(s) para a data da venda.\n\n`
        + 'Abater antes disso deixa resíduo de medicamento na carne, e quem responde é você.\n\n'
        + 'Registrar a venda mesmo assim?')) return;
  }
  const soldPriceRaw = parseNum($('an-sold-price').value);
  const data = {
    ident, cat: $('an-cat').value.trim(),
    raca: $('an-raca').value.trim() || null,
    entryDate: $('an-entry-date').value || null,
    entryWeight: parseNum($('an-entry-weight').value) || null,
    manejoData: $('an-manejo-data').value || null,
    manejoMedicamento: $('an-manejo-medicamento').value.trim() || null,
    notes: $('an-notes').value.trim(),
    sold,
    soldDate: sold ? ($('an-sold-date').value || todayISO()) : null,
    soldWeight: sold ? (parseNum($('an-sold-weight').value) || null) : null,
    soldPrice: sold && Number.isFinite(soldPriceRaw) && soldPriceRaw > 0 ? soldPriceRaw : null,
    dead,
    deadDate: dead ? ($('an-dead-date').value || todayISO()) : null,
    deadCause: dead ? ($('an-dead-cause').value.trim() || null) : null
  };
  let a, isNew = false;
  if (id) {
    a = animals.find(x => x.id === id);
    if (!a) return sumiu('Este animal foi removido');
    Object.assign(a, data);
  } else {
    a = Object.assign({ id: uid() }, data);
    animals.push(a);
    isNew = true;
  }
  syncAnimalSaleTrans(a);
  // A pesagem de entrada acompanha o cadastro: corrigir a data ou o peso ali
  // precisa corrigir o histórico, senão os dois passam a discordar.
  const entradaOk = a.entryDate && Number.isFinite(a.entryWeight) && a.entryWeight > 0;
  let entrada = a.entryWeighingId ? weighings.find(w => w.id === a.entryWeighingId) : null;
  if (!entrada && !isNew) entrada = weighings.find(w => w.animalId === a.id && w.notes === 'Peso de entrada');
  if (entradaOk) {
    if (entrada) {
      Object.assign(entrada, { date: a.entryDate, weight: a.entryWeight });
      a.entryWeighingId = entrada.id;
      upsert('weighings', entrada);
    } else {
      const w = { id: uid(), animalId: a.id, date: a.entryDate, weight: a.entryWeight, jejum: false, notes: 'Peso de entrada' };
      weighings.push(w); a.entryWeighingId = w.id; upsert('weighings', w);
    }
  } else if (entrada) {
    weighings = weighings.filter(w => w.id !== entrada.id);
    remove('weighings', entrada.id);
    a.entryWeighingId = null;
  }
  upsert('animals', a);
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
  ]).catch(() => toast('Falha ao remover na nuvem — verifique a conexão'));
  closeAllM(); render(); toast('Animal excluído');
});

function openWeighing(animalId, w) {
  const a = animals.find(x => x.id === animalId);
  $('w-modal-title').textContent = w ? 'Editar pesagem' : 'Nova pesagem';
  $('w-context').textContent = 'Animal: ' + (a ? a.ident : '?');
  $('w-id').value = w ? w.id : '';
  $('w-animal-id').value = animalId;
  $('w-date').value = w ? w.date : todayISO();
  $('w-weight').value = w ? numParaCampo(w.weight) : '';
  $('w-notes').value = w ? (w.notes || '') : '';
  $('btn-delete-weighing').hidden = !w;
  openM('modal-weighing');
}
$('form-weighing').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('w-id').value, animalId = $('w-animal-id').value;
  const date = $('w-date').value, weight = parseNum($('w-weight').value);
  if (!date || !Number.isFinite(weight) || weight <= 0) return;
  const dupW = weighings.find(x => x.id !== id && x.animalId === animalId && x.date === date);
  if (dupW) {
    const an = animals.find(x => x.id === animalId);
    if (!askDuplicate(`${an ? an.ident : 'Este animal'} já tem pesagem em ${fmtBRfull(dupW.date)}: ${fmtN(dupW.weight, 1)} kg.\n\nPara corrigir o peso, edite a pesagem existente em vez de criar outra.`)) return;
  }
  // Esta fazenda pesa SEMPRE sem jejum, e a caixa de marcar saiu da tela: era a
  // última porta por onde um "jejum" entrava sem querer, e um clique errado ali
  // tirava o animal da média do rebanho e distorcia o GMD dele para sempre.
  //
  // Pesagem ANTIGA que já esteja marcada como jejum conserva a marca. Reescrever
  // para "cheio" só porque alguém abriu a tela mudaria o passado em silêncio — e
  // o aviso de comparação misturada existe justamente para dar conta desse caso,
  // venha ele de um registro velho ou de um arquivo importado.
  const anterior = id ? weighings.find(x => x.id === id) : null;
  const data = { animalId, date, weight, jejum: anterior ? !!anterior.jejum : false,
    notes: $('w-notes').value.trim() };
  let w;
  if (id) {
    w = weighings.find(x => x.id === id);
    if (!w) return sumiu('Esta pesagem foi removida');
    Object.assign(w, data);
  }
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
  // book nulo = veio da aba Fazenda, onde a atividade ainda não foi escolhida.
  // Editando, a atividade fica travada: mudar de livro exigiria refazer os
  // vínculos com estoque e com a venda do animal, e um deles ficaria órfão.
  const perguntar = !book && !t;
  const efetivo = book || (t ? (LIVROS.find(b => arrLivro(b).some(x => x.id === t.id)) || 'bov') : 'bov');
  $('t-modal-title').textContent = t ? 'Editar lançamento' : 'Novo lançamento';
  $('t-id').value = t ? t.id : '';
  $('t-book').value = efetivo;
  $('t-livro-wrap').style.display = perguntar ? '' : 'none';
  preencherSeletorAtividade();
  abrirListaCategorias(false);
  // Lançando pela aba Fazenda, começa em Geral — é a natureza da aba. Quem
  // quiser jogar em Bovinos ou Aviários troca no seletor, que está no topo.
  $('t-livro').value = perguntar && tab === 'fazenda' ? 'ger' : efetivo;
  sincronizarLivroTrans();
  document.querySelector(`input[name="t-type"][value="${t ? t.type : 'saida'}"]`).checked = true;
  sincronizarSentidoTrans();
  $('t-date').value = t ? t.date : todayISO();
  $('t-amount').value = t ? numParaCampo(t.amount) : '';
  $('t-category').value = t ? (t.category || '') : '';
  $('t-notes').value = t ? (t.notes || '') : '';
  $('t-prazo').checked = !!(t && t.venc);
  $('t-venc').value = t && t.venc ? t.venc : '';
  // O NÚMERO DE PARCELAS DO CARNÊ, e não "1".
  //
  // Abrindo a parcela 3/8, o campo mostrava "Em quantas vezes: 1", cinzento.
  // Era a única informação na tela sobre o parcelamento, e estava errada: a
  // tela dizia que o lançamento não era parcelado justamente quando era.
  $('t-parcelas').value = t && t.parcelas > 1 ? t.parcelas : 1;
  // O ritmo volta ao do boleto a cada abertura: ele vale para o carnê que está
  // sendo criado agora, e carregar a escolha da vez passada para um lançamento
  // novo seria decidir no lugar de quem está digitando.
  $('t-ritmo').value = 'mes';
  limparDatasParcelas('t');
  // Uma parcela já criada não se re-parcela: editar a 2/3 mexe só nela.
  $('t-parcelas').disabled = !!(t && t.parcelas > 1);
  anexosForm = (t && t.anexos ? t.anexos.map(a => Object.assign({}, a)) : []);
  anexosRemover = [];
  renderAnexosForm();
  $('t-pago').checked = !!(t && t.pago);
  // Sem este campo, pagoEm só podia ser o dia em que se tocou em "Pagar" — e
  // conta paga na semana passada caía no mês errado do regime de caixa, sem
  // nenhum jeito de arrumar.
  $('t-pago-em').value = t && t.pagoEm ? t.pagoEm : '';
  syncPrazoUI(); previewParcelas();
  // O CARNÊ INTEIRO, À VISTA.
  //
  // Dentro do lançamento aberto não havia nada dizendo que aquilo era uma
  // parcela — nem qual, nem de quantas, nem quanto foi a compra. A lista de
  // fora mostra "3/8"; abrindo, a informação sumia. Agora o carnê inteiro
  // aparece aqui: cada parcela, a data, se já foi paga, e qual é esta.
  const ctx = $('t-context');
  const avisos = [];
  const irmas = t && t.grupo
    ? arrLivro(efetivo).filter(x => x.grupo === t.grupo).sort((a, b) => (a.parcela || 0) - (b.parcela || 0))
    : [];
  if (irmas.length > 1) {
    const soma = irmas.reduce((s2, x) => s2 + x.amount, 0);
    avisos.push(`<b>Parcela ${t.parcela} de ${t.parcelas}</b> — carnê de ${fmtRS(soma)}`);
    avisos.push('<span class="tc-carne">' + irmas.map(x =>
      `<span class="tc-parc${x.id === t.id ? ' tc-esta' : ''}${x.pago ? ' tc-paga' : ''}">`
      + `${x.parcela}/${x.parcelas} ${fmtBR(x.venc)}${x.pago ? ' paga' : ''}`
      + `${x.id === t.id ? ' ←' : ''}</span>`).join('') + '</span>');
  }
  if (t && t.lock === 'stock') avisos.push('Gerado pelo estoque — prefira editar pela movimentação de estoque.');
  else if (t && t.lock === 'animal') avisos.push('Gerado pela venda do animal — prefira editar pelo cadastro do animal.');
  ctx.hidden = !avisos.length;
  ctx.innerHTML = avisos.join('<br>');
  // A nota é da COMPRA, não da prestação: vale para as parcelas todas, e tirar
  // de uma tira de todas. Dizer isso evita a dúvida de anexar oito vezes.
  const notaAx = $('t-anexo-nota');
  if (notaAx) {
    notaAx.textContent = irmas.length > 1
      ? `A nota vale para as ${irmas.length} parcelas deste carnê — anexe uma vez só.`
      : 'A foto é reduzida no aparelho antes de subir, para caber na nuvem.';
  }
  $('btn-delete-transaction').hidden = !t;
  openM('modal-transaction');
}
// Trocar a atividade no formulário troca o livro de destino e a lista de
// categorias sugeridas — cada atividade tem as suas.
// O seletor é montado a cada abertura porque a lista de atividades pode ter
// mudado noutro aparelho enquanto este formulário estava fechado.
function preencherSeletorAtividade() {
  const sel = $('t-livro');
  const atual = sel.value;
  sel.innerHTML = '<option value="bov">Bovinos</option>'
    + '<option value="av">Aviários</option>'
    + '<option value="ger">Geral (fazenda toda)</option>'
    + atividades.map(a => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('');
  if (atual && LIVROS.indexOf(atual) >= 0) sel.value = atual;
}
// Entrada e saída usam os mesmos campos e NÃO são a mesma coisa: "vencimento"
// de uma venda é previsão de recebimento, e "já foi pago" é "já recebi". Com
// as palavras erradas, o campo certo é preenchido com a intenção errada.
function sincronizarSentidoTrans() {
  const marcado = document.querySelector('input[name="t-type"]:checked');
  const ehEntrada = !!marcado && marcado.value === 'entrada';
  $('t-prazo-rot').textContent = ehEntrada ? 'A prazo (receber depois)' : 'A prazo (pagar depois)';
  // Numa parcela que já existe, a data ali é a DELA. Chamá-la de "1º
  // vencimento" fazia parecer que mexer nela mexia no carnê inteiro.
  const umaParcela = $('t-parcelas').disabled;
  $('t-venc-rot').textContent = umaParcela
    ? (ehEntrada ? 'Previsão de recebimento desta parcela *' : 'Vencimento desta parcela *')
    : (ehEntrada ? '1ª previsão de recebimento *' : '1º vencimento *');
  $('t-pago-rot').textContent = ehEntrada ? 'Já recebi' : 'Já foi pago';
  $('t-pago-em-rot').textContent = ehEntrada ? 'Data do recebimento' : 'Data do pagamento';
}
document.querySelectorAll('input[name="t-type"]').forEach(r =>
  r.addEventListener('change', sincronizarSentidoTrans));
// ===== Lista de categorias que abre, e que acha sem acento =====
// A lista nativa do navegador tem dois defeitos no celular: só aparece depois
// de digitar, e compara LITERALMENTE — "mao" não encontra "Mão de obra",
// "racao" não encontra "Ração/insumos". Quem escreve no curral não põe acento,
// e concluía que a categoria não existia. Esta lista abre com um toque e usa a
// mesma comparação sem acento do resto do aplicativo.
function categoriasDoCampo() {
  const dl = document.getElementById($('t-category').getAttribute('list'));
  if (!dl) return [];
  // Ordem alfabética do PORTUGUÊS: localeCompare com 'pt-BR' põe "Mão de obra"
  // no M e "Ração/insumos" no R. Ordenar pelo código da letra jogaria tudo que
  // tem acento para o fim da lista, longe de onde o olho procura.
  return [...dl.options].map(o => o.value).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function desenharListaCategorias() {
  const caixa = $('t-cat-lista');
  const termo = semAcento($('t-category').value.trim());
  const todas = categoriasDoCampo();
  const achadas = termo ? todas.filter(c => semAcento(c).includes(termo)) : todas;
  if (!achadas.length) {
    caixa.innerHTML = `<p class="cat-vazia mono">Nenhuma categoria com "${esc($('t-category').value.trim())}". `
      + 'O campo aceita qualquer texto — pode escrever a sua.</p>';
    return;
  }
  caixa.innerHTML = achadas.map(c => `<button type="button" class="cat-item" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
function abrirListaCategorias(abrir) {
  const caixa = $('t-cat-lista');
  if (!abrir) { caixa.hidden = true; return; }
  desenharListaCategorias();
  caixa.hidden = false;
}
$('t-cat-abrir').addEventListener('click', () => abrirListaCategorias($('t-cat-lista').hidden));
$('t-category').addEventListener('input', () => {
  if (!$('t-cat-lista').hidden) desenharListaCategorias();
});
$('t-cat-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  $('t-category').value = b.dataset.cat;
  abrirListaCategorias(false);
});
function sincronizarLivroTrans() {
  const livro = $('t-livro').value;
  $('t-book').value = livro;
  // Atividade criada pela pessoa (soja, leite) recebe a lista genérica: propor
  // "Venda de gado" numa lavoura seria sugestão errada em cima de sugestão.
  abrirListaCategorias(false);
  $('t-category').setAttribute('list',
    livro === 'av' ? 'cats-av' : livro === 'bov' ? 'cats-bov' : 'cats-geral');
}
$('t-livro').addEventListener('change', sincronizarLivroTrans);
$('form-transaction').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('t-id').value, book = $('t-book').value;
  const amount = parseNum($('t-amount').value);
  const date = $('t-date').value;
  if (!date || !Number.isFinite(amount) || amount <= 0) return;
  const data = {
    date, amount,
    type: document.querySelector('input[name="t-type"]:checked').value,
    category: $('t-category').value.trim(),
    notes: $('t-notes').value.trim()
  };
  const ehSaida = data.type === 'saida';
  // Entrada a prazo é venda para receber depois — boi entregue hoje, dinheiro
  // em 30 dias. Antes o formulário simplesmente jogava fora o vencimento de
  // uma entrada, e a venda virava dinheiro que já estava na conta.
  const aPrazo = $('t-prazo').checked;
  if (aPrazo && !$('t-venc').value) { toast('Informe o vencimento'); return; }
  // O número de parcelas só é um PEDIDO quando o campo está destravado. Travado,
  // ele é informação — "esta é uma de duas". Lido como pedido, o salvamento ia
  // procurar carnê repetido usando o valor da PARCELA como total da compra, e
  // avisava de uma duplicidade que não existe.
  const reparcelando = aPrazo && !$('t-parcelas').disabled;
  const nParc = reparcelando ? nParcelasDe('t-parcelas') : 1;
  const ritmoT = ritmoDe('t'), datasT = datasEscolhidas('t');
  // Data em branco ou fora de ordem para antes de salvar: parcela sem
  // vencimento sairia do "A pagar" sem avisar, e uma que vence antes da
  // anterior é erro de digitação que só apareceria na cobrança.
  if (aPrazo && nParc > 1) {
    const erro = erroDasDatas($('t-venc').value, nParc, ritmoT, datasT);
    if (erro) { toast(erro); return; }
  }
  data.venc = aPrazo ? $('t-venc').value : null;
  data.pago = aPrazo ? $('t-pago').checked : false;
  // Marcou pago e não disse quando: assume hoje, que é o que o botão "Pagar"
  // já fazia. Desmarcou: a data sai junto, senão sobraria uma data de pagamento
  // numa conta que voltou a ser devida.
  data.pagoEm = data.pago ? ($('t-pago-em').value || todayISO()) : null;
  const arr = arrLivro(book);
  const col = colLivro(book);
  const atual = id ? arr.find(x => x.id === id) : null;
  const dupCarne = nParc > 1 ? findDupCarne(arr, data, amount, atual && atual.grupo) : null;
  if (dupCarne) {
    const c = dupCarne;
    if (!askDuplicate(`Já existe uma compra parcelada de ${fmtRS(c.soma)} em ${fmtBRfull(c.p.date)}`
      + `\n${c.n} parcelas${c.p.category ? `\nCategoria: ${c.p.category}` : ''}`
      + `${c.p.notes ? `\nDescrição: ${c.p.notes}` : ''}`)) return;
  }
  const dup = dupCarne ? null : findDupTrans(arr, data, id);
  if (dup) {
    const tipo = dup.type === 'entrada' ? 'entrada' : 'saída';
    const origem = dup.lock === 'stock' ? '\n(gerado por uma compra de estoque)'
      : dup.lock === 'animal' ? '\n(gerado pela venda de um animal)' : '';
    if (!askDuplicate(`Já existe uma ${tipo} de ${fmtRS(dup.amount)} em ${fmtBRfull(dup.date)}${dup.category ? `\nCategoria: ${dup.category}` : ''}${dup.notes ? `\nDescrição: ${dup.notes}` : ''}${origem}`)) return;
  }
  let t;
  // O que este salvamento mexeu, para o calendário saber o que mandar — e o
  // que cancelar, quando a conta acabou de ser marcada como paga.
  let tocadas = [];
  if (id) {
    t = arr.find(x => x.id === id);
    if (!t) return sumiu('Este lançamento foi removido');
    // Lançamento à vista que agora vai ser parcelado. Antes o pedido era lido,
    // a prévia anunciava "3× de R$ 300,00" e o salvamento jogava fora: ficava
    // UM lançamento de R$ 900 e ninguém era avisado.
    const virarCarne = !t.grupo && nParc > 1;
    if (virarCarne && t.lock) {
      // Este lançamento é o reflexo de outra coisa. Parcelar por aqui deixaria
      // a compra (ou a venda) apontando para uma parcela só, e as outras
      // ficariam soltas quando ela fosse apagada.
      toast(t.lock === 'stock'
        ? 'Parcele pela movimentação de estoque que gerou este lançamento'
        : 'Parcele pelo cadastro do animal que gerou este lançamento');
      return;
    }
    if (virarCarne) {
      const grupo = uid();
      const partes = montarParcelas({ base: data, total: amount, venc: data.venc, n: nParc, grupo, ritmo: ritmoT, datas: datasT });
      // A parcela 1 continua sendo ESTE registro, com o mesmo id: a nota fiscal
      // anexada e tudo o que aponte para ele seguem valendo.
      Object.assign(t, partes[0], { id });
      const novas = partes.slice(1);
      novas.forEach(p => arr.push(p));
      aplicarAnexos(t, col);
      escreverVarias(col, [t, ...novas]);
      tocadas = [t, ...novas];
    } else {
      // Editar uma parcela mexe só nela: o resto do carnê continua de pé.
      Object.assign(t, data, t.grupo ? { grupo: t.grupo, parcela: t.parcela, parcelas: t.parcelas } : {});
      aplicarAnexos(t, col); upsert(col, t);
      tocadas = [t];
    }
  } else if (nParc > 1) {
    // Parcelado: a despesa inteira entra no dia do lançamento e cada parcela
    // carrega só o seu vencimento.
    const grupo = uid();
    const partes = montarParcelas({ base: data, total: amount, venc: data.venc, n: nParc, grupo, ritmo: ritmoT, datas: datasT });
    partes.forEach(p => arr.push(p));
    // A nota fiscal é da compra inteira: fica na primeira parcela, para não
    // duplicar o arquivo uma vez por prestação.
    aplicarAnexos(partes[0], col);
    escreverVarias(col, partes);
    t = partes[0];
    tocadas = partes;
  } else {
    t = Object.assign({ id: uid() }, data); arr.push(t);
    aplicarAnexos(t, col); upsert(col, t);
    tocadas = [t];
  }
  closeAllM(); render(); toast('Lançamento salvo');
  agendarMudanca(tocadas, book);
});
$('btn-delete-transaction').addEventListener('click', () => {
  const id = $('t-id').value, book = $('t-book').value;
  const arr = arrLivro(book);
  const col = colLivro(book);
  const alvo = arr.find(x => x.id === id);
  if (!id || !alvo) return;
  // Parcela de um carnê: perguntar qual das duas coisas, porque apagar só a
  // parcela e apagar a compra inteira levam a saldos diferentes.
  let ids = [id];
  const irmas = alvo.grupo ? arr.filter(x => x.grupo === alvo.grupo) : [];
  if (irmas.length > 1) {
    const tudo = confirm(`Esta é a parcela ${alvo.parcela} de ${alvo.parcelas}.\n\n`
      + `OK apaga as ${irmas.length} parcelas restantes (a compra inteira).\n`
      + 'Cancelar apaga só esta parcela.');
    ids = tudo ? irmas.map(x => x.id) : [id];
    // Sobrou UMA parcela do carnê: não há escolha a fazer, mas continua sendo
    // uma exclusão. Antes esta era a única do app que acontecia sem perguntar —
    // um toque errado apagava o lançamento e não havia como voltar atrás.
  } else if (!confirm(alvo.grupo
    ? `Excluir a última parcela desta compra (${alvo.parcela} de ${alvo.parcelas})?`
    : 'Excluir este lançamento?')) return;
  // Guarda os alvos ANTES de filtrar: depois eles não estão mais na lista, e a
  // nota fiscal anexada ficaria na nuvem sem ninguém para apagá-la.
  const alvos = arr.filter(x => ids.includes(x.id));
  if (book !== 'bov') { setLivro(book, arrLivro(book).filter(x => !ids.includes(x.id))); }
  else {
    bovT = bovT.filter(x => !ids.includes(x.id));
    moves.forEach(m => {
      if (ids.includes(m.linkTrans)) { delete m.linkTrans; upsert('moves', m); }
      if (m.linkGrupo && alvo.grupo === m.linkGrupo && ids.length > 1) { delete m.linkGrupo; upsert('moves', m); }
    });
    animals.forEach(a => { if (ids.includes(a.linkTrans)) { delete a.linkTrans; upsert('animals', a); } });
  }
  const saindo = new Set(ids);
  alvos.forEach(x => apagarAnexosDe(x, saindo));
  ids.forEach(x => remove(col, x));
  closeAllM(); render(); toast('Lançamento excluído');
  agendarMudanca([], book, ids);
});

// ===== Aba Compras: o livro de cabeças =====
function renderCompras() {
  const R = saldoRebanho();
  const linha = (rot, n, cls) => n === 0 ? '' : `<div class="rs-linha ${cls || ''}">
    <span class="rs-rot">${esc(rot)}</span>
    <span class="rs-n mono">${cls === 'rs-sai' ? '−' : '+'}${fmtN(n, 0)}</span></div>`;
  const entradas = linha('Saldo inicial', R.porTipo.inicial.cabecas)
    + linha(`Compras${R.porTipo.compra.n ? ` (${R.porTipo.compra.n})` : ''}`, R.porTipo.compra.cabecas)
    + linha('Nascimentos', R.porTipo.nascimento.cabecas);
  const saidas = linha('Vendas em lote', R.porTipo.venda.cabecas, 'rs-sai')
    + linha('Mortes em lote', R.porTipo.morte.cabecas, 'rs-sai')
    + linha('Vendidos com brinco', R.vendidosComBrinco, 'rs-sai')
    + linha('Mortos com brinco', R.mortosComBrinco, 'rs-sai');
  // Sem nenhum movimento a tela não mostra saldo: zero cabeças seria uma
  // afirmação falsa sobre uma fazenda que tem gado e ainda não lançou nada.
  if (!R.temMovimento) {
    $('reb-saldo').innerHTML = `<div class="rs-vazio">
      <p class="eyebrow mono">Estoque de gado</p>
      <p>Aqui se conta o rebanho por <b>cabeça</b>, e não por brinco — é o que responde
      "quantas cabeças eu tenho" quando entra um lote que ainda não foi identificado.</p>
      <p class="small">Comece pelo <b>saldo inicial</b>: quantas cabeças você tem hoje.
      Depois, cada compra, nascimento, venda ou morte de lote. As vendas e as mortes
      dos animais com brinco entram sozinhas — você não precisa lançá-las aqui.</p>
      ${R.comBrinco ? `<button type="button" class="btn-secondary" id="reb-inicial">
        Usar os ${R.comBrinco} animais cadastrados como saldo inicial</button>` : ''}
    </div>`;
    $('reb-lista').innerHTML = '';
    return;
  }
  const alerta = R.saldo < 0 ? 'rs-negativo' : '';
  $('reb-saldo').innerHTML = `<div class="rs-caixa ${alerta}">
      <div class="rs-cab mono">Estoque de gado</div>
      <div class="rs-saldo">${fmtN(R.saldo, 0)} <span class="rs-un">cabeça${R.saldo === 1 ? '' : 's'}</span></div>
      <div class="rs-corpo">
        <div class="rs-grupo"><div class="rs-tit mono">Entradas · ${fmtN(R.entradas, 0)}</div>${entradas || '<div class="rs-nada mono">nenhuma</div>'}</div>
        <div class="rs-grupo"><div class="rs-tit mono">Saídas · ${fmtN(R.saidas, 0)}</div>${saidas || '<div class="rs-nada mono">nenhuma</div>'}</div>
      </div>
      <p class="rs-nota mono">A venda e a morte de animal com brinco já saem daqui, lidas do cadastro —
      lançar de novo descontaria a mesma cabeça duas vezes.</p>
    </div>
    <p class="est-nota mono" id="reb-conferencia">${
      R.saldo < 0
        ? '<b>Saldo negativo.</b> Saiu mais cabeça do que entrou: falta lançar uma compra ou o saldo inicial.'
        : `Com brinco no rebanho: <b>${fmtN(R.comBrinco, 0)}</b> · `
          + (R.semBrinco >= 0
            ? `sem brinco: <b>${fmtN(R.semBrinco, 0)}</b>`
            : `<b>${fmtN(-R.semBrinco, 0)} ficha(s) a mais que cabeça</b> — falta lançar uma compra, ou sobra animal cadastrado`)
    }</p>`;
  const itens = rebmovOrdenado();
  $('reb-lista').innerHTML = `<div class="list">${itens.map(m => {
    const tipo = REB_TIPOS[m.tipo] || REB_TIPOS.compra;
    const n = cabecasDe(m);
    const peso = Number.isFinite(m.pesoMedio) && m.pesoMedio > 0;
    const val = Number.isFinite(m.valor) && m.valor > 0;
    return `<div class="list-item" data-rebmov="${esc(m.id)}">
      <div class="item-main">
        <div class="item-title">${esc(tipo.nome)}${m.cat ? ' · ' + esc(m.cat) : ''}</div>
        <div class="item-sub mono">${fmtBRfull(m.date)}${m.notes ? ' · ' + esc(m.notes) : ''}${
          peso ? ` · ${fmtN(m.pesoMedio, 0)} kg/cab` : ''}${
          val ? ` · ${fmtRS(m.valor)}` : ''}${m.linkTrans ? ' · no Financeiro' : ''}</div>
      </div>
      <div class="item-side">
        <div class="value ${tipo.sinal < 0 ? 'negative' : 'positive'}">${tipo.sinal < 0 ? '−' : '+'}${fmtN(n, 0)}</div>
        <div class="aux mono">cabeça${n === 1 ? '' : 's'}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}
// O tipo manda no resto do formulário: nascimento não tem preço de compra,
// venda em lote tem é receita, e saldo inicial não é dinheiro nenhum.
function sincronizarRebmov() {
  const tipo = $('rm-tipo').value;
  const ehVenda = tipo === 'venda';
  const temDinheiro = tipo === 'compra' || ehVenda;
  $('rm-dinheiro').style.display = temDinheiro ? '' : 'none';
  $('rm-valor-rot').textContent = ehVenda ? 'Valor total recebido (R$)' : 'Valor total da compra (R$)';
  $('rm-postfin-rot').textContent = ehVenda
    ? 'Lançar a venda no Financeiro (Bovinos)' : 'Lançar a compra no Financeiro (Bovinos)';
  const AJUDA = {
    compra: 'Entram cabeças no rebanho. Use para o lote que chegou, com ou sem brinco.',
    nascimento: 'Entram cabeças nascidas na fazenda.',
    venda: 'Saem cabeças SEM brinco. Animal cadastrado se vende pela ficha dele, na aba Rebanho — e sai daqui sozinho.',
    morte: 'Saem cabeças SEM brinco. Animal cadastrado se marca como morto na ficha dele, e sai daqui sozinho.',
    inicial: 'Quantas cabeças a fazenda tinha quando você começou a usar esta aba. Lance uma vez só.'
  };
  $('rm-ajuda').textContent = AJUDA[tipo] || '';
  mostrarValorCompra();
}
function mostrarValorCompra() {
  const el = $('rm-valor-lido'); if (!el) return;
  const bruto = $('rm-valor').value.trim();
  const v = parseNum(bruto);
  const vale = Number.isFinite(v) && v > 0;
  const n = Math.round(parseNum($('rm-qtd').value) || 0);
  el.hidden = !bruto;
  el.textContent = !bruto ? ''
    : vale ? '= ' + fmtRS(v) + (n > 0 ? ` · ${fmtRS(v / n)} por cabeça` : '')
    : 'Não entendi este valor — escreva os centavos com vírgula (ex: 1.250,50)';
  el.classList.toggle('valor-erro', !!bruto && !vale);
}
function openRebmov(m) {
  $('rm-modal-title').textContent = m ? 'Editar movimento' : 'Movimento do rebanho';
  $('rm-id').value = m ? m.id : '';
  $('rm-tipo').value = m ? m.tipo : 'compra';
  $('rm-date').value = m ? m.date : todayISO();
  $('rm-qtd').value = m ? cabecasDe(m) : '';
  $('rm-cat').value = m ? (m.cat || '') : '';
  $('rm-peso').value = m && Number.isFinite(m.pesoMedio) ? numParaCampo(m.pesoMedio) : '';
  $('rm-valor').value = m && Number.isFinite(m.valor) ? numParaCampo(m.valor) : '';
  $('rm-postfin').checked = m ? !!m.linkTrans || !m.id : true;
  $('rm-notes').value = m ? (m.notes || '') : '';
  $('btn-delete-rebmov').hidden = !m;
  sincronizarRebmov();
  openM('modal-rebmov');
}
$('rm-tipo').addEventListener('change', sincronizarRebmov);
['rm-valor', 'rm-qtd'].forEach(id =>
  ['input', 'change'].forEach(ev => $(id).addEventListener(ev, mostrarValorCompra)));
$('form-rebmov').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('rm-id').value;
  const tipo = $('rm-tipo').value;
  if (!ehTipoReb(tipo)) return;
  const date = $('rm-date').value;
  const qtd = Math.round(parseNum($('rm-qtd').value));
  if (!date || !Number.isFinite(qtd) || qtd <= 0) { toast('Informe a data e quantas cabeças'); return; }
  const pesoMedio = parseNum($('rm-peso').value);
  const valor = parseNum($('rm-valor').value);
  const temDinheiro = tipo === 'compra' || tipo === 'venda';
  // Saldo inicial é um retrato do começo: dois deles seriam duas fazendas
  // somadas, e o número ficaria o dobro sem nada na tela explicando.
  if (tipo === 'inicial' && rebmov.some(x => x.tipo === 'inicial' && x.id !== id)) {
    toast('Já existe um saldo inicial — edite o que está lá');
    return;
  }
  const dados = {
    tipo, date, qtd,
    cat: $('rm-cat').value.trim() || null,
    pesoMedio: Number.isFinite(pesoMedio) && pesoMedio > 0 ? pesoMedio : null,
    valor: temDinheiro && Number.isFinite(valor) && valor > 0 ? valor : null,
    notes: $('rm-notes').value.trim()
  };
  let m;
  if (id) {
    m = rebmov.find(x => x.id === id);
    if (!m) return sumiu('Este movimento foi removido');
    Object.assign(m, dados);
  } else {
    m = Object.assign({ id: uid(), linkTrans: null }, dados);
    rebmov.push(m);
  }
  m.postFin = temDinheiro && $('rm-postfin').checked;
  syncCompraTrans(m);
  delete m.postFin;
  upsert('rebmov', m);
  closeAllM(); render(); toast('Movimento salvo');
});
$('btn-delete-rebmov').addEventListener('click', () => {
  const id = $('rm-id').value; if (!id) return;
  const m = rebmov.find(x => x.id === id);
  if (!m) return;
  const temLanc = !!m.linkTrans;
  if (!confirm(`Excluir este movimento de ${cabecasDe(m)} cabeça(s)?`
    + (temLanc ? '\n\nO lançamento dele no Financeiro sai junto.' : ''))) return;
  if (temLanc) {
    const t = bovT.find(x => x.id === m.linkTrans);
    if (t) apagarAnexosDe(t);
    bovT = bovT.filter(x => x.id !== m.linkTrans);
    remove('bovtrans', m.linkTrans);
  }
  rebmov = rebmov.filter(x => x.id !== id);
  remove('rebmov', id);
  closeAllM(); render(); toast('Movimento excluído');
});
document.addEventListener('click', e => {
  const li = e.target.closest('[data-rebmov]');
  if (li) {
    const m = rebmov.find(x => x.id === li.dataset.rebmov);
    if (!m) return sumiu('Este movimento foi removido');
    return openRebmov(m);
  }
  // Atalho da tela vazia: o saldo inicial que quase todo mundo vai querer.
  if (e.target.id === 'reb-inicial') {
    const n = animals.filter(noRebanho).length;
    openRebmov(null);
    $('rm-tipo').value = 'inicial'; sincronizarRebmov();
    $('rm-qtd').value = String(n);
    $('rm-notes').value = 'Rebanho já cadastrado quando a aba começou';
  }
});

function openItem(it) {
  $('i-modal-title').textContent = it ? 'Editar item' : 'Novo item de estoque';
  $('i-id').value = it ? it.id : '';
  $('i-name').value = it ? it.name : '';
  $('i-unit').value = it ? it.unit : 'kg';
  $('i-min').value = it ? numParaCampo(it.minQty) : '';
  $('i-carencia').value = it ? numParaCampo(it.carencia) : '';
  $('i-notes').value = it ? (it.notes || '') : '';
  $('btn-delete-item').hidden = !it;
  openM('modal-item');
}
$('form-item').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('i-id').value;
  const name = $('i-name').value.trim();
  if (!name) return;
  const data = { name, unit: $('i-unit').value, minQty: parseNum($('i-min').value) || null, carencia: Math.round(parseNum($('i-carencia').value)) || null, notes: $('i-notes').value.trim() };
  let it;
  if (id) {
    it = items.find(x => x.id === id);
    if (!it) return sumiu('Este item foi removido');
    Object.assign(it, data);
  }
  else { it = Object.assign({ id: uid() }, data); items.push(it); }
  upsert('items', it);
  closeAllM(); render(); toast('Item salvo');
});
$('btn-delete-item').addEventListener('click', () => {
  const id = $('i-id').value;
  if (!id || !confirm('Excluir o item e todas as movimentações dele? Lançamentos financeiros vinculados também serão removidos.')) return;
  const mv = moves.filter(m => m.itemId === id);
  // flatMap e não map(linkTrans): compra parcelada guarda o carnê em linkGrupo,
  // e olhar só o linkTrans deixava as parcelas cobrando uma compra apagada.
  const linked = mv.flatMap(lancamentosDaCompra);
  // A nota fiscal fica num registro próprio na nuvem. Apagar só o lançamento
  // deixava a foto lá, sem nada que a alcançasse de volta.
  const saindoItem = new Set(linked);
  bovT.filter(t => linked.includes(t.id)).forEach(t => apagarAnexosDe(t, saindoItem));
  bovT = bovT.filter(t => !linked.includes(t.id));
  moves = moves.filter(m => m.itemId !== id);
  items = items.filter(x => x.id !== id);
  // Apagar o item leva junto as compras dele, e com elas as parcelas a pagar:
  // os avisos no calendário têm de ir junto, senão cobram uma ração que nem
  // existe mais no estoque.
  const avisosDoItem = linked.slice();
  if (detailItem === id) detailItem = null;
  batchWrite([
    { col: 'items', del: id },
    ...mv.map(m => ({ col: 'moves', del: m.id })),
    ...linked.map(t => ({ col: 'bovtrans', del: t }))
  ]).catch(() => toast('Falha ao remover na nuvem — verifique a conexão'));
  closeAllM(); render(); toast('Item excluído');
  agendarMudanca([], 'bov', avisosDoItem);
});

function syncMoveCostUI() {
  const type = document.querySelector('input[name="m-type"]:checked').value;
  $('m-cost-wrap').style.display = type === 'entrada' ? '' : 'none';
}
document.querySelectorAll('input[name="m-type"]').forEach(r => r.addEventListener('change', () => { syncMoveCostUI(); syncPrazoUI(); }));
// "A prazo" só faz sentido para saída de dinheiro: entrada a receber é outra
// coisa, e prometer aqui o que não existe seria pior do que não oferecer.
function syncPrazoUI() {
  const mEnt = document.querySelector('input[name="m-type"]:checked');
  const compra = mEnt && mEnt.value === 'entrada' && $('m-postfin').checked;
  $('m-prazo').closest('.check-lbl').style.display = compra ? '' : 'none';
  $('m-prazo-wrap').style.display = compra && $('m-prazo').checked ? '' : 'none';
  // O bloco de prazo vale para os DOIS sentidos: a prazo para pagar e a prazo
  // para receber. Escondê-lo na entrada era o que impedia registrar uma venda
  // que só vai ser paga em trinta dias.
  $('t-prazo-box').style.display = '';
  $('t-prazo-wrap').style.display = $('t-prazo').checked ? '' : 'none';
  $('t-pago-em-wrap').style.display = $('t-prazo').checked && $('t-pago').checked ? '' : 'none';
  sincronizarSentidoTrans();
}
// Mostra em quanto fica cada parcela antes de salvar: quem parcela quer saber
// o valor da prestação, não o total.
const nParcelasDe = campo => Math.min(36, Math.max(1, Math.round(parseNum($(campo).value) || 1)));
const ritmoDe = pre => { const el = $(pre + '-ritmo'); return el ? el.value : 'mes'; };
const limparDatasParcelas = pre => {
  const b = $(pre + '-datas');
  if (b) { b.innerHTML = ''; b.hidden = true; b.dataset.forma = ''; }
};
// Qual ritmo um carnê que já existe está seguindo. Serve para reabrir uma
// compra parcelada mostrando o que ela tem, em vez de voltar ao padrão e
// reescrever as datas na primeira vez que alguém tocar em Salvar.
function ritmoDetectado(vencs) {
  if (!vencs || vencs.length < 2 || vencs.some(v => !v)) return 'mes';
  if (vencs.every((v, i) => v === vencimentoParcela(vencs[0], i))) return 'mes';
  if (vencs.every((v, i) => v === somarDias(vencs[0], 30 * i))) return '30';
  return 'livre';
}
function preencherDatasParcelas(pre, vencs) {
  const box = $(pre + '-datas'); if (!box || !vencs || !vencs.length) return;
  box.querySelectorAll('.pd-data').forEach(el => {
    const i = Number(el.dataset.parcela);
    if (vencs[i]) el.value = vencs[i];
  });
}
// O que está digitado nas caixas de data, por número de parcela.
function datasEscolhidas(pre) {
  const box = $(pre + '-datas');
  const r = [];
  if (box) box.querySelectorAll('.pd-data').forEach(el => { r[Number(el.dataset.parcela)] = el.value; });
  return r;
}
// Uma caixa de data por parcela, da 2ª em diante — a 1ª é o campo "1º
// vencimento", que já é obrigatório e é de onde as outras saem.
//
// Só redesenha quando a FORMA muda (número de parcelas, ritmo, primeira data).
// Redesenhar a cada tecla do campo de valor apagaria a data que o dedo está
// digitando ao lado, que é o jeito mais rápido de fazer alguém desistir.
function desenharDatasParcelas(pre) {
  const box = $(pre + '-datas'); if (!box) return;
  const n = nParcelasDe(pre + '-parcelas');
  const venc = $(pre + '-venc').value;
  const ritmo = ritmoDe(pre);
  const mostrar = ritmo === 'livre' && n > 1 && !!venc;
  box.hidden = !mostrar;
  const forma = `${n}|${ritmo}|${venc}`;
  if (!mostrar) { box.innerHTML = ''; box.dataset.forma = ''; return; }
  if (box.dataset.forma === forma) return;
  const antigas = datasEscolhidas(pre);
  const padrao = vencimentosDe(venc, n, 'mes');
  box.innerHTML = Array.from({ length: n - 1 }, (_, k) => {
    const i = k + 1;
    return `<label class="mono">${i + 1}ª parcela</label>`
      + `<input type="date" class="pd-data" data-parcela="${i}" value="${antigas[i] || padrao[i]}" />`;
  }).join('');
  box.dataset.forma = forma;
}
// O ritmo só tem sentido com mais de uma parcela, e não tem sentido nenhum ao
// editar uma parcela que já existe: ali se mexe no vencimento DELA, no campo de
// cima, e o resto do carnê continua de pé.
function sincronizarRitmo(pre) {
  const wrap = $(pre + '-ritmo-wrap'); if (!wrap) return;
  const campoN = $(pre + '-parcelas');
  wrap.hidden = campoN.disabled || nParcelasDe(pre + '-parcelas') < 2;
  if (wrap.hidden) { const b = $(pre + '-datas'); if (b) { b.hidden = true; b.innerHTML = ''; b.dataset.forma = ''; } return; }
  desenharDatasParcelas(pre);
}
function resumoParcelas(total, n, venc, ritmo, datas) {
  const vs = parcelasDe(total, n);
  const iguais = vs.every(v => v === vs[0]);
  const vencs = vencimentosDe(venc, n, ritmo, datas);
  // Até seis parcelas as datas aparecem TODAS. É o que se quer conferir antes
  // de salvar — e era justamente o que não se via quando o ritmo era fixo.
  const quando = n <= 6 ? vencs.map(fmtBR).join(' · ')
    : `1ª em ${fmtBR(vencs[0])} · última em ${fmtBR(vencs[n - 1])}`;
  return `${n}× de ${fmtRS(vs[0])}${iguais ? '' : ` (a última de ${fmtRS(vs[vs.length - 1])})`} · ${quando}`;
}
// Só os textos, sem redesenhar nada: é isto que roda quando o dedo está dentro
// de uma das caixas de data.
function notaParcelas() {
  const elT = $('t-parcelas-nota');
  if (elT) {
    const total = parseNum($('t-amount').value), n = nParcelasDe('t-parcelas'), venc = $('t-venc').value;
    // CAMPO TRAVADO = PARCELA QUE JÁ EXISTE, e aí o valor na tela é o DELA, não
    // o da compra. Simular a divisão aqui dividia a parcela de novo: numa conta
    // de R$ 2.892,57 que é uma de duas, a prévia anunciava "2× de R$ 1.446,29"
    // — um carnê que não existe, com datas inventadas, embaixo do valor certo.
    // O carnê de verdade já aparece inteiro no alto da tela.
    const parcelaExistente = $('t-parcelas').disabled;
    elT.textContent = (parcelaExistente || !Number.isFinite(total) || total <= 0 || n < 2 || !venc) ? ''
      : resumoParcelas(total, n, venc, ritmoDe('t'), datasEscolhidas('t'));
  }
  const elM = $('m-parcelas-nota');
  if (elM) {
    const total = (parseNum($('m-qty').value) || 0) * (parseNum($('m-cost').value) || 0);
    const n = nParcelasDe('m-parcelas'), venc = $('m-venc').value;
    elM.textContent = (n > 1 && total > 0 && venc)
      ? resumoParcelas(total, n, venc, ritmoDe('m'), datasEscolhidas('m'))
      : 'Entra em "A pagar" no Financeiro e avisa quando estiver perto de vencer.';
  }
  mostrarValorLido();
}
function previewParcelas() {
  sincronizarRitmo('t'); sincronizarRitmo('m');
  notaParcelas();
}
// O valor de volta, em português, embaixo do campo — antes de salvar.
//
// O ponto é a única coisa no aplicativo que uma pessoa pode escrever querendo
// dizer duas coisas: "1.250" é mil duzentos e cinquenta para quem escreve, e
// era um e vinte e cinco para quem lia. A regra de leitura foi acertada, mas
// regra nenhuma adivinha intenção: o que resolve de verdade é o número
// aparecer escrito do jeito que vai ser salvo, antes do toque em Salvar.
function mostrarValorLido() {
  const el = $('t-amount-lido'); if (!el) return;
  const bruto = $('t-amount').value.trim();
  const v = parseNum(bruto);
  const vale = Number.isFinite(v) && v > 0;
  el.hidden = !bruto;
  el.textContent = !bruto ? ''
    : vale ? '= ' + fmtRS(v)
    : 'Não entendi este valor — escreva os centavos com vírgula (ex: 1.250,50)';
  el.classList.toggle('valor-erro', !!bruto && !vale);
}
['m-prazo', 'm-postfin', 't-prazo', 't-pago'].forEach(id => $(id).addEventListener('change', syncPrazoUI));
// "input" E "change", nos dois. Campo de data é o caso: a caixa nativa do
// iPhone nem sempre dispara "input" quando a data vem do seletor de rolagem —
// e sem o evento a prévia fica parada, mostrando as datas antigas enquanto o
// salvamento grava as novas. Mostrar uma coisa e gravar outra é exatamente o
// defeito que esta tela não pode ter. Os dois tratadores são idempotentes:
// chamar duas vezes não custa nada e não muda resultado.
['m-parcelas', 'm-venc', 'm-qty', 'm-cost', 't-parcelas', 't-venc', 't-amount']
  .forEach(id => ['input', 'change'].forEach(ev => $(id).addEventListener(ev, previewParcelas)));
['t-ritmo', 'm-ritmo'].forEach(id => $(id).addEventListener('change', previewParcelas));
// Mexer numa data escolhida atualiza o resumo, mas NÃO redesenha a lista: o
// redesenho tiraria a caixa debaixo do dedo no meio da digitação.
['t-datas', 'm-datas'].forEach(id =>
  ['input', 'change'].forEach(ev => $(id).addEventListener(ev, notaParcelas)));
document.querySelectorAll('input[name="t-type"]').forEach(r => r.addEventListener('change', syncPrazoUI));
// Apaga os lançamentos que esta compra gerou — a parcela única ou o carnê
// inteiro. Sem isso, editar uma compra parcelada deixaria parcelas órfãs
// cobrando no "A pagar" uma dívida que não existe mais.
// Todos os lançamentos que uma compra gerou: a parcela única OU o carnê
// inteiro. Um lugar só decide isso, porque quem apaga a movimentação, quem
// apaga o item e quem edita a compra precisam apagar exatamente o mesmo
// conjunto — esquecer o carnê num deles deixa parcela cobrando sozinha.
function lancamentosDaCompra(mv) {
  const ids = [];
  if (mv.linkTrans) ids.push(mv.linkTrans);
  if (mv.linkGrupo) bovT.filter(x => x.grupo === mv.linkGrupo).forEach(x => ids.push(x.id));
  return ids;
}
// Devolve os ids que apagou: quem chama precisa deles para cancelar o alarme
// que essas contas já tenham posto no calendário. Apagar a conta e deixar o
// aviso tocando é o mesmo erro de deixar a conta paga tocando.
function limparVinculoCompra(mv) {
  const ids = lancamentosDaCompra(mv);
  if (!ids.length) return [];
  // A nota fiscal anexada some junto com o lançamento que a carregava, senão o
  // arquivo fica na nuvem sem dono — ocupando espaço e sem tela que o abra.
  const saindoCompra = new Set(ids);
  bovT.filter(x => ids.includes(x.id)).forEach(x => apagarAnexosDe(x, saindoCompra));
  bovT = bovT.filter(x => !ids.includes(x.id));
  ids.forEach(id => remove('bovtrans', id));
  mv.linkTrans = null; mv.linkGrupo = null;
  return ids;
}
function openMove(itemId, presetType, m) {
  const it = items.find(x => x.id === itemId);
  if (!it) return;
  $('m-modal-title').textContent = m ? 'Editar movimentação' : (presetType === 'entrada' ? 'Entrada (compra)' : 'Saída (consumo)');
  $('m-context').textContent = `${it.name} — em estoque: ${fmtN(qtyOf(it.id), 1)} ${it.unit}`;
  $('m-id').value = m ? m.id : '';
  $('m-item-id').value = itemId;
  document.querySelector(`input[name="m-type"][value="${m ? m.type : presetType}"]`).checked = true;
  $('m-date').value = m ? m.date : todayISO();
  $('m-qty').value = m ? numParaCampo(m.qty) : '';
  $('m-cost').value = m ? numParaCampo(m.unitCost) : '';
  $('m-postfin').checked = m ? !!(m.linkTrans || m.linkGrupo) : true;
  $('m-notes').value = m ? (m.notes || '') : '';
  const doGrupo = m && m.linkGrupo ? bovT.filter(x => x.grupo === m.linkGrupo).sort((a, b) => a.parcela - b.parcela) : [];
  const tv = doGrupo.length ? doGrupo[0] : (m && m.linkTrans ? bovT.find(x => x.id === m.linkTrans) : null);
  $('m-prazo').checked = !!(tv && tv.venc);
  $('m-venc').value = tv && tv.venc ? tv.venc : '';
  $('m-parcelas').value = doGrupo.length ? doGrupo.length : 1;
  // Reabrir uma compra parcelada tem de mostrar o carnê que ESTÁ lá, com as
  // datas que ele tem. Salvar refaz o carnê do zero: se a tela voltasse sempre
  // em "todo mês", bastaria abrir a compra, tocar em Salvar, e as datas
  // combinadas uma a uma seriam reescritas em silêncio.
  const vencsGrupo = doGrupo.map(x => x.venc);
  $('m-ritmo').value = ritmoDetectado(vencsGrupo);
  limparDatasParcelas('m');
  $('btn-delete-move').hidden = !m;
  syncMoveCostUI(); syncPrazoUI(); previewParcelas();
  preencherDatasParcelas('m', vencsGrupo);
  notaParcelas();
  openM('modal-move');
}
$('form-move').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('m-id').value, itemId = $('m-item-id').value;
  const it = items.find(x => x.id === itemId);
  const type = document.querySelector('input[name="m-type"]:checked').value;
  const date = $('m-date').value, qty = parseNum($('m-qty').value);
  const unitCost = parseNum($('m-cost').value);
  const postFin = $('m-postfin').checked;
  const aPrazo = $('m-prazo').checked;
  const venc = $('m-venc').value;
  const nParcM = aPrazo ? nParcelasDe('m-parcelas') : 1;
  const ritmoM = ritmoDe('m'), datasM = datasEscolhidas('m');
  if (!date || !Number.isFinite(qty) || qty <= 0) return;
  if (type === 'entrada' && postFin && aPrazo && !venc) { toast('Informe o vencimento da compra a prazo'); return; }
  if (type === 'entrada' && postFin && aPrazo && nParcM > 1) {
    const erro = erroDasDatas(venc, nParcM, ritmoM, datasM);
    if (erro) { toast(erro); return; }
  }
  const dupMv = moves.find(x => x.id !== id && x.itemId === itemId && x.date === date && x.type === type && Math.abs(x.qty - qty) < 0.0001);
  if (dupMv) {
    const tipo = type === 'entrada' ? 'entrada' : 'saída';
    if (!askDuplicate(`Já existe uma ${tipo} de ${fmtN(dupMv.qty, dupMv.qty % 1 ? 2 : 0)} ${it.unit} de ${it.name} em ${fmtBRfull(dupMv.date)}${dupMv.notes ? `\nObs.: ${dupMv.notes}` : ''}`)) return;
  }
  let mv;
  // A compra de estoque a prazo também vira conta a pagar: ela tem de ir para
  // o calendário pelo mesmo caminho, senão o automático valeria só para metade
  // das contas — e ninguém adivinharia qual metade.
  let tocadasMv = [], removidosMv = [];
  if (id) {
    mv = moves.find(x => x.id === id);
    if (!mv) return sumiu('Esta movimentação foi removida');
    Object.assign(mv, { type, date, qty, notes: $('m-notes').value.trim() });
  }
  else { mv = { id: uid(), itemId, type, date, qty, notes: $('m-notes').value.trim() }; moves.push(mv); }
  if (type === 'entrada') {
    mv.unitCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;
    const total = mv.unitCost ? qty * mv.unitCost : null;
    // Refaz o vínculo do zero: com parcelamento o número de lançamentos pode
    // mudar entre uma edição e outra, e sobrar parcela velha seria dívida
    // fantasma no "A pagar".
    // Editar uma compra refaz o carnê do zero, com ids novos: as parcelas
    // antigas somem e precisam ser canceladas no calendário, senão sobrariam
    // dois avisos para a mesma dívida.
    removidosMv = limparVinculoCompra(mv);
    if (postFin && total) {
      const base = { date, type: 'saida', amount: total, category: 'Ração/insumos',
        notes: it.name + (mv.notes ? ' — ' + mv.notes : ''), lock: 'stock' };
      if (aPrazo && nParcM > 1) {
        const grupo = uid();
        const partes = montarParcelas({ base, total, venc, n: nParcM, grupo, ritmo: ritmoM, datas: datasM });
        partes.forEach(p => bovT.push(p));
        escreverVarias('bovtrans', partes);
        mv.linkGrupo = grupo; mv.linkTrans = null;
        tocadasMv = partes;
      } else {
        const t = Object.assign({ id: uid() }, base, { venc: aPrazo ? venc : null, pago: false });
        bovT.push(t); upsert('bovtrans', t);
        mv.linkTrans = t.id; mv.linkGrupo = null;
        tocadasMv = [t];
      }
    }
  } else {
    delete mv.unitCost;
    // Entrada que virou saída: a compra deixou de existir, e o carnê dela
    // também. Os avisos têm de ir embora junto.
    removidosMv = limparVinculoCompra(mv);
  }
  upsert('moves', mv);
  closeAllM(); render(); toast('Movimentação salva');
  agendarMudanca(tocadasMv, 'bov', removidosMv);
});
$('btn-delete-move').addEventListener('click', () => {
  const id = $('m-id').value; if (!id || !confirm('Excluir esta movimentação?')) return;
  const mv = moves.find(x => x.id === id);
  // Apagar a compra apaga o carnê inteiro: parcela órfã cobraria uma dívida
  // que não existe mais.
  const sairam = mv ? limparVinculoCompra(mv) : [];
  moves = moves.filter(x => x.id !== id);
  remove('moves', id);
  closeAllM(); render(); toast('Movimentação excluída');
  agendarMudanca([], 'bov', sairam);
});

// ===== Modo pesagem =====
let wmCount = 0;
// A lista sai das pesagens realmente gravadas naquela data, não de uma lista
// guardada em memória: sair e voltar ao modo pesagem mantém tudo à vista, e
// fechar o app também.
function pesagensDoDia(data) {
  return weighings
    .filter(w => w.date === data)
    .map(w => {
      const a = animals.find(x => x.id === w.animalId);
      const anterior = wOf(w.animalId).filter(x => x.date < data).pop();
      const dias = anterior ? daysBetween(anterior.date, data) : 0;
      return {
        id: w.id, ident: a ? a.ident : '?', peso: w.weight,
        gmd: anterior && dias > 0 ? (w.weight - anterior.weight) / dias : null,
        // Sem GMD tem motivo, e o motivo precisa aparecer: um traço sozinho
        // faz parecer defeito quando na verdade o animal não tem histórico.
        motivo: !anterior ? '1ª pesagem' : dias <= 0 ? 'mesmo dia' : ''
      };
    })
    .reverse();   // o último pesado aparece em cima
}

function renderSessao() {
  const el = $('wm-sessao');
  const lista = pesagensDoDia($('wm-date').value);
  if (!lista.length) { el.hidden = true; return; }
  const gmds = lista.map(p => p.gmd).filter(Number.isFinite);
  const media = gmds.length ? gmds.reduce((s, g) => s + g, 0) / gmds.length : null;
  const mediaPeso = lista.reduce((s, p) => s + p.peso, 0) / lista.length;
  el.innerHTML = `
    <div class="ws-media">
      <span class="rot">GMD médio do dia${gmds.length < lista.length ? ` · ${gmds.length} de ${lista.length}` : ''}</span>
      <span class="val ${media != null ? gmdFaixa(media) : ''}">${media != null ? fmtN(media, 3) : '—'}</span>
    </div>
    <div class="ws-media">
      <span class="rot">Peso médio · ${lista.length} ${lista.length === 1 ? 'animal' : 'animais'}</span>
      <span class="val">${fmtN(mediaPeso, 0)} kg</span>
    </div>
    ${lista.map(p => `
      <div class="ws-linha">
        <span class="brinco">${esc(p.ident)}</span>
        <span>${fmtN(p.peso, p.peso % 1 ? 1 : 0)} kg</span>
        <span class="gmd ${Number.isFinite(p.gmd) ? gmdFaixa(p.gmd) : 'g-sem'}">${Number.isFinite(p.gmd) ? fmtN(p.gmd, 3) : esc(p.motivo || '—')}</span>
      </div>`).join('')}`;
  el.hidden = false;
}

// Trava contra erro de digitação: um bovino não ganha 3 kg por dia nem pesa 8 kg.
// Em intervalo curto o GMD não diz nada (o enchimento do rúmen sozinho move
// dezenas de quilos no mesmo dia), então ali a checagem é pela variação do peso.
const GMD_MAX = 2.5, GMD_MIN = -1.0, PESO_MIN = 20, PESO_MAX = 1500;
const DIAS_MIN_GMD = 7, VARIACAO_MAX_CURTA = 0.15;
function pesagemSuspeita(ident, peso, gmd, anterior, dias) {
  if (peso < PESO_MIN || peso > PESO_MAX) {
    return `${ident}: ${fmtN(peso, 1)} kg está fora do esperado para um bovino.`;
  }
  if (!anterior || dias <= 0) return null;
  const antes = anterior.weight;
  const trecho = `${fmtN(antes, 1)} kg em ${fmtBR(anterior.date)} → ${fmtN(peso, 1)} kg em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  if (dias < DIAS_MIN_GMD) {
    const variacao = antes > 0 ? Math.abs(peso - antes) / antes : 0;
    if (variacao > VARIACAO_MAX_CURTA) {
      return `${ident}: ${fmtN(variacao * 100, 0)}% de diferença em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
        + `\n${trecho}\n\nVariação grande demais para tão pouco tempo — confira o peso e o brinco.`;
    }
    return null;
  }
  if (Number.isFinite(gmd) && (gmd > GMD_MAX || gmd < GMD_MIN)) {
    return `${ident}: isso daria ${fmtN(gmd, 3)} kg por dia\n${trecho}`
      + `\n\n${gmd > GMD_MAX ? 'Ganho alto demais para um bovino' : 'Perda de peso muito grande'}`
      + ' — confira o peso digitado e o brinco.';
  }
  return null;
}
function openWeighMode() {
  wmCount = 0;
  $('wm-date').value = todayISO();
  $('wm-ident').value = ''; $('wm-peso').value = '';
  $('wm-last').textContent = ''; $('wm-count').textContent = '';
  $('wm-previa').hidden = true;
  renderSessao();
  wmCampo = 'wm-ident';
  $('wm-virgula').disabled = true;
  $('weigh-mode').hidden = false;
  setTimeout(() => $('wm-ident').focus(), 100);
}
// Prévia do GMD com o animal ainda na balança: mostra como ele vem ganhando
// antes de salvar, para a decisão ser tomada ali mesmo.
const gmdFaixa = g => !Number.isFinite(g) ? '' : g < 0.4 ? 'g-baixo' : g < 0.8 ? 'g-medio' : g < 1.2 ? 'g-bom' : 'g-otimo';
function atualizarPreviaPesagem() {
  const el = $('wm-previa');
  const ident = $('wm-ident').value.trim();
  const peso = parseNum($('wm-peso').value);
  const data = $('wm-date').value;
  // Esconder também limpa: sem isso, o conteúdo do animal ANTERIOR ficava
  // pendurado no DOM, esperando para enganar quem lê a tela.
  if (!ident || !Number.isFinite(peso) || peso <= 0 || !data) {
    el.hidden = true; el.innerHTML = ''; return;
  }

  const arrobas = peso * (settings.yield / 100) / 15;
  const pesoTxt = `${fmtN(peso, peso % 1 ? 1 : 0)} kg · ${fmtN(arrobas, 1)} @`;
  const animal = animalDoBrinco(ident);
  // Mesma regra do salvamento: compara com a última pesagem anterior a esta data
  const anterior = animal ? wOf(animal.id).filter(w => w.date < data).pop() : null;
  const dias = anterior ? daysBetween(anterior.date, data) : 0;
  const gmd = anterior && dias > 0 ? (peso - anterior.weight) / dias : null;

  // A prévia é onde o brinco se confere. Se o animal saiu do rebanho, isso
  // precisa aparecer AQUI, com ele ainda na balança — não só no aviso na hora
  // de salvar, quando quem está no curral já digitou tudo.
  const saiu = animal && animal.dead ? 'morto' : animal && animal.sold ? 'vendido' : null;
  const aviso = saiu ? `<p class="wp-alerta">⚠ este brinco está marcado como ${
    saiu.toUpperCase()}${saiu === 'morto' ? ' — confira se não foi trocado' : ''}</p>` : '';

  if (gmd === null) {
    el.innerHTML = `
      <div class="wp-topo">
        <div class="wp-gmd">${esc(ident)}</div>
        <div class="wp-lado">${pesoTxt}</div>
      </div>
      <p class="wp-nota">${animal ? 'Primeira pesagem deste animal — sem GMD ainda' : 'Brinco novo — o animal será cadastrado'}</p>
      ${aviso}`;
  } else {
    const ganho = peso - anterior.weight;
    // O curral grava cheio, então a mistura que a prévia pode encontrar é com
    // uma pesagem ANTERIOR que foi em jejum — e é justamente essa que precisa
    // ser anunciada com o animal ainda na balança.
    const misturado = !mesmaCondicao(anterior, { jejum: false });
    el.innerHTML = `
      <div class="wp-topo">
        <div class="wp-gmd ${gmdFaixa(gmd)}">${fmtN(gmd, 3)}<span class="un">kg/dia</span></div>
        <div class="wp-lado">${pesoTxt}<br>${ganho >= 0 ? '+' : ''}${fmtN(ganho, ganho % 1 ? 1 : 0)} kg em ${dias} dias</div>
      </div>
      <p class="wp-nota">anterior ${fmtN(anterior.weight, anterior.weight % 1 ? 1 : 0)} kg em ${fmtBR(anterior.date)}${anterior.jejum ? ' (jejum)' : ''}</p>
      ${misturado ? `<p class="wp-alerta">⚠ comparando ${anterior.jejum ? 'jejum com cheio' : 'cheio com jejum'} — o ganho real é ${anterior.jejum ? 'menor' : 'maior'} que este</p>` : ''}
      ${aviso}`;
  }
  el.hidden = false;
}

// No curral não há lista de brincos: o campo é só para digitar. Qualquer lista
// que abre por cima atrapalha quem está com o gado na balança e ainda arrisca
// gravar no animal errado por um toque sem querer. Quem confere o brinco é a
// prévia abaixo, que mostra o peso anterior assim que o número está completo.
const porBrinco = (a, b) => a.ident.localeCompare(b.ident, 'pt-BR', { numeric: true });
['wm-ident', 'wm-peso'].forEach(id => $(id).addEventListener('input', atualizarPreviaPesagem));

// ===== Teclado do curral =====
// Os campos usam inputmode="none": o teclado do sistema não abre. Quem digita
// é o teclado abaixo, com teclas grandes o bastante para dedo sujo e de luva.
// No iPadOS não havia como conseguir isso por atributo — ele só oferece a
// régua inteira, com todos os símbolos e teclas pequenas.
let wmCampo = 'wm-ident';
['wm-ident', 'wm-peso'].forEach(id => $(id).addEventListener('focus', () => {
  wmCampo = id;
  // A vírgula só faz sentido no peso; no brinco ela só atrapalharia.
  $('wm-virgula').disabled = id !== 'wm-peso';
}));
// Escreve na POSIÇÃO DO CURSOR, não no fim: quem toca no meio do número para
// corrigir um dígito espera que a correção caia ali.
function teclar(tecla) {
  const campo = $(wmCampo);
  if (!campo) return;
  const texto = campo.value;
  let ini = campo.selectionStart, fim = campo.selectionEnd;
  // Campo que nunca recebeu cursor devolve null: nesse caso, fim do texto.
  if (ini == null || fim == null) { ini = fim = texto.length; }
  if (tecla === 'apagar') {
    if (ini === fim && ini === 0) return;
    if (ini === fim) ini--;                       // sem seleção: apaga um antes
    campo.value = texto.slice(0, ini) + texto.slice(fim);
  } else {
    // Uma vírgula só, e nunca no brinco.
    if (tecla === ',' && (wmCampo !== 'wm-peso' || texto.includes(','))) return;
    campo.value = texto.slice(0, ini) + tecla + texto.slice(fim);
    ini = ini + tecla.length;
  }
  try { campo.setSelectionRange(ini, ini); } catch (e) { /* campo sem seleção */ }
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}
$('wm-teclado').addEventListener('click', e => {
  const b = e.target.closest('[data-tecla]');
  if (!b || b.disabled) return;
  teclar(b.dataset.tecla);
});
$('wm-date').addEventListener('change', () => { atualizarPreviaPesagem(); renderSessao(); });
$('btn-weigh-mode').addEventListener('click', openWeighMode);
$('wm-close').addEventListener('click', () => { $('weigh-mode').hidden = true; render(); });
$('wm-save').addEventListener('click', () => {
  const ident = $('wm-ident').value.trim();
  const peso = parseNum($('wm-peso').value);
  const date = $('wm-date').value;
  if (!ident || !Number.isFinite(peso) || peso <= 0 || !date) { toast('Preencha brinco e peso'); return; }

  // Confere a plausibilidade ANTES de gravar: com o animal ainda na balança dá
  // para corrigir; depois, o número errado já contaminou o histórico.
  const existente = animalDoBrinco(ident);
  const anteriorCheck = existente ? wOf(existente.id).filter(x => x.date < date).pop() : null;
  const diasCheck = anteriorCheck ? daysBetween(anteriorCheck.date, date) : 0;
  const gmdCheck = anteriorCheck && diasCheck > 0 ? (peso - anteriorCheck.weight) / diasCheck : null;
  const suspeita = pesagemSuspeita(ident, peso, gmdCheck, anteriorCheck, diasCheck);
  if (suspeita && !confirm(`⚠️ CONFIRA ESTA PESAGEM\n\n${suspeita}\n\nGravar assim mesmo?`)) {
    $('wm-peso').select(); $('wm-peso').focus();
    return;
  }
  // Brinco de animal que saiu do rebanho: avisa em vez de criar uma cópia
  // escondida. A pesagem entra no histórico verdadeiro, então o GMD continua.
  // Um animal morto reaparecendo na balança quase sempre é brinco trocado.
  const saiu = existente && (existente.sold || existente.dead) ? (existente.sold ? 'VENDIDO' : 'MORTO') : null;
  if (saiu && !confirm(`O brinco ${existente.ident} está marcado como ${saiu}.\n\n`
      + (saiu === 'MORTO' ? 'Confira se o brinco não foi trocado.\n\n' : '')
      + 'Gravar a pesagem no histórico dele mesmo assim?')) {
    $('wm-ident').select(); $('wm-ident').focus();
    return;
  }

  let a = existente;
  let createdNew = false;
  if (!a) {
    a = { id: uid(), ident, cat: '', entryDate: date, entryWeight: null, notes: '' };
    animals.push(a); upsert("animals", a); createdNew = true;
  }
  // Esta fazenda não pesa em jejum: o curral grava sempre peso cheio, e o
  // controle foi tirado da tela de propósito — uma caixa que ninguém usa é uma
  // caixa que alguém marca sem querer, e aí o dia inteiro fica com a condição
  // errada. Pesagem em jejum, quando houver, entra pelo cadastro do animal,
  // onde a marcação existe e é consciente.
  const jejum = false;
  const ws = wOf(a.id);
  const sameDay = ws.find(w => w.date === date);
  let replaced = false, w;
  if (sameDay) { w = sameDay; Object.assign(w, { weight: peso, jejum }); replaced = true; }
  else { w = { id: uid(), animalId: a.id, date, weight: peso, jejum, notes: '' }; weighings.push(w); }
  const prev = wOf(a.id).filter(x => x.date < date).pop();
  const g = prev ? gmdBetween(prev, { date, weight: peso }) : null;
  upsert('weighings', w);
  wmCount++;
  renderSessao();
  $('wm-count').textContent = `${wmCount} pesagen${wmCount > 1 ? 's' : ''} nesta sessão`;
  $('wm-last').textContent = `✓ ${a.ident} · ${fmtN(peso, 1)} kg` +
    (Number.isFinite(g) ? ` · GMD ${fmtN(g, 3)} (desde ${fmtBR(prev.date)})` : createdNew ? ' · novo animal' : replaced ? ' · atualizada' : ' · 1ª pesagem');
  $('wm-ident').value = ''; $('wm-peso').value = '';
  $("wm-previa").hidden = true;
  $("wm-ident").focus();
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
    const limpa = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    const cabecalho = limpa(lines[0]);
    const temCabecalho = /ident|animal|brinco/i.test(cabecalho[0]);
    // Achar as colunas pelo NOME, e não pela posição. O arquivo que o próprio
    // aplicativo exporta tem dezenove colunas, com a data na TERCEIRA — lido
    // por posição, ele acusava "data inválida: Novilha" em cada linha e não
    // importava nada. Exportar e reimportar é o caminho natural de quem quer
    // corrigir pesos na planilha e trazer de volta, e o aplicativo não lia o
    // que ele mesmo tinha escrito.
    //
    // A ordem dos nomes importa: "data_entrada", "manejo_data", "peso_entrada"
    // e "peso_venda" também existem no arquivo, e são outra coisa.
    const acha = (...nomes) => {
      for (const n of nomes) {
        const k = cabecalho.findIndex(c => n.test(c));
        if (k >= 0) return k;
      }
      return -1;
    };
    const iIdent = temCabecalho ? acha(/^identifica/i, /^ident/i, /brinco/i, /^animal/i) : 0;
    const iData = temCabecalho ? acha(/^data$/i, /^data_pesagem$/i, /^date$/i) : 1;
    const iPeso = temCabecalho ? acha(/^peso$/i, /^peso_kg$/i, /^weight$/i) : 2;
    // Cabeçalho que não nomeia as três: volta para as três primeiras colunas,
    // que é o formato do modelo e o que uma planilha simples produz.
    const ci = iIdent >= 0 ? iIdent : 0;
    const cd = iData >= 0 ? iData : 1;
    const cp = iPeso >= 0 ? iPeso : 2;
    const maior = Math.max(ci, cd, cp);
    const rows = []; const errors = [];
    lines.forEach((line, i) => {
      const cols = limpa(line);
      if (i === 0 && temCabecalho) return;
      if (cols.length <= maior) { errors.push(`Linha ${i + 1}: menos de ${maior + 1} colunas`); return; }
      const ident = cols[ci];
      const date = parseDateFlex(cols[cd]);
      const peso = parseNum(cols[cp]);
      // Linha sem data E sem peso é um animal que ainda não foi pesado: ele sai
      // no arquivo exportado e não é erro nenhum, é só uma linha sem pesagem.
      if (!cols[cd] && !cols[cp]) return;
      if (!ident) { errors.push(`Linha ${i + 1}: identificação vazia`); return; }
      if (!date) { errors.push(`Linha ${i + 1}: data inválida "${cols[cd]}"`); return; }
      if (!Number.isFinite(peso) || peso <= 0) { errors.push(`Linha ${i + 1}: peso inválido "${cols[cp]}"`); return; }
      rows.push({ ident, date, peso });
    });
    const existingIdents = new Set(animals.filter(noRebanho).map(a => chaveBrinco(a.ident)));
    const newIdents = new Set(rows.map(r => chaveBrinco(r.ident)).filter(x => !existingIdents.has(x)));
    let dupes = 0;
    rows.forEach(r => {
      const a = animalDoBrinco(r.ident);
      if (a && weighings.some(w => w.animalId === a.id && w.date === r.date)) dupes++;
    });
    // Mesma checagem do modo pesagem: arquivo ruim não pode contaminar o histórico
    const suspeitas = [];
    rows.forEach(r => {
      const a = animalDoBrinco(r.ident);
      const ant = a ? wOf(a.id).filter(w => w.date < r.date).pop() : null;
      const d = ant ? daysBetween(ant.date, r.date) : 0;
      const g = ant && d > 0 ? (r.peso - ant.weight) / d : null;
      const aviso = pesagemSuspeita(r.ident, r.peso, g, ant, d);
      if (aviso) suspeitas.push(aviso.split('\n')[0]);
    });
    pendingRows = rows;
    $('preview-stats').innerHTML = `<b>${rows.length}</b> pesagens válidas · <b>${newIdents.size}</b> animais novos serão criados · <b>${dupes}</b> duplicatas serão ignoradas${errors.length ? ` · <b>${errors.length}</b> linhas com erro` : ''}`
      + (suspeitas.length ? `<br><span class="aviso-suspeita">⚠ <b>${suspeitas.length}</b> pesagem(ns) com número fora do esperado: ${suspeitas.slice(0, 3).map(esc).join(' · ')}${suspeitas.length > 3 ? ' …' : ''}</span>` : '');
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
    let a = animalDoBrinco(r.ident);
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
// Campo de CSV: aspas quando houver separador, aspas ou quebra de linha —
// sem isso, um brinco com ";" ou uma observação com quebra de linha desalinha
// as colunas e corrompe a planilha inteira.
function csv(v) {
  // Quebra de linha dentro de um campo é CSV válido, mas parte o registro em
  // duas linhas no arquivo: conferir "uma linha por lançamento" deixa de
  // funcionar, e importador simples lê o pedaço de baixo como registro novo.
  // Numa observação de fazenda a quebra não carrega informação — vira ponto.
  let t = String(v == null ? '' : v).replace(/\s*[\r\n]+\s*/g, ' · ');
  // Excel e Planilhas tratam texto começado em = + - @ como FÓRMULA e a
  // EXECUTAM ao abrir o arquivo. Uma observação digitada como =HYPERLINK(...)
  // roda na máquina do contador. Estes arquivos existem para sair da fazenda,
  // então o texto vai neutralizado com uma apóstrofe, que a planilha não mostra.
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[;"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
// O BOM \u00e9 para o Excel: sem ele, planilha em portugu\u00eas abre "Ra\u00e7\u00e3o" torto. Mas
// arquivo de calend\u00e1rio n\u00e3o \u00e9 planilha \u2014 leitor rigoroso engasga com o BOM
// antes do BEGIN:VCALENDAR, ent\u00e3o ele \u00e9 opcional.
// Aplicativo instalado na tela de in\u00edcio do iPhone. A\u00ed dentro, o clique que o
// PROGRAMA d\u00e1 num link de download n\u00e3o produz nada: sem arquivo, sem erro, sem
// aviso. Quem toca em exportar v\u00ea a tela n\u00e3o mudar e conclui que o aplicativo
// est\u00e1 com defeito \u2014 e n\u00e3o h\u00e1 como saber se falhou ou se o arquivo foi parar
// em algum canto. Foi o que aconteceu com a agenda do calend\u00e1rio, e o mesmo
// valia, calado, para TODOS os CSVs.
//
// O teste \u00e9 estreito de prop\u00f3sito: s\u00f3 iPhone/iPad E instalado. No Safari
// comum, e no computador, o download direto funciona e continua sendo o
// caminho \u2014 troc\u00e1-lo por uma tela seria estorvo onde n\u00e3o h\u00e1 problema.
function noIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function instalado() {
  try {
    return window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch (e) { return false; }
}
function precisaDaTela() { return noIOS() && instalado(); }
// resumo: o que o arquivo tem dentro, em uma linha. No iPhone instalado a tela
// de saída mostrava só o NOME do arquivo — e "não sei se saiu tudo" não tem
// resposta possível olhando um nome. Com o resumo, o número de lançamentos e o
// período aparecem antes de abrir o arquivo.
function download(name, content, mime, comBom, resumo) {
  const texto = comBom === false ? content : '\ufeff' + content;
  const blob = new Blob([texto], { type: (mime || 'text/plain') + ';charset=utf-8' });
  if (precisaDaTela()) {
    // O texto de reserva vai SEM o marcador do Excel — copiado com ele, o
    // primeiro caractere seria um invisível que estraga o arquivo colado.
    mostrarSaida({ nome: name, blob, resumo: resumo ? name + ' · ' + resumo : name, cru: content });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}
// Número em português para planilha: 370,5 e não 370.5.
const numCsv = (n, c) => Number.isFinite(n) ? (c == null ? String(n).replace('.', ',') : fmtN(n, c)) : '';
$('menu-exp-pes').addEventListener('click', () => {
  // O que faltava aqui não era linha: era COLUNA. Saíam brinco, data e peso —
  // e ficavam de fora a categoria, o GMD (o número que a fazenda inteira
  // acompanha), a arroba e tudo sobre a saída do animal. E o animal cadastrado
  // ainda não pesado não saía de jeito nenhum, porque o arquivo era montado a
  // partir das pesagens: o arquivo mostrava um rebanho menor do que o real.
  const rows = ['identificacao;categoria;raca;data;peso_kg;arrobas;gmd_kg_dia;dias_desde_anterior;'
    + 'jejum;situacao;data_entrada;peso_entrada;manejo_data;manejo_medicamento;'
    + 'data_saida;peso_venda;preco_venda;preco_arroba_venda;causa_morte;observacoes;obs_animal'];
  const situacaoDe = a => !a ? 'desconhecido' : a.dead ? 'morto' : a.sold ? 'vendido' : 'rebanho';
  const saidaDe = a => !a ? '' : a.dead ? (a.deadDate || '') : a.sold ? (a.soldDate || '') : '';
  const linha = (a, w, gmd, dias) => [
    csv(a ? a.ident : '?'),
    csv(a ? (a.cat || '') : ''),
    csv(a ? (a.raca || '') : ''),
    w ? fmtBRfull(w.date) : '',
    w ? numCsv(w.weight) : '',
    w ? numCsv(arrobasDe(w.weight, settings.yield), 2) : '',
    Number.isFinite(gmd) ? numCsv(gmd, 3) : '',
    Number.isFinite(dias) ? String(dias) : '',
    w ? (w.jejum ? 'sim' : 'nao') : '',
    situacaoDe(a),
    a && a.entryDate ? fmtBRfull(a.entryDate) : '',
    a && Number.isFinite(a.entryWeight) ? numCsv(a.entryWeight) : '',
    // Manejo sanitário: a carência do medicamento decide se o animal pode ir
    // para o abate. Estava no cadastro e não saía em exportação nenhuma.
    a && a.manejoData ? fmtBRfull(a.manejoData) : '',
    csv(a && a.manejoMedicamento ? a.manejoMedicamento : ''),
    saidaDe(a) ? fmtBRfull(saidaDe(a)) : '',
    a && Number.isFinite(a.soldWeight) ? numCsv(a.soldWeight) : '',
    a && Number.isFinite(a.soldPrice) ? fmtN(a.soldPrice, 2) : '',
    // O preço por arroba já sai calculado: é a conta que o contador e o sócio
    // refariam na planilha, e refazer conta à mão é onde entra o erro.
    a && arrobaDoAnimal(a) != null ? fmtN(arrobaDoAnimal(a), 2) : '',
    csv(a && a.deadCause ? a.deadCause : ''),
    csv(w ? w.notes : ''),
    // A observação do cadastro é outra coisa que a da pesagem, e some se as
    // duas dividirem a mesma coluna.
    csv(a && a.notes ? a.notes : '')
  ].join(';');

  // Uma linha por pesagem, em ordem de data, com o ganho desde a anterior DO
  // MESMO animal — é assim que a planilha reproduz o que a tela mostra.
  const linhas = [];
  weighings.slice().sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0).forEach(w => {
    const a = animals.find(x => x.id === w.animalId);
    const hist = a ? wOf(a.id) : [];
    const anterior = hist.filter(x => x.date < w.date).pop();
    const dias = anterior ? daysBetween(anterior.date, w.date) : null;
    const gmd = anterior && dias > 0 ? (w.weight - anterior.weight) / dias : null;
    linhas.push({ data: w.date, texto: linha(a, w, gmd, dias) });
  });
  // E os animais que ainda não passaram pela balança, para o arquivo bater com
  // a contagem do rebanho.
  const pesados = new Set(weighings.map(w => w.animalId));
  animals.filter(a => !pesados.has(a.id)).forEach(a => {
    linhas.push({ data: a.entryDate || '', texto: linha(a, null, null, null) });
  });
  linhas.sort((x, y) => x.data < y.data ? -1 : x.data > y.data ? 1 : 0);
  linhas.forEach(l => rows.push(l.texto));

  download('pesagens-fazendajs.csv', rows.join('\n'), 'text/csv');
  fecharMenu();
  toast(`CSV exportado · ${weighings.length} pesagens · ${animals.length} animais`);
});
// Nome do arquivo por livro. Sem o Geral aqui, o CSV dele saía com o nome de
// Bovinos e sobrescrevia o outro na pasta de downloads.
const ARQ_LIVRO = { bov: 'bovinos', av: 'aviarios', ger: 'geral' };
// Nome de arquivo da atividade criada pela fazenda. Sem isto, o nome caía em
// "financeiro-bovinos" para qualquer atividade: exportar a Soja e depois os
// Bovinos dava DOIS arquivos com o mesmo nome, e o segundo parecia ter perdido
// os lançamentos do primeiro — ou pior, um sobrescrevia o outro na pasta.
const arqLivro = b => ARQ_LIVRO[b]
  || (semAcento(NOME_LIVRO[b] || String(b)).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'atividade');
const ORIGEM = { stock: 'compra de estoque', animal: 'venda de animal' };
// O arquivo do financeiro, lançamento por lançamento, em ordem de data. É este
// que vai para o contador, para o banco e para a planilha — e por isso ele
// carrega TUDO: sem filtro de período, de regime nem de busca, e com uma coluna
// dizendo de qual atividade é cada linha, inclusive as atividades criadas pela
// fazenda (que antes só apareciam no arquivo da fazenda inteira).
//
// Quatro coisas faziam o arquivo parecer incompleto, e eram todas verdade:
//
//  · a data saía só em dd/mm/aaaa. Planilha configurada em inglês lê isso como
//    mês/dia: o primeiro clique no cabeçalho reordena o arquivo inteiro e a
//    ordem de data que ele tinha se perde na mão de quem abriu. A primeira
//    coluna agora é aaaa-mm-dd, que ordena igual em qualquer programa e em
//    qualquer idioma;
//  · o valor saía só em português (1.250,50), que fora do Brasil não é número.
//    Vai junto o mesmo valor com ponto decimal, para a planilha somar;
//  · não havia como CONFERIR se o arquivo veio inteiro. Agora cada linha leva o
//    saldo acumulado: se o último saldo não for o saldo da fazenda, falta linha
//    — e a coluna mostra em qual dia a conta deixou de fechar;
//  · lançamentos no mesmo dia saíam em ordem indefinida. A ordem agora é
//    completa — data, vencimento, atividade, parcela, id — e o mesmo arquivo
//    sai igual duas vezes, o que permite comparar um com o outro.
//
// pago_em e não só "sim": contabilidade em regime de caixa precisa da data em
// que o dinheiro SAIU, não da data em que a conta venceu. E a coluna da nota
// fiscal é o que liga o lançamento ao documento na hora da declaração.
const COLS_FIN = 'data_iso;data;atividade;tipo;valor;valor_numero;saldo_acumulado;'
  + 'categoria;classificacao;parcela;vencimento;venc_iso;pago;pago_em;'
  + 'nota_fiscal;origem;descricao;id';
// Número para planilha estrangeira: ponto decimal, sem separador de milhar.
const numPlano = v => Number.isFinite(v) ? v.toFixed(2) : '';
const linhaFin = (t, nome, saldoCent) => {
  const cat = t.category || '';
  return [
    t.date || '', fmtBRfull(t.date), csv(nome || ''), t.type,
    fmtN(t.amount, 2), numPlano(t.amount), numPlano(saldoCent / 100),
    csv(cat), classOf(cat, t.type),
    t.parcelas > 1 ? `${t.parcela}/${t.parcelas}` : '',
    t.venc ? fmtBRfull(t.venc) : '', t.venc || '',
    t.venc ? (t.pago ? 'sim' : 'nao') : '',
    t.pagoEm ? fmtBRfull(t.pagoEm) : '',
    csv((t.anexos || []).map(a => a.nome).join(' | ')),
    ORIGEM[t.lock] || 'lançamento manual',
    csv(t.notes), t.id || ''
  ].join(';');
};
const porData = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
// Ordem COMPLETA: dois lançamentos nunca ficam em ordem indefinida. Sem os
// critérios de desempate, o arquivo saía numa ordem num aparelho e noutra em
// outro, e comparar dois arquivos do mesmo mês ficava impossível.
const ordemFin = (x, y) => {
  const t1 = x.t, t2 = y.t;
  return String(t1.date || '').localeCompare(String(t2.date || ''))
    || String(t1.venc || '').localeCompare(String(t2.venc || ''))
    || String(x.nome || '').localeCompare(String(y.nome || ''), 'pt-BR')
    || ((t1.parcela || 0) - (t2.parcela || 0))
    || String(t1.id || '').localeCompare(String(t2.id || ''));
};
// Monta as linhas já ordenadas, com o saldo acumulado em CENTAVOS inteiros: em
// ponto flutuante, mil linhas de centavo deixam o saldo final errado na casa
// decimal, e um saldo que não fecha é exatamente o que faz o dono desconfiar
// (com razão) de que falta lançamento.
function linhasFinanceiro(pares) {
  let saldo = 0;
  return pares.slice().sort(ordemFin).map(({ t, nome }) => {
    saldo += (t.type === 'entrada' ? 1 : -1) * Math.round(t.amount * 100);
    return linhaFin(t, nome, saldo);
  });
}
// O que a tela diz depois de gerar o arquivo. Era só o nome do arquivo — e
// "não sei se saiu tudo" não tem resposta possível olhando um nome. Agora diz
// quantos lançamentos foram, de que dia a que dia, e quanto somam.
function resumoFin(pares, curto) {
  const datas = pares.map(p => p.t.date).filter(Boolean).sort();
  const soma = tipo => pares.filter(p => p.t.type === tipo)
    .reduce((a, p) => a + Math.round(p.t.amount * 100), 0) / 100;
  const base = `${pares.length} lançamento(s)`
    + (datas.length ? ` · ${fmtBRfull(datas[0])} a ${fmtBRfull(datas[datas.length - 1])}` : '');
  // O aviso que passa na tela tem segundos para ser lido e vira um bloco de
  // quatro linhas se levar tudo; as somas ficam na tela do arquivo, que fica.
  return curto ? base
    : base + ` · entradas ${fmtRS(soma('entrada'))} · saídas ${fmtRS(soma('saida'))}`;
}
function exportFin(book) {
  const nome = NOME_LIVRO[book] || String(book);
  const pares = arrLivro(book).map(t => ({ t, nome }));
  const arquivo = `financeiro-${arqLivro(book)}-fazendajs.csv`;
  const resumo = resumoFin(pares);
  download(arquivo, [COLS_FIN, ...linhasFinanceiro(pares)].join('\n'), 'text/csv', undefined,
    `${nome} · ${resumo}`);
  fecharMenu();
  toast(`CSV de ${nome} · ${resumoFin(pares, true)}`);
}
// "Geral" é o nome do TERCEIRO livro — os custos da sede que não são de
// bovinos nem de aviários. Quem lê "exportar financeiro Geral" entende
// "exportar tudo", pede o arquivo e recebe um punhado de linhas achando que
// perdeu o resto. Esta aqui é a que exporta mesmo a fazenda inteira: os três
// livros fixos E cada atividade criada pela fazenda.
function exportFinTudo() {
  const pares = LIVROS.flatMap(b => arrLivro(b).map(t => ({ t, nome: NOME_LIVRO[b] })));
  const resumo = resumoFin(pares);
  const quantas = LIVROS.length;
  download('financeiro-fazenda-inteira-fazendajs.csv',
    [COLS_FIN, ...linhasFinanceiro(pares)].join('\n'), 'text/csv', undefined,
    `Fazenda inteira · ${resumo}`);
  fecharMenu();
  toast(`CSV da fazenda inteira · ${resumoFin(pares, true)} · ${quantas} atividade(s)`);
}
// Os CSVs de dados trazem linha por linha, e é o que o contador quer. Quem
// administra a fazenda precisa do FECHAMENTO: quanto entrou, quanto saiu, por
// atividade, por natureza, por categoria, o que ainda se deve, e como estão o
// rebanho e o estoque. Tudo isso existia só na tela — não dava para levar para
// o banco, para o sócio nem para o contador.
// Quatro colunas fixas (secao;item;valor;detalhe) porque um arquivo com blocos
// de larguras diferentes abre torto em qualquer planilha.
// TRÊS relatórios, porque auditoria se faz por atividade.
//
// Havia um só, da fazenda inteira. Para auditar, isso não serve: quem confere
// Bovinos precisa dos números de Bovinos, sem os aviários no meio, e quem olha
// o consolidado precisa saber exatamente o que entrou nele. Um relatório que
// mistura as duas coisas obriga o auditor a desfazer a soma na mão — e é aí que
// aparece divergência que não existe.
//
//   Bovinos   — o livro dos bovinos, com rebanho, GMD, estoque e custo da arroba
//   Aviários  — o livro dos aviários, só dinheiro
//   Fazenda   — TUDO: os três livros fixos e cada atividade criada, consolidado
//
// Cada um diz, na primeira linha, o que entra e o que NÃO entra nele. Relatório
// de auditoria que não declara o próprio escopo é relatório que não dá para
// auditar: quem lê não tem como saber se a diferença é erro ou é recorte.
const ESCOPOS = {
  bov: { nome: 'Bovinos', arquivo: 'bovinos', livros: ['bov'], rebanho: true },
  av: { nome: 'Aviários', arquivo: 'aviarios', livros: ['av'], rebanho: false },
  fazenda: { nome: 'Fazenda inteira', arquivo: 'fazenda', livros: null, rebanho: true }
};
function exportRelatorio(qual) {
  const esc = ESCOPOS[qual] || ESCOPOS.fazenda;
  const livros = esc.livros;
  const nomesNoEscopo = (livros || LIVROS).map(b => NOME_LIVRO[b]);
  const R = resumoFazenda('all', undefined, undefined, livros);
  const linhas = [];
  // ENTRADA E SAÍDA EM COLUNAS SEPARADAS.
  //
  // O relatório saía com uma coluna "valor" só, e o sentido do dinheiro ficava
  // escondido dentro do texto da linha — "Venda de gado (entrada)" ao lado de
  // "Ração/insumos (saída)", os dois com número positivo, na mesma coluna.
  // Para conferir, era preciso LER cada linha para saber se aquele dinheiro
  // entrou ou saiu, e somar coluna nenhuma dava resultado nenhum.
  //
  // Agora cada linha de dinheiro ocupa a coluna do seu lado, e o saldo sai
  // feito. Quem confere seleciona a coluna "entradas" na planilha e vê o total;
  // faz o mesmo em "saidas"; e compara com a linha TOTAL de cada bloco, que
  // existe justamente para o bloco fechar sozinho.
  //
  // E os números saem SEM a apóstrofe de proteção. Ela existe para texto que
  // começa com = + - @ (uma observação digitada como =HYPERLINK roda na
  // máquina do contador), mas num campo numérico ela transformava o valor
  // negativo em TEXTO: a planilha mostrava '-700,00 e não somava a coluna.
  const num = v => (v == null || !Number.isFinite(v)) ? '' : fmtN(v, 2);
  const linha = (secao, item, ent, sai, saldo, valor, detalhe) =>
    linhas.push([csv(secao), csv(item), num(ent), num(sai), num(saldo),
      valor == null ? '' : csv(String(valor)), csv(detalhe || '')].join(';'));
  // movimento: entrou, saiu, e o saldo da linha já calculado
  const mov = (secao, item, ent, sai, detalhe) =>
    linha(secao, item, ent, sai, (ent || 0) - (sai || 0), null, detalhe);
  // conta em aberto: é compromisso, não movimento — por isso sem saldo, para
  // não ser somado junto com o que já aconteceu
  const conta = (secao, item, ent, sai, detalhe) =>
    linha(secao, item, ent, sai, null, null, detalhe);
  // linha que não é dinheiro: escopo, rebanho, GMD, estoque
  const info = (secao, item, valor, detalhe) =>
    linha(secao, item, null, null, null, valor, detalhe);

  // ---- o escopo, antes de qualquer número ----
  info('Relatório', 'Escopo', esc.nome, 'atividades somadas: ' + nomesNoEscopo.join(' + '));
  if (!livros) {
    info('Relatório', 'O que entra', 'tudo',
      `os ${LIVROS.length} livros da fazenda, inclusive as atividades criadas`);
  } else {
    const fora = LIVROS.filter(b => livros.indexOf(b) < 0).map(b => NOME_LIVRO[b]);
    info('Relatório', 'O que NÃO entra', fora.length ? fora.join(' + ') : 'nada',
      fora.length ? 'está no relatório da Fazenda inteira' : '');
  }
  info('Relatório', 'Gerado em', fmtBRfull(todayISO()), 'versão ' + VERSAO + ' do aplicativo');
  info('Relatório', 'Arquivo de lançamentos correspondente',
    'financeiro-' + (livros ? arqLivro(livros[0]) : 'fazenda-inteira') + '-fazendajs.csv',
    'o relatório resume — o arquivo traz linha por linha, em ordem de data');

  // ---- o movimento do período, numa linha só ----
  // Eram três linhas (receitas, custos, saldo) que o olho tinha de juntar.
  mov('Resumo', 'MOVIMENTO DO PERÍODO', R.receitas, R.custos,
    `${R.n} lançamento(s) · todos, sem filtro de mês nem de busca`);
  // Compromisso não é movimento: fica na coluna "valor" para não ser somado
  // junto com o dinheiro que já entrou ou saiu.
  info('Resumo', 'Ainda a pagar', fmtN(R.aPagarTotal, 2),
    `${R.contas.length} conta(s) · uma por uma na seção A pagar`);
  info('Resumo', 'Ainda a receber', fmtN(R.aReceberTotal, 2),
    `${R.recebimentos.length} conta(s) · uma por uma na seção A receber`);

  // ---- caixa: o mesmo dinheiro pela data em que ele andou ----
  // As duas visões saem juntas, sempre. Exportar só uma obrigaria quem lê a
  // adivinhar qual é — e as duas respondem perguntas diferentes.
  const C = resumoFazenda('all', 'caixa', undefined, livros);
  mov('Caixa', 'RECEBIDO E PAGO', C.receitas, C.custos,
    'pela data em que o dinheiro entrou ou saiu de verdade');
  info('Caixa', 'Falta pagar', fmtN(R.aPagarTotal, 2),
    'conta a prazo não entra no caixa até ser paga');
  info('Caixa', 'Falta receber', fmtN(R.aReceberTotal, 2),
    'venda a prazo não entra no caixa até o dinheiro cair');

  // ---- por atividade, com total que fecha ----
  // Num relatório de uma atividade só, a quebra seria uma linha repetindo o
  // resumo — e linha repetida em relatório de conferência é convite a erro.
  if (!livros || livros.length > 1) {
    R.atividades.forEach(a => mov('Atividade', a.nome, a.entrada, a.saida,
      `${a.n} lançamento(s)`));
    mov('Atividade', 'TOTAL das atividades', R.receitas, R.custos,
      'tem de ser igual ao MOVIMENTO DO PERÍODO');
  }

  // ---- por natureza, com total que fecha ----
  // Receita é entrada; custeio e investimento são saída. Com as duas colunas,
  // a natureza deixa de ser uma lista de números soltos e passa a somar.
  const recClasse = R.classes['Receita'] || 0;
  const custeio = R.classes['Custeio'] || 0;
  const invest = R.classes['Investimento'] || 0;
  mov('Natureza', 'Receita', recClasse, null, 'tudo o que entrou');
  mov('Natureza', 'Custeio', null, custeio, 'o que some no ciclo');
  mov('Natureza', 'Investimento', null, invest, 'vira patrimônio, não some no ciclo');
  mov('Natureza', 'TOTAL das naturezas', recClasse, custeio + invest,
    'tem de ser igual ao MOVIMENTO DO PERÍODO');

  // ---- por categoria, cada uma do seu lado ----
  R.categorias.forEach(([chave, v]) => {
    const [tp, cat] = chave.split('|');
    const ehEntrada = tp !== 'saida';
    mov('Categoria', cat, ehEntrada ? v : null, ehEntrada ? null : v,
      ehEntrada ? 'entrada' : 'saída');
  });
  mov('Categoria', 'TOTAL das categorias', R.receitas, R.custos,
    'tem de ser igual ao MOVIMENTO DO PERÍODO');

  // ---- o que se deve e o que se tem para receber ----
  R.contas.forEach(({ t, livro }) => conta('A pagar',
    `${livro} · ${t.category || 'Sem categoria'}${rotuloParcela(t)}`, null, t.amount,
    `vence ${fmtBRfull(t.venc)} · ${t.dias < 0 ? `venceu há ${-t.dias} dia(s)` : t.dias === 0 ? 'vence hoje' : `em ${t.dias} dia(s)`}`));
  conta('A pagar', 'TOTAL a pagar', null, R.aPagarTotal, `${R.contas.length} conta(s) em aberto`);
  R.recebimentos.forEach(({ t, livro }) => conta('A receber',
    `${livro} · ${t.category || 'Sem categoria'}${rotuloParcela(t)}`, t.amount, null,
    `previsto ${fmtBRfull(t.venc)} · ${t.dias < 0 ? `atrasado há ${-t.dias} dia(s)` : t.dias === 0 ? 'hoje' : `em ${t.dias} dia(s)`}`));
  conta('A receber', 'TOTAL a receber', R.aReceberTotal, null,
    `${R.recebimentos.length} conta(s) em aberto`);

  // ---- rebanho, GMD, estoque e custo da arroba: só onde fazem sentido ----
  if (esc.rebanho) {
    // O desempenho mês a mês é o que o sócio e o banco perguntam depois do
    // dinheiro: não adianta saber quanto entrou sem saber se o gado ganhou.
    const gger = gmdGeralRebanho();
    if (gger.gmd != null) {
      info('GMD do rebanho', 'Da 1ª pesagem de cada animal até a mais recente',
        numCsv(gger.gmd, 3) + ' kg/dia',
        `${gger.n} animal(is) · ${numCsv(gger.kg, 1)} kg em ${gger.dias} dias-animal`
        + (gger.primeira ? ` · ${fmtBRfull(gger.primeira)} a ${fmtBRfull(gger.ultima)}` : ''));
    }
    const gmes = gmdPorMes();
    gmes.meses.slice(0, 24).forEach(m => {
      info('GMD mês a mês', rotuloMesCurto(m.mes), numCsv(m.gmd, 3) + ' kg/dia',
        `${m.animais} animal(is) · ${m.dias} dias-animal · ${numCsv(m.kg, 1)} kg`);
    });
    if (gmes.misturados) {
      info('GMD mês a mês', 'Intervalos fora da conta', String(gmes.misturados),
        'comparavam jejum com cheio');
    }

    // Rebanho: os mesmos números da tela do Rebanho e da Mortalidade, para o
    // relatório e o aplicativo nunca contarem histórias diferentes.
    const noRebanhoAgora = animals.filter(noRebanho);
    const vendidos = animals.filter(a => a.sold && !a.dead);
    const mortos = animals.filter(a => a.dead);
    const pesoDe = a => { const ws = wOf(a.id); return ws.length ? ws[ws.length - 1].weight : null; };
    const pesos = noRebanhoAgora.map(pesoDe).filter(Number.isFinite);
    const kgTotal = pesos.reduce((s2, w) => s2 + w, 0);
    const gmds = noRebanhoAgora.map(a => gmdTotal(wOf(a.id))).filter(Number.isFinite);
    const base = noRebanhoAgora.length + mortos.length;
    // O estoque por CABEÇA vem antes da contagem por ficha: são números
    // diferentes de propósito, e o relatório precisa dizer os dois para que
    // ninguém some um com o outro achando que é o mesmo rebanho.
    const SR = saldoRebanho();
    if (SR.temMovimento) {
      info('Rebanho', 'Estoque de gado (cabeças)', String(SR.saldo),
        `entradas ${SR.entradas} · saídas ${SR.saidas} · pelo livro de movimento do rebanho`);
      info('Rebanho', 'Cabeças sem brinco', String(SR.semBrinco),
        'estoque de gado menos os animais cadastrados um a um');
    }
    info('Rebanho', 'Animais no rebanho', String(noRebanhoAgora.length),
      SR.temMovimento ? 'cadastrados um a um, com brinco' : '');
    info('Rebanho', 'Vendidos', String(vendidos.length),
      `receita registrada ${fmtN(vendidos.reduce((s2, a) => s2 + (Number.isFinite(a.soldPrice) ? a.soldPrice : 0), 0), 2)}`);
    info('Rebanho', 'Mortos', String(mortos.length), '');
    info('Rebanho', 'Taxa de mortalidade', base ? fmtN(mortos.length / base * 100, 1) + '%' : '—',
      base ? `${mortos.length} de ${base} (rebanho + mortos)` : 'sem base de cálculo');
    info('Rebanho', 'Peso total no rebanho', pesos.length ? fmtN(kgTotal, 0) + ' kg' : '—',
      `${pesos.length} animal(is) com pesagem`);
    info('Rebanho', 'Arrobas no rebanho', pesos.length ? fmtN(arrobasDe(kgTotal, settings.yield), 1) + ' @' : '—',
      `rendimento de carcaça ${fmtN(settings.yield, 0)}%`);
    info('Rebanho', 'Peso médio', pesos.length ? fmtN(kgTotal / pesos.length, 0) + ' kg' : '—', '');
    info('Rebanho', 'GMD médio', gmds.length ? fmtN(gmds.reduce((s2, g) => s2 + g, 0) / gmds.length, 3) + ' kg/dia' : '—',
      `${gmds.length} animal(is) com duas pesagens ou mais`);

    items.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')).forEach(it => {
      const q = qtyOf(it.id), med = avgCostOf(it.id);
      info('Estoque', it.name, `${numCsv(q)} ${it.unit}`,
        (med != null ? `custo médio ${fmtN(med, 2)} · valor ${fmtN(q * med, 2)}` : 'sem preço de compra')
        + (Number.isFinite(it.minQty) && q < it.minQty ? ` · ABAIXO DO MÍNIMO (${numCsv(it.minQty)})` : ''));
    });

    // Custo da arroba: só entra quando há conta feita, senão o relatório
    // anunciaria um custo que ninguém calculou.
    const c = calcCusto();
    if (Number.isFinite(c.custoArroba)) {
      info('Custo da arroba', 'Custo por arroba produzida', fmtN(c.custoArroba, 2), '');
      info('Custo da arroba', 'Custo por dia por animal', fmtN(c.custoDia, 2),
        `sal ${fmtN(c.salDia, 2)} · sanidade ${fmtN(c.sanDia, 2)} · mão de obra ${fmtN(c.moDia, 2)} · terra ${fmtN(c.terraDia, 2)}`);
      info('Custo da arroba', 'Arrobas ganhas por dia', fmtN(c.arrobaDia, 4),
        `GMD ${custoParams.gmd != null ? fmtN(custoParams.gmd, 3) : '—'} kg/dia · rendimento ${fmtN(c.rend, 0)}%`);
    }
  } else {
    // Dizer que não entra é diferente de omitir: omitido, parece que faltou.
    info('Rebanho e estoque', 'Não entram neste relatório', '—',
      'rebanho, GMD, estoque e custo da arroba são dos Bovinos');
  }

  // ---- a conferência, no fim ----
  // É por estas linhas que o auditor amarra o resumo ao arquivo de
  // lançamentos, sem refazer conta nenhuma.
  info('Conferência', 'Lançamentos somados', String(R.n),
    'o arquivo de lançamentos tem de ter este mesmo número de linhas');
  mov('Conferência', 'ENTRADAS E SAÍDAS', R.receitas, R.custos,
    'o saldo é o saldo_acumulado da última linha do arquivo de lançamentos');
  info('Conferência', 'Como conferir na planilha', 'some a coluna entradas',
    'o total tem de bater com esta linha, e o mesmo na coluna saidas');

  const resumo = `${esc.nome} · ${R.n} lançamento(s) · entradas ${fmtRS(R.receitas)} · saídas ${fmtRS(R.custos)}`;
  download(`relatorio-${esc.arquivo}-fazendajs-${todayISO()}.csv`,
    'secao;item;entradas;saidas;saldo;valor;detalhe\n' + linhas.join('\n'), 'text/csv', undefined, resumo);
  fecharMenu();
  toast(`Relatório de ${esc.nome} · ${R.n} lançamento(s)`);
}

// ===== Agenda de pagamentos no calendário do celular =====
// O "A pagar" só avisa com o aplicativo aberto. A conta que vence no dia 10 não
// lembra ninguém no dia 7, e é aí que o boleto atrasa. Este arquivo (.ics, o
// formato que iPhone, Android, Google e Outlook entendem) leva cada conta em
// aberto para o calendário do aparelho, com alarme.
//
// Por que arquivo e não uma assinatura de calendário (webcal) que se atualiza
// sozinha: assinatura exige um endereço na internet servindo as contas da
// fazenda o tempo todo. Quem tivesse o endereço leria quanto a fazenda deve, a
// quem e quando, sem senha nenhuma. O arquivo sai do aparelho para o
// calendário e não fica publicado em lugar nenhum — em troca, é preciso
// exportar de novo quando as contas mudarem.
// Acima disto o arquivo não vai para o campo de texto de reserva: 200 mil
// caracteres já são umas 4 mil linhas de planilha, muito além do que alguém
// copia à mão, e o backup com notas passa disso em centenas de vezes.
const COPIA_MAX = 200000;
const ICS_CAL = 'Fazenda J.S — contas a pagar';
const ICS_ARQ = 'fazenda-js-contas-a-pagar.ics';
// Texto em iCalendar escapa barra, ponto e vírgula, vírgula e quebra de linha.
// A quebra é a que importa de verdade: uma observação com ENTER dentro viraria
// linha solta no meio do arquivo, e uma observação escrita de má-fé poderia
// fechar o evento e abrir outro. Virando "\n" literal, não fecha nada.
const escICS = v => String(v == null ? '' : v)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n');
// O formato manda dobrar linha com mais de 75 OCTETOS — octeto, não letra: "ç"
// e "ã" ocupam dois. Cortando por letra, uma linha de acentos passaria do
// limite; cortando por byte sem cuidado, partiria um caractere ao meio e o
// iPhone mostraria "Ra��o". Por isso o corte anda para trás enquanto estiver
// em cima de um byte de continuação (10xxxxxx).
function dobrarICS(linha) {
  const bytes = new TextEncoder().encode(linha);
  if (bytes.length <= 75) return linha;
  const dec = new TextDecoder();
  const partes = [];
  let ini = 0, limite = 75;
  while (ini < bytes.length) {
    let fim = Math.min(ini + limite, bytes.length);
    while (fim > ini && fim < bytes.length && (bytes[fim] & 0xC0) === 0x80) fim--;
    partes.push(dec.decode(bytes.slice(ini, fim)));
    ini = fim;
    limite = 74;   // a linha de continuação gasta um octeto com o espaço da frente
  }
  return partes.join('\r\n ');
}
// Passa a data por um calendário de verdade antes de escrever. Não é
// paranoia: uma conta com vencimento em 29/02/2026 — dia que não existe, 2026
// não é bissexto — saía como DTSTART:20260229, e leitor rigoroso recusa o
// ARQUIVO INTEIRO por causa de uma data assim. Todas as outras contas sumiriam
// junto, sem nenhuma explicação na tela do celular. O formulário de hoje não
// deixa digitar isso, mas backup restaurado e importação deixam.
//
// Data impossível rola para o dia seguinte real (29/02 vira 01/03), que é o
// que qualquer calendário faz. Texto que não é data nenhuma devolve null, e
// quem chama decide o que fazer.
function dataICS(iso) {
  const partes = String(iso == null ? '' : iso).slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || !partes.every(Number.isFinite)) return null;
  const [y, m, d] = partes;
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  const p = x => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
const icsData = iso => String(iso).slice(0, 10).replace(/-/g, '');
// Evento de dia inteiro termina no dia SEGUINTE: o fim é exclusivo. Sem isso o
// iPhone desenha a conta em dois dias, ou em nenhum. Conta a partir da data já
// normalizada, senão o começo e o fim discordariam em quantos dias distam.
const diaSeguinte = iso => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const p = x => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};
const icsCarimbo = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
// Exportar duas vezes não pode criar dois lembretes da mesma conta. O UID é o
// id do lançamento, então o calendário reconhece o evento que já tem; e como
// ele só ACEITA a atualização se vier com número de versão maior, cada
// exportação sobe esse número. Sem isso, corrigir o valor de uma conta e
// exportar de novo não mudaria nada no iPhone.
function proximaSequenciaICS() {
  const n = Number(LS.g('fjs-ics-seq', 0)) || 0;
  const prox = n + 1;
  LS.s('fjs-ics-seq', prox);
  return prox;
}
// O sufixo "@fazendajs" existe para separar de qualquer outro aplicativo que
// mande evento para o mesmo iPhone: dois eventos só se sobrescrevem quando têm
// o MESMO UID, e nenhum outro aplicativo usa este sufixo. Mesmo que os eventos
// caiam no mesmo calendário, um nunca apaga o outro.
const uidICS = t => escICS(t.id) + '@fazendajs';
const alarmeICS = (gatilho, texto) =>
  ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escICS(texto),
   'TRIGGER:' + gatilho, 'END:VALARM'];
function eventoICS(c, livro, seq, carimbo, hoje) {
  const dia = dataICS(c.venc);
  if (!dia) return [];            // sem data legível não há evento possível
  const atrasada = c.venc < hoje;
  const titulo = (atrasada ? '⚠ VENCIDA · ' : '') + 'Fazenda J.S · ' + fmtRS(c.amount)
    + ' · ' + (c.category || 'Conta a pagar') + rotuloParcela(c);
  const descricao = [
    'Conta a pagar da Fazenda J.S.',
    'Atividade: ' + livro,
    'Valor: ' + fmtRS(c.amount),
    'Vence em: ' + fmtBRfull(c.venc),
    c.parcelas > 1 ? `Parcela ${c.parcela} de ${c.parcelas}` : 'Parcela única',
    'Lançada em: ' + fmtBRfull(c.date),
    c.notes ? 'Observação: ' + c.notes : '',
    '',
    'Marque como paga no aplicativo Fazenda J.S.'
  ].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT',
    'UID:' + uidICS(c),
    'DTSTAMP:' + carimbo,
    'DTSTART;VALUE=DATE:' + icsData(dia),
    'DTEND;VALUE=DATE:' + icsData(diaSeguinte(dia)),
    'SUMMARY:' + escICS(titulo),
    'DESCRIPTION:' + escICS(descricao),
    'CATEGORIES:' + escICS('Fazenda J.S'),
    'SEQUENCE:' + seq,
    'STATUS:CONFIRMED',
    // TRANSPARENT: a conta não ocupa o dia. Marcada como OPAQUE, o iPhone
    // trataria o dia inteiro como comprometido e passaria a recusar convite.
    'TRANSP:TRANSPARENT',
    // Dois avisos, contados a partir da meia-noite do dia do vencimento:
    // três dias antes às 9h (dá tempo de ir ao banco) e no próprio dia às 8h.
    ...alarmeICS('-PT63H', 'Vence em 3 dias: ' + titulo),
    ...alarmeICS('PT8H', 'Vence hoje: ' + titulo),
    'END:VEVENT'
  ];
}
// Todas as contas em aberto dos TRÊS livros, na ordem em que vencem. A vencida
// entra também: ela é a mais urgente que existe, e deixá-la de fora esconderia
// justamente o que não pode ser esquecido.
function contasParaAgenda() {
  return LIVROS.flatMap(b => contasAPagar(arrLivro(b)).map(c => ({ c, livro: NOME_LIVRO[b] })))
    .sort((a, b) => a.c.venc.localeCompare(b.c.venc));
}
// Conta paga tem de PARAR de tocar no iPhone. Sem isto, o lembrete exportado
// em setembro acorda ele no vencimento de uma conta que ele já quitou — e duas
// ou três dessas bastam para ninguém mais confiar no alarme. Como o arquivo
// novo simplesmente não traz a conta paga, o calendário não fica sabendo de
// nada: é preciso mandar o evento de volta, dizendo que está cancelado.
//
// Por isso o aplicativo guarda o que já mandou. Guarda o vencimento junto
// porque o cancelamento precisa do dia, e o lançamento pode ter sido apagado.
const ICS_ENVIADOS = 'fjs-ics-enviados';
const enviadosICS = () => { const v = LS.g(ICS_ENVIADOS, null); return v && typeof v === 'object' ? v : {}; };
function eventoCancelado(id, dados, seq, carimbo) {
  const dia = dataICS(dados.venc);
  if (!dia) return [];
  return [
    'BEGIN:VEVENT',
    'UID:' + escICS(id) + '@fazendajs',
    'DTSTAMP:' + carimbo,
    'DTSTART;VALUE=DATE:' + icsData(dia),
    'DTEND;VALUE=DATE:' + icsData(diaSeguinte(dia)),
    'SUMMARY:' + escICS('✔ PAGA · ' + (dados.nome || 'Conta da Fazenda J.S')),
    'DESCRIPTION:' + escICS('Esta conta foi paga (ou apagada) no aplicativo Fazenda J.S.'),
    'CATEGORIES:' + escICS('Fazenda J.S'),
    'SEQUENCE:' + seq,
    'STATUS:CANCELLED',
    'TRANSP:TRANSPARENT',
    // Sem nenhum alarme, de propósito. Se o calendário do aparelho apagar o
    // evento, ótimo; se apenas atualizar, ele fica lá riscado e MUDO — que é o
    // que importa. O alarme é que não pode sobreviver ao pagamento.
    'END:VEVENT'
  ];
}
// Dois modos. INTEIRO: o arquivo é a agenda toda, e o que não está mais nela
// é cancelado — é o do menu. PARCIAL: só as contas que acabaram de ser
// mexidas, para o lançamento ir ao calendário na hora sem reenviar o resto.
//
// A diferença que importa é a memória do que já foi mandado: no modo parcial
// ela é ACRESCENTADA, nunca substituída. Substituindo, um envio de uma conta
// só faria o aplicativo pensar que todas as outras sumiram — e a exportação
// seguinte cancelaria, uma a uma, contas que continuam devidas.
function agendaICS(contas, opc) {
  const parcial = !!(opc && opc.parcial);
  const seq = proximaSequenciaICS();
  const carimbo = icsCarimbo();
  const hoje = todayISO();
  const antes = enviadosICS();
  const agora = parcial ? Object.assign({}, antes) : {};
  // Só entra na memória o que virou evento de verdade. Guardando a conta de
  // data ilegível, o aplicativo acharia que ela está no calendário e um dia
  // mandaria o cancelamento de um evento que nunca existiu.
  contas.filter(x => dataICS(x.c.venc)).forEach(x => {
    agora[x.c.id] = { venc: x.c.venc, nome: fmtRS(x.c.amount) + ' · ' + (x.c.category || 'Conta a pagar') };
  });
  // Inteiro: cancela tudo o que saiu da agenda. Parcial: só o que foi apontado
  // — uma conta paga agora mesmo, por exemplo.
  const cancelar = (parcial ? (opc.cancelar || []) : Object.keys(antes))
    .filter(id => antes[id] && antes[id].venc && (parcial || !agora[id]));
  cancelar.forEach(id => { delete agora[id]; });
  LS.s(ICS_ENVIADOS, agora);
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fazenda J.S//Agenda de pagamentos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // O nome que o celular oferece para o calendário na hora de importar.
    'X-WR-CALNAME:' + escICS(ICS_CAL),
    'X-WR-CALDESC:' + escICS('Contas a pagar lançadas no aplicativo Fazenda J.S'),
    ...contas.flatMap(x => eventoICS(x.c, x.livro, seq, carimbo, hoje)),
    ...cancelar.flatMap(id => eventoCancelado(id, antes[id], seq, carimbo)),
    'END:VCALENDAR'
  ];
  // CRLF não é preciosismo: o formato exige, e leitor rigoroso recusa o arquivo
  // inteiro com só "\n".
  return linhas.map(dobrarICS).join('\r\n') + '\r\n';
}
// Nada de baixar sozinho. Dentro de um aplicativo instalado na tela de início
// do iPhone, o clique que o programa dá num link de download costuma não
// produzir NADA — sem arquivo, sem erro, sem aviso. Foi o que aconteceu: a
// pessoa toca em exportar e a tela não muda, e não há como saber se falhou ou
// se o arquivo foi para algum lugar que ela não achou.
//
// Agora o arquivo é montado e a tela mostra três caminhos, cada um um botão ou
// link DE VERDADE, que o dedo toca. Toque do usuário tem permissão que clique
// de programa não tem, e se um caminho não existir no aparelho ele nem
// aparece, em vez de falhar calado.
let saidaURL = null;
// O que ESTE aparelho permite. Não é curiosidade técnica: dentro de um
// aplicativo instalado na tela de início do iPhone, três coisas que funcionam
// em qualquer navegador simplesmente não funcionam, e nenhuma delas avisa.
// Sem isto, "não apareceu nada" não distingue uma da outra.
function diagnostico() {
  const teste = new File(['x'], 'a.ics', { type: 'text/calendar' });
  let compArq = false;
  try { compArq = !!(navigator.canShare && navigator.canShare({ files: [teste] })); } catch (e) {}
  return {
    versao: VERSAO,
    ios: noIOS(),
    instalado: instalado(),
    temShare: !!navigator.share,
    compArq,
    ua: (navigator.userAgent || '').slice(0, 120)
  };
}
const diagEmTexto = d => `Fazenda J.S v${d.versao} | iOS ${d.ios ? 'sim' : 'nao'}`
  + ` | instalado ${d.instalado ? 'sim' : 'nao'} | compartilhar ${d.temShare ? 'sim' : 'nao'}`
  + ` | compartilhar-arquivo ${d.compArq ? 'sim' : 'nao'} | ${d.ua}`;
// A tela que abre sozinha precisa dizer POR QUE abriu. Ela dizia sempre "você
// acabou de lançar uma conta a prazo" — inclusive quando tinha aberto por uma
// conta PAGA. Quem acabou de dar baixa lia aquilo, não reconhecia a própria
// ação, fechava a tela, e o alarme da conta quitada seguia tocando no celular.
const MOTIVO_AUTO = {
  nova: 'Esta tela abriu sozinha porque você acabou de lançar uma conta a prazo. '
      + 'O iPhone não deixa nenhum aplicativo pôr evento no calendário sem um toque seu — falta só ele.',
  baixa: 'Esta tela abriu sozinha porque você acabou de dar baixa numa conta. '
       + 'Este arquivo TIRA o lembrete dela do calendário — sem ele, o alarme de uma conta já paga continua tocando. '
       + 'O iPhone exige um toque seu para mexer no calendário.',
  ambas: 'Esta tela abriu sozinha porque você mexeu nas contas: há lembrete novo para pôr '
       + 'e conta paga para tirar do calendário. O iPhone exige um toque seu para as duas coisas.'
};
function mostrarSaida({ nome, blob, resumo, cru, ehAgenda, automatico, motivo }) {
  if (saidaURL) URL.revokeObjectURL(saidaURL);
  saidaURL = URL.createObjectURL(blob);
  $('ag-resumo').textContent = resumo;
  // Copiar à mão só faz sentido em arquivo pequeno. O backup completo passa
  // de dezenas de MB com as notas fiscais dentro: jogar isso num campo de
  // texto trava o aparelho, e ninguém ia colar tanta coisa nas Notas de
  // qualquer forma. Acima do limite, a reserva simplesmente sai da tela.
  const cabeCopiar = typeof cru === 'string' && cru.length <= COPIA_MAX;
  $('ag-cru').value = cabeCopiar ? cru : '';
  $('ag-cru').hidden = true;
  $('ag-reserva').hidden = !cabeCopiar;

  // ABRIR: na MESMA aba, de propósito. Aplicativo instalado na tela de início
  // do iPhone não abre aba nova — target="_blank" ali não faz absolutamente
  // nada, e foi por isso que este botão parecia morto. Indo na mesma aba, o
  // sistema reconhece que o conteúdo não é página, e quem assume é o visual
  // do próprio iPhone, que oferece o Calendário.
  $('ag-abrir').href = saidaURL;
  $('ag-abrir').removeAttribute('target');
  $('ag-abrir').removeAttribute('rel');
  // BAIXAR continua, porque no computador e no Safari comum é o caminho curto.
  // Instalado no iPhone, o atributo é ignorado — por isso não é mais o
  // primeiro da lista nem a única saída.
  $('ag-baixar').href = saidaURL;
  $('ag-baixar').setAttribute('download', nome);

  // COMPARTILHAR: o botão aparece sempre que o aparelho tem a folha de
  // compartilhar, mesmo quando ele diz que não aceita ESTE tipo de arquivo. O
  // iPhone recusa .ics nessa checagem, e era isso que escondia o botão — a
  // pessoa via dois caminhos onde deveria ver três. Recusando de novo na hora
  // do toque, o erro APARECE, em vez de o botão sumir sem explicação.
  const arquivo = new File([blob], nome, { type: blob.type });
  const d = diagnostico();
  $('ag-share').hidden = !d.temShare;
  $('ag-share-nao').hidden = d.temShare;
  $('ag-share').textContent = ehAgenda
    ? 'Compartilhar → Calendário' : 'Compartilhar / Salvar';
  $('ag-abrir').textContent = !ehAgenda ? 'Abrir o arquivo'
    : motivo === 'baixa' ? 'Atualizar o Calendário' : 'Abrir no Calendário';
  $('ag-share').onclick = async () => {
    try { await navigator.share({ files: [arquivo], title: nome }); }
    catch (e) {
      if (e && e.name === 'AbortError') return;
      // Segunda tentativa só com o texto: alguns aparelhos recusam o ARQUIVO e
      // aceitam o conteúdo, e daí dá para salvar nas Notas.
      try { await navigator.share({ title: nome, text: cru || '' }); return; }
      catch (e2) {
        if (e2 && e2.name === 'AbortError') return;
        toast('Este aparelho recusou compartilhar (' + ((e && e.name) || 'erro') + ') — use "Abrir"');
      }
    }
  };
  $('ag-diag').textContent = diagEmTexto(d);
  $('ag-so-agenda').hidden = !ehAgenda;
  // A tela que apareceu sozinha precisa dizer POR QUE apareceu e como fazer
  // parar: tela que surge sem ser chamada e sem saída vira estorvo.
  $('ag-auto').hidden = !automatico;
  if (automatico) $('ag-auto-motivo').textContent = MOTIVO_AUTO[motivo] || MOTIVO_AUTO.nova;
  $('modal-saida-titulo').textContent = ehAgenda ? 'Agenda pronta' : 'Arquivo pronto';
  $('modal-agenda-saida').hidden = false;
}
$('ag-diag-copiar').addEventListener('click', async () => {
  const txt = diagEmTexto(diagnostico());
  try { await navigator.clipboard.writeText(txt); toast('Copiado — cole na conversa'); }
  catch (e) { $('ag-diag').classList.add('sel'); toast('Não deu para copiar — leia a linha acima'); }
});
$('ag-copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('ag-cru').value);
    toast('Texto copiado — cole num arquivo terminado em .ics');
  } catch (e) {
    // Sem permissão de área de transferência, seleciona para o dedo copiar.
    $('ag-cru').hidden = false; $('ag-cru').select();
    toast('Não deu para copiar sozinho — o texto está aí, selecionado');
  }
});
// Conta a prazo lançada vai para o calendário NA HORA, sem passar pelo menu.
//
// "Automático" tem um limite que não é meu: o iPhone nunca deixa um programa
// entregar arquivo sozinho — sempre falta um toque. Então o automático aqui é
// o arquivo já montado e a tela já aberta, com as parcelas que acabaram de ser
// criadas, faltando só o toque que o sistema exige.
//
// E vai também o contrário: marcar uma conta como paga no formulário manda o
// cancelamento dela. Sem isso, quem passa a usar só este caminho nunca mais
// faz a exportação inteira — e o alarme de uma conta já quitada continuaria
// tocando, que é o jeito mais rápido de a pessoa parar de confiar no aviso.
// As portas por onde uma conta sai da agenda, todas ligadas aqui. A lista está
// escrita porque ela já foi descoberta aos pedaços: cada porta esquecida deixa
// um alarme tocando por uma dívida que não existe, e quem descobre é o dono do
// celular, no dia do vencimento.
//   1. salvar o lançamento (pago, ou deixou de ser a prazo)
//   2. excluir o lançamento
//   3. pagar pela lista "A pagar"  — o caminho mais usado de todos
//   4. salvar a compra de estoque (refaz o carnê com ids novos)
//   5. excluir a compra de estoque
//   6. excluir o item de estoque, que leva as compras dele junto
//   7. apagar todos os dados
//   8. restaurar um backup, que troca tudo por lançamentos de outros ids
// Fica de fora, de propósito: mudança vinda da NUVEM, feita em outro aparelho.
// Abrir uma tela sozinha por causa de um dado que chegou de fora seria pior que
// o problema; para esse caso existe a agenda inteira, no menu.
function agendarMudanca(tocadas, book, removidos) {
  if (!LS.g('fjs-ics-auto', true)) return false;
  const lista = (tocadas || []).filter(Boolean);
  const abertas = lista.filter(emAberto);
  const enviadas = enviadosICS();
  // Duas maneiras de uma conta sair da agenda, e as duas precisam cancelar:
  // ela foi PAGA (continua existindo, só não se deve mais) ou foi APAGADA.
  // A apagada não dá para reconhecer pela própria conta — ela some da lista —,
  // por isso vem pelo id, de quem a apagou.
  const cancelar = lista.filter(t => !emAberto(t) && enviadas[t.id]).map(t => t.id)
    .concat((removidos || []).filter(id => enviadas[id]));
  if (!abertas.length && !cancelar.length) return false;
  const hoje = todayISO();
  const contas = abertas
    .map(t => ({ c: Object.assign({}, t, { dias: daysBetween(hoje, t.venc) }),
                 livro: NOME_LIVRO[book] || 'Fazenda' }))
    .sort((a, b) => a.c.venc.localeCompare(b.c.venc));
  const texto = agendaICS(contas, { parcial: true, cancelar });
  const partes = [];
  if (contas.length) partes.push(`${contas.length} conta(s) a prazo`);
  if (cancelar.length) partes.push(`${cancelar.length} paga(s) saem da agenda`);
  const motivo = contas.length && cancelar.length ? 'ambas' : cancelar.length ? 'baixa' : 'nova';
  mostrarSaida({
    nome: ICS_ARQ,
    blob: new Blob([texto], { type: 'text/calendar;charset=utf-8' }),
    resumo: partes.join(' · '),
    cru: texto, ehAgenda: true, automatico: true, motivo
  });
  return true;
}
$('ag-auto-desligar').addEventListener('click', () => {
  LS.s('fjs-ics-auto', false);
  closeAllM();
  toast('Não vai mais abrir sozinho — o menu (⋯) continua tendo a agenda');
});
function exportAgenda() {
  const contas = contasParaAgenda();
  // Mesmo sem nenhuma conta em aberto pode haver o que exportar: as que foram
  // pagas desde a última vez precisam do aviso de cancelamento, senão o alarme
  // delas continua tocando. Só não há nada a fazer quando as duas listas estão
  // vazias.
  const aCancelar = Object.keys(enviadosICS()).filter(id => !contas.some(x => x.c.id === id));
  if (!contas.length && !aCancelar.length) {
    closeAllM();
    toast('Nenhuma conta a pagar em aberto — não há o que agendar');
    return;
  }
  const texto = agendaICS(contas);
  const atrasadas = contas.filter(x => x.c.dias < 0).length;
  // Conta com data que não dá para ler não vira evento. Ela não pode sair da
  // contagem em silêncio: quem lançou 12 e vê "11 no calendário" precisa saber
  // que uma ficou, e por quê.
  const ilegiveis = contas.filter(x => !dataICS(x.c.venc)).length;
  const resumo = `${contas.length - ilegiveis} conta(s) no calendário`
    + (atrasadas ? ` · ${atrasadas} já vencida(s)` : '')
    + (aCancelar.length ? ` · ${aCancelar.length} paga(s) saem da agenda` : '')
    + (ilegiveis ? ` · ${ilegiveis} sem vencimento legível ficaram de fora` : '');
  closeAllM();
  // A agenda mostra a tela SEMPRE, em qualquer aparelho: mandar o arquivo para
  // o Calendário é o objetivo, e para isso o compartilhar é o caminho — não é
  // um download que deu errado.
  mostrarSaida({
    nome: ICS_ARQ,
    blob: new Blob([texto], { type: 'text/calendar;charset=utf-8' }),
    resumo, cru: texto, ehAgenda: true
  });
}
// A separação que ele pediu depende de um passo que só o dono do iPhone pode
// dar: o aplicativo não cria nem escolhe calendário no aparelho. Por isso a
// instrução aparece UMA vez, antes da primeira exportação — dita só na
// conversa, ela se perde; repetida toda vez, vira estorvo.
function abrirAgendaICS() {
  if (LS.g('fjs-ics-explicado', false)) { exportAgenda(); return; }
  closeAllM();
  $('modal-agenda').hidden = false;
}
$('menu-exp-agenda').addEventListener('click', abrirAgendaICS);
$('ag-exportar').addEventListener('click', () => {
  LS.s('fjs-ics-explicado', true);
  exportAgenda();
});
// Atalho para rever a instrução do calendário separado depois da primeira vez.
$('ag-rever').addEventListener('click', () => {
  closeAllM();
  $('modal-agenda').hidden = false;
});

// O item antigo vira o consolidado: quem já conhecia o menu continua achando
// o relatório da fazenda no mesmo lugar.
$('menu-rel-bov').addEventListener('click', () => exportRelatorio('bov'));
$('menu-rel-av').addEventListener('click', () => exportRelatorio('av'));
$('menu-exp-relatorio').addEventListener('click', () => exportRelatorio('fazenda'));
$('menu-exp-tudo').addEventListener('click', exportFinTudo);
// As atividades criadas pela fazenda ganham cada uma o seu item no menu, com o
// número de lançamentos ao lado: assim "só esta atividade" existe para elas
// como existe para Bovinos, e dá para ver de relance se a atividade tem o que
// exportar antes de pedir o arquivo.
function montarExportAtividades() {
  const box = $('menu-exp-atividades');
  if (!box) return;
  box.innerHTML = atividades.map(a =>
    `<button class="menu-item" data-exp-livro="${esc(a.id)}"><span>📤</span> `
    + `Exportar financeiro — só ${esc(a.nome)} (CSV) `
    + `<span class="menu-n mono">${arrLivro(a.id).length}</span></button>`).join('');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-exp-livro]');
  if (b) exportFin(b.dataset.expLivro);
});
$('menu-exp-bfin').addEventListener('click', () => exportFin('bov'));
$('menu-exp-afin').addEventListener('click', () => exportFin('av'));
$('menu-exp-gfin').addEventListener('click', () => exportFin('ger'));
// Ração e suplemento são o maior custo do confinamento, e esse gasto só existia
// dentro do aplicativo: não havia como levá-lo para uma planilha nem mostrá-lo
// ao contador. O saldo vai acumulado linha a linha, para conferir o estoque
// físico contra o que o app diz.
// O livro de cabeças sai como os outros: uma linha por movimento, em ordem de
// data, com o saldo acumulado para conferir que não falta nem sobra linha.
$('menu-exp-rebmov').addEventListener('click', () => {
  const rows = ['data_iso;data;movimento;cabecas;saldo_acumulado;categoria;peso_medio_kg;valor;no_financeiro;observacao;id'];
  let saldo = 0;
  rebmov.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))
    || String(a.id).localeCompare(String(b.id))).forEach(m => {
    const tipo = REB_TIPOS[m.tipo] || REB_TIPOS.compra;
    const n = cabecasDe(m);
    saldo += tipo.sinal * n;
    rows.push([m.date || '', fmtBRfull(m.date), csv(tipo.nome), tipo.sinal * n, saldo,
      csv(m.cat || ''), Number.isFinite(m.pesoMedio) ? numCsv(m.pesoMedio, 1) : '',
      Number.isFinite(m.valor) ? fmtN(m.valor, 2) : '',
      m.linkTrans ? 'sim' : 'nao', csv(m.notes || ''), m.id].join(';'));
  });
  const R = saldoRebanho();
  download('movimento-rebanho-fazendajs.csv', rows.join('\n'), 'text/csv', undefined,
    `${rebmov.length} movimento(s) · estoque ${fmtN(R.saldo, 0)} cabeça(s)`);
  fecharMenu();
  toast(`CSV do movimento do rebanho · ${rebmov.length} movimento(s) · ${fmtN(R.saldo, 0)} cabeça(s)`);
});
$('menu-exp-estoque').addEventListener('click', () => {
  // estoque_minimo e carencia vêm do cadastro do item: o mínimo é o que dispara
  // a recompra, e a carência é quantos dias o medicamento impede o abate. Os
  // dois só existiam dentro do aplicativo.
  const rows = ['item;unidade;estoque_minimo;carencia_dias;data;tipo;quantidade;'
    + 'custo_unitario;total;saldo_apos;observacoes'];
  const doItem = it => [csv(it.name), csv(it.unit),
    Number.isFinite(it.minQty) ? numCsv(it.minQty) : '',
    Number.isFinite(it.carencia) ? String(it.carencia) : ''];
  items.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')).forEach(it => {
    let saldo = 0;
    moves.filter(m => m.itemId === it.id)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      .forEach(m => {
        saldo += m.type === 'entrada' ? m.qty : -m.qty;
        const total = m.type === 'entrada' && Number.isFinite(m.unitCost) ? m.qty * m.unitCost : null;
        rows.push([
          ...doItem(it), fmtBRfull(m.date), m.type,
          numCsv(m.qty), Number.isFinite(m.unitCost) ? fmtN(m.unitCost, 2) : '',
          total != null ? fmtN(total, 2) : '', numCsv(saldo),
          csv(m.notes)
        ].join(';'));
      });
    // Item cadastrado sem nenhuma movimentação também aparece: ele existe no
    // estoque, e um arquivo que o esconde mostra um estoque menor do que o real.
    if (!moves.some(m => m.itemId === it.id)) {
      rows.push([...doItem(it), '', '', '', '', '', '0', csv(it.notes)].join(';'));
    }
  });
  download('estoque-fazendajs.csv', rows.join('\n'), 'text/csv');
  fecharMenu(); toast(`CSV de estoque exportado · ${items.length} itens · ${moves.length} movimentações`);
});

// ===== Backup / restauração =====
// A nota fiscal não mora no lançamento: mora num registro à parte, que o app só
// busca quando alguém abre a nota. Por isso ela ficava de fora do backup — o
// arquivo trazia um lançamento dizendo "1 nota anexada" e a nota não existia em
// lugar nenhum. Um backup que não devolve a nota não é backup da nota.
async function anexosParaBackup() {
  const metas = LIVROS.flatMap(b => arrLivro(b).flatMap(t => (t.anexos || [])
    .map(a => Object.assign({}, a, { transId: t.id, col: colLivro(b) }))));
  const saida = [], faltaram = [];
  for (const m of metas) {
    const dados = await carregarAnexo(m.id);
    if (dados) saida.push(Object.assign({}, m, { dados }));
    else faltaram.push(m.nome || m.id);
  }
  return { anexos: saida, faltaram };
}
$('menu-backup').addEventListener('click', async () => {
  closeAllM();
  const metas = LIVROS.flatMap(b => arrLivro(b).flatMap(t => t.anexos || []));
  if (metas.length) toast(`Juntando ${metas.length} nota(s) fiscal(is) ao backup…`);
  const { anexos, faltaram } = await anexosParaBackup();
  // O código da fazenda vai DENTRO do backup. Sem ele, o arquivo guardava
  // tudo menos a chave que abre a porta: quem perdesse o código ficava com o
  // backup na mão e sem conseguir entrar. O arquivo já continha a fazenda
  // inteira, então ele sempre foi tão secreto quanto o código — e agora
  // também serve para voltar.
  const data = { app: 'fazendajs', v: 9, exportedAt: new Date().toISOString(), farm,
    animals, weighings, bovT, avT, gerT, items, moves, rebmov, atividades, extraT,
    anexos, settings, custo: custoParams };
  const corpo = JSON.stringify(data, null, 1);
  download(`backup-fazendajs-${todayISO()}.json`, corpo, 'application/json');
  // O tamanho importa: com as notas dentro, o arquivo passa de alguns KB para
  // dezenas de MB. Quem baixa precisa saber o que está guardando.
  const tam = kb(corpo.length);
  if (faltaram.length) {
    alert(`⚠️ Backup baixado SEM ${faltaram.length} nota(s) fiscal(is)\n\n`
      + faltaram.slice(0, 8).join('\n') + (faltaram.length > 8 ? `\n… e mais ${faltaram.length - 8}` : '')
      + '\n\nElas não puderam ser lidas agora (provavelmente sem internet).\n'
      + 'Refaça o backup com sinal para guardar as notas junto.');
  } else toast(`Backup baixado · ${tam}${anexos.length ? ` · ${anexos.length} nota(s)` : ''} · guarda o código da fazenda`);
});
$('menu-restore').addEventListener('click', () => $('restore-input').click());
$('restore-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let d = null;
    try {
      d = JSON.parse(String(reader.result));
      if (d.app !== 'fazendajs') { toast('Arquivo não é um backup do Fazenda JS'); return; }
      if (!confirm('Substituir TODOS os dados da fazenda (em todos os aparelhos) pelo backup?')) return;
      toast('Restaurando…');
      const delOps = [
        ...animals.map(x => ({ col: 'animals', del: x.id })),
        ...weighings.map(x => ({ col: 'weighings', del: x.id })),
        ...bovT.map(x => ({ col: 'bovtrans', del: x.id })),
        ...avT.map(x => ({ col: 'avtrans', del: x.id })),
        ...gerT.map(x => ({ col: 'gertrans', del: x.id })),
        // Os lançamentos das atividades criadas saem também: sem isto, a
        // fazenda restaurada ficaria com o financeiro antigo delas por baixo.
        ...atividades.flatMap(a => arrLivro(a.id).map(x => ({ col: colLivro(a.id), del: x.id }))),
        // As notas do que está sendo substituído saem junto: senão ficariam na
        // nuvem para sempre, sem lançamento que as alcance.
        ...anexosDeTudo().map(id => ({ col: 'anexos', del: id })),
        ...items.map(x => ({ col: 'items', del: x.id })),
        ...moves.map(x => ({ col: 'moves', del: x.id })),
        ...rebmov.map(x => ({ col: 'rebmov', del: x.id }))
      ];
      await batchWrite(delOps);
      const addOps = [
        ...(d.animals || []).map(x => ({ col: 'animals', obj: x })),
        ...(d.weighings || []).map(x => ({ col: 'weighings', obj: x })),
        ...(d.bovT || []).map(x => ({ col: 'bovtrans', obj: x })),
        ...(d.avT || []).map(x => ({ col: 'avtrans', obj: x })),
        ...(d.gerT || []).map(x => ({ col: 'gertrans', obj: x })),
        ...(d.atividades || []).flatMap(a => ((d.extraT || {})[a.id] || [])
          .map(x => ({ col: 'at_' + a.id, obj: x }))),
        ...(d.items || []).map(x => ({ col: 'items', obj: x })),
        ...(d.moves || []).map(x => ({ col: 'moves', obj: x })),
        ...(d.rebmov || []).map(x => ({ col: 'rebmov', obj: x })),
        // As notas fiscais do backup voltam para a coleção delas. Sem isto, os
        // lançamentos restaurados anunciariam notas que não existem mais.
        ...(d.anexos || []).filter(x => x && x.id && x.dados).map(x => ({ col: 'anexos', obj: x }))
      ];
      // Já disponíveis nesta sessão, sem precisar buscar na nuvem de novo
      (d.anexos || []).forEach(x => { if (x && x.id && x.dados) anexoCache.set(x.id, x.dados); });
      // A tela tem de mostrar o backup JÁ. Antes isto dependia da nuvem
      // responder: sem internet a restauração parecia não ter feito nada, e o
      // aparelho seguia com os dados velhos enquanto a fila carregava os novos.
      animals = d.animals || []; weighings = d.weighings || [];
      bovT = d.bovT || []; avT = d.avT || []; gerT = d.gerT || [];
      items = d.items || []; moves = d.moves || []; rebmov = d.rebmov || [];
      // A lista de atividades entra antes dos lançamentos delas, pelo mesmo
      // motivo do espelho: sem dono, extraT não é lido por ninguém.
      extraT = {};
      aplicarAtividades(d.atividades);
      Object.keys(d.extraT || {}).forEach(id => { if (ehExtra(id)) extraT[id] = d.extraT[id] || []; });
      if (d.settings && Number.isFinite(d.settings.yield)) settings.yield = d.settings.yield;
      if (d.custo) custoParams = Object.assign({}, CUSTO_VAZIO, d.custo);
      detailAnimal = null; detailItem = null; closeAllM();
      salvarEspelho(true); render();

      await batchWrite(addOps);
      const farmDoc = {};
      if (d.settings && Number.isFinite(d.settings.yield)) farmDoc.yield = d.settings.yield;
      if (d.custo) farmDoc.custo = Object.assign({}, CUSTO_VAZIO, d.custo);
      farmDoc.atividades = atividades;
      // salvarFazenda em vez da nuvem direta: sem internet os ajustes entram na
      // fila em vez de derrubar a restauração inteira num "arquivo inválido".
      if (Object.keys(farmDoc).length) salvarFazenda(farmDoc);
      toast(db ? 'Backup restaurado' : 'Backup restaurado no aparelho — sobe quando a internet voltar');
      // O backup troca TODOS os lançamentos, com ids próprios: as contas que
      // estavam no calendário antes não existem mais. Cancelar o que não é
      // mais conta em aberto evita o pior caso — avisos de uma fazenda que
      // este aparelho não tem mais, sem nenhum jeito de descobrir de onde vêm.
      const aindaAberto = new Set(LIVROS.flatMap(b2 => arrLivro(b2)).filter(emAberto).map(x => x.id));
      agendarMudanca([], 'bov', Object.keys(enviadosICS()).filter(x => !aindaAberto.has(x)));
    } catch (err) {
      // Separar as duas causas: arquivo estragado é problema do arquivo, falha
      // de rede não é — e a segunda já ficou guardada na fila.
      toast(d ? 'Restaurado no aparelho; a nuvem recebe quando a internet voltar' : 'Arquivo de backup inválido');
    }
  };
  reader.readAsText(f, 'utf-8');
  e.target.value = '';
});
$('menu-clear').addEventListener('click', async () => {
  if (!confirm('Apagar TODOS os dados da fazenda, em todos os aparelhos?\n\nRecomendado baixar um backup antes (menu → Backup completo).')) return;
  const typed = prompt('Esta ação NÃO pode ser desfeita.\n\nPara confirmar, digite a palavra:\n\nAPAGAR');
  if (typed == null) return;
  if (typed.trim().toUpperCase() !== 'APAGAR') { toast('Confirmação incorreta — nada foi apagado'); return; }
  // LIVROS e não três linhas escritas à mão: o livro Geral nasceu depois desta
  // função e ficou de fora. Quem mandava apagar TUDO seguia com os custos
  // gerais e com as notas fiscais inteiras guardadas na nuvem.
  const ops = [
    ...animals.map(x => ({ col: 'animals', del: x.id })),
    ...weighings.map(x => ({ col: 'weighings', del: x.id })),
    ...LIVROS.flatMap(b => arrLivro(b).map(x => ({ col: colLivro(b), del: x.id }))),
    ...anexosDeTudo().map(id => ({ col: 'anexos', del: id })),
    ...items.map(x => ({ col: 'items', del: x.id })),
    ...moves.map(x => ({ col: 'moves', del: x.id })),
    ...rebmov.map(x => ({ col: 'rebmov', del: x.id }))
  ];
  // A tela tem de esvaziar AGORA. Antes isto dependia do snapshot da nuvem
  // responder: sem internet o app seguia mostrando tudo, e quem acabara de
  // digitar APAGAR concluía que nada tinha sido apagado.
  animals = []; weighings = []; bovT = []; avT = []; gerT = []; items = []; moves = []; rebmov = [];
  anexoCache.clear();
  detailAnimal = null; detailItem = null; closeAllM();
  salvarEspelho(true); render();
  toast('Apagando…');
  try { await batchWrite(ops); toast('Dados apagados'); } catch (e) { toast('Falha ao apagar — verifique a conexão'); }
  // Apagar tudo no aplicativo não apaga o que já está no calendário do
  // aparelho: sem isto, os avisos continuariam tocando por contas de uma
  // fazenda que não existe mais aqui dentro.
  agendarMudanca([], 'bov', Object.keys(enviadosICS()));
});
// Toda nota fiscal presa a qualquer lançamento, dos três livros. Anexo é um
// registro à parte na nuvem: se ninguém o apagar junto, ele fica lá para
// sempre, ocupando espaço e sem nenhum lançamento que o alcance.
function anexosDeTudo() {
  // Sem o conjunto, a nota de um carnê de oito parcelas sairia oito vezes no
  // backup e no apagar-tudo — oito cópias do mesmo arquivo.
  return [...new Set(LIVROS.flatMap(b => arrLivro(b).flatMap(t => (t.anexos || []).map(a => a.id))))];
}
// ===== Limpeza: manter só quem foi pesado num dia =====
// Serve para acertar o rebanho depois de uma venda em lote: quem passou pela
// balança fica com todo o histórico, o resto sai. Como é irreversível, a tela
// mostra brinco por brinco quem sai antes de qualquer coisa acontecer.
// Cada dia em que houve pesagem, com quantos animais passaram pela balança.
// Serve de conferência antes de apagar: se um dia mostra muito mais animais do
// que passaram no curral, o número não veio de pesagem — veio de peso de
// entrada de cadastro ou de importação de CSV, e isso aparece separado aqui.
function diasDePesagem() {
  const porDia = new Map();
  for (const w of weighings) {
    if (!porDia.has(w.date)) porDia.set(w.date, { data: w.date, origem: new Map() });
    const origem = porDia.get(w.date).origem;
    // Conta ANIMAIS, não registros: o mesmo animal com duas pesagens no mesmo
    // dia (corrida entre aparelhos) conta uma vez. Somando registros de um lado
    // e animais do outro, "do curral" saía menor do que é, e com sujeira
    // bastante virava número negativo — justo na linha que serve para explicar
    // de onde veio a contagem do dia.
    const o = w.notes === 'Peso de entrada' ? 'entrada' : w.notes === 'Importado' ? 'importado' : 'curral';
    // Passou pela balança, vale a balança: curral ganha de cadastro e de importação.
    if (origem.get(w.animalId) !== 'curral') origem.set(w.animalId, o === 'curral' ? 'curral' : (origem.get(w.animalId) || o));
  }
  return [...porDia.values()].map(d => {
    const vals = [...d.origem.values()];
    const conta = tipo => vals.reduce((n, v) => n + (v === tipo ? 1 : 0), 0);
    return { data: d.data, total: d.origem.size, curral: conta('curral'), entrada: conta('entrada'), importado: conta('importado') };
  }).sort((a, b) => b.data.localeCompare(a.data));
}
let lmDias = new Set();
function limpezaSeparar(datas) {
  const idsFicam = new Set(weighings.filter(w => datas.has(w.date)).map(w => w.animalId));
  // A limpeza é do REBANHO. Vendido e morto já saíram dele e têm registro
  // próprio nas abas Vendidas e Mortalidade — se entrassem aqui seriam
  // apagados por não terem pesagem no dia, e junto iriam o histórico da venda
  // e a causa da morte. Ficam de fora dos dois lados da conta.
  const rebanho = animals.filter(noRebanho);
  const ficam = rebanho.filter(a => idsFicam.has(a.id)).sort(porBrinco);
  const saem = rebanho.filter(a => !idsFicam.has(a.id)).sort(porBrinco);
  const fora = animals.length - rebanho.length;
  return { ficam, saem, fora };
}
function renderDiasLimpeza() {
  const dias = diasDePesagem();
  $('lm-dias').innerHTML = !dias.length
    ? '<p class="lm-vazio mono">Nenhuma pesagem registrada.</p>'
    : dias.slice(0, 20).map(d => {
      const origem = d.entrada || d.importado
        ? `<span class="origem">${d.curral} do curral` +
          `${d.entrada ? ` · ${d.entrada} de cadastro` : ''}` +
          `${d.importado ? ` · ${d.importado} importados` : ''}</span>`
        : '';
      return `<label class="lm-dia">
        <input type="checkbox" data-dia="${d.data}"${lmDias.has(d.data) ? ' checked' : ''} />
        <span class="d">${fmtBR(d.data)}</span>
        <span class="n mono">${d.total} ${d.total === 1 ? 'animal' : 'animais'}${origem}</span>
      </label>`;
    }).join('') + (dias.length > 20 ? `<p class="lm-vazio mono">+ ${dias.length - 20} dia(s) mais antigos, não listados.</p>` : '');
}
function renderLimpeza() {
  const btn = $('lm-confirm');
  if (!lmDias.size) {
    $('lm-resumo').innerHTML = '<p class="lm-vazio mono">Marque ao menos um dia de pesagem.</p>';
    $('lm-listas').innerHTML = ''; $('lm-aviso').hidden = true;
    btn.disabled = true; btn.textContent = 'Marque os dias'; return;
  }
  const { ficam, saem, fora } = limpezaSeparar(lmDias);
  $('lm-resumo').innerHTML = `
    <div class="lm-numeros">
      <div class="lm-num"><span class="v">${ficam.length}</span><span class="r mono">ficam</span></div>
      <div class="lm-num saem"><span class="v">${saem.length}</span><span class="r mono">saem</span></div>
    </div>
    ${!ficam.length ? '<p class="lm-vazio mono">Nenhum animal foi pesado nos dias marcados — confira antes de continuar.</p>' : ''}
    ${fora ? `<p class="lm-fora mono">${fora} animal(is) já vendidos ou mortos ficam de fora desta limpeza — o registro deles é preservado.</p>` : ''}`;
  const linha = a => {
    const ws = wOf(a.id);
    const ult = ws[ws.length - 1];
    return `<div class="lm-linha"><span class="brinco">${esc(a.ident)}</span>` +
      `<span class="info mono">${ult ? fmtN(ult.weight, ult.weight % 1 ? 1 : 0) + ' kg · ' + fmtBR(ult.date) : 'sem pesagem'}` +
      `${ws.length ? ` · ${ws.length} pesagem${ws.length > 1 ? 's' : ''}` : ''}</span></div>`;
  };
  $('lm-listas').innerHTML =
    (saem.length ? `<details open class="lm-bloco"><summary>Serão apagados (${saem.length})</summary>${saem.map(linha).join('')}</details>` : '') +
    (ficam.length ? `<details class="lm-bloco"><summary>Continuam no rebanho (${ficam.length})</summary>${ficam.map(linha).join('')}</details>` : '');
  const pesagensSaem = saem.reduce((s, a) => s + wOf(a.id).length, 0);
  $('lm-aviso').hidden = !saem.length;
  // Sem nada para apagar, ou sem ninguém sobrando, o botão nem liga: apagar o
  // rebanho inteiro por engano de dia seria a pior forma de descobrir o erro.
  btn.disabled = !saem.length || !ficam.length;
  btn.textContent = !ficam.length ? 'Confira os dias' :
    !saem.length ? 'Nada a apagar' :
    `Apagar ${saem.length} ${saem.length === 1 ? 'animal' : 'animais'} e ${pesagensSaem} ${pesagensSaem === 1 ? 'pesagem' : 'pesagens'}`;
}
$('menu-limpeza').addEventListener('click', () => {
  closeAllM();
  // Já vem marcado o que foi pedido no curral: o último dia de pesagem e o
  // anterior. Continua sendo uma sugestão — o que vale é o que estiver marcado.
  lmDias = new Set(diasDePesagem().slice(0, 2).map(d => d.data));
  renderDiasLimpeza(); renderLimpeza();
  openM('modal-limpeza');
});
$('lm-dias').addEventListener('change', e => {
  const cx = e.target.closest('[data-dia]');
  if (!cx) return;
  cx.checked ? lmDias.add(cx.dataset.dia) : lmDias.delete(cx.dataset.dia);
  renderLimpeza();
});
$('lm-backup').addEventListener('click', () => $('menu-backup').click());
$('lm-confirm').addEventListener('click', async () => {
  const { ficam, saem } = limpezaSeparar(lmDias);
  if (!saem.length || !ficam.length) return;
  const pesagensSaem = saem.flatMap(a => wOf(a.id));
  if (!confirm(`Apagar ${saem.length} animais e ${pesagensSaem.length} pesagens, em todos os aparelhos?\n\n`
    + `Ficam os ${ficam.length} pesados em ${[...lmDias].sort().reverse().map(fmtBR).join(' e ')}, com o histórico completo.\n\n`
    + 'Recomendado baixar o backup antes.')) return;
  const typed = prompt('Esta ação NÃO pode ser desfeita.\n\nPara confirmar, digite a palavra:\n\nAPAGAR');
  if (typed == null) return;
  if (typed.trim().toUpperCase() !== 'APAGAR') { toast('Confirmação incorreta — nada foi apagado'); return; }
  const ops = [
    ...pesagensSaem.map(w => ({ col: 'weighings', del: w.id })),
    ...saem.map(a => ({ col: 'animals', del: a.id }))
  ];
  // Tira do aparelho na hora. Sem isso, quem estivesse sem sinal continuaria
  // vendo o rebanho antigo até a nuvem responder — e no curral isso confunde.
  const idsSaem = new Set(saem.map(a => a.id));
  animals = animals.filter(a => !idsSaem.has(a.id));
  weighings = weighings.filter(w => !idsSaem.has(w.animalId));
  detailAnimal = null; closeAllM();
  salvarEspelho(true); render();
  toast('Apagando…');
  try {
    await batchWrite(ops);
    toast(`${saem.length} animais apagados · ${ficam.length} no rebanho`);
  } catch (e) { toast('Apagado no aparelho — a nuvem atualiza quando a internet voltar'); }
});

$('menu-migrate').addEventListener('click', () => { closeAllM(); migrateLegacy(); });
$('menu-leave').addEventListener('click', () => {
  // Três coisas que este botão precisa limpar, e uma delas quebrou sozinha.
  //
  // 1. O ESPELHO. Desde que o arranque passou a recuperar o código de dentro
  //    do espelho local (para não trancar ninguém fora da própria fazenda),
  //    apagar só a chave 'fjs-farm' deixou de desconectar: a página recarregava
  //    e voltava para a MESMA fazenda, como se o botão não existisse.
  // 2. A FILA. Alteração feita sem sinal fica guardada esperando internet. Se
  //    ela sobrevivesse à troca, subiria dentro da fazenda SEGUINTE — dado de
  //    uma fazenda aparecendo na outra, sem nada na tela explicando.
  // 3. A configuração, que já era.
  const naFila = pendentes.length;
  if (!confirm('Desconectar este aparelho?\n\n'
    + 'Os dados na nuvem permanecem. Para voltar, basta o código da fazenda.'
    + (naFila
      ? `\n\n⚠️ ATENÇÃO: ${naFila} alteração(ões) feita(s) sem sinal ainda NÃO subiram`
        + ' para a nuvem. Desconectando agora, elas se perdem.\n\n'
        + 'Conecte na internet e espere subir antes de desconectar.'
      : ''))) return;
  LS.del('fjs-fbconfig'); LS.del('fjs-farm'); LS.del(ESPELHO); LS.del('fjs-pendentes');
  location.reload();
});

// ===== Ajustes =====
$('set-yield').addEventListener('change', e => {
  let v = Math.round(parseNum(e.target.value));
  if (!Number.isFinite(v)) v = 52;
  v = Math.min(65, Math.max(40, v));
  e.target.value = v; settings.yield = v;
  salvarFazenda({ yield: v });
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
  // O código da fazenda é a senha dos próprios dados: é ele que faz o mesmo
  // rebanho aparecer em outro aparelho, e as regras da nuvem não deixam
  // ninguém listar fazendas — esquecido o código, não há como recuperá-lo.
  // Por isso ele fica em destaque, com um toque para copiar: era um texto
  // pequeno no meio do estado da conexão, e quem ia configurar o segundo
  // aparelho tinha de copiar à mão, olhando de um celular para o outro.
  $('menu-farm-info').innerHTML = farm
    ? `<span class="mf-rotulo">Código da fazenda — use o MESMO em todo aparelho</span>
       <button type="button" class="mf-codigo mono" id="mf-copiar" title="Toque para copiar">${esc(farm)}</button>
       <span class="mf-estado mono">${navigator.onLine ? 'on-line' : 'off-line — sincroniza quando a internet voltar'}</span>`
    : '<span class="mf-estado mono">Não conectado</span>';
  // A versão em que ESTE aparelho está. Sem isto, quando um recurso novo não
  // aparece não há como distinguir "o aplicativo está com defeito" de "este
  // celular ainda está na versão antiga, guardada pelo navegador".
  $('menu-farm-info').innerHTML += `<span class="mf-versao mono">versão ${VERSAO}</span>`;
  rotuloSelo();
  updateMigrateBtn();
  rotuloConferir();
  montarExportAtividades();
  openM('modal-menu');
});
document.addEventListener('click', async e => {
  if (!e.target.closest('#mf-copiar') || !farm) return;
  try {
    await navigator.clipboard.writeText(farm);
    toast('Código copiado — cole no outro aparelho');
  } catch (err) {
    // Sem permissão de área de transferência, seleciona para copiar à mão
    const alvo = $('mf-copiar');
    const faixa = document.createRange();
    faixa.selectNodeContents(alvo);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(faixa);
    toast('Segure sobre o código para copiar');
  }
});
$('btn-move-in').addEventListener('click', () => openMove(detailItem, 'entrada'));
$('btn-move-out').addEventListener('click', () => openMove(detailItem, 'saida'));
$('bfin-period').addEventListener('change', () => { guardarPeriodo('bfin-period'); render(); });
$('av-period').addEventListener('change', () => { guardarPeriodo('av-period'); render(); });
restaurarPeriodos();
// valor guardado pode estar desatualizado por uma versão antiga do app
if (![...$('bov-sort').options].some(o => o.value === bovSort)) bovSort = 'ident-asc';
$('bov-sort').value = bovSort;
$('bov-sort').addEventListener('change', e => { bovSort = e.target.value; LS.s('fjs-sort-rebanho', bovSort); render(); });
// Mesmo GMD do modo pesagem, guardado no mesmo lugar: é um número só da
// fazenda, e digitá-lo duas vezes acabaria com dois valores discordando.
$('bov-gmd-sim').value = LS.g('fjs-gmd-sim', '');
$('bov-gmd-sim').addEventListener('input', () => {
  LS.s('fjs-gmd-sim', $('bov-gmd-sim').value.trim());
  renderRebanho();
});
// Mesmo cuidado com o regime: valor guardado por uma versão antiga não pode
// deixar o seletor num estado que não existe mais.
definirRegime(regimeAtual());
// Os dobráveis feitos em HTML precisam do estado guardado aplicado uma vez, no
// arranque. A cada desenho seria pior: fecharia o bloco na mão de quem acabou
// de abri-lo.
document.querySelectorAll('details[data-dobra]').forEach(d => {
  d.open = dobraAberta(d.dataset.dobra);
});

document.addEventListener('click', e => {
  const vt = e.target.closest('[data-ver-tudo]');
  if (vt) { $(vt.dataset.verTudo).value = 'all'; guardarPeriodo(vt.dataset.verTudo); render(); return; }
  const lb = e.target.closest('[data-limpar-busca]');
  if (lb) { limparBusca(lb.dataset.limparBusca); return; }
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
    // A linha da conta a pagar É clicável e tem o botão de baixa DENTRO dela.
    // Sem esta saída, tocar em "Pagar" dava baixa e abria o lançamento por
    // cima — a tela do que acabou de ser pago, aparecendo sozinha.
    if (e.target.closest('[data-pagar]')) return;
    const book = tr.dataset.book;
    const t = arrLivro(book).find(x => x.id === tr.dataset.trans);
    // Toque que não produz resposta nenhuma é indistinguível de aplicativo
    // quebrado — foi assim que a linha da conta parecia estar antes de abrir.
    // Apagada no outro aparelho, a conta tem de DIZER que foi apagada.
    if (!t) return sumiu('Este lançamento foi removido');
    openTrans(book, t);
  }
});

$('fab').addEventListener('click', () => {
  // Na Fazenda o lançamento não tem livro definido: o formulário pergunta.
  if (tab === 'fazenda') return openTrans(null);   // pergunta a atividade
  if (tab === 'aviarios') return openTrans('av');
  if (seg === 'vendidas' || seg === 'custos') return;
  if (seg === 'compras') return openRebmov();
  if (seg === 'rebanho' && detailAnimal) return openWeighing(detailAnimal);
  if (seg === 'rebanho') return openAnimal();
  if (seg === 'estoque' && detailItem) return openMove(detailItem, 'entrada');
  if (seg === 'estoque') return openItem();
  return openTrans('bov');
});

// ===== Setup =====
// Quem chega aqui sem o código está trancado do lado de fora do próprio
// rebanho. Antes de mandar a pessoa procurar no console do Google, o
// aplicativo procura no que ela já tem na mão.
$('su-do-backup').addEventListener('click', () => $('su-backup-input').click());
$('su-backup-input').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';                     // o mesmo arquivo pode ser escolhido de novo
  if (!f) return;
  const err = $('su-error');
  const leitor = new FileReader();
  leitor.onerror = () => { err.hidden = false; err.textContent = 'Não consegui ler esse arquivo.'; };
  leitor.onload = () => {
    let d = null;
    try { d = JSON.parse(String(leitor.result)); } catch (x) { d = null; }
    if (!d || d.app !== 'fazendajs') {
      err.hidden = false; err.textContent = 'Esse arquivo não é um backup do Fazenda J.S.'; return;
    }
    if (!d.farm) {
      // Backups antigos (v6 e anteriores) foram gravados sem o código dentro.
      err.hidden = false;
      err.textContent = 'Esse backup é de uma versão que ainda não guardava o código junto. '
        + 'Ele serve para restaurar os dados, mas não para lembrar o código.';
      return;
    }
    err.hidden = true;
    $('su-farm').value = d.farm;
    toast('Código encontrado no backup — confira e toque em Conectar');
  };
  leitor.readAsText(f);
});
$('su-connect').addEventListener('click', () => {
  const err = $('su-error'); err.hidden = true;
  const colado = $('su-config').value.trim();
  // Em branco usa a configuração de sempre. Colado, TEM de ser válido: aceitar
  // um texto quebrado caindo no padrão ligaria a pessoa, calada, num projeto
  // que não é o dela — e ela só descobriria pela fazenda vazia.
  const cfg = colado ? parseConfig(colado) : CONFIG_PADRAO;
  const farmCode = $('su-farm').value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!cfg) { err.hidden = false; err.textContent = 'Configuração inválida. Cole o bloco firebaseConfig completo, com apiKey e projectId — ou deixe em branco para usar a de sempre.'; return; }
  if (!farmCode) {
    err.hidden = false;
    err.textContent = 'Escreva o código da fazenda — é ele que encontra os seus dados.';
    return;
  }
  // Login anônimo é aberto a qualquer um, e as regras liberam LEITURA E ESCRITA
  // dentro de farms/{código} para qualquer autenticado. Não há identidade e não
  // há como limitar tentativas: quem adivinha o código lê tudo e APAGA tudo. O
  // comprimento do código é literalmente a única barreira que existe.
  //
  // Mas isto AVISA, não barra. Barrar código curto trancava do lado de fora
  // quem já tinha uma fazenda criada com um código curto — quem mais precisa
  // desta tela é justamente quem está voltando, e recusar o código certo dele
  // seria o pior defeito possível aqui.
  if (farmCode.length < 12 && !confirm(
      'Esse código tem menos de 12 caracteres.\n\n'
      + 'O código é a SENHA dos seus dados: quem adivinhar lê e apaga tudo.\n\n'
      + 'Se é o código de uma fazenda que você JÁ tem, siga em frente. '
      + 'Se está criando agora, volte e use algo mais longo '
      + '(ex.: js-boi-2026-x7k9m2).\n\nContinuar assim mesmo?')) return;
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

// ===== Selo no ícone do aplicativo =====
// O pedido era "criar o lembrete sem me fazer confirmar no calendário". No
// calendário não dá: a Apple exige um toque para qualquer aplicativo pôr ou
// tirar evento, e web nenhuma passa por cima disso.
//
// O que passa é o SELO: aquele número vermelho no canto do ícone. Pede
// permissão UMA vez e depois atualiza calado, sem toque nenhum, toda vez que o
// aplicativo abre. Não toca alarme — mas fica na tela de início o dia inteiro
// dizendo quantas contas estão vencidas ou vencendo, que é o lembrete que não
// depende de ninguém confirmar nada.
const SELO = 'fjs-selo';
const seloLigado = () => LS.g(SELO, false) === true;
const temSelo = () => typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
let seloAtual = -1;
const contasDoSelo = () =>
  LIVROS.flatMap(b => contasAPagar(arrLivro(b))).filter(c => c.dias <= AVISO_DIAS).length;
function atualizarSelo() {
  if (!temSelo()) return;
  const n = seloLigado() ? contasDoSelo() : 0;
  // Só mexe quando o número MUDA: render() roda a cada toque na tela, e pedir
  // ao sistema para repintar o ícone a cada toque é trabalho jogado fora.
  if (n === seloAtual) return;
  seloAtual = n;
  try { n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge(); }
  catch (e) { /* aparelho recusou o selo: não é motivo para quebrar a tela */ }
}
function rotuloSelo() {
  const el = $('menu-selo-rot');
  if (el) el.textContent = seloLigado()
    ? 'Aviso no ícone: LIGADO' : 'Aviso no ícone do aplicativo';
}
$('menu-selo').addEventListener('click', async () => {
  closeAllM();
  if (seloLigado()) {
    LS.s(SELO, false); seloAtual = -1; atualizarSelo(); rotuloSelo();
    toast('Aviso no ícone desligado');
    return;
  }
  if (!temSelo()) { toast('Este aparelho não mostra aviso no ícone do aplicativo'); return; }
  // No iPhone o selo só existe para o aplicativo INSTALADO na tela de início, e
  // só depois da permissão de notificação. Dizer isso antes evita o pior
  // desfecho: ligar, não ver selo nenhum e concluir que está quebrado.
  if (noIOS() && !instalado()) {
    toast('Primeiro adicione o aplicativo à tela de início — o selo é do atalho');
    return;
  }
  let permissao = typeof Notification === 'undefined' ? 'granted' : Notification.permission;
  if (permissao === 'default') {
    try { permissao = await Notification.requestPermission(); } catch (e) { permissao = 'denied'; }
  }
  if (permissao === 'denied') {
    toast('Permissão negada — ative em Ajustes → Notificações → Fazenda J.S');
    return;
  }
  LS.s(SELO, true); seloAtual = -1; atualizarSelo(); rotuloSelo();
  const n = contasDoSelo();
  toast(n ? `Ligado — ${n} conta(s) no ícone` : 'Ligado — o número aparece quando houver conta vencendo');
});

// ===== Atividades da fazenda =====
// A lista mora no documento da fazenda, junto dos outros ajustes, e por isso
// chega sozinha em todos os aparelhos. Cada atividade guarda os lançamentos
// dela numa coleção própria — o nome dela sai do id, nunca do nome escrito,
// senão renomear "Soja" perderia todo o financeiro da soja.
const chaveNome = n => semAcento(String(n || '').trim()).replace(/\s+/g, ' ');
function erroAtividade(msg) {
  const e = $('at-erro');
  if (!msg) { e.hidden = true; return; }
  e.hidden = false; e.textContent = msg;
}
function nomeAtividadeValido(nome, idIgnorar) {
  const limpo = String(nome || '').trim();
  if (!limpo) return 'Escreva o nome da atividade.';
  if (limpo.length > 40) return 'Nome muito comprido — use até 40 caracteres.';
  const k = chaveNome(limpo);
  if (LIVROS_FIXOS.some(b => chaveNome(NOME_FIXO[b]) === k)) {
    return `"${limpo}" já é uma das atividades fixas.`;
  }
  if (atividades.some(a => a.id !== idIgnorar && chaveNome(a.nome) === k)) {
    return `Já existe uma atividade chamada "${limpo}".`;
  }
  return '';
}
function guardarAtividades() {
  recomputarLivros();
  salvarFazenda({ atividades: atividades.map(a => ({ id: a.id, nome: a.nome })) });
  salvarEspelho(true);
  if (db && farm) subscribe();
  renderAtividades();
  render();
}
function renderAtividades() {
  const box = $('at-lista');
  if (!box) return;
  const linha = (nome, quantos, botoes) =>
    `<div class="at-linha"><div class="at-info"><b>${esc(nome)}</b>`
    + `<span class="at-n mono">${quantos} lançamento(s)</span></div>${botoes}</div>`;
  box.innerHTML = LIVROS_FIXOS.map(b =>
      linha(NOME_FIXO[b], arrLivro(b).length, '<span class="at-fixa mono">fixa</span>'))
    .concat(atividades.map(a => linha(a.nome, arrLivro(a.id).length,
      `<div class="at-botoes"><button type="button" class="btn-small" data-at-renomear="${esc(a.id)}">Renomear</button>`
      + `<button type="button" class="btn-small out" data-at-apagar="${esc(a.id)}">Apagar</button></div>`)))
    .join('');
}
$('menu-atividades').addEventListener('click', () => {
  closeAllM(); erroAtividade(''); $('at-nome').value = '';
  renderAtividades(); openM('modal-atividades');
});
$('at-criar').addEventListener('click', () => {
  const nome = $('at-nome').value.trim();
  const erro = nomeAtividadeValido(nome, null);
  if (erro) { erroAtividade(erro); return; }
  erroAtividade('');
  atividades = atividades.concat([{ id: 'at' + uid(), nome }]);
  $('at-nome').value = '';
  guardarAtividades();
  toast(`Atividade "${nome}" criada`);
});
document.addEventListener('click', async e => {
  const ren = e.target.closest && e.target.closest('[data-at-renomear]');
  if (ren) {
    const a = atividades.find(x => x.id === ren.dataset.atRenomear);
    if (!a) return;
    const novo = prompt('Novo nome da atividade:', a.nome);
    if (novo == null) return;
    const erro = nomeAtividadeValido(novo, a.id);
    if (erro) { alert(erro); return; }
    // Só o nome muda. O id fica, e com ele todo o financeiro da atividade.
    atividades = atividades.map(x => x.id === a.id ? { id: x.id, nome: novo.trim() } : x);
    guardarAtividades();
    toast('Atividade renomeada');
    return;
  }
  const del = e.target.closest && e.target.closest('[data-at-apagar]');
  if (!del) return;
  const a = atividades.find(x => x.id === del.dataset.atApagar);
  if (!a) return;
  const lancs = arrLivro(a.id).slice();
  // Apagar a atividade apaga o dinheiro dela. Isso precisa estar escrito com o
  // número na frente, antes do toque — depois não há como voltar.
  const aviso = lancs.length
    ? `Apagar a atividade "${a.nome}" e os ${lancs.length} lançamento(s) dela?\n\n`
      + 'Isto NÃO pode ser desfeito e vale para todos os aparelhos.\n\n'
      + 'Se quiser guardar esses lançamentos, cancele e baixe um backup antes.'
    : `Apagar a atividade "${a.nome}"?`;
  if (!confirm(aviso)) return;
  const col = colLivro(a.id);
  // As contas a prazo dela saem do calendário junto: lembrete de uma atividade
  // que não existe mais não teria como ser rastreado até a origem.
  agendarMudanca([], a.id, lancs.filter(emAberto).map(x => x.id));
  atividades = atividades.filter(x => x.id !== a.id);
  delete extraT[a.id];
  guardarAtividades();
  try { await batchWrite(lancs.map(x => ({ col, del: x.id }))); }
  catch (err) { toast('A atividade saiu daqui — os lançamentos somem da nuvem quando houver sinal'); }
  toast(`Atividade "${a.nome}" apagada`);
});

// ===== Conferir os valores já lançados =====
// Uma correção de leitura não corrige o passado.
//
// O aplicativo lia "10.000" no campo de valor como R$ 10,00 — mil vezes menos,
// em silêncio — e recusava "1.000.000". A leitura foi acertada, mas o que foi
// lançado antes está salvo com o número que foi lido na hora, e nenhum código
// adivinha agora o que o dedo quis dizer então. Quem sabe é o dono.
//
// Então esta tela faz o que dá para fazer com honestidade: procura no que já
// está salvo os valores que CAIRIAM nessa armadilha, mostra cada um com a data
// e a descrição, e deixa a correção a um toque — nunca em bloco, nunca sozinha.
//
// O que a busca encontra, e por quê:
//
//  · centavo com três casas (R$ 12,345) é IMPOSSÍVEL em real: é assinatura
//    certa do erro, porque "12.345" lido como decimal dá exatamente isso;
//  · lançamento abaixo de R$ 100 numa fazenda é raro, e é onde todo valor
//    entre mil e cem mil reais aterrissa quando o ponto é lido como vírgula;
//  · compra de estoque cujo TOTAL não chega a R$ 100 — o preço unitário
//    sozinho não diz nada (sal mineral é R$ 3,50/kg mesmo), o total diz;
//  · venda de animal por menos de R$ 100, que não existe;
//  · pesagem abaixo de 50 kg, que nenhum bovino tem.
//
// Preço unitário e quantidade, isolados, não têm como ser julgados pelo valor:
// 1,25 pode ser um preço de verdade. Por isso a compra entra pelo total, e a
// tela diz isso em vez de fingir certeza.
const CV_DINHEIRO = 100;   // lançamento menor que isto, numa fazenda, é raro
const CV_PESO = 50;        // nenhum bovino pesa menos que isto
const casasDe = v => {
  if (!Number.isFinite(v)) return 0;
  const s = String(v), p = s.indexOf('.');
  return p < 0 ? 0 : s.length - p - 1;
};
// "× 1.000" com o arredondamento do dinheiro, senão 0,07 × 1000 viraria
// 70,00000000000001 e o centavo entraria torto na nuvem.
const vezesMil = v => Math.round(v * 100000) / 100;
function valoresSuspeitos() {
  const achados = [];
  const dinheiro = v => Number.isFinite(v) && v > 0 && (casasDe(v) > 2 || v < CV_DINHEIRO);
  const grupoVisto = new Set();
  LIVROS.forEach(b => arrLivro(b).forEach(t => {
    if (!dinheiro(t.amount)) return;
    // Lançamento gerado por outra coisa não se conserta aqui: mexer nele
    // deixaria a compra (ou a venda do animal) contando outra história. A
    // origem é que aparece na lista, logo abaixo.
    if (t.lock) return;
    // Carnê é UM erro, não três. Três linhas iguais na lista fariam o dono
    // conferir a mesma compra parcela por parcela, e é no meio dessa repetição
    // que o erro de verdade passa batido.
    const doGrupo = t.grupo ? arrLivro(b).filter(x => x.grupo === t.grupo) : [t];
    if (t.grupo) {
      if (grupoVisto.has(t.grupo)) return;
      grupoVisto.add(t.grupo);
    }
    const soma = doGrupo.reduce((sm, x) => sm + x.amount, 0);
    achados.push({ o: 'lancamento', grave: doGrupo.some(x => casasDe(x.amount) > 2), livro: b, id: t.id,
      valor: soma, data: t.date,
      quem: `${NOME_LIVRO[b]} · ${t.category || 'sem categoria'}`
        + (doGrupo.length > 1 ? ` · ${doGrupo.length}× de ${fmtRS(t.amount)}` : '')
        + (t.notes ? ' · ' + t.notes : ''),
      parcelas: doGrupo.length });
  }));
  moves.forEach(m => {
    if (m.type !== 'entrada') return;
    const total = (m.qty || 0) * (m.cost || 0);
    if (!dinheiro(total) && !(Number.isFinite(m.cost) && casasDe(m.cost) > 2)) return;
    const it = items.find(x => x.id === m.itemId);
    achados.push({ o: 'move', grave: casasDe(m.cost || 0) > 2, id: m.id, itemId: m.itemId,
      valor: total, data: m.date,
      quem: `Compra de estoque · ${it ? it.name : 'item removido'} · ${fmtN(m.qty, 2)} ${it ? it.unit : ''} × ${fmtRS(m.cost || 0)}` });
  });
  animals.forEach(a => {
    if (!a.sold || !dinheiro(a.soldPrice)) return;
    achados.push({ o: 'animal', grave: casasDe(a.soldPrice) > 2, id: a.id,
      valor: a.soldPrice, data: a.soldDate,
      quem: `Venda do animal ${a.ident}` });
  });
  weighings.forEach(w => {
    if (!Number.isFinite(w.weight) || w.weight <= 0 || w.weight >= CV_PESO) return;
    const a = animals.find(x => x.id === w.animalId);
    achados.push({ o: 'pesagem', grave: true, id: w.id, animalId: w.animalId,
      peso: w.weight, data: w.date,
      quem: `Pesagem de ${a ? a.ident : '?'} · ${fmtN(w.weight, 1)} kg` });
  });
  return achados.sort((x, y) => (y.grave - x.grave) || String(y.data).localeCompare(String(x.data)));
}
function renderConferir() {
  const achados = valoresSuspeitos();
  const quantos = LIVROS.reduce((s, b) => s + arrLivro(b).length, 0);
  $('cv-explica').innerHTML = 'Até a versão 89, um valor escrito com ponto e sem vírgula — <b>10.000</b> — '
    + 'era lido como <b>R$ 10,00</b>. Isso foi corrigido, mas o que já estava salvo '
    + 'continua com o número que foi lido na hora. Esta tela procura o que pode ter caído nisso: '
    + `centavo com três casas, lançamento abaixo de ${fmtRS(CV_DINHEIRO)}, compra de estoque que não chega a esse total, `
    + `venda de animal por menos que isso e pesagem abaixo de ${CV_PESO} kg.`;
  const el = $('cv-resultado');
  if (!achados.length) {
    el.innerHTML = `<div class="cv-limpo">
      <p><b>Nada fora do lugar.</b></p>
      <p class="small">Conferidos ${quantos} lançamento(s), ${moves.length} movimentação(ões) de estoque, `
      + `${animals.filter(a => a.sold).length} venda(s) e ${weighings.length} pesagem(ns). `
      + 'Nenhum valor caiu na armadilha do ponto.</p></div>';
    return;
  }
  const graves = achados.filter(a => a.grave), olhar = achados.filter(a => !a.grave);
  const linha = a => {
    const valor = a.o === 'pesagem' ? `${fmtN(a.peso, 1)} kg` : fmtRS(a.valor);
    const botao = a.o === 'lancamento'
      ? `<button type="button" class="btn-small cv-mil" data-cv-mil="${esc(a.id)}" data-cv-livro="${esc(a.livro)}">× 1.000${a.parcelas > 1 ? ` (${a.parcelas} parcelas)` : ''}</button>`
      : `<button type="button" class="btn-small" data-cv-abrir="${a.o}" data-cv-id="${esc(a.id)}">Abrir</button>`;
    return `<div class="cv-linha${a.grave ? ' cv-grave' : ''}">
      <div class="cv-quem"><b>${esc(a.quem)}</b><span class="mono">${a.data ? fmtBRfull(a.data) : 'sem data'}</span></div>
      <span class="cv-valor">${valor}</span>${botao}
    </div>`;
  };
  el.innerHTML = (graves.length ? `<p class="cv-titulo cv-grave-t">Valor impossível — ${graves.length}</p>`
      + '<p class="small">Centavo com três casas, ou bovino com menos de 50 kg. Nenhum dos dois existe: é erro de leitura, certo.</p>'
      + graves.map(linha).join('') : '')
    + (olhar.length ? `<p class="cv-titulo">Vale conferir — ${olhar.length}</p>`
      + '<p class="small">Pode ser um valor pequeno de verdade. Só você sabe: confira a data e a descrição antes de corrigir.</p>'
      + olhar.map(linha).join('') : '');
}
// O número no próprio item do menu. Uma tela de conferência que não se anuncia
// só é usada por quem já desconfia de algo — e o erro de mil vezes é exatamente
// o que NÃO levanta suspeita: o lançamento está lá, com data e categoria, só
// com o valor errado. Com o número ao lado, a conferência se oferece onde o
// dono já olha, sem alarme na cara de quem não tem nada a corrigir.
function rotuloConferir() {
  const el = $('menu-conferir-rot');
  if (!el) return;
  const n = valoresSuspeitos().length;
  el.textContent = n ? `Conferir valores já lançados (${n})` : 'Conferir valores já lançados';
  $('menu-conferir').classList.toggle('cv-tem', n > 0);
}
$('menu-conferir').addEventListener('click', () => { closeAllM(); renderConferir(); openM('modal-conferir'); });
document.addEventListener('click', e => {
  const mil = e.target.closest('[data-cv-mil]');
  if (mil) {
    const livro = mil.dataset.cvLivro, arr = arrLivro(livro);
    const t = arr.find(x => x.id === mil.dataset.cvMil);
    if (!t) { renderConferir(); return sumiu('Este lançamento foi removido'); }
    // Carnê se corrige inteiro: deixar uma parcela mil vezes maior que as
    // outras seria trocar um erro visível por um erro difícil de achar.
    const alvos = t.grupo ? arr.filter(x => x.grupo === t.grupo) : [t];
    const de = alvos.reduce((s, x) => s + x.amount, 0);
    if (!confirm(`Multiplicar por mil?\n\n${t.category || 'Lançamento'} · ${fmtBRfull(t.date)}\n\n`
      + `${alvos.length > 1 ? `${alvos.length} parcelas, somando ` : ''}${fmtRS(de)}  →  ${fmtRS(vezesMil(de))}\n\n`
      + 'Vale para todos os aparelhos.')) return;
    alvos.forEach(x => { x.amount = vezesMil(x.amount); });
    escreverVarias(colLivro(livro), alvos);
    // O valor vai no lembrete do calendário: deixá-lo velho ali seria cobrar
    // a conta antiga depois de corrigir a nova.
    agendarMudanca(alvos, livro);
    render(); renderConferir(); toast('Valor corrigido');
    return;
  }
  const abrir = e.target.closest('[data-cv-abrir]');
  if (!abrir) return;
  const id = abrir.dataset.cvId;
  closeAllM();
  if (abrir.dataset.cvAbrir === 'move') {
    const m = moves.find(x => x.id === id);
    if (m) openMove(m.itemId, m.type, m); else sumiu('Esta movimentação foi removida');
  } else if (abrir.dataset.cvAbrir === 'animal') {
    const a = animals.find(x => x.id === id);
    if (a) openAnimal(a); else sumiu('Este animal foi removido');
  } else if (abrir.dataset.cvAbrir === 'pesagem') {
    const w = weighings.find(x => x.id === id);
    if (w) openWeighing(w.animalId, w); else sumiu('Esta pesagem foi removida');
  }
});

// ===== Ícone da tela de início =====
// O logo da fazenda mudou, mas o atalho já instalado continua com o desenho
// velho. Isso não tem conserto pelo código: o iOS baixa o ícone UMA vez, na
// hora em que o atalho é criado, e nunca mais volta a buscar — não existe API,
// nem cabeçalho, nem versão de arquivo que force a troca. Já troquei o nome do
// arquivo do ícone justamente para o cache do aparelho não ter o que
// reaproveitar num atalho NOVO; o antigo, só refazendo.
//
// Então o que o aplicativo pode fazer é a única coisa que sobra: não deixar a
// receita na cabeça de quem usa. O caminho fica guardado aqui dentro, a um
// toque, com o logo certo na tela para comparar com o da tela de início.
const ENDERECO_APP = 'https://fazenda-e3652.web.app';
const enderecoDoApp = () => {
  // Em teste o app roda em localhost; mandar o endereço de produção ali seria
  // mentira. Fora de produção, mostra o endereço de onde ele realmente está.
  try {
    const h = location.hostname;
    if (h === 'fazenda-e3652.web.app' || h === 'localhost' || h === '127.0.0.1' || !h) return ENDERECO_APP;
    return location.origin;
  } catch (e) { return ENDERECO_APP; }
};
function abrirTelaIcone() {
  $('ic-endereco').textContent = enderecoDoApp();
  closeAllM();
  openM('modal-icone');
}
$('menu-icone').addEventListener('click', abrirTelaIcone);
$('icone-btn').addEventListener('click', abrirTelaIcone);
$('ic-copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(enderecoDoApp()); toast('Endereço copiado — cole no Safari'); }
  catch (e) { toast('Não deu para copiar — o endereço está escrito acima'); }
});
const esconderBannerIcone = () => { $('icone-banner').hidden = true; };
// "Já arrumei" cala de vez; o × cala só desta vez. Quem refez o atalho não
// pode continuar levando o mesmo aviso todo dia.
$('ic-pronto').addEventListener('click', () => {
  localStorage.setItem('fjs-icone-ok', '1');
  esconderBannerIcone(); closeAllM(); toast('Combinado — não aviso mais');
});
$('icone-fechar').addEventListener('click', esconderBannerIcone);
// O aviso só aparece para quem está no modo aplicativo num iPhone: no
// navegador não existe atalho para arrumar, e o aviso seria ruído. Não dá para
// saber POR CÓDIGO se o ícone é o velho ou o novo — por isso a frase pergunta
// em vez de afirmar, e some no primeiro "já arrumei".
if (precisaDaTela() && !localStorage.getItem('fjs-icone-ok')) $('icone-banner').hidden = false;
// ===== Atualização do aplicativo =====
// A verificação de versão acontecia UMA vez, ao carregar, e nunca mais. Com o
// app aberto o dia inteiro no iPad, versão nova só chegava fechando e abrindo —
// e no modo aplicativo o iOS nem oferece puxar-para-atualizar (o gesto está
// desligado de propósito, para ninguém recarregar sem querer no meio da
// pesagem). Agora o app procura sozinho e AVISA quando há novidade.
let regSW = null, jaAvisouVersao = false;
function mostrarAvisoVersao() {
  if (jaAvisouVersao) return;
  jaAvisouVersao = true;
  $('atualizacao').hidden = false;
}
function procurarAtualizacao(manual) {
  if (!regSW) { if (manual) toast('Atualização automática indisponível neste aparelho'); return; }
  if (manual) toast('Procurando atualização…');
  regSW.update()
    .then(() => { if (manual && !jaAvisouVersao) toast('O aplicativo já está na versão mais nova'); })
    .catch(() => { if (manual) toast('Sem internet para procurar atualização'); });
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => {
  // updateViaCache: 'none' impede que o próprio sw.js seja lido do cache do
  // navegador — sem isso, uma versão nova pode demorar a chegar ao aparelho.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => {
      regSW = reg;
      reg.update().catch(() => {});
      // Chegou versão nova: avisa, mas NÃO recarrega sozinho. Recarregar no meio
      // de uma pesagem tiraria a tela debaixo de quem está com o gado na balança.
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoVersao();
        });
      });
      if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoVersao();
    })
    .catch(() => {});
  // Procura ao voltar para o aplicativo e de hora em hora com ele aberto.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) procurarAtualizacao(false); });
  window.addEventListener('online', () => procurarAtualizacao(false));
  setInterval(() => procurarAtualizacao(false), 60 * 60 * 1000);
});
$('at-aplicar').addEventListener('click', () => {
  $('at-aplicar').textContent = 'Atualizando…';
  location.reload();
});
$('at-depois').addEventListener('click', () => { $('atualizacao').hidden = true; });
$('menu-atualizar').addEventListener('click', () => { closeAllM(); procurarAtualizacao(true); });

// ===== Início =====
(function init() {
  render();
  // Sem configuração guardada, usa a embutida: o que decide se o aplicativo
  // abre ou pede tela de entrada é ter o CÓDIGO DA FAZENDA, que é o que
  // realmente encontra os dados. Antes, perder a configuração sozinha já
  // mandava para a tela de entrada mesmo com o código na mão.
  const cfg = LS.g('fjs-fbconfig', null) || CONFIG_PADRAO;
  // O espelho local sempre guardou o código junto com os dados, e o aplicativo
  // ignorava isso: bastava a chave 'fjs-farm' sumir para a tela de entrada
  // aparecer com o código ali do lado, a um palmo, sem ninguém olhar. Agora
  // olha — e regrava, para não voltar a perguntar.
  const espelho = LS.g(ESPELHO, null);
  const savedFarm = LS.g('fjs-farm', null) || (espelho && espelho.farm) || null;
  if (savedFarm && !LS.g('fjs-farm', null)) LS.s('fjs-farm', savedFarm);
  if (savedFarm) {
    farm = savedFarm;
    if (carregarEspelho(savedFarm)) render();   // dados do aparelho já na tela
    atualizarPendentes();
    connect(cfg, savedFarm);
  }
  else { $('setup-screen').hidden = false; }
})();
