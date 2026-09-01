// Auditoria: o que perde dado, o que calcula errado, o que expõe informação.
//
// As outras baterias conferem se o app faz o que promete. Esta parte do
// pressuposto contrário: assume má-fé, sinal ruim e dado estragado, e tenta
// arrancar do aplicativo um prejuízo que ninguém veria acontecer.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Auditoria de perda, cálculo e exposição');

  // ---------- a fila não pode engolir uma edição feita durante o envio ----------
  // No curral o sinal vai e volta. Enquanto um lote sobe, o usuário continua
  // digitando. Se a fila remover pela IDENTIDADE DO REGISTRO em vez do item
  // enfileirado, a edição nova é apagada da fila junto com a antiga: a tela
  // segue certa, o aparelho segue certo, e a NUVEM fica com o valor velho para
  // sempre. Ninguém vê, até abrir em outro aparelho.
  t.secao('fila de envio durante sinal instável');
  const corrida = await pagina.evaluate(async () => {
    pendentes = []; localStorage.removeItem('fjs-pendentes');
    const enviados = [];
    let liberar;
    const espera = new Promise(r => { liberar = r; });
    // Envio lento de propósito: é a janela em que o dedo continua trabalhando.
    window.escreverLote = async ops => {
      ops.forEach(o => enviados.push({ col: o.col, id: o.del || o.obj.id, valor: o.obj && o.obj.amount }));
      await espera;
    };
    enfileirar({ col: 'bovtrans', id: 'x1', obj: { id: 'x1', amount: 100 } });
    const enviando = enviarPendentes();
    // durante o envio, o mesmo lançamento é corrigido
    enfileirar({ col: 'bovtrans', id: 'x1', obj: { id: 'x1', amount: 999 } });
    liberar();
    await enviando;
    return {
      primeiroValorEnviado: enviados[0] && enviados[0].valor,
      sobrouNaFila: pendentes.length,
      valorNaFila: pendentes[0] && pendentes[0].obj.amount
    };
  });
  t.conferir('o valor antigo é o que subiu na primeira leva',
    corrida.primeiroValorEnviado === 100, String(corrida.primeiroValorEnviado));
  t.conferir('a correção feita DURANTE o envio continua na fila',
    corrida.sobrouNaFila === 1, `${corrida.sobrouNaFila} item(ns) na fila`);
  t.conferir('e é o valor corrigido que ficou para subir',
    corrida.valorNaFila === 999, String(corrida.valorNaFila));

  // ---------- um registro que nunca sobe não pode travar todos os outros ----------
  // Documento grande demais, campo inválido, permissão mudada: a nuvem recusa
  // para sempre. Se o lote inteiro é reenviado junto, esse um segura a fila e
  // NADA mais sincroniza. E o aviso na tela diz "aguardando a internet", que é
  // mentira — a internet está lá.
  t.secao('registro que a nuvem recusa para sempre');
  const veneno = await pagina.evaluate(async () => {
    pendentes = []; localStorage.removeItem('fjs-pendentes');
    const subiram = [];
    window.escreverLote = async ops => {
      // um lote com o registro problemático falha INTEIRO, como um batch real
      if (ops.some(o => o.obj && o.obj.id === 'ruim')) throw new Error('doc grande demais');
      ops.forEach(o => subiram.push(o.del || o.obj.id));
    };
    enfileirar({ col: 'bovtrans', id: 'ruim', obj: { id: 'ruim', amount: 1 } });
    enfileirar({ col: 'bovtrans', id: 'bom1', obj: { id: 'bom1', amount: 2 } });
    enfileirar({ col: 'bovtrans', id: 'bom2', obj: { id: 'bom2', amount: 3 } });
    await enviarPendentes();
    await enviarPendentes();
    return { subiram, restaram: pendentes.map(p => p.id), aviso: $('sync-dot').title };
  });
  t.conferir('os registros bons sobem mesmo com um recusado no meio',
    veneno.subiram.includes('bom1') && veneno.subiram.includes('bom2'),
    'subiram: ' + (veneno.subiram.join(', ') || 'nenhum'));
  t.conferir('o registro recusado não some — continua na fila',
    veneno.restaram.includes('ruim'), 'restaram: ' + veneno.restaram.join(', '));
  t.conferir('e a fila não fica presa nos bons',
    veneno.restaram.length === 1, 'restaram: ' + veneno.restaram.join(', '));
  t.conferir('o aviso deixa de culpar a internet quando o problema é outro',
    /não|recus|erro|problema/i.test(veneno.aviso), veneno.aviso);

  // ---------- planilha do contador não pode executar fórmula ----------
  // Texto começando com = + - @ vira FÓRMULA ao abrir no Excel ou no Sheets.
  // Uma observação digitada como =HYPERLINK(...) roda na máquina de quem abre.
  // O app existe para mandar esses arquivos para fora da fazenda.
  t.secao('injeção de fórmula no CSV');
  const formula = await pagina.evaluate(() => {
    const perigos = ['=1+1', '+1', '-1+1', '@SUM(A1)', '=HYPERLINK("http://x","y")'];
    const saidas = perigos.map(p => csv(p));
    return {
      saidas,
      // nenhum começa por caractere que a planilha entenda como fórmula
      todosNeutralizados: saidas.every(x => !/^[=+\-@\t\r]/.test(x.replace(/^"/, ''))),
      // e o texto original continua legível (desfazendo o escape do CSV)
      preservaTexto: saidas.every((x, i) => {
        const cru = x.startsWith('"') ? x.slice(1, -1).replace(/""/g, '"') : x;
        return cru.replace(/^'/, '') === perigos[i];
      }),
      // texto comum não é estragado
      comumIntacto: csv('Ração/insumos') === 'Ração/insumos' && csv('') === ''
    };
  });
  t.conferir('texto de fórmula é neutralizado no CSV',
    formula.todosNeutralizados === true, formula.saidas.join(' | '));
  t.conferir('e o conteúdo original continua legível',
    formula.preservaTexto === true, formula.saidas.join(' | '));
  t.conferir('texto comum não é alterado', formula.comumIntacto === true);

  // ---------- dado vindo de fora não pode virar HTML ----------
  // O backup é um arquivo JSON que qualquer um pode editar e mandar por
  // WhatsApp. Restaurar não pode dar a quem escreveu o arquivo o direito de
  // rodar código na tela de quem restaurou.
  t.secao('HTML vindo de backup restaurado');
  const injecao = await pagina.evaluate(async () => {
    window.__invadiu = false;
    const veneno = '<img src=x onerror="window.__invadiu=true">';
    items = [{ id: 'iv', name: 'Sal', unit: veneno }];
    moves = [{ id: 'mv', itemId: 'iv', type: 'entrada', date: '2026-08-01', qty: 10, unitCost: 2 }];
    animals = []; weighings = []; bovT = []; avT = []; gerT = [];
    tab = 'bovinos'; seg = 'estoque'; detailItem = null; render();
    const naLista = $('stock-list').innerHTML;
    detailItem = 'iv'; render();
    const noDetalhe = $('stock-header').innerHTML;
    detailItem = null;
    await new Promise(r => setTimeout(r, 250));
    return {
      invadiu: window.__invadiu,
      temTagNaLista: /<img/i.test(naLista),
      temTagNoDetalhe: /<img/i.test(noDetalhe),
      // e o texto continua aparecendo, escapado
      mostraTexto: naLista.includes('&lt;img')
    };
  });
  t.conferir('unidade vinda de backup não executa código', injecao.invadiu === false);
  t.conferir('e não vira tag na lista de estoque', injecao.temTagNaLista === false);
  t.conferir('nem na tela de detalhe do item', injecao.temTagNoDetalhe === false);
  t.conferir('o texto continua visível, escapado', injecao.mostraTexto === true);

  // ---------- o código da fazenda é a única barreira ----------
  // Login anônimo é aberto ao mundo; as regras liberam LEITURA E ESCRITA para
  // qualquer autenticado dentro de farms/{código}. Quem adivinha o código
  // apaga a fazenda inteira. O comprimento do código É a segurança.
  t.secao('força do código da fazenda');
  const codigo = await pagina.evaluate(() => {
    const testar = valor => {
      $('su-config').value = JSON.stringify({ apiKey: 'a', projectId: 'p' });
      $('su-farm').value = valor;
      $('su-error').hidden = true; $('su-error').textContent = '';
      $('su-connect').click();
      return { recusou: !$('su-error').hidden, motivo: $('su-error').textContent };
    };
    const r = { curto: testar('js26'), medio: testar('fazenda2026'), bom: testar('js-boi-2026-x7k9m2') };
    localStorage.setItem('fjs-farm', JSON.stringify('demo'));
    $('setup-screen').hidden = true;
    return r;
  });
  t.conferir('código curto é recusado', codigo.curto.recusou === true, codigo.curto.motivo);
  t.conferir('e a recusa explica que o código é a senha dos dados',
    /senha|apaga|adivinh|proteg/i.test(codigo.curto.motivo), codigo.curto.motivo);
  t.conferir('código adivinhável ainda é recusado', codigo.medio.recusou === true, codigo.medio.motivo);
  t.conferir('código forte passa', codigo.bom.recusou === false, codigo.bom.motivo);

  // ---------- escrita sem sinal COM o SDK carregado ----------
  // A bateria "Sem sinal" cobre o caso em que o SDK nem carregou (db === null).
  // O caso do curral é outro e mais perigoso: o SDK carregou, a autenticação
  // valeu pelo token guardado, e o sinal caiu. Aí set() NÃO REJEITA — fica
  // pendente para sempre — então o .catch nunca dispara e a escrita jamais
  // entra na nossa fila. Ela existe só dentro do Firestore, e se a persistência
  // dele não estiver ligada, existe só na MEMÓRIA: fechou o app, perdeu.
  t.secao('escrita sem sinal com o SDK carregado');
  const semSinal = await pagina.evaluate(async () => {
    pendentes = []; localStorage.removeItem('fjs-pendentes');
    // um "banco" que aceita a chamada mas nunca confirma, como offline de verdade
    const nuncaConfirma = { set: () => new Promise(() => {}), delete: () => new Promise(() => {}) };
    const falso = { collection: () => falso, doc: () => falso,
      set: nuncaConfirma.set, delete: nuncaConfirma.delete,
      batch: () => ({ set() {}, delete() {}, commit: () => new Promise(() => {}) }) };
    const antes = db; db = falso;
    upsert('weighings', { id: 'sw1', animalId: 'a1', date: '2026-09-01', weight: 415 });
    remove('bovtrans', 'bt1');
    await new Promise(r => setTimeout(r, 120));
    const naFila = pendentes.map(p => p.id);
    const guardado = JSON.parse(localStorage.getItem('fjs-pendentes') || '[]').map(p => p.id);
    db = antes;
    return { naFila, guardado };
  });
  t.conferir('pesagem sem sinal entra na fila do app, não só na do Firestore',
    semSinal.naFila.includes('sw1'), 'fila: ' + (semSinal.naFila.join(', ') || 'vazia'));
  t.conferir('exclusão sem sinal também', semSinal.naFila.includes('bt1'),
    'fila: ' + semSinal.naFila.join(', '));
  t.conferir('e a fila é gravada no aparelho na hora — fechar o app não perde',
    semSinal.guardado.includes('sw1') && semSinal.guardado.includes('bt1'),
    'guardado: ' + semSinal.guardado.join(', '));

  // Com sinal, a fila tem de esvaziar sozinha: senão ela cresce para sempre e
  // o aviso de "aguardando internet" vira ruído que ninguém mais lê.
  const comSinal = await pagina.evaluate(async () => {
    pendentes = []; localStorage.removeItem('fjs-pendentes');
    const ok = { collection: () => ok, doc: () => ok,
      set: async () => {}, delete: async () => {},
      batch: () => ({ set() {}, delete() {}, commit: async () => {} }) };
    const antes = db; db = ok;
    upsert('weighings', { id: 'cw1', animalId: 'a1', date: '2026-09-01', weight: 400 });
    await new Promise(r => setTimeout(r, 120));
    const depois = pendentes.length;
    db = antes;
    return { depois };
  });
  t.conferir('com sinal, a fila esvazia sozinha ao confirmar',
    comSinal.depois === 0, `${comSinal.depois} sobrou(ram)`);

  // Correção feita antes de a nuvem confirmar a anterior não pode ser removida
  // pela confirmação da ANTIGA.
  const correcao = await pagina.evaluate(async () => {
    pendentes = []; localStorage.removeItem('fjs-pendentes');
    let confirmar;
    const lento = { collection: () => lento, doc: () => lento,
      set: () => new Promise(r => { confirmar = r; }), delete: async () => {},
      batch: () => ({ set() {}, delete() {}, commit: async () => {} }) };
    const antes = db; db = lento;
    upsert('weighings', { id: 'k1', animalId: 'a1', date: '2026-09-01', weight: 400 });
    const primeiroConfirmar = confirmar;
    upsert('weighings', { id: 'k1', animalId: 'a1', date: '2026-09-01', weight: 999 });
    primeiroConfirmar();                    // a nuvem confirma a PRIMEIRA
    await new Promise(r => setTimeout(r, 120));
    const r = { sobrou: pendentes.length, peso: pendentes[0] && pendentes[0].obj.weight };
    db = antes;
    return r;
  });
  t.conferir('a correção feita antes da confirmação continua na fila',
    correcao.sobrou === 1, `${correcao.sobrou} na fila`);
  t.conferir('e é o valor corrigido que ficou', correcao.peso === 999, String(correcao.peso));

  // A fila protege a pesagem, que é pequena. Mas ela não pode virar o problema:
  // operação em massa e anexo em base64 na fila enchem o armazenamento, e
  // armazenamento cheio derruba a fila INTEIRA — trocaria a garantia por uma
  // ilusão dela.
  const semInchar = await pagina.evaluate(async () => {
    pendentes = []; localStorage.removeItem('fjs-pendentes');
    const ok = { collection: () => ok, doc: () => ok, set: async () => {}, delete: async () => {},
      batch: () => ({ set() {}, delete() {}, commit: async () => {} }) };
    const antes = db; db = ok;
    // restaurar/apagar em massa: passa pelo batchWrite
    await batchWrite(Array.from({ length: 50 }, (_, i) =>
      ({ col: 'weighings', obj: { id: 'lote' + i, animalId: 'a', date: '2026-09-01', weight: 300 } })));
    const depoisLote = pendentes.length;
    // anexo pesado: não pode ser copiado para a fila a cada gravação
    upsert('anexos', { id: 'ax9', transId: 't1', dados: 'data:image/jpeg;base64,' + 'A'.repeat(2000) });
    await new Promise(r => setTimeout(r, 80));
    const depoisAnexo = pendentes.filter(p => p.col === 'anexos').length;
    // já a pesagem, essa entra sempre
    upsert('weighings', { id: 'pesa1', animalId: 'a', date: '2026-09-01', weight: 300 });
    const pesagemEntrou = pendentes.some(p => p.id === 'pesa1');
    await new Promise(r => setTimeout(r, 80));
    db = antes;
    return { depoisLote, depoisAnexo, pesagemEntrou };
  });
  t.conferir('operação em massa não despeja tudo na fila',
    semInchar.depoisLote === 0, `${semInchar.depoisLote} registro(s) na fila`);
  t.conferir('anexo com foto não é copiado para a fila quando há nuvem',
    semInchar.depoisAnexo === 0, `${semInchar.depoisAnexo} anexo(s) na fila`);
  t.conferir('mas a pesagem entra na fila sempre — é ela que não pode se perder',
    semInchar.pesagemEntrou === true);

  // ---------- cache vazio não pode apagar o que está no aparelho ----------
  // O iOS despeja o IndexedDB de um site depois de dias sem uso. Um app de
  // fazenda aberto uma vez por semana cai nisso. Voltando com o cache vazio, o
  // Firestore entrega um snapshot VAZIO marcado como "do cache" — e aplicá-lo
  // apaga o rebanho da tela e, pior, sobrescreve a cópia local com o vazio.
  t.secao('snapshot vazio vindo de cache despejado');
  const cacheVazio = await pagina.evaluate(async () => {
    animals = [{ id: 'a1', ident: '292' }, { id: 'a2', ident: '293' }];
    weighings = [{ id: 'w1', animalId: 'a1', date: '2026-08-13', weight: 227 }];
    bovT = []; avT = []; gerT = []; items = []; moves = [];
    salvarEspelho(true);
    const espelhoAntes = JSON.parse(localStorage.getItem('fjs-espelho')).animals.length;

    // o app aplica o snapshot pelo mesmo caminho de subscribe()
    aplicarSnapshot('animals', [], { fromCache: true });
    const depoisVazioCache = animals.length;
    await new Promise(r => setTimeout(r, 700));   // deixa o espelho gravar
    const espelhoDepois = JSON.parse(localStorage.getItem('fjs-espelho')).animals.length;

    // já um snapshot vazio VINDO DO SERVIDOR é verdade: a fazenda foi apagada
    aplicarSnapshot('animals', [], { fromCache: false });
    const depoisVazioServidor = animals.length;
    return { espelhoAntes, depoisVazioCache, espelhoDepois, depoisVazioServidor };
  });
  t.conferir('snapshot vazio do cache NÃO apaga o rebanho da tela',
    cacheVazio.depoisVazioCache === 2, `${cacheVazio.depoisVazioCache} animais restaram`);
  t.conferir('e não sobrescreve a cópia local com vazio',
    cacheVazio.espelhoDepois === 2, `espelho ficou com ${cacheVazio.espelhoDepois}`);
  t.conferir('snapshot vazio vindo do SERVIDOR é respeitado — é verdade',
    cacheVazio.depoisVazioServidor === 0, `${cacheVazio.depoisVazioServidor} restaram`);

  // ---------- persistência recusada tem de ser dita ----------
  t.secao('persistência do Firestore recusada');
  const persistencia = await pagina.evaluate(() => {
    return { avisa: typeof avisarSemPersistencia === 'function' };
  });
  t.conferir('existe aviso para quando a nuvem não pode guardar offline',
    persistencia.avisa === true);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
