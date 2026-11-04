// REGISTRO ESTRAGADO NÃO PODE CALAR UMA TELA.
//
// Pedido do dono: procurar erro onde ainda não se procurou.
//
// O aplicativo desenha a tela a partir dos registros que tem. Quando um campo
// vem com o tipo errado — texto onde se esperava número, número onde se
// esperava data, campo faltando — a conta daquela linha pode sair errada, e
// isso é ruim; mas o que não pode acontecer é a TELA INTEIRA parar de desenhar.
// É a diferença entre uma linha estranha, que o dono vê e conserta, e uma aba
// em branco, que não explica nada e não dá por onde começar.
//
// De onde vem registro estragado, na vida real: backup de outra origem, campo
// gravado por uma versão antiga do aplicativo, importação de planilha com
// coluna vazia, corrida entre dois aparelhos. Nada disso é exótico.
//
// Três defeitos achados por esta varredura, todos medidos:
//   · animal sem brinco parava a aba do rebanho E a tela de "manter só quem foi
//     pesado" — a que mostra quem sai ANTES de apagar;
//   · item de estoque sem nome parava a aba Estoque e a lista de medicamentos
//     do manejo;
//   · conta com vencimento que não é texto parava a aba Fazenda inteira
//     ("a.t.venc.localeCompare is not a function").
//
// O resto desta bateria é rede de segurança: são os casos que o aplicativo JÁ
// aguenta, fixados aqui para que continuem aguentando.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Registro estragado não cala a tela');

  const casos = await pagina.evaluate(`(function () {
    const out = {};
    const tentar = (nome, fn) => {
      try { fn(); out[nome] = ''; } catch (e) { out[nome] = e.message; }
    };
    const base = () => {
      animals = []; weighings = []; bovT = []; avT = []; gerT = [];
      items = []; moves = []; rebmov = []; extraT = {}; atividades = [];
      detailAnimal = null; detailItem = null;
    };
    // Todas as telas de dinheiro, com o período aberto para que nada seja
    // filtrado por data: filtro que esconde o registro estragado também esconde
    // o defeito.
    const telasDeDinheiro = () => {
      tab = 'bovinos'; seg = 'financeiro'; $('bfin-period').value = 'all'; render();
      tab = 'fazenda'; $('fz-period') && ($('fz-period').value = 'all'); render();
      contasAPagar(bovT); contasAReceber(bovT);
      LIVROS.forEach(b => { contasAPagar(arrLivro(b)); contasAReceber(arrLivro(b)); });
    };
    const telasDoRebanho = () => {
      tab = 'bovinos'; seg = 'rebanho'; render();
      gmdGeralRebanho(); conferenciaDaRodada(); comparativoRebanho();
      valorDoRebanho(); gmdPorMes(); rodadasDePesagem();
      seg = 'mortalidade'; render(); seg = 'vendidas'; render();
      seg = 'compras'; render(); seg = 'estoque'; render();
      seg = 'rebanho'; render();
    };
    const relatorios = () => {
      const orig = window.download; window.download = () => {};
      try { LIVROS.forEach(b => exportRelatorio(b)); } finally { window.download = orig; }
    };

    // ---- o que derrubava a tela ----
    tentar('animal sem o campo do brinco', () => {
      base();
      animals = [{ id: 'a1', ident: '701', cat: 'Novilha' }, { id: 'a2', cat: 'Novilha' },
        { id: 'a3', ident: null, cat: 'Novilha' }, { id: 'a4', ident: 7, cat: 'Novilha' }];
      weighings = [{ id: 'w1', animalId: 'a1', date: '2026-09-01', weight: 300, jejum: false },
        { id: 'w2', animalId: 'a2', date: '2026-10-01', weight: 310, jejum: false }];
      recomputarLivros(); telasDoRebanho();
      limpezaSeparar(new Set(['2026-10-01']));
      relatorios();
    });
    tentar('item de estoque sem nome', () => {
      base();
      items = [{ id: 'i1', name: 'Sal mineral', unit: 'kg' }, { id: 'i2', unit: 'kg' },
        { id: 'i3', name: null, unit: 'un' }];
      moves = [{ id: 'm1', itemId: 'i2', type: 'entrada', qty: 10, date: '2026-10-01', unitCost: 3 }];
      recomputarLivros();
      tab = 'bovinos'; seg = 'estoque'; render();
      preencherMedicamentos();
      relatorios();
    });
    tentar('conta com vencimento que não é texto', () => {
      base();
      bovT = [{ id: 'c1', date: '2026-10-01', type: 'saida', amount: 100, category: 'Sal', venc: 20261110 },
        { id: 'c2', date: '2026-10-02', type: 'saida', amount: 200, category: 'Sal', venc: '2026-11-05' },
        { id: 'c3', date: '2026-10-03', type: 'entrada', amount: 900, category: 'Venda', venc: 20261201 }];
      recomputarLivros(); telasDeDinheiro(); relatorios();
    });

    // ---- rede de segurança: casos que já aguentam, e têm de continuar ----
    tentar('lançamento com categoria numérica', () => {
      base();
      bovT = [{ id: 'd1', date: '2026-10-01', type: 'saida', amount: 100, category: 55 }];
      recomputarLivros(); telasDeDinheiro(); relatorios();
    });
    tentar('lançamento com data numérica', () => {
      base();
      bovT = [{ id: 'e1', date: 20261001, type: 'saida', amount: 100, category: 'Sal' }];
      recomputarLivros(); telasDeDinheiro(); relatorios();
    });
    tentar('lançamento com valor em texto', () => {
      base();
      bovT = [{ id: 'f1', date: '2026-10-01', type: 'saida', amount: '100', category: 'Sal' }];
      recomputarLivros(); telasDeDinheiro(); relatorios();
    });
    tentar('lançamento sem tipo', () => {
      base();
      bovT = [{ id: 'f2', date: '2026-10-01', amount: 100, category: 'Sal' }];
      recomputarLivros(); telasDeDinheiro(); relatorios();
    });
    tentar('nota fiscal estragada no lançamento', () => {
      base();
      bovT = [{ id: 'g1', date: '2026-10-01', type: 'saida', amount: 100, category: 'Sal',
        anexos: [{ id: 'an1', nome: 'x.pdf', tipo: 'application/pdf' }, null, { nome: 'sem id' }] }];
      recomputarLivros(); telasDeDinheiro(); anexosDeTudo(); relatorios();
    });
    tentar('movimento de estoque apontando para item que não existe', () => {
      base();
      items = [{ id: 'i1', name: 'Sal', unit: 'kg' }];
      moves = [{ id: 'm1', itemId: 'i9', type: 'entrada', qty: 5, date: '2026-10-01', unitCost: 2 }];
      recomputarLivros(); tab = 'bovinos'; seg = 'estoque'; render(); relatorios();
    });
    tentar('movimento do rebanho com tipo desconhecido', () => {
      base();
      rebmov = [{ id: 'r1', tipo: 'xpto', qtd: 5, date: '2026-10-01' }];
      recomputarLivros(); tab = 'bovinos'; seg = 'compras'; render(); relatorios();
    });
    tentar('pesagem de animal que não existe mais', () => {
      base();
      animals = [{ id: 'a1', ident: '1', cat: 'Novilha' }];
      weighings = [{ id: 'w1', animalId: 'a9', date: '2026-10-01', weight: 300, jejum: false }];
      recomputarLivros(); telasDoRebanho(); relatorios();
    });
    tentar('pesagem com peso em texto', () => {
      base();
      animals = [{ id: 'a1', ident: '1', cat: 'Novilha' }];
      weighings = [{ id: 'w1', animalId: 'a1', date: '2026-09-01', weight: '300', jejum: false },
        { id: 'w2', animalId: 'a1', date: '2026-10-01', weight: 330, jejum: false }];
      recomputarLivros(); telasDoRebanho(); relatorios();
    });
    tentar('pesagem com data que não é data', () => {
      base();
      animals = [{ id: 'a1', ident: '1', cat: 'Novilha' }];
      weighings = [{ id: 'w1', animalId: 'a1', date: 'nao-e-data', weight: 300, jejum: false },
        { id: 'w2', animalId: 'a1', date: '2026-10-01', weight: 330, jejum: false }];
      recomputarLivros(); telasDoRebanho(); relatorios();
    });
    tentar('atividade sem nome na lista', () => {
      base();
      aplicarAtividades([{ id: 'ovos', nome: 'Ovos' }, { id: 'sem', nome: null }, { nome: 'sem id' }]);
      extraT['ovos'] = [{ id: 'o1', date: '2026-10-01', type: 'entrada', amount: 50, category: 'Venda' }];
      recomputarLivros(); telasDeDinheiro(); relatorios();
    });
    tentar('tudo estragado ao mesmo tempo', () => {
      base();
      animals = [{ id: 'a1' }, { id: 'a2', ident: '2', cat: 'Novilha' }];
      weighings = [{ id: 'w1', animalId: 'a1', date: '2026-10-01', weight: 300 },
        { id: 'w2', animalId: 'zzz', date: 'x', weight: 'y' }];
      bovT = [{ id: 'x1', date: '2026-10-01', type: 'saida', amount: 10, category: 7, venc: 20261110 },
        { id: 'x2', date: null, type: null, amount: null, category: null }];
      items = [{ id: 'i1', unit: 'kg' }];
      moves = [{ id: 'm1', itemId: 'i1', type: 'saida', qty: 'tres', date: '2026-10-01' }];
      rebmov = [{ id: 'r1' }];
      recomputarLivros(); telasDoRebanho(); telasDeDinheiro(); relatorios();
    });
    return out;
  })()`);

  const ACHADOS = ['animal sem o campo do brinco', 'item de estoque sem nome',
    'conta com vencimento que não é texto', 'nota fiscal estragada no lançamento'];
  t.secao('os quatro que paravam a tela');
  ACHADOS.forEach(nome => {
    t.conferir(nome + ': todas as telas desenham', casos[nome] === '', casos[nome]);
  });

  t.secao('rede de segurança: os que já aguentam têm de continuar aguentando');
  Object.entries(casos).forEach(([nome, erro]) => {
    if (ACHADOS.includes(nome)) return;
    t.conferir(nome + ': todas as telas desenham', erro === '', erro);
  });

  // E depois de passar por tudo isso, o aplicativo tem de continuar
  // funcionando de verdade — não basta não quebrar, tem de voltar ao normal.
  t.secao('depois de tudo, o aplicativo continua inteiro');
  const normal = await pagina.evaluate(() => {
    animals = []; weighings = []; bovT = []; avT = []; gerT = [];
    items = []; moves = []; rebmov = []; extraT = {}; atividades = [];
    detailAnimal = null; detailItem = null;
    for (let i = 1; i <= 4; i++) {
      animals.push({ id: 'n' + i, ident: '80' + i, cat: 'Novilha' });
      weighings.push({ id: 'nw' + i, animalId: 'n' + i, date: '2026-09-01', weight: 300, jejum: false });
      weighings.push({ id: 'nx' + i, animalId: 'n' + i, date: '2026-10-01', weight: 330, jejum: false });
    }
    bovT = [{ id: 'bt1', date: '2026-10-01', type: 'saida', amount: 500, category: 'Sal mineral' }];
    recomputarLivros(); tab = 'bovinos'; seg = 'rebanho'; render();
    return { linhas: document.querySelectorAll('#animal-list .list-item').length,
      gmd: gmdGeralRebanho(), semIdent: document.querySelectorAll('#animal-list .sem-identificacao').length };
  });
  t.conferir('a lista do rebanho volta a desenhar os quatro animais',
    normal.linhas === 4, String(normal.linhas));
  t.conferir('o GMD geral volta a sair', normal.gmd && Math.abs(normal.gmd.gmd - 1) < 1e-9,
    JSON.stringify(normal.gmd));
  t.conferir('e nenhuma marca de registro estragado sobra na lista do rebanho',
    normal.semIdent === 0, String(normal.semIdent));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
