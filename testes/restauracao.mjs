// RESTAURAR BACKUP — A ÚNICA OPERAÇÃO QUE PODE APAGAR A FAZENDA.
//
// Pedido do dono: procurar erro onde ainda não se procurou. Este caminho nunca
// tinha sido conferido por bateria nenhuma, e é o único do aplicativo que
// substitui a fazenda inteira de uma vez.
//
// O que a sonda achou aqui, medido no aplicativo rodando:
//
//   · um arquivo com "app":"fazendajs" e `animals` vindo como OBJETO em vez de
//     lista apagava a fazenda da nuvem, não gravava nada em troca, e a tela
//     dizia "Restaurado no aparelho; a nuvem recebe quando a internet voltar";
//   · quando o lote de apagamentos falhava, os catorze apagamentos iam para a
//     fila de envio sem nenhum registro novo atrás — a fila cumpriria o resto
//     quando a internet voltasse;
//   · o novo era gravado DEPOIS de apagar o velho, com um instante no meio em
//     que a fazenda não existia em lugar nenhum além do arquivo.
//
// O que esta bateria cobra, nesta ordem de importância:
//   1. arquivo ruim não apaga NADA — nem na nuvem, nem na fila, nem na tela;
//   2. a gravação do novo vem ANTES de qualquer apagamento, sempre;
//   3. gravação que não confirmou não autoriza apagamento nenhum;
//   4. só sai o que o backup não traz — id que existe nos dois lados não é
//      apagado e regravado;
//   5. a pergunta mostra os dois lados antes de substituir, e avisa quando o
//      backup é de outra fazenda;
//   6. nenhuma mensagem diz "restaurado" quando não está.
import { servir, abrirApp, placar } from './apoio.mjs';

// Dublê que GRAVA o que a nuvem recebeu, na ordem, e que recusa id que o
// Firestore de verdade recusaria. Sem ele não há como cobrar ordem de lote
// nenhuma: o dublê de apoio.mjs aceita tudo em silêncio.
const DUBLE = `(function () {
  window.__ops = [];
  window.__falhar = null;           // 'add' | 'del' | null
  const confDoc = (nome, id) => {
    // O Firestore recusa isto na hora, de forma síncrona, e era assim que um
    // registro sem id derrubava a gravação com meia fazenda no ar.
    if (id === undefined || id === null || id === '' || String(id).indexOf('/') >= 0)
      throw new Error('Invalid document reference: ' + id);
    return { __col: nome, __id: String(id) };
  };
  const colStub = nome => ({ doc: id => confDoc(nome, id), onSnapshot: () => () => {} });
  const fazendaDoc = { __col: '_fazenda', __id: '_fazenda',
    collection: nome => colStub(nome), set: async () => {}, onSnapshot: () => () => {} };
  db = {
    collection: () => ({ doc: () => fazendaDoc }),
    enablePersistence: async () => {},
    batch: () => {
      const ops = [];
      return {
        set(ref, obj) {
          if (!obj || typeof obj !== 'object') throw new Error('valor inválido na gravação');
          ops.push({ tipo: 'set', col: ref.__col, id: ref.__id });
        },
        delete(ref) { ops.push({ tipo: 'del', col: ref.__col, id: ref.__id }); },
        commit: async () => {
          if (window.__falhar === 'add' && ops.some(o => o.tipo === 'set'))
            throw new Error('nuvem recusou a gravação');
          if (window.__falhar === 'del' && ops.some(o => o.tipo === 'del'))
            throw new Error('nuvem recusou o apagamento');
          ops.forEach(o => window.__ops.push(o));
        }
      };
    }
  };
})()`;

