// Agenda de pagamentos no calendário do celular (.ics).
//
// Este arquivo sai do aplicativo e é lido por um programa de fora — o
// Calendário do iPhone. Programa de fora não perdoa: quebra de linha errada,
// acento partido no meio ou um BEGIN sem END e ele recusa o arquivo INTEIRO,
// sem dizer qual evento estava torto. Por isso aqui se confere a forma do
// arquivo com o mesmo rigor com que se confere uma conta.
//
// E se confere uma coisa que não é de formato: exportar duas vezes não pode
// encher o calendário de lembretes repetidos.
import { servir, abrirApp, placar } from './apoio.mjs';

// Desdobra as linhas de continuação para poder ler o conteúdo: o formato corta
// linha longa e emenda com um espaço na frente.
const desdobrar = txt => txt.replace(/\r\n /g, '');
const linhas = txt => desdobrar(txt).split('\r\n');
// Partir por LINHA, e não procurando o texto "BEGIN:VEVENT" solto no arquivo.
// Um leitor de calendário de verdade trabalha por linha, e a diferença não é
// acadêmica: a observação deste teste contém, de propósito, as letras
// "BEGIN:VEVENT" dentro do texto. Partindo por texto, o próprio teste
// enxergaria um quarto evento que não existe — foi o que aconteceu aqui — e
// acusaria o aplicativo por um defeito do conferidor.
function eventos(txt) {
  const saida = [];
  let atual = null;
  linhas(txt).forEach(l => {
    if (l === 'BEGIN:VEVENT') { atual = []; return; }
    if (l === 'END:VEVENT') { if (atual) saida.push(atual); atual = null; return; }
    if (atual) atual.push(l);
  });
  return saida;
}
// Dentro de um evento, ignora o que está dentro dos alarmes: eles têm
// DESCRIPTION próprio, e procurar sem cuidado devolveria o texto do alarme no
// lugar do texto da conta.
const campo = (ev, nome) => {
  let dentroAlarme = false;
  for (const l of ev) {
    if (l === 'BEGIN:VALARM') { dentroAlarme = true; continue; }
    if (l === 'END:VALARM') { dentroAlarme = false; continue; }
    if (dentroAlarme) continue;
    if (l.startsWith(nome + ':') || l.startsWith(nome + ';')) return l.slice(l.indexOf(':') + 1);
  }
  return null;
};
const temLinha = (ev, alvo) => ev.some(l => l === alvo);
// Desfaz o escape, que é o que o calendário faz antes de mostrar o texto na
// tela. Numa passada só, da esquerda para a direita: em duas passadas, uma
// barra invertida escapada seguida de "n" viraria quebra de linha por engano.
const desesc = v => String(v == null ? '' : v)
  .replace(/\\(.)/g, (m, c) => (c === 'n' || c === 'N') ? '\n' : c);
