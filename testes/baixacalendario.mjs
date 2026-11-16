// Dar baixa numa conta tem de tirar o lembrete dela do calendário.
//
// O mecanismo já existia e funcionava: pagar gerava o arquivo de cancelamento,
// com STATUS:CANCELLED e sem alarme. O defeito era outro, e era de PALAVRA — o
// pior tipo, porque nada quebra e a conta continua apitando.
//
// A tela que abre sozinha dizia, sempre: "esta tela abriu sozinha porque você
// acabou de LANÇAR UMA CONTA A PRAZO". Era o que ela dizia também quando abria
// por uma conta PAGA. Quem acabou de dar baixa lia aquilo, não reconhecia a
// própria ação, fechava a tela — e o alarme da conta quitada seguia tocando no
// celular todo dia.
//
// Nenhum aplicativo web escreve no calendário do iPhone sozinho: a Apple exige
// um toque. O que o aplicativo PODE fazer é abrir a tela certa na hora certa e
// explicar o que aquele toque faz. É isso que esta bateria cobra.
import { servir, abrirApp, placar } from './apoio.mjs';

const campo = (texto, nome) => {
  const l = texto.split('\r\n').find(x => x.indexOf(nome + ':') === 0);
  return l ? l.slice(nome.length + 1) : null;
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Baixa de conta no calendário');
  pagina.on('dialog', d => d.accept());

  // ---------- lançar e depois pagar ----------
  t.secao('a conta vai para o calendário e depois sai dele');
  const fluxo = await pagina.evaluate(() => {
    const saidas = [];
    bovT = []; avT = []; gerT = []; animals = []; items = []; moves = [];
    LS.del('fjs-ics-enviados'); LS.s('fjs-ics-auto', true);
    const orig = window.mostrarSaida;
    window.mostrarSaida = o => { saidas.push(o); };
    bovT = [{ id: 'c1', date: '2026-09-01', type: 'saida', amount: 1000,
      category: 'Lenha', venc: '2026-11-10', pago: false }];
    const abriuAoLancar = agendarMudanca([bovT[0]], 'bov');
    const lembrada = Object.keys(enviadosICS());
    const conta = bovT[0];
    conta.pago = true; conta.pagoEm = todayISO();
    const abriuAoPagar = agendarMudanca([conta], 'bov');
    window.mostrarSaida = orig;
    return { abriuAoLancar, abriuAoPagar, lembrada,
      n: saidas.length,
      motivo1: saidas[0] && saidas[0].motivo, motivo2: saidas[1] && saidas[1].motivo,
      resumo2: saidas[1] && saidas[1].resumo,
      ics: saidas[1] && saidas[1].cru };
  });
  t.conferir('lançar a prazo abre a agenda sozinha', fluxo.abriuAoLancar === true);
  t.conferir('e o aplicativo guarda que aquela conta foi para o calendário',
    fluxo.lembrada.join(',') === 'c1', fluxo.lembrada.join(','));
  t.conferir('dar baixa abre a agenda de novo, para tirar o lembrete',
    fluxo.abriuAoPagar === true);

  const ics = fluxo.ics || '';
  t.conferir('o arquivo cancela exatamente aquele evento',
    /STATUS:CANCELLED/.test(ics) && /UID:c1@fazendajs/.test(ics),
    campo(ics, 'UID'));
  // Mesmo UID é o que faz o calendário ATUALIZAR o evento que já está lá, em
  // vez de criar um segundo ao lado do primeiro.
  t.conferir('com o MESMO identificador, para atualizar e não duplicar',
    (ics.match(/UID:/g) || []).length === 1, String((ics.match(/UID:/g) || []).length));
  t.conferir('e com sequência maior, senão o calendário ignora a atualização',
    Number(campo(ics, 'SEQUENCE')) > 0, campo(ics, 'SEQUENCE'));
  // O alarme é a razão de tudo isto: conta paga não pode acordar ninguém.
  t.conferir('o cancelamento não leva alarme nenhum junto',
    !/BEGIN:VALARM/.test(ics), '');
  t.conferir('o título diz que está paga', /SUMMARY:✔ PAGA/.test(ics),
    campo(ics, 'SUMMARY'));

  // ---------- a tela precisa dizer POR QUE abriu ----------
  // É aqui que estava o defeito.
  t.secao('a tela explica o que aquele toque faz');
  t.conferir('ao lançar, o motivo é "conta nova"', fluxo.motivo1 === 'nova', String(fluxo.motivo1));
  t.conferir('ao pagar, o motivo é "baixa" — e não "conta nova"',
    fluxo.motivo2 === 'baixa', String(fluxo.motivo2));
  t.conferir('o resumo conta quantas saem da agenda',
    /1 paga\(s\) saem da agenda/.test(fluxo.resumo2 || ''), fluxo.resumo2);

  const texto = await pagina.evaluate(() => {
    bovT = [{ id: 'c2', date: '2026-09-01', type: 'saida', amount: 500,
      category: 'Frete', venc: '2026-12-01', pago: true, pagoEm: todayISO() }];
    LS.s('fjs-ics-enviados', { c2: { venc: '2026-12-01', nome: 'Frete' } });
    LS.s('fjs-ics-auto', true);
    agendarMudanca([bovT[0]], 'bov');
    return { frase: $('ag-auto-motivo').textContent,
      botao: $('ag-abrir').textContent,
      visivel: !$('ag-auto').hidden };
  });
  t.conferir('a explicação aparece na tela', texto.visivel && texto.frase.length > 40);
  t.conferir('e fala de DAR BAIXA, não de lançar conta',
    /dar baixa/i.test(texto.frase) && !/acabou de lançar/i.test(texto.frase),
    texto.frase.slice(0, 70));
  t.conferir('avisa que sem o toque o alarme da conta paga continua tocando',
    /continua tocando/i.test(texto.frase), '');
  t.conferir('e o botão fala em ATUALIZAR, que é o que vai acontecer',
    texto.botao === 'Atualizar o Calendário', texto.botao);

  // ---------- a linha de diagnóstico descreve o arquivo DA TELA ----------
  //
  // O dono mandou a linha pedindo ajuda e ela não servia: testava sempre um
  // "a.ics" do tipo text/calendar, que é um arquivo que o aplicativo nunca
  // oferece. Os de verdade saem com charset no tipo — text/calendar;charset=
  // utf-8, text/csv;charset=utf-8, application/json;charset=utf-8 — e o iPhone
  // decide se aceita compartilhar OLHANDO O TIPO. A resposta podia ser "sim"
  // para o arquivo de mentira e "não" para o que estava na mão da pessoa.
  //
  // E a linha não dizia QUAL arquivo estava na tela, nem o tamanho dele. Sem
  // isso não dá para saber se o problema é na agenda, no relatório ou no
  // backup, e um backup de 30 MB não se comporta como um .ics de 2 KB.
  t.secao('o diagnóstico fala do arquivo que está na tela');
  const diag = await pagina.evaluate(`(async function () {
    const vendo = () => document.getElementById('ag-diag').textContent;
    const r = {};
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    r.agenda = vendo();
    // O BOTÃO, e não a variável: o que importa é o texto que chega na conversa.
    // Conferindo a variável, a mutação que fazia o botão recalcular sobre o
    // arquivo de mentira passava batida — o conferidor olhava para o lado certo
    // da tela e para o lado errado do problema.
    let copiado = null;
    const origCb = navigator.clipboard && navigator.clipboard.writeText;
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async t => { copiado = t; } } });
    } catch (e) { copiado = 'SEM ACESSO'; }
    document.getElementById('ag-diag-copiar').click();
    await new Promise(ok => setTimeout(ok, 30));
    r.copiado = copiado;
    r.copiadoIgual = copiado === vendo();
    mostrarSaida({ nome: 'lancamentos.csv',
      blob: new Blob(['a;b;c'], { type: 'text/csv;charset=utf-8' }),
      resumo: '10 linhas', cru: 'a;b;c' });
    r.csv = vendo();
    mostrarSaida({ nome: 'backup-fazendajs.json',
      blob: new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'application/json;charset=utf-8' }),
      resumo: 'tudo', cru: null });
    r.backup = vendo();
    r.generico = diagEmTexto(diagnostico());
    closeAllM();
    document.getElementById('modal-agenda-saida').hidden = true;
    return r;
  })()`);
  // O tipo que a linha mostra é o do arquivo QUE VAI SER COMPARTILHADO, e esse
  // sai sem o ";charset=utf-8": o charset fica no blob, que precisa dele para o
  // programa que abrir o arquivo ler os acentos, e sai do File, onde não serve
  // para nada e podia ser o motivo de o iPhone recusar.
  t.conferir('a agenda aparece com nome e tipo de verdade na linha',
    /agenda-fazendajs\.ics/.test(diag.agenda) && /· text\/calendar ·/.test(diag.agenda),
    diag.agenda.slice(0, 150));
  t.conferir('o arquivo do contador também, com o tipo dele',
    /lancamentos\.csv/.test(diag.csv) && /· text\/csv ·/.test(diag.csv),
    diag.csv.slice(0, 150));
  t.conferir('o backup também, e com o tamanho, que no iPhone muda tudo',
    /backup-fazendajs\.json/.test(diag.backup) && /3\.0 MB/.test(diag.backup),
    diag.backup.slice(0, 160));
  t.conferir('cada tela traz o SEU arquivo, e não o da tela anterior',
    !/agenda/.test(diag.csv) && !/lancamentos/.test(diag.backup),
    `${diag.csv.slice(60, 120)} | ${diag.backup.slice(60, 120)}`);
  t.conferir('o botão de copiar manda a MESMA linha que está na tela',
    diag.copiadoIgual === true, `copiado: ${String(diag.copiado).slice(0, 120)}`);
  // Sem arquivo na mão a conta é genérica, e tem de se declarar genérica: é a
  // diferença entre medida e palpite.
  t.conferir('sem arquivo na tela, a linha diz que o teste é genérico',
    /teste a\.ics/.test(diag.generico), diag.generico.slice(0, 150));

  // ---------- quem decide a ordem dos botões é o aparelho ----------
  //
  // A tela dizia, fixo: "No iPhone, é o PRIMEIRO" — e o primeiro era "Abrir o
  // arquivo". Dentro do aplicativo instalado na tela de início, abrir um
  // endereço blob: não faz nada: sem arquivo, sem erro, sem aviso. O dono tocou
  // e não aconteceu nada, exatamente como a frase não previa. Ela tinha sido
  // escrita como certeza e nunca passou por um iPhone de verdade.
  t.secao('a tela aponta o caminho que ESTE aparelho aceita');
  const palco = (podeArquivo, temShare, ios) => `(function () {
    Object.defineProperty(navigator, 'share', { configurable: true,
      value: ${temShare} ? (async () => {}) : undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => ${podeArquivo} });
    noIOS = () => ${ios}; instalado = () => ${ios};
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    const acoes = document.getElementById('ag-share').parentElement;
    return { primeiro: acoes.children[0].id,
      ordem: [...acoes.children].map(e => e.id).join('>'),
      sharePrimario: document.getElementById('ag-share').classList.contains('btn-primary'),
      como: document.getElementById('ag-como').textContent,
      diag: document.getElementById('ag-diag').textContent };
  })()`;
  const aceita = await pagina.evaluate(palco('true', 'true', 'true'));
  t.conferir('iPhone instalado que aceita o arquivo: Compartilhar vem primeiro',
    aceita.primeiro === 'ag-share' && aceita.sharePrimario, aceita.ordem);
  t.conferir('e a tela diz que os outros dois costumam não fazer nada ali dentro',
    /não fazer nada/.test(aceita.como) && /Compartilhar/.test(aceita.como),
    aceita.como.slice(0, 130));
  t.conferir('com a saída pelo Safari escrita, para quem precisar dos outros',
    /Safari/.test(aceita.como), aceita.como.slice(0, 160));
  const recusa = await pagina.evaluate(palco('false', 'true', 'true'));
  t.conferir('iPhone que NÃO aceita o arquivo: a tela diz isso, em vez de prometer',
    recusa.primeiro === 'ag-abrir' && /não aceita compartilhar/.test(recusa.como),
    recusa.como.slice(0, 130));
  const pc = await pagina.evaluate(palco('false', 'false', 'false'));
  t.conferir('no computador, qualquer caminho serve, e a tela não assusta ninguém',
    pc.primeiro === 'ag-abrir' && /qualquer um dos caminhos/.test(pc.como),
    pc.como.slice(0, 120));
  // O ";charset=utf-8" fica no blob, que precisa dele, e sai do File, que não.
  t.conferir('o arquivo que vai para o compartilhar sai sem ";charset"',
    / \(agenda-fazendajs\.ics · text\/calendar · /.test(aceita.diag),
    aceita.diag.split(' | ')[4]);

  // ---------- o aparelho que não responde ----------
  //
  // Há navegador com a folha de compartilhar e SEM a checagem (navigator.
  // canShare). Perguntar a ele devolvia "não" — e a tela passava a AFIRMAR
  // "este aparelho não aceita compartilhar este arquivo", sobre um aparelho que
  // nunca foi perguntado. A linha de diagnóstico, que é o que chega na conversa
  // pedindo ajuda, afirmava "compartilhar-arquivo nao" pelo mesmo motivo.
  //
  // Declarar base errada é pior do que não declarar: eu mesmo ia ler aquela
  // linha e procurar defeito no lugar errado. Agora são três respostas — sim,
  // nao e "nao sei" — e só um "nao" medido rebaixa o Compartilhar.
  t.secao('aparelho que não responde se aceita o arquivo');
  const naoSei = await pagina.evaluate(() => {
    noIOS = () => true; instalado = () => true;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    return { como: document.getElementById('ag-como').textContent,
      diag: document.getElementById('ag-diag').textContent,
      primeiro: document.getElementById('ag-share').parentElement.children[0].id };
  });
  t.conferir('a tela não afirma recusa de um aparelho que não foi perguntado',
    !/não aceita compartilhar/.test(naoSei.como), naoSei.como.slice(0, 120));
  t.conferir('ela manda tentar o Compartilhar, que é o único que pode funcionar ali',
    naoSei.primeiro === 'ag-share' && /Comece pelo PRIMEIRO/.test(naoSei.como),
    naoSei.primeiro + ' · ' + naoSei.como.slice(0, 90));
  t.conferir('a linha de diagnóstico diz "nao sei", e não "nao"',
    / compartilhar-arquivo nao sei /.test(naoSei.diag), naoSei.diag.split(' | ')[4]);

  // ---------- o aparelho sem o construtor File ----------
  //
  // Montar o File é o primeiro passo do Compartilhar, e ele acontecia ANTES de
  // a tela abrir. Medido: com o construtor quebrado, a tela da agenda não abria
  // — a pessoa perdia o Abrir, o Baixar, o texto de reserva e a própria linha de
  // diagnóstico por causa do caminho que ela nem ia usar. O arquivo já estava
  // pronto; faltava só mostrá-lo.
  t.secao('aparelho sem o construtor File');
  const semFile = await pagina.evaluate(() => {
    const orig = window.File;
    window.File = function () { throw new TypeError('sem File aqui'); };
    let erro = null;
    try {
      mostrarSaida({ nome: 'agenda-fazendajs.ics',
        blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
        resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    } catch (e) { erro = String(e && e.message || e); }
    const r = { erro, aberto: !document.getElementById('modal-agenda-saida').hidden,
      diag: document.getElementById('ag-diag').textContent,
      temBaixar: !!document.getElementById('ag-baixar').getAttribute('href') };
    window.File = orig;
    return r;
  });
  t.conferir('a tela abre assim mesmo, com os outros caminhos de pé',
    semFile.aberto && semFile.temBaixar && !semFile.erro, semFile.erro || 'sem erro');
  t.conferir('e a linha ainda diz o nome e o tamanho do arquivo que está na tela',
    /agenda-fazendajs\.ics/.test(semFile.diag) && / compartilhar-arquivo nao sei /.test(semFile.diag),
    semFile.diag.split(' | ')[4]);

  // ---------- o toque que não dá certo ----------
  //
  // O aviso vermelho existe para acabar com a dúvida "recusou ou não aconteceu
  // nada?", que foi a dúvida do dono. Estas conferências cobram que ele apareça
  // EXATAMENTE nos casos em que o arquivo não foi — e em nenhum outro, porque
  // alarme que toca no trabalho normal é alarme que ninguém lê quando é de
  // verdade.
  t.secao('o toque que não dá certo');

  // Enquanto a folha está aberta, a promessa fica pendurada; um segundo toque
  // por baixo dela estoura com InvalidStateError. É o toque mais provável que
  // existe: tocou, não viu nada acontecer, tocou de novo.
  const doisToques = await pagina.evaluate(async () => {
    noIOS = () => true; instalado = () => true;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    let n = 0;
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => {
      n++;
      if (n > 1) { const e = new Error('ja'); e.name = 'InvalidStateError'; return Promise.reject(e); }
      return new Promise(() => {});   // a folha fica aberta, como no iPhone
    } });
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    const b = document.getElementById('ag-share');
    b.click(); b.click();
    await new Promise(r => setTimeout(r, 60));
    const p = document.getElementById('ag-como');
    return { vermelho: p.classList.contains('ag-falhou'), texto: p.textContent, n };
  });
  // Duas defesas, e as duas conferidas: o segundo toque nem chega a mexer na
  // folha que já está aberta, e se chegasse o erro dela não seria lido como
  // recusa do aparelho. Conferir só a segunda deixava a primeira sem conferidor
  // nenhum — descoberto devolvendo a trava ao código e vendo a bateria passar.
  t.conferir('o segundo toque não chega a mexer na folha já aberta',
    doisToques.n === 1, 'chamadas ao compartilhar: ' + doisToques.n);
  t.conferir('e o segundo toque do próprio dedo não vira "o aparelho recusou"',
    !doisToques.vermelho, doisToques.texto.slice(0, 100));

  // Fechar a folha sem escolher nada também não é recusa.
  const cancelou = await pagina.evaluate(async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => {
      const e = new Error('x'); e.name = 'AbortError'; return Promise.reject(e);
    } });
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    document.getElementById('ag-share').click();
    await new Promise(r => setTimeout(r, 60));
    const p = document.getElementById('ag-como');
    return { vermelho: p.classList.contains('ag-falhou'), texto: p.textContent };
  });
  t.conferir('fechar a folha sem escolher nada também não é recusa',
    !cancelou.vermelho, cancelou.texto.slice(0, 100));

  // Recusa de verdade: tem de aparecer, tem de dizer o motivo, tem de sumir na
  // próxima vez, e o botão tem de continuar vivo — a trava do toque duplo solta
  // no `finally` justamente para isso.
  const recusou = await pagina.evaluate(async () => {
    let n = 0, falhar = true;
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => {
      n++;
      if (!falhar) return Promise.resolve();
      const e = new Error('x'); e.name = 'NotAllowedError'; return Promise.reject(e);
    } });
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    const p = document.getElementById('ag-como');
    document.getElementById('ag-share').click();
    await new Promise(r => setTimeout(r, 80));
    const depois = { vermelho: p.classList.contains('ag-falhou'), texto: p.textContent, n };
    // o botão continua vivo?
    falhar = false; const antes = n;
    document.getElementById('ag-share').click();
    await new Promise(r => setTimeout(r, 60));
    const vivo = n > antes;
    // reabrir limpa o vermelho da vez anterior
    mostrarSaida({ nome: 'agenda-fazendajs.ics',
      blob: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar;charset=utf-8' }),
      resumo: '2 contas', cru: 'BEGIN:VCALENDAR', ehAgenda: true });
    return { depois, vivo, limpou: !p.classList.contains('ag-falhou') };
  });
  t.conferir('recusa de verdade aparece na tela, com o motivo escrito',
    recusou.depois.vermelho && /NotAllowedError/.test(recusou.depois.texto),
    recusou.depois.texto.slice(0, 100));
  t.conferir('e tentou as duas vezes antes de desistir — arquivo e texto',
    recusou.depois.n === 2, 'chamadas: ' + recusou.depois.n);
  t.conferir('o botão continua funcionando depois de uma recusa',
    recusou.vivo, 'a trava do toque duplo solta sozinha');
  t.conferir('reabrir a tela apaga o vermelho da vez anterior', recusou.limpou);

  // Sem texto de reserva não há segunda tentativa — e é aí que o aviso quase
  // ficou de fora, na primeira versão deste conserto: o caminho simplesmente
  // terminava calado, que é o defeito que eu estava consertando.
  const semTexto = await pagina.evaluate(async () => {
    const mandou = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => {
      mandou.push(Object.keys(d).sort().join(','));
      const e = new Error('x'); e.name = 'NotAllowedError'; return Promise.reject(e);
    } });
    mostrarSaida({ nome: 'vazio.ics',
      blob: new Blob([''], { type: 'text/calendar;charset=utf-8' }),
      resumo: 'nada', cru: '', ehAgenda: true });
    document.getElementById('ag-share').click();
    await new Promise(r => setTimeout(r, 80));
    const p = document.getElementById('ag-como');
    return { mandou, vermelho: p.classList.contains('ag-falhou') };
  });
  t.conferir('não oferece um texto vazio para compartilhar',
    semTexto.mandou.length === 1 && semTexto.mandou[0] === 'files,title',
    JSON.stringify(semTexto.mandou));
  t.conferir('e mesmo sem segunda tentativa o aviso aparece — nenhum toque fica calado',
    semTexto.vermelho);

  // O backup completo passa de dezenas de MB com as notas fiscais dentro. O
  // texto de reserva já sai da tela acima do limite, pela mesma razão; a
  // segunda tentativa do compartilhar não seguia essa regra e mandaria o
  // arquivo inteiro como TEXTO para a folha do aparelho.
  const gigante = await pagina.evaluate(async () => {
    const grande = 'x'.repeat(400000);   // o dobro do limite de cópia
    const mandou = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => {
      mandou.push(Object.keys(d).sort().join(',') + ':' + (d.text || '').length);
      const e = new Error('x'); e.name = 'NotAllowedError'; return Promise.reject(e);
    } });
    mostrarSaida({ nome: 'backup-fazendajs.json',
      blob: new Blob([grande], { type: 'application/json;charset=utf-8' }),
      resumo: 'backup', cru: grande });
    document.getElementById('ag-share').click();
    await new Promise(r => setTimeout(r, 120));
    return { mandou, vermelho: document.getElementById('ag-como').classList.contains('ag-falhou'),
      reservaNaTela: !document.getElementById('ag-reserva').hidden };
  });
  t.conferir('arquivo grande não é oferecido como texto para a folha do aparelho',
    gigante.mandou.length === 1, JSON.stringify(gigante.mandou));
  t.conferir('e o limite é o MESMO do texto de reserva, que também sai da tela',
    !gigante.reservaNaTela && gigante.vermelho,
    'reserva na tela: ' + gigante.reservaNaTela + ' · avisou: ' + gigante.vermelho);

  // ---------- conta que nunca foi para o calendário ----------
  // Abrir a tela para cancelar um lembrete que não existe seria pedir um toque
  // à toa, toda vez que alguém desse baixa.
  t.secao('conta que nunca foi para o calendário');
  const nunca = await pagina.evaluate(() => {
    LS.del('fjs-ics-enviados');
    bovT = [{ id: 'c3', date: '2026-09-01', type: 'saida', amount: 300,
      category: 'Sal', venc: '2026-12-20', pago: true, pagoEm: todayISO() }];
    return agendarMudanca([bovT[0]], 'bov');
  });
  t.conferir('não abre tela nenhuma, porque não há lembrete a tirar',
    nunca === false, String(nunca));

  // ---------- pagar pelo botão da lista ----------
  // É o caminho mais usado — mais do que abrir o formulário.
  t.secao('pagar pelo botão da lista');
  const peloBotao = await pagina.evaluate(() => {
    const saidas = [];
    LS.del('fjs-ics-enviados'); LS.s('fjs-ics-auto', true);
    gerT = []; avT = [];
    bovT = [{ id: 'c4', date: '2026-09-01', type: 'saida', amount: 777,
      category: 'Energia elétrica', venc: '2026-11-05', pago: false }];
    LS.s('fjs-ics-enviados', { c4: { venc: '2026-11-05', nome: 'Energia elétrica' } });
    const orig = window.mostrarSaida;
    window.mostrarSaida = o => { saidas.push(o); };
    const origC = window.confirm; window.confirm = () => true;
    tab = 'bovinos'; seg = 'financeiro';
    $('bfin-period').value = 'all'; guardarPeriodo('bfin-period');
    LS.s('fjs-dobra-apagar-bov', true);
    render();
    const botao = document.querySelector('#bfin-apagar [data-pagar]');
    if (botao) botao.click();
    window.confirm = origC; window.mostrarSaida = orig;
    return { achouBotao: !!botao, pago: !!bovT[0].pago,
      abriu: saidas.length, motivo: saidas[0] && saidas[0].motivo,
      cancelou: saidas[0] ? /STATUS:CANCELLED/.test(saidas[0].cru) : false,
      uid: saidas[0] ? /UID:c4@fazendajs/.test(saidas[0].cru) : false };
  });
  t.conferir('o botão "Pagar" está na lista', peloBotao.achouBotao);
  t.conferir('ele marca a conta como paga', peloBotao.pago);
  t.conferir('e dispara o cancelamento no calendário, pelo caminho mais usado',
    peloBotao.abriu === 1 && peloBotao.motivo === 'baixa'
    && peloBotao.cancelou && peloBotao.uid,
    `${peloBotao.abriu} tela(s) · motivo ${peloBotao.motivo}`);

  // ---------- quem desligou, fica desligado ----------
  t.secao('quem pediu para não abrir sozinho');
  const desligado = await pagina.evaluate(() => {
    LS.s('fjs-ics-auto', false);
    bovT = [{ id: 'c5', date: '2026-09-01', type: 'saida', amount: 100,
      category: 'Frete', venc: '2026-11-09', pago: true, pagoEm: todayISO() }];
    LS.s('fjs-ics-enviados', { c5: { venc: '2026-11-09', nome: 'Frete' } });
    const r = agendarMudanca([bovT[0]], 'bov');
    LS.s('fjs-ics-auto', true);
    return r;
  });
  t.conferir('a tela não abre sozinha para quem desligou', desligado === false);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