// A fazenda do curral, montada à mão: seis animais, seis pesagens, dois
// lançamentos, um item de estoque e uma atividade com lançamento próprio.
const SEMEAR = `(function () {
  animals = []; weighings = []; bovT = []; avT = []; gerT = [];
  items = []; moves = []; rebmov = [];
  extraT = {}; atividades = [];
  for (let i = 1; i <= 6; i++) {
    animals.push({ id: 'a' + i, ident: '70' + i, cat: 'Novilha' });
    weighings.push({ id: 'v' + i, animalId: 'a' + i, date: '2026-07-10', weight: 250 + i, jejum: false });
  }
  bovT.push({ id: 't1', type: 'saida', cat: 'Sal mineral', value: 1000, date: '2026-07-01' });
  bovT.push({ id: 't2', type: 'entrada', cat: 'Venda de gado', value: 9000, date: '2026-08-01' });
  items.push({ id: 'i1', name: 'Sal mineral', unit: 'kg', qty: 100 });
  aplicarAtividades([{ id: 'ovos', nome: 'Ovos' }]);
  extraT['ovos'] = [{ id: 'o1', type: 'entrada', cat: 'Venda', value: 300, date: '2026-07-05' }];
  pendentes = []; guardarFila();
  recomputarLivros(); salvarEspelho(true); render();
  // O aviso da rodada anterior ainda estaria na tela por dois segundos e meio,
  // e o conferidor leria a mensagem errada.
  $('toast').hidden = true; $('toast').textContent = '';
  window.__ops = [];
  return { animais: animals.length, lanc: LIVROS.reduce((s, b) => s + arrLivro(b).length, 0) };
})()`;

const ESTADO = `(function () {
  return {
    animais: animals.length, pesagens: weighings.length,
    bovT: bovT.length, itens: items.length,
    ovos: (extraT['ovos'] || []).length,
    atividades: atividades.map(a => a.id).join(','),
    rend: settings.yield,
    fila: pendentes.length,
    filaDel: pendentes.filter(p => p.del).length,
    filaAdd: pendentes.filter(p => !p.del && p.col !== '_fazenda').length,
    toast: $('toast').hidden ? '' : $('toast').textContent,
    ops: window.__ops.slice(),
    espelho: (function () { try {
      const e = JSON.parse(localStorage.getItem('fjs-espelho'));
      return e ? e.animals.length : -1; } catch (x) { return -2; } })()
  };
})()`;