const lido = (ev, nome) => desesc(campo(ev, nome));

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Agenda no calendário');

  const r = await pagina.evaluate(() => {
    const p = n => String(n).padStart(2, '0');
    const h = new Date();
    const dia = n => { const d = new Date(h.getFullYear(), h.getMonth(), h.getDate() + n);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const out = { dia30: dia(30), diaOntem: dia(-1) };

    bovT = [
      // a que interessa: a prazo, ainda não paga
      { id: 'cb1', date: dia(-10), type: 'saida', amount: 1234.5, category: 'Ração/insumos',
        venc: dia(30), pago: false, grupo: 'g', parcela: 2, parcelas: 3, notes: 'Lote 3' },
      // já paga: lembrete de conta paga é estorvo
      { id: 'cb2', date: dia(-40), type: 'saida', amount: 500, category: 'Vacina',
        venc: dia(-20), pago: true, pagoEm: dia(-19) },
      // à vista: não tem vencimento, não tem o que lembrar
      { id: 'cb3', date: dia(-2), type: 'saida', amount: 80, category: 'Combustível' },
      // entrada: dinheiro que entra não é conta a pagar
      { id: 'cb4', date: dia(-3), type: 'entrada', amount: 9000, category: 'Venda de gado', venc: dia(10) }
    ];
    // vencida e em aberto: é a mais urgente que existe
    avT = [{ id: 'ca1', date: dia(-60), type: 'saida', amount: 300, category: 'Energia',
      venc: dia(-1), pago: false }];
    // observação com tudo o que pode quebrar o arquivo, inclusive uma tentativa
    // de fechar o evento e abrir outro por dentro do texto
    gerT = [{ id: 'cg1', date: dia(-5), type: 'saida', amount: 77.7, category: 'Manutenção; peças, e mais',
      venc: dia(5), pago: false,
      notes: 'linha um\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:evento falso\\ ; , fim' }];
    animals = []; weighings = []; items = []; moves = [];

    localStorage.removeItem('fjs-ics-seq');
    out.texto = agendaICS(contasParaAgenda());
    out.deNovo = agendaICS(contasParaAgenda());
    out.quantas = contasParaAgenda().length;
    // linha mais comprida do arquivo, em OCTETOS (acento ocupa dois)
    out.maiorLinha = Math.max(...out.texto.split('\r\n')
      .map(l => new TextEncoder().encode(l).length));
    out.temLFsolto = /[^\r]\n/.test(out.texto);
    return out;
  });

  const evs = eventos(r.texto);

  t.secao('o arquivo tem a forma que o calendário exige');
  t.conferir('abre e fecha o calendário',
    r.texto.startsWith('BEGIN:VCALENDAR\r\n') && r.texto.trimEnd().endsWith('END:VCALENDAR'),
    r.texto.slice(0, 30));
  t.conferir('toda linha termina em CRLF, nenhuma em LF solto', r.temLFsolto === false);
  t.conferir('nenhuma linha passa de 75 octetos', r.maiorLinha <= 75, String(r.maiorLinha));
  t.conferir('nenhum acento saiu partido', !/�/.test(r.texto));
  t.conferir('cada BEGIN tem o seu END',
    (r.texto.match(/BEGIN:/g) || []).length === (r.texto.match(/END:/g) || []).length,
    `${(r.texto.match(/BEGIN:/g) || []).length} vs ${(r.texto.match(/END:/g) || []).length}`);
  t.conferir('declara versão e quem gerou',
    /\r\nVERSION:2\.0\r\n/.test(r.texto) && /PRODID:.*Fazenda J\.S/.test(desdobrar(r.texto)), '');

  t.secao('só entra o que é conta a pagar');
  t.conferir('um evento para cada conta em aberto dos três livros',
    evs.length === 3 && r.quantas === 3, String(evs.length));
  t.conferir('conta já paga não vira lembrete', !/Vacina/.test(desdobrar(r.texto)));
  t.conferir('compra à vista não vira lembrete', !/Combust/.test(desdobrar(r.texto)));
  t.conferir('entrada de dinheiro não vira lembrete', !/Venda de gado/.test(desdobrar(r.texto)));
  t.conferir('as contas saem na ordem em que vencem',
    evs.map(b => campo(b, 'DTSTART')).join(',') === [...evs.map(b => campo(b, 'DTSTART'))].sort().join(','),
    evs.map(b => campo(b, 'DTSTART')).join(','));

  t.secao('cada evento cai no dia certo');
  const oDe = cat => evs.find(b => (campo(b, 'SUMMARY') || '').includes(cat));
  const racao = oDe('Ração');
  const semHifen = iso => iso.replace(/-/g, '');
  t.conferir('começa no dia do vencimento',
    campo(racao, 'DTSTART') === semHifen(r.dia30), campo(racao, 'DTSTART'));
  t.conferir('é de dia inteiro e termina no dia seguinte (o fim é exclusivo)',
    racao.some(l => l.startsWith('DTSTART;VALUE=DATE:'))
      && Number(campo(racao, 'DTEND')) === Number(semHifen(r.dia30)) + 1,
    campo(racao, 'DTEND'));
  t.conferir('o título traz o valor e a categoria',
    /R\$ 1\.234,50/.test(lido(racao, 'SUMMARY')) && /Ração/.test(lido(racao, 'SUMMARY')),
    lido(racao, 'SUMMARY'));
  t.conferir('e a parcela, para não confundir com as outras do carnê',
    /2\/3/.test(campo(racao, 'SUMMARY')), campo(racao, 'SUMMARY'));
  t.conferir('a descrição diz de qual atividade é a conta',
    /Bovinos/.test(lido(racao, 'DESCRIPTION')), lido(racao, 'DESCRIPTION'));
  // Depois de desescapado, o que o iPhone mostra tem de ser o texto original —
  // com a quebra de linha de volta, e sem barra invertida sobrando na tela.
  t.conferir('e o que aparece na tela é o texto de verdade, com as linhas',
    lido(racao, 'DESCRIPTION').includes('\nVence em: ')
      && !lido(racao, 'DESCRIPTION').includes('\\'),
    JSON.stringify(lido(racao, 'DESCRIPTION').slice(0, 60)));
  t.conferir('a conta vencida vem marcada',
    /VENCIDA/.test(lido(oDe('Energia'), 'SUMMARY')), lido(oDe('Energia'), 'SUMMARY'));
  t.conferir('a que ainda não venceu não vem marcada',
    !/VENCIDA/.test(campo(racao, 'SUMMARY')), campo(racao, 'SUMMARY'));

  t.secao('os avisos');
  t.conferir('cada conta tem dois alarmes: três dias antes e no dia',
    evs.every(b => b.filter(l => l === 'BEGIN:VALARM').length === 2
      && temLinha(b, 'TRIGGER:-PT63H') && temLinha(b, 'TRIGGER:PT8H')), '');
  t.conferir('a conta não ocupa o dia na agenda',
    evs.every(b => campo(b, 'TRANSP') === 'TRANSPARENT'), '');

  t.secao('exportar de novo não duplica lembrete');
  const evs2 = eventos(r.deNovo);
  t.conferir('o mesmo lançamento mantém o mesmo identificador',
    evs.map(b => campo(b, 'UID')).join(',') === evs2.map(b => campo(b, 'UID')).join(','),
    evs.map(b => campo(b, 'UID')).join(','));
  t.conferir('o identificador é o do lançamento, para o calendário reconhecê-lo',
    evs.some(b => campo(b, 'UID').startsWith('cb1@')), evs.map(b => campo(b, 'UID')).join(','));
  // Sem número de versão maior, o calendário ignora a atualização e a correção
  // feita no aplicativo nunca chega ao iPhone.
  t.conferir('a segunda exportação vem com versão maior, para valer como correção',
    evs2.every((b, i) => Number(campo(b, 'SEQUENCE')) > Number(campo(evs[i], 'SEQUENCE'))),
    `${campo(evs[0], 'SEQUENCE')} → ${campo(evs2[0], 'SEQUENCE')}`);

  t.secao('separado do calendário pessoal');
  // Dois eventos só se sobrescrevem quando têm o MESMO identificador. O sufixo
  // garante que nada vindo de outro aplicativo colida com o da fazenda.
  t.conferir('todo identificador é do domínio da fazenda',
    evs.every(b => campo(b, 'UID').endsWith('@fazendajs')), '');
  t.conferir('o arquivo pede um calendário com nome próprio',
    /X-WR-CALNAME:Fazenda J\.S/.test(desdobrar(r.texto)), '');
  t.conferir('todo evento vai marcado como da fazenda',
    evs.every(b => campo(b, 'CATEGORIES') === 'Fazenda J.S'), '');
  t.conferir('e o título diz de onde veio, mesmo fora do calendário certo',
    evs.every(b => campo(b, 'SUMMARY').includes('Fazenda J.S')), '');

  t.secao('texto do usuário não quebra o arquivo');
  const manut = oDe('Manuten');
  t.conferir('ponto e vírgula e vírgula da categoria saem escapados',
    campo(manut, 'SUMMARY').includes('\\;') && campo(manut, 'SUMMARY').includes('\\,'),
    campo(manut, 'SUMMARY'));
  t.conferir('e voltam ao normal na tela do calendário',
    lido(manut, 'SUMMARY').includes('Manutenção; peças, e mais'), lido(manut, 'SUMMARY'));
  t.conferir('a quebra de linha da observação vira "\\n", não linha solta',
    campo(manut, 'DESCRIPTION').includes('\\n'), '');
  // A observação continha "END:VEVENT / BEGIN:VEVENT". Se o escape falhasse,
  // apareceria um quarto evento, inventado por quem escreveu a observação.
  // A prova está em contar as LINHAS "BEGIN:VEVENT": as letras existem dentro
  // da observação, mas nenhuma delas chega a começar uma linha.
  t.conferir('observação não consegue inventar um evento falso',
    evs.length === 3 && linhas(r.texto).filter(l => l === 'BEGIN:VEVENT').length === 3
      && !linhas(r.texto).some(l => l.startsWith('SUMMARY:evento falso')),
    `${evs.length} eventos`);
  t.conferir('a barra invertida também sai escapada',
    campo(manut, 'DESCRIPTION').includes('\\\\'), '');

  // ---------- conta paga tem de parar de tocar ----------
  // O arquivo novo simplesmente não traz a conta paga — e disso o calendário
  // do aparelho não fica sabendo. O lembrete continuaria lá, tocando no
  // vencimento de uma conta já quitada. Duas dessas e ninguém confia mais no
  // alarme.
  t.secao('conta paga sai da agenda');
  const paga = await pagina.evaluate(() => {
    localStorage.removeItem('fjs-ics-enviados');
    localStorage.removeItem('fjs-ics-seq');
    const primeiro = agendaICS(contasParaAgenda());
    const alvo = bovT.find(x => x.id === 'cb1');
    alvo.pago = true; alvo.pagoEm = alvo.venc;
    const segundo = agendaICS(contasParaAgenda());
    // exportar de novo sem mudar nada não pode repetir o cancelamento
    const terceiro = agendaICS(contasParaAgenda());
    alvo.pago = false; delete alvo.pagoEm;
    return { primeiro, segundo, terceiro };
  });
  const evsPagos = eventos(paga.segundo);
  const cancelado = evsPagos.find(b => campo(b, 'UID') === 'cb1@fazendajs');
  t.conferir('a conta paga volta no arquivo, para o calendário saber dela',
    !!cancelado, evsPagos.map(b => campo(b, 'UID')).join(','));
  t.conferir('e volta marcada como cancelada',
    cancelado && campo(cancelado, 'STATUS') === 'CANCELLED',
    cancelado ? campo(cancelado, 'STATUS') : '—');
  // O ponto todo: mesmo que o aparelho não apague o evento, ele fica mudo.
  t.conferir('sem nenhum alarme — é isso que cala o aviso',
    cancelado && !cancelado.some(l => l === 'BEGIN:VALARM'), '');
  t.conferir('com o mesmo identificador, senão vira um evento novo em vez de corrigir',
    cancelado && campo(cancelado, 'UID') === 'cb1@fazendajs', '');
  t.conferir('e com versão maior, senão o calendário ignora a correção',
    cancelado && Number(campo(cancelado, 'SEQUENCE'))
      > Number(campo(eventos(paga.primeiro).find(b => campo(b, 'UID') === 'cb1@fazendajs'), 'SEQUENCE')),
    cancelado ? campo(cancelado, 'SEQUENCE') : '—');
  t.conferir('o título diz que foi paga',
    cancelado && /PAGA/.test(desesc(campo(cancelado, 'SUMMARY'))),
    cancelado ? desesc(campo(cancelado, 'SUMMARY')) : '—');
  t.conferir('as outras contas continuam com os seus alarmes',
    evsPagos.filter(b => campo(b, 'STATUS') !== 'CANCELLED')
      .every(b => b.filter(l => l === 'BEGIN:VALARM').length === 2), '');
  t.conferir('exportar de novo não repete o cancelamento',
    !linhas(paga.terceiro).includes('STATUS:CANCELLED'), '');

  t.secao('o caminho pela tela');
  // O download que o PROGRAMA dispara não produz nada dentro do aplicativo
  // instalado na tela de início do iPhone: nem arquivo, nem erro. Por isso a
  // tela passou a oferecer caminhos que o DEDO toca — e é isso que se confere
  // aqui: que eles existam, apontem para o arquivo certo, e que nenhum some
  // sem explicação.
  const tela = await pagina.evaluate(async () => {
    const out = {};
    localStorage.removeItem('fjs-ics-explicado');
    localStorage.removeItem('fjs-ics-enviados');
    bovT = [{ id: 'tb1', date: '2026-09-01', type: 'saida', amount: 400, category: 'Ração/insumos',
      venc: '2026-12-10', pago: false }];
    avT = []; gerT = [];
    navigator.canShare = () => false;   // aparelho sem compartilhar de arquivo

    // primeira vez: explica antes, porque escolher o calendário certo é um
    // passo que só o dono do aparelho pode dar
    $('menu-exp-agenda').click();
    out.explicouAntes = !$('modal-agenda').hidden;

    $('ag-exportar').click();
    await new Promise(ok => setTimeout(ok, 60));
    out.abriuSaida = !$('modal-agenda-saida').hidden;
    out.fechouInstrucao = $('modal-agenda').hidden;
    out.resumo = $('ag-resumo').textContent;
    out.guardouQueExplicou = JSON.parse(localStorage.getItem('fjs-ics-explicado'));

    const abrir = $('ag-abrir'), baixar = $('ag-baixar');
    out.abrirTemLink = /^blob:/.test(abrir.href);
    out.abrirNaoBaixa = !abrir.hasAttribute('download');
    out.baixarTemLink = /^blob:/.test(baixar.href);
    out.baixarTemNome = baixar.getAttribute('download');
    out.mesmoArquivo = abrir.href === baixar.href;
    // sem compartilhar no aparelho, o botão some E a tela diz por quê
    out.shareEscondido = $('ag-share').hidden;
    out.explicaSemShare = !$('ag-share-nao').hidden;
    // o texto de reserva tem de ser o arquivo de verdade
    out.cruEhOArquivo = $('ag-cru').value.startsWith('BEGIN:VCALENDAR')
      && $('ag-cru').value.includes('UID:tb1@fazendajs');

    // com compartilhar, é o contrário
    navigator.canShare = () => true;
    $('modal-agenda-saida').hidden = true;
    $('menu-exp-agenda').click();
    await new Promise(ok => setTimeout(ok, 60));
    out.segundaVezDireto = $('modal-agenda').hidden && !$('modal-agenda-saida').hidden;
    out.shareAparece = !$('ag-share').hidden && $('ag-share-nao').hidden;

    // rever a instrução depois da primeira vez
    $('ag-rever').click();
    out.reveInstrucao = !$('modal-agenda').hidden;
    closeAllM();

    // sem nada a agendar nem a cancelar: não abre tela, avisa
    bovT = []; avT = []; gerT = [];
    $('menu-exp-agenda').click();
    await new Promise(ok => setTimeout(ok, 60));
    out.quitouAbre = !$('modal-agenda-saida').hidden;   // ainda há cancelamento
    out.quitouSoCancela = $('ag-cru').value.includes('STATUS:CANCELLED')
      && !$('ag-cru').value.includes('BEGIN:VALARM');
    closeAllM();
    $('menu-exp-agenda').click();
    await new Promise(ok => setTimeout(ok, 60));
    out.vazioNaoAbre = $('modal-agenda-saida').hidden;
    out.vazioAvisa = !$('toast').hidden && $('toast').textContent;
    return out;
  });
  t.conferir('na primeira vez o app ensina a separar do calendário pessoal',
    tela.explicouAntes === true);
  t.conferir('exportar abre a tela de saída, em vez de não mostrar nada',
    tela.abriuSaida === true);
  t.conferir('e fecha a tela de instrução', tela.fechouInstrucao === true);
  t.conferir('a tela diz quantas contas foram', /1 conta/.test(tela.resumo || ''), tela.resumo);
  t.conferir('o app lembra que já explicou', tela.guardouQueExplicou === true);
  t.conferir('da segunda vez em diante vai direto para a saída',
    tela.segundaVezDireto === true);

  t.secao('os três caminhos são links de verdade');
  t.conferir('"Abrir" aponta para o arquivo', tela.abrirTemLink === true);
  // Com o atributo "download" o aparelho GUARDA em vez de abrir: os dois
  // atributos brigam, e é por isso que são dois links e não um.
  t.conferir('e abre mesmo, sem o atributo que manda guardar',
    tela.abrirNaoBaixa === true);
  t.conferir('"Baixar" aponta para o mesmo arquivo', tela.baixarTemLink && tela.mesmoArquivo,
    String(tela.mesmoArquivo));
  t.conferir('e salva com nome de calendário',
    tela.baixarTemNome === 'fazenda-js-contas-a-pagar.ics', String(tela.baixarTemNome));
  t.conferir('sem compartilhar no aparelho, o botão some',
    tela.shareEscondido === true);
  t.conferir('e a tela diz por que sumiu, em vez de calar',
    tela.explicaSemShare === true);
  t.conferir('com compartilhar, ele aparece e o aviso some',
    tela.shareAparece === true);
  t.conferir('o texto de reserva é o arquivo de verdade',
    tela.cruEhOArquivo === true);
  t.conferir('dá para rever a instrução do calendário separado',
    tela.reveInstrucao === true);

  t.secao('quando não há o que agendar');
  t.conferir('quitando tudo, ainda abre — para calar os alarmes',
    tela.quitouAbre === true);
  t.conferir('e esse arquivo só cancela, sem criar alarme novo',
    tela.quitouSoCancela === true);
  t.conferir('sem nada a agendar nem a cancelar, não abre tela nenhuma',
    tela.vazioNaoAbre === true);
  t.conferir('e diz por que não abriu', /Nenhuma conta/i.test(tela.vazioAvisa || ''),
    String(tela.vazioAvisa));

  // ---------- o mesmo defeito atingia TODOS os CSVs ----------
  // A agenda só tornou o problema visível. Dentro do aplicativo instalado no
  // iPhone, o mesmo clique programático entregava os CSVs em lugar nenhum —
  // calado, desde sempre. A tela de saída passou a valer para todo arquivo.
  t.secao('no iPhone instalado, todo arquivo passa pela tela');
  const csvs = await pagina.evaluate(async () => {
    const out = {};
    closeAllM();
    bovT = [{ id: 'x1', date: '2026-09-01', type: 'saida', amount: 10, category: 'Frete' }];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];

    // no computador e no Safari comum, o download direto funciona e continua
    // sendo o caminho: trocá-lo por uma tela seria estorvo onde não há problema
    window.precisaDaTela = () => false;
    let bateuNoDireto = false;
    const origCriar = document.createElement.bind(document);
    document.createElement = tag => {
      const el = origCriar(tag);
      if (tag === 'a') { const c = el.click.bind(el); el.click = () => { bateuNoDireto = true; c(); }; }
      return el;
    };
    $('menu-exp-bfin').click();
    await new Promise(ok => setTimeout(ok, 40));
    out.foraDoIphoneBaixaDireto = bateuNoDireto && $('modal-agenda-saida').hidden;

    // no iPhone instalado, a tela aparece com o MESMO arquivo
    window.precisaDaTela = () => true;
    bateuNoDireto = false;
    $('menu-exp-bfin').click();
    await new Promise(ok => setTimeout(ok, 40));
    out.noIphoneAbreTela = !$('modal-agenda-saida').hidden;
    out.naoTentaODireto = bateuNoDireto === false;
    out.nomeDoCsv = $('ag-baixar').getAttribute('download');
    out.titulo = $('modal-saida-titulo').textContent;
    out.conteudoEhOCsv = $('ag-cru').value.includes('Frete');
    // as linhas do calendário não podem aparecer num CSV
    out.semConversaDeCalendario = $('ag-so-agenda').hidden;

    // e a agenda continua com as linhas dela
    closeAllM();
    bovT = [{ id: 'x2', date: '2026-09-01', type: 'saida', amount: 20, category: 'Frete',
      venc: '2026-12-01', pago: false }];
    localStorage.setItem('fjs-ics-explicado', 'true');
    $('menu-exp-agenda').click();
    await new Promise(ok => setTimeout(ok, 40));
    out.agendaTemAsLinhas = !$('ag-so-agenda').hidden;
    out.tituloAgenda = $('modal-saida-titulo').textContent;

    document.createElement = origCriar;
    window.precisaDaTela = () => false;
    closeAllM();
    return out;
  });
  t.conferir('fora do iPhone instalado, o download direto continua valendo',
    csvs.foraDoIphoneBaixaDireto === true);
  t.conferir('no iPhone instalado, o CSV abre a tela em vez de sumir',
    csvs.noIphoneAbreTela === true);
  t.conferir('e nem tenta o download que não funciona lá',
    csvs.naoTentaODireto === true);
  t.conferir('a tela oferece o CSV com o nome certo',
    /financeiro-bovinos/.test(csvs.nomeDoCsv || ''), String(csvs.nomeDoCsv));
  t.conferir('com o conteúdo do CSV, não de outro arquivo',
    csvs.conteudoEhOCsv === true);
  t.conferir('e o título fala de arquivo, não de agenda',
    csvs.titulo === 'Arquivo pronto', csvs.titulo);
  t.conferir('sem as instruções de calendário, que ali não fazem sentido',
    csvs.semConversaDeCalendario === true);
  t.conferir('já a agenda mantém as instruções dela',
    csvs.agendaTemAsLinhas === true);
  t.conferir('e o título de agenda', csvs.tituloAgenda === 'Agenda pronta', csvs.tituloAgenda);

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