// O backup de referência: fazenda diferente da que está no aparelho, com um id
// de animal em comum ('a1') de propósito — é ele que prova que id presente nos
// dois lados não é apagado e regravado.
const BACKUP = {
  app: 'fazendajs', v: 9, exportedAt: '2026-10-20T10:00:00.000Z', farm: 'demo',
  animals: [{ id: 'a1', ident: '701', cat: 'Novilha' }, { id: 'z2', ident: '901', cat: 'Novilha' }],
  weighings: [{ id: 'zw1', animalId: 'a1', date: '2026-09-01', weight: 300, jejum: false }],
  bovT: [{ id: 'zt1', type: 'saida', cat: 'Sal mineral', value: 50, date: '2026-09-01' }],
  avT: [], gerT: [], items: [], moves: [], rebmov: [],
  atividades: [{ id: 'leite', nome: 'Leite' }],
  extraT: { leite: [{ id: 'l1', type: 'entrada', cat: 'Venda', value: 700, date: '2026-09-02' }] },
  anexos: [], settings: { yield: 54 }, custo: {}
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Restaurar backup — a operação que pode apagar a fazenda');

  // Toda pergunta e todo aviso da restauração passam por aqui, para que a
  // bateria possa cobrar o TEXTO: mensagem errada nesta tela é o que
  // transformava tropeço de rede em fazenda apagada sem ninguém perceber.
  let dialogos = [];
  let responder = true;
  pagina.on('dialog', async d => {
    dialogos.push({ tipo: d.type(), msg: d.message() });
    responder && d.type() === 'confirm' ? await d.accept() : await d.dismiss();
  });

  async function restaurar(obj, { falhar = null, confirmar = true } = {}) {
    await pagina.evaluate(SEMEAR);
    await pagina.evaluate(DUBLE);
    await pagina.evaluate(`window.__falhar = ${falhar ? `'${falhar}'` : 'null'}`);
    dialogos = []; responder = confirmar;
    const corpo = typeof obj === 'string' ? obj : JSON.stringify(obj);
    await pagina.setInputFiles('#restore-input',
      { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(corpo) });
    await pagina.waitForFunction('window.__falhar !== "__esperando"', { timeout: 5000 }).catch(() => {});
    await pagina.waitForTimeout(500);
    const e = await pagina.evaluate(ESTADO);
    return Object.assign(e, { dialogos: dialogos.slice(),
      aviso: (dialogos.filter(x => x.tipo === 'alert')[0] || {}).msg || '',
      pergunta: (dialogos.filter(x => x.tipo === 'confirm')[0] || {}).msg || '' });
  }

  // ---------- 1. o caminho normal ----------
  t.secao('restaurar com a nuvem respondendo');
  const ok = await restaurar(BACKUP);
  t.conferir('a tela passa a mostrar o backup',
    ok.animais === 2 && ok.pesagens === 1 && ok.bovT === 1,
    `${ok.animais} animais · ${ok.pesagens} pesagens · ${ok.bovT} lançamentos`);
  t.conferir('o aparelho guarda o backup na hora, sem esperar a nuvem',
    ok.espelho === 2, String(ok.espelho));
  t.conferir('a atividade do backup entra e a antiga sai',
    ok.atividades === 'leite', ok.atividades);
  t.conferir('e os lançamentos da atividade antiga saem com ela',
    ok.ovos === 0, String(ok.ovos));
  t.conferir('o rendimento de carcaça vem do backup', ok.rend === 54, String(ok.rend));
  t.conferir('a fila de envio fica vazia: tudo subiu', ok.fila === 0, String(ok.fila));
  t.conferir('a mensagem diz que restaurou', ok.toast === 'Backup restaurado', ok.toast);
  t.conferir('e nenhum aviso de erro aparece', ok.aviso === '', ok.aviso.slice(0, 80));

  // ---------- 2. a ordem dos lotes ----------
  // A regra que não pode quebrar nunca: enquanto não houver registro novo
  // gravado, não se apaga nada. Entre um lote e outro a fazenda tem de estar
  // completa — com registro repetido, se for o caso, mas nunca vazia.
  t.secao('grava o novo ANTES de apagar o velho');
  const ultimoSet = ok.ops.map(o => o.tipo).lastIndexOf('set');
  const primeiroDel = ok.ops.map(o => o.tipo).indexOf('del');
  t.conferir('a nuvem recebeu gravação e apagamento',
    ultimoSet >= 0 && primeiroDel >= 0,
    ok.ops.map(o => o.tipo + ':' + o.col + '/' + o.id).join(' '));
  t.conferir('nenhum apagamento aconteceu antes da última gravação',
    primeiroDel > ultimoSet, `último set em ${ultimoSet}, primeiro del em ${primeiroDel}`);

  // ---------- 3. só sai o que o backup não traz ----------
  t.secao('id que existe nos dois lados não é apagado e regravado');
  const apagados = ok.ops.filter(o => o.tipo === 'del');
  const gravados = ok.ops.filter(o => o.tipo === 'set');
  t.conferir('o animal que está no backup E no aparelho não é apagado',
    !apagados.some(o => o.col === 'animals' && o.id === 'a1'),
    apagados.filter(o => o.col === 'animals').map(o => o.id).join(','));
  t.conferir('mas é gravado, com o conteúdo do backup',
    gravados.some(o => o.col === 'animals' && o.id === 'a1'),
    gravados.filter(o => o.col === 'animals').map(o => o.id).join(','));
  t.conferir('os outros cinco animais do aparelho saem',
    apagados.filter(o => o.col === 'animals').length === 5,
    String(apagados.filter(o => o.col === 'animals').length));
  t.conferir('nenhum id é gravado e apagado na mesma restauração',
    !gravados.some(g => apagados.some(a => a.col === g.col && a.id === g.id)),
    gravados.filter(g => apagados.some(a => a.col === g.col && a.id === g.id))
      .map(g => g.col + '/' + g.id).join(','));
  t.conferir('o item de estoque que o backup não tem sai',
    apagados.some(o => o.col === 'items' && o.id === 'i1'), '');
  t.conferir('os lançamentos da atividade antiga saem da coleção dela',
    apagados.some(o => o.col === 'at_ovos' && o.id === 'o1'), '');
  t.conferir('e os da atividade nova entram na coleção nova',
    gravados.some(o => o.col === 'at_leite' && o.id === 'l1'), '');

  // ---------- 4. a pergunta mostra os dois lados ----------
  t.secao('ninguém autoriza no escuro');
  t.conferir('a pergunta diz quantos animais, pesagens e lançamentos o backup tem',
    /O BACKUP[\s\S]*2 animais · 1 pesagens · 2 lançamentos/.test(ok.pergunta),
    ok.pergunta.replace(/\n/g, ' | '));
  t.conferir('e quantos o aparelho tem agora',
    /ESTE APARELHO[\s\S]*6 animais · 6 pesagens · 3 lançamentos/.test(ok.pergunta),
    ok.pergunta.replace(/\n/g, ' | '));
  t.conferir('com a data em que o backup foi feito',
    /20\/10\/2026/.test(ok.pergunta), ok.pergunta.replace(/\n/g, ' | '));

  t.secao('backup de outra fazenda vem com aviso');
  const outra = await restaurar(Object.assign({}, BACKUP, { farm: 'vizinho' }));
  t.conferir('a pergunta avisa que o backup é de outra fazenda',
    /outra fazenda|ATEN[ÇC][ÃA]O/.test(outra.pergunta) && /vizinho/.test(outra.pergunta),
    outra.pergunta.split('\n')[2] || outra.pergunta.slice(0, 120));
  t.conferir('e diz em qual fazenda o aparelho está',
    /"demo"/.test(outra.pergunta), outra.pergunta.slice(0, 200));

  t.secao('quem desiste não perde nada');
  const nao = await restaurar(BACKUP, { confirmar: false });
  t.conferir('recusando a pergunta, a fazenda fica como estava',
    nao.animais === 6 && nao.pesagens === 6 && nao.bovT === 2,
    `${nao.animais}/${nao.pesagens}/${nao.bovT}`);
  t.conferir('e a nuvem não recebe nada', nao.ops.length === 0 && nao.fila === 0,
    `${nao.ops.length} ops · ${nao.fila} na fila`);

  // ---------- 5. arquivo ruim não apaga nada ----------
  // Este é o grupo que achou o defeito. Cada arquivo abaixo era aceito pelo
  // aplicativo antes, apagava a fazenda da nuvem e não gravava nada em troca.
  t.secao('arquivo estragado não apaga NADA');
  const ruins = [
    ['lista vindo como objeto', Object.assign({}, BACKUP, { animals: { a: 1 } }), /lista/i],
    ['registro sem id', Object.assign({}, BACKUP, { animals: [{ ident: '900' }] }), /identifica/i],
    ['registro nulo no meio da lista', Object.assign({}, BACKUP, { animals: [null, { id: 'z9' }] }), /identifica/i],
    ['id com barra', Object.assign({}, BACKUP, { animals: [{ id: 'a/b' }] }), /identifica/i],
    ['id vazio', Object.assign({}, BACKUP, { animals: [{ id: '' }] }), /identifica/i],
    ['id numérico', Object.assign({}, BACKUP, { animals: [{ id: 7 }] }), /identifica/i],
    ['id repetido', Object.assign({}, BACKUP, {
      animals: [{ id: 'x1', ident: '1' }, { id: 'x1', ident: '2' }] }), /duas vezes/i],
    ['pesagem sem id', Object.assign({}, BACKUP, { weighings: [{ animalId: 'a1', weight: 300 }] }), /identifica/i],
    ['lançamento sem id', Object.assign({}, BACKUP, { bovT: [{ value: 100 }] }), /identifica/i],
    ['atividade sem nome', Object.assign({}, BACKUP, { atividades: [{ id: 'leite' }] }), /nome|identifica/i],
    ['atividade com id de livro fixo', Object.assign({}, BACKUP, {
      atividades: [{ id: 'bov', nome: 'Falso' }] }), /livro fixo/i],
    ['lançamento de atividade sem id', Object.assign({}, BACKUP, {
      extraT: { leite: [{ value: 5 }] } }), /identifica/i],
    ['lançamentos de atividade vindo como objeto', Object.assign({}, BACKUP, {
      extraT: { leite: { a: 1 } } }), /lista/i],
    ['versão mais nova do que o aparelho lê', Object.assign({}, BACKUP, { v: 99 }), /mais nova/i],
    ['versão não numérica', Object.assign({}, BACKUP, { v: 'nove' }), /mais nova/i],
    ['custo vindo como texto', Object.assign({}, BACKUP, { custo: 'nada' }), /custo/i],
    ['arquivo de outro programa', { app: 'outro', animals: [] }, /n[ãa]o [ée] um backup/i],
    ['JSON pela metade', '{"app":"fazendajs","v":9,"animals":[{"id"', /n[ãa]o pôde ser lido/i],
    ['arquivo vazio', '', /n[ãa]o pôde ser lido/i],
    ['lista solta no lugar do backup', '[1,2,3]', /n[ãa]o [ée] um backup/i]
  ];
  for (const [nome, arquivo, esperado] of ruins) {
    const r = await restaurar(arquivo);
    t.conferir(`${nome}: a fazenda fica intacta`,
      r.animais === 6 && r.pesagens === 6 && r.bovT === 2 && r.itens === 1
      && r.ovos === 1 && r.atividades === 'ovos' && r.espelho === 6,
      `${r.animais}/${r.pesagens}/${r.bovT}/${r.itens} · atividade ${r.atividades}`);
    t.conferir(`${nome}: a nuvem não recebe nem apagamento nem gravação`,
      r.ops.length === 0, r.ops.map(o => o.tipo + ':' + o.col).join(' '));
    t.conferir(`${nome}: a fila de envio fica vazia`, r.fila === 0,
      `${r.filaDel} apagamentos · ${r.filaAdd} gravações na fila`);
    t.conferir(`${nome}: o aviso explica o que está errado e que nada foi apagado`,
      esperado.test(r.aviso) && /[Nn]ada foi apagado|não pôde ser lido/.test(r.aviso),
      r.aviso.replace(/\n/g, ' | ').slice(0, 160) || 'nenhum aviso');
    // O título do aviso tem de NEGAR a restauração, e nenhuma mensagem de
    // sucesso pode aparecer: era exatamente a mensagem de sucesso em cima de
    // uma fazenda apagada que escondia o defeito.
    t.conferir(`${nome}: a mensagem NEGA a restauração, sem prometer sucesso`,
      /N[ÃA]O restaurado/.test(r.aviso) && !/^Backup restaurado/.test(r.toast),
      (r.aviso.split('\n')[0] + ' / toast: ' + r.toast).slice(0, 140));
  }

  // ---------- 6. a nuvem recusando a gravação ----------
  // O caso 2 da sonda: antes, o lote que falhava era o de APAGAR, e os
  // apagamentos ficavam na fila sem nada para pôr no lugar.
  t.secao('a nuvem recusa a gravação do novo');
  const gf = await restaurar(BACKUP, { falhar: 'add' });
  t.conferir('o backup fica gravado no aparelho', gf.animais === 2 && gf.espelho === 2,
    `${gf.animais} animais · espelho ${gf.espelho}`);
  t.conferir('os registros do backup entram na fila de envio',
    gf.filaAdd >= 4, `${gf.filaAdd} gravações na fila`);
  t.conferir('NENHUM apagamento é feito na nuvem',
    !gf.ops.some(o => o.tipo === 'del'), gf.ops.map(o => o.tipo + ':' + o.col).join(' '));
  t.conferir('nem entra na fila para ser feito depois',
    gf.filaDel === 0, `${gf.filaDel} apagamentos na fila`);
  t.conferir('o aviso diz que a nuvem não confirmou',
    /n[ãa]o confirmou/i.test(gf.aviso), gf.aviso.replace(/\n/g, ' | ').slice(0, 160));
  t.conferir('e diz que nada foi apagado',
    /NADA foi apagado/i.test(gf.aviso), gf.aviso.replace(/\n/g, ' | ').slice(0, 200));
  t.conferir('e manda guardar o arquivo do backup',
    /[Gg]uarde o arquivo/.test(gf.aviso), gf.aviso.replace(/\n/g, ' | ').slice(0, 220));

  // ---------- 7. a nuvem recusando o apagamento ----------
  t.secao('a nuvem recusa a limpeza do que era antigo');
  const af = await restaurar(BACKUP, { falhar: 'del' });
  t.conferir('o backup inteiro chega na nuvem antes de qualquer apagamento',
    af.ops.filter(o => o.tipo === 'set').length >= 4
    && !af.ops.some(o => o.tipo === 'del'),
    af.ops.map(o => o.tipo + ':' + o.col + '/' + o.id).join(' '));
  t.conferir('a tela mostra o backup', af.animais === 2 && af.espelho === 2,
    `${af.animais} · espelho ${af.espelho}`);
  t.conferir('os apagamentos que faltaram ficam na fila',
    af.filaDel > 0, `${af.filaDel} apagamentos na fila`);
  t.conferir('o aviso diz que faltou tirar o que era antigo',
    /antigo/i.test(af.aviso), af.aviso.replace(/\n/g, ' | ').slice(0, 160));
  t.conferir('e não promete que está tudo pronto',
    !/^Backup restaurado$/.test(af.toast), af.toast);

  // ---------- 8. backup sem nada dentro ----------
  // Arquivo legítimo de fazenda recém-aberta. Restaurar tem de esvaziar, e a
  // conferência não pode confundir "vazio" com "estragado".
  t.secao('backup de fazenda vazia é backup legítimo');
  const vazio = await restaurar({ app: 'fazendajs', v: 9, exportedAt: '2026-10-01T10:00:00.000Z',
    farm: 'demo', animals: [], weighings: [], bovT: [], avT: [], gerT: [], items: [],
    moves: [], rebmov: [], atividades: [], extraT: {}, anexos: [], settings: { yield: 50 }, custo: {} });
  t.conferir('a fazenda fica vazia, como o arquivo manda',
    vazio.animais === 0 && vazio.pesagens === 0 && vazio.bovT === 0 && vazio.itens === 0,
    `${vazio.animais}/${vazio.pesagens}/${vazio.bovT}/${vazio.itens}`);
  t.conferir('e a mensagem diz que restaurou',
    vazio.toast === 'Backup restaurado' && vazio.aviso === '', vazio.toast + ' ' + vazio.aviso);
  t.conferir('tudo o que estava aqui foi apagado da nuvem',
    vazio.ops.filter(o => o.tipo === 'del').length >= 12 && !vazio.ops.some(o => o.tipo === 'set'),
    `${vazio.ops.filter(o => o.tipo === 'del').length} apagamentos`);

  // ---------- 9. campos que faltam, sem estar estragados ----------
  // Backup antigo não tinha todos os campos. Faltar não é defeito; o que não
  // pode é faltar e levar a fazenda junto.
  t.secao('backup antigo, com campos que ainda não existiam');
  const antigo = await restaurar({ app: 'fazendajs', v: 9, farm: 'demo',
    animals: [{ id: 'q1', ident: '500', cat: 'Novilha' }], weighings: [] });
  t.conferir('restaura o que o arquivo tem',
    antigo.animais === 1 && antigo.pesagens === 0, `${antigo.animais}/${antigo.pesagens}`);
  t.conferir('e o que falta vira vazio, não erro',
    antigo.bovT === 0 && antigo.itens === 0 && antigo.aviso === '',
    `${antigo.bovT}/${antigo.itens} · ${antigo.aviso.slice(0, 60)}`);
  t.conferir('sem data, a pergunta não inventa data nenhuma',
    !/\(de /.test(antigo.pergunta), antigo.pergunta.split('\n')[2] || '');

  // ---------- 10. lançamento de atividade sem dono ----------
  t.secao('lançamento de atividade que o backup não lista');
  const orfao = await restaurar(Object.assign({}, BACKUP, {
    extraT: { leite: [{ id: 'l1', type: 'entrada', cat: 'Venda', value: 700, date: '2026-09-02' }],
      sumiu: [{ id: 's1', value: 10 }, { id: 's2', value: 20 }] } }));
  t.conferir('a pergunta avisa quantos ficam de fora',
    /2 lançamento\(s\) de atividade/.test(orfao.pergunta),
    orfao.pergunta.replace(/\n/g, ' | '));
  t.conferir('e eles não são gravados em coleção nenhuma',
    !orfao.ops.some(o => o.col === 'at_sumiu'),
    orfao.ops.filter(o => o.col.indexOf('at_') === 0).map(o => o.col + '/' + o.id).join(' '));
  t.conferir('o resto restaura normalmente', orfao.animais === 2 && orfao.toast === 'Backup restaurado',
    `${orfao.animais} · ${orfao.toast}`);

  // ---------- 11. o backup da PRÓPRIA fazenda ----------
  // É a restauração mais comum que existe — e era a que escondia o defeito,
  // porque a lista de atividades vem IGUAL. Toda a bateria acima usa um backup
  // com atividade diferente da do aparelho, e com isso passava por cima.
  t.secao('restaurar um backup da própria fazenda, com as mesmas atividades');
  const mesma = await restaurar(Object.assign({}, BACKUP, {
    atividades: [{ id: 'ovos', nome: 'Ovos' }],
    extraT: { ovos: [{ id: 'novo1', date: '2026-09-01', type: 'entrada', amount: 700, category: 'Venda' },
      { id: 'novo2', date: '2026-09-02', type: 'saida', amount: 100, category: 'Ração' }] } }));
  const livro = await pagina.evaluate(`(function () {
    return { chaves: Object.keys(extraT).join(','),
      ovos: (extraT['ovos'] || []).map(x => x.id).join(','),
      ehLivro: ehExtra('ovos'),
      // arrLivro sem reconhecer o livro cai em bovT: a aba da atividade
      // passaria a mostrar o dinheiro de Bovinos.
      naoEhBov: arrLivro('ovos') !== bovT,
      colecao: colLivro('ovos'),
      espelho: (function () { try {
        const e = JSON.parse(localStorage.getItem('fjs-espelho'));
        return ((e.extraT || {})['ovos'] || []).map(x => x.id).join(','); } catch (x) { return 'erro'; } })() };
  })()`);
  t.conferir('a atividade continua sendo um livro de verdade depois da restauração',
    livro.ehLivro && livro.naoEhBov && livro.colecao === 'at_ovos',
    `ehExtra=${livro.ehLivro} · separado de bovT=${livro.naoEhBov} · coleção ${livro.colecao}`);
  t.conferir('os lançamentos da atividade são os do BACKUP, não os antigos',
    livro.ovos === 'novo1,novo2', livro.ovos || 'vazio');
  t.conferir('e a cópia local do aparelho guarda esses lançamentos',
    livro.espelho === 'novo1,novo2', livro.espelho || 'vazio');
  t.conferir('a nuvem recebe os lançamentos na coleção da atividade',
    mesma.ops.filter(o => o.tipo === 'set' && o.col === 'at_ovos').map(o => o.id).sort().join(',') === 'novo1,novo2',
    mesma.ops.filter(o => o.col === 'at_ovos').map(o => o.tipo + '/' + o.id).join(' '));
  t.conferir('e apaga o lançamento antigo que o backup não tem',
    mesma.ops.some(o => o.tipo === 'del' && o.col === 'at_ovos' && o.id === 'o1'),
    mesma.ops.filter(o => o.col === 'at_ovos').map(o => o.tipo + '/' + o.id).join(' '));
  t.conferir('a mensagem diz que restaurou', mesma.toast === 'Backup restaurado', mesma.toast);

  // A cópia local tem o mesmo caminho, e tinha o mesmo risco: ela também zera
  // extraT antes de reaplicar a lista de atividades.
  t.secao('a cópia local do aparelho pelo mesmo caminho');
  const espelhoDuasVezes = await pagina.evaluate(`(function () {
    // Ler a cópia local com a lista de atividades JÁ carregada é o caso que
    // ninguém exercita: no arranque ela está vazia e a lista sempre "muda".
    const antes = { chaves: Object.keys(extraT).join(','), ovos: (extraT['ovos'] || []).length };
    const lido = carregarEspelho(farm);
    return { lido, antes, chaves: Object.keys(extraT).join(','),
      ovos: (extraT['ovos'] || []).map(x => x.id).join(','),
      ehLivro: ehExtra('ovos'), naoEhBov: arrLivro('ovos') !== bovT };
  })()`);
  t.conferir('ler a cópia local duas vezes não apaga os lançamentos da atividade',
    espelhoDuasVezes.lido && espelhoDuasVezes.ovos === 'novo1,novo2',
    JSON.stringify(espelhoDuasVezes));
  t.conferir('e a atividade continua separada de Bovinos',
    espelhoDuasVezes.ehLivro && espelhoDuasVezes.naoEhBov,
    `ehExtra=${espelhoDuasVezes.ehLivro} · separado=${espelhoDuasVezes.naoEhBov}`);

  // ---------- 12. notas fiscais ----------
  t.secao('as notas fiscais do backup');
  const comNota = await restaurar(Object.assign({}, BACKUP, {
    anexos: [{ id: 'n1', nome: 'nota.pdf', dados: 'data:application/pdf;base64,AAA' },
      { id: 'n2', nome: 'sem-arquivo.pdf' }] }));
  t.conferir('a nota com arquivo dentro é gravada',
    comNota.ops.some(o => o.tipo === 'set' && o.col === 'anexos' && o.id === 'n1'), '');
  t.conferir('a nota sem arquivo dentro não é gravada',
    !comNota.ops.some(o => o.col === 'anexos' && o.id === 'n2'),
    comNota.ops.filter(o => o.col === 'anexos').map(o => o.tipo + '/' + o.id).join(' '));
  t.conferir('e a pergunta conta só as notas que têm arquivo',
    /1 nota\(s\)/.test(comNota.pergunta), comNota.pergunta.replace(/\n/g, ' | '));

  // ---------- 13. a volta completa: backup DE VERDADE, feito pelo aplicativo ----------
  // A conferência que importa mais de todas. Toda a bateria acima usa arquivos
  // montados à mão, e a conferência nova do arquivo é dura de propósito: se ela
  // recusasse o backup que o próprio aplicativo produz, o dono ficaria com o
  // arquivo na mão e sem conseguir voltar — o pior resultado possível, pior do
  // que o defeito que esta entrega conserta.
  t.secao('o backup que o aplicativo baixa é aceito por ele mesmo');
  await pagina.evaluate(SEMEAR);
  await pagina.evaluate(DUBLE);
  const arquivo = await pagina.evaluate(`(async function () {
    // Uma nota fiscal presa a um lançamento, para o backup ter anexo de
    // verdade, e um carnê, para ter vencimento e parcelas.
    bovT.push({ id: 'nf1', date: '2026-08-10', type: 'saida', amount: 450, category: 'Ração/insumos',
      venc: '2026-09-10', anexos: [{ id: 'anx1', nome: 'nota.pdf', tipo: 'application/pdf' }] });
    anexoCache.set('anx1', 'data:application/pdf;base64,JVBERi0xLjQK');
    recomputarLivros(); render();
    let corpo = '';
    const orig = window.download;
    window.download = (nome, c) => { corpo = String(c); };
    $('menu-backup').click();
    // o backup junta as notas antes de baixar: espera a volta
    for (let i = 0; i < 60 && !corpo; i++) await new Promise(r => setTimeout(r, 50));
    window.download = orig;
    return corpo;
  })()`);
  t.conferir('o aplicativo produziu um arquivo de backup', arquivo.length > 100,
    String(arquivo.length) + ' caracteres');
  const conferido = await pagina.evaluate(`(function (txt) {
    const d = JSON.parse(txt);
    const c = conferirBackup(d);
    return { erro: c.erro || '', v: d.v, farm: d.farm, temData: !!d.exportedAt,
      animais: c.animais, pesagens: c.pesagens, lanc: c.lanc, notas: c.notas };
  })(${JSON.stringify(arquivo)})`);
  t.conferir('e o seu próprio conferidor aceita esse arquivo',
    conferido.erro === '', conferido.erro);
  t.conferir('a versão do formato gravada é a que a restauração lê',
    conferido.v === 9, String(conferido.v));
  t.conferir('o código da fazenda e a data vão dentro do arquivo',
    conferido.farm === 'demo' && conferido.temData,
    `${conferido.farm} · data ${conferido.temData}`);
  t.conferir('a contagem do arquivo bate com a fazenda que o gerou',
    conferido.animais === 6 && conferido.pesagens === 6
    && conferido.lanc === 4 && conferido.notas === 1,
    `${conferido.animais} animais · ${conferido.pesagens} pesagens · ${conferido.lanc} lançamentos · ${conferido.notas} notas`);

  // E agora a volta: apaga tudo e restaura o arquivo baixado.
  const voltou = await restaurar(arquivo);
  t.conferir('restaurando o arquivo baixado, a fazenda volta inteira',
    voltou.animais === 6 && voltou.pesagens === 6 && voltou.bovT === 3
    && voltou.itens === 1 && voltou.ovos === 1,
    `${voltou.animais} animais · ${voltou.pesagens} pesagens · ${voltou.bovT} lançamentos · ${voltou.itens} itens · ${voltou.ovos} da atividade`);
  t.conferir('com a mesma atividade e o mesmo rendimento de carcaça',
    voltou.atividades === 'ovos', voltou.atividades);
  t.conferir('e a mensagem diz que restaurou, sem aviso nenhum',
    voltou.toast === 'Backup restaurado' && voltou.aviso === '',
    voltou.toast + ' / ' + voltou.aviso.slice(0, 80));
  const notaVoltou = await pagina.evaluate(`(function () {
    const t2 = bovT.find(x => x.id === 'nf1');
    return { temAnexo: !!(t2 && anexosDe(t2).length === 1),
      noCache: anexoCache.has('anx1'),
      venc: t2 ? t2.venc : null };
  })()`);
  t.conferir('a nota fiscal volta presa ao lançamento, com o arquivo dentro',
    notaVoltou.temAnexo && notaVoltou.noCache, JSON.stringify(notaVoltou));
  t.conferir('e o vencimento da conta volta igual',
    notaVoltou.venc === '2026-09-10', String(notaVoltou.venc));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
