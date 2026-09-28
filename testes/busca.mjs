// Busca por palavra nos financeiros.
//
// "Quanto gastei com vacina?" não é uma pergunta que período e regime
// respondem. A busca responde — e, respondendo, ESCONDE lançamento e MUDA o
// saldo. As duas coisas exigem cuidado igual: um total menor sem explicação é
// pior que nenhum total, e uma tela vazia sem motivo faz quem olha concluir
// que perdeu dado.
//
// Por isso aqui se confere, em partes iguais: que ela acha o que tem de achar
// (inclusive sem acento, que é como se digita no curral), que o saldo conta
// exatamente o que a lista mostra, e que o que ela escondeu está anunciado com
// o caminho de volta.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Busca por palavra');

  const r = await pagina.evaluate(() => {
    bovT = [
      { id: 's1', date: '2026-03-10', type: 'saida', amount: 1234.5,
        category: 'Ração/insumos', notes: 'Lote 3' },
      { id: 's2', date: '2026-03-15', type: 'saida', amount: 300,
        category: 'Vacina', notes: 'febre aftosa' },
      { id: 's3', date: '2026-04-01', type: 'entrada', amount: 9000,
        category: 'Venda de gado' },
      { id: 's4', date: '2026-05-01', type: 'saida', amount: 150,
        category: 'Combustível', venc: '2026-11-10', pago: false }
    ];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    definirRegime('competencia');
    tab = 'bovinos'; seg = 'financeiro';
    $('bfin-period').value = 'all'; guardarPeriodo('bfin-period');

    const busca = v => {
      termoBusca['bfin-busca'] = v;
      $('bfin-busca').value = v;
      render();
      const linhas = [...$('bfin-list').querySelectorAll('[data-trans]')];
      const av = $('bfin-list').querySelector('[data-limpar-busca]');
      return {
        n: linhas.length,
        ids: linhas.map(e => e.dataset.trans).join(','),
        saldo: $('bfin-balance').innerText.split('\n')[1],
        rotulo: $('bfin-balance').innerText.split('\n')[0],
        aviso: av ? av.innerText.replace(/\n/g, ' · ') : null,
        categorias: $('bfin-cats').innerText.replace(/\n/g, ' | ')
      };
    };
    const out = {
      vazia: busca(''),
      semAcento: busca('racao'),
      comAcento: busca('ração'),
      maiuscula: busca('VACINA'),
      naObservacao: busca('aftosa'),
      duasPalavras: busca('vacina aftosa'),
      ordemInvertida: busca('aftosa vacina'),
      porValor: busca('1234'),
      porDataVenc: busca('10/11'),
      emAberto: busca('em aberto'),
      soEspacos: busca('   '),
      nadaAcha: busca('zzz')
    };
    // o botão × limpa e devolve tudo
    out.tinhaX = !document.querySelector('.busca-x[data-limpar-busca="bfin-busca"]').hidden;
    limparBusca('bfin-busca');
    out.aposLimpar = $('bfin-list').querySelectorAll('[data-trans]').length;
    out.sumiuOX = document.querySelector('.busca-x[data-limpar-busca="bfin-busca"]').hidden;
    out.campoVazio = $('bfin-busca').value === '';
    return out;
  });

  t.secao('acha o que tem de achar');
  t.conferir('sem busca, a lista vem inteira', r.vazia.n === 4, String(r.vazia.n));
  // Quem digita no curral escreve "racao". Exigir o til seria exigir que a
  // pessoa pare para achar a tecla — e ela não para; ela conclui que não achou.
  t.conferir('digitando sem acento acha a palavra com acento',
    r.semAcento.n === 1 && r.semAcento.ids === 's1', r.semAcento.ids);
  t.conferir('e com acento acha igual', r.comAcento.ids === 's1', r.comAcento.ids);
  t.conferir('maiúscula ou minúscula dá no mesmo',
    r.maiuscula.n === 1 && r.maiuscula.ids === 's2', r.maiuscula.ids);
  t.conferir('acha pela observação, não só pela categoria',
    r.naObservacao.ids === 's2', r.naObservacao.ids);
  t.conferir('duas palavras: todas têm de aparecer',
    r.duasPalavras.ids === 's2', r.duasPalavras.ids);
  // Exigir a frase inteira junto faria a busca falhar por causa da ordem em que
  // a pessoa lembrou das coisas.
  t.conferir('e a ordem entre elas não importa',
    r.ordemInvertida.ids === 's2', r.ordemInvertida.ids);
  t.conferir('acha pelo valor, escrito como veio à cabeça',
    r.porValor.ids === 's1', r.porValor.ids);
  t.conferir('acha pela data de vencimento', r.porDataVenc.ids === 's4', r.porDataVenc.ids);
  t.conferir('e por "em aberto", que é como se fala da conta',
    r.emAberto.ids === 's4', r.emAberto.ids);
  t.conferir('só espaços não filtra nada', r.soEspacos.n === 4, String(r.soEspacos.n));

  t.secao('o saldo conta o que a lista mostra');
  // Filtrando só a lista, o saldo diria uma coisa e as linhas embaixo dele,
  // outra — e quem procurou "vacina" leria o total da fazenda inteira achando
  // que era o da vacina.
  t.conferir('sem busca, o saldo é o do período inteiro',
    /7\.315,50/.test(r.vazia.saldo), r.vazia.saldo);
  t.conferir('buscando ração, o saldo é só o da ração',
    /1\.234,50/.test(r.semAcento.saldo), r.semAcento.saldo);
  t.conferir('buscando vacina, só o da vacina',
    /300,00/.test(r.maiuscula.saldo), r.maiuscula.saldo);
  t.conferir('sem resultado, o saldo é zero e não o total',
    /R\$ 0,00/.test(r.nadaAcha.saldo), r.nadaAcha.saldo);
  // Um total parcial sem aviso é o mesmo que um total errado.
  t.conferir('e o rótulo avisa que o saldo está filtrado',
    /BUSCA/i.test(r.semAcento.rotulo) && !/BUSCA/i.test(r.vazia.rotulo),
    `${r.vazia.rotulo} → ${r.semAcento.rotulo}`);
  t.conferir('as categorias também seguem a busca',
    /Vacina/i.test(r.maiuscula.categorias) && !/Ração/i.test(r.maiuscula.categorias),
    r.maiuscula.categorias.slice(0, 80));

  t.secao('o que a busca escondeu é anunciado');
  t.conferir('sem busca não há aviso nenhum', r.vazia.aviso === null, String(r.vazia.aviso));
  t.conferir('com busca, o aviso conta quantos ficaram de fora',
    /3 lançamentos fora da busca/.test(r.semAcento.aviso || ''), r.semAcento.aviso);
  t.conferir('e quanto eles somam', /9\.450,00/.test(r.semAcento.aviso || ''), r.semAcento.aviso);
  t.conferir('oferecendo limpar a busca num toque',
    /LIMPAR BUSCA/i.test(r.semAcento.aviso || ''), r.semAcento.aviso);
  t.conferir('sem nenhum resultado, o aviso conta os quatro',
    /4 lançamentos fora da busca/.test(r.nadaAcha.aviso || ''), r.nadaAcha.aviso);

  t.secao('limpar devolve tudo');
  t.conferir('o × aparece quando há texto', r.tinhaX === true);
  t.conferir('limpar traz os quatro de volta', r.aposLimpar === 4, String(r.aposLimpar));
  t.conferir('o campo fica vazio', r.campoVazio === true);
  t.conferir('e o × some', r.sumiuOX === true);

  // ---------- a busca não pode sobreviver ao fechamento ----------
  // Período fica guardado porque é uma postura; busca é um gesto. Uma busca
  // que volta na abertura deixaria o aplicativo mostrando metade dos
  // lançamentos, e quem não lembra de ter digitado nada conclui que perdeu.
  t.secao('a busca não fica guardada no aparelho');
  const guardou = await pagina.evaluate(() => {
    termoBusca['bfin-busca'] = 'vacina';
    $('bfin-busca').value = 'vacina';
    render();
    return Object.keys(localStorage).filter(k => /busca/i.test(k)
      || String(localStorage.getItem(k)).includes('vacina'));
  });
  t.conferir('nada sobre busca é gravado', guardou.length === 0, guardou.join(','));
  await pagina.reload();
  await pagina.waitForFunction(() => typeof render === 'function');
  const aoReabrir = await pagina.evaluate(() => ({
    campo: $('bfin-busca').value, termo: termoBusca['bfin-busca']
  }));
  t.conferir('reabrindo, o campo está vazio', aoReabrir.campo === '', aoReabrir.campo);
  t.conferir('e o termo também', aoReabrir.termo === '', String(aoReabrir.termo));

  // ---------- os três financeiros ----------
  t.secao('vale nas três abas, cada uma com a sua');
  const tres = await pagina.evaluate(() => {
    bovT = [{ id: 'b1', date: '2026-03-10', type: 'saida', amount: 100, category: 'Vacina' },
            { id: 'b2', date: '2026-03-11', type: 'saida', amount: 200, category: 'Frete' }];
    avT = [{ id: 'a1', date: '2026-03-10', type: 'saida', amount: 300, category: 'Energia elétrica' },
           { id: 'a2', date: '2026-03-11', type: 'saida', amount: 400, category: 'Frete' }];
    gerT = [{ id: 'g1', date: '2026-03-10', type: 'saida', amount: 500, category: 'Manutenção' }];
    animals = []; weighings = []; items = []; moves = [];
    definirRegime('competencia');
    ['bfin-period', 'av-period', 'fz-period'].forEach(id => {
      $(id).value = 'all'; guardarPeriodo(id);
    });
    Object.keys(termoBusca).forEach(k => { termoBusca[k] = ''; if ($(k)) $(k).value = ''; });

    const out = {};
    termoBusca['bfin-busca'] = 'frete';
    tab = 'bovinos'; seg = 'financeiro'; render();
    out.bov = $('bfin-list').querySelectorAll('[data-trans]').length;
    // a busca de Bovinos não pode filtrar Aviários
    tab = 'aviarios'; render();
    out.avSemBusca = $('av-list').querySelectorAll('[data-trans]').length;
    termoBusca['av-busca'] = 'energia';
    render();
    out.avComBusca = $('av-list').querySelectorAll('[data-trans]').length;

    // a Fazenda busca nos três livros, e acha pelo NOME da atividade
    tab = 'fazenda';
    termoBusca['fz-busca'] = 'frete';
    render();
    out.fzFrete = $('fz-lista').querySelectorAll('[data-trans]').length;
    out.fzSaldo = $('fz-balance').innerText.split('\n')[1];
    termoBusca['fz-busca'] = 'aviários';
    render();
    out.fzPorLivro = $('fz-lista').querySelectorAll('[data-trans]').length;
    termoBusca['fz-busca'] = 'zzz';
    render();
    out.fzVazio = !$('fz-empty').hidden;
    out.fzTitulo = $('fz-empty-titulo').textContent;
    out.fzTexto = $('fz-empty-texto').textContent;
    // o resumo da Fazenda tem de aceitar o termo sem tela nenhuma
    out.resumoDireto = resumoFazenda('all', 'competencia', 'frete').n;
    out.resumoSemTermo = resumoFazenda('all', 'competencia').n;
    Object.keys(termoBusca).forEach(k => { termoBusca[k] = ''; if ($(k)) $(k).value = ''; });
    render();
    return out;
  });
  t.conferir('Bovinos acha o frete dele', tres.bov === 1, String(tres.bov));
  // Cada aba tem a sua caixa: a busca de uma filtrando a outra faria a pessoa
  // ver Aviários vazio sem ter digitado nada ali.
  t.conferir('e a busca de Bovinos não mexe em Aviários',
    tres.avSemBusca === 2, String(tres.avSemBusca));
  t.conferir('Aviários tem a busca dele', tres.avComBusca === 1, String(tres.avComBusca));
  t.conferir('a Fazenda acha o frete dos dois livros',
    tres.fzFrete === 2, String(tres.fzFrete));
  t.conferir('somando só os dois', /600,00/.test(tres.fzSaldo || ''), tres.fzSaldo);
  t.conferir('e acha pelo nome da atividade', tres.fzPorLivro === 2, String(tres.fzPorLivro));
  // Culpar o regime quando foi a busca mandaria a pessoa mexer no lugar errado.
  t.conferir('sem resultado, a Fazenda explica que foi a BUSCA',
    tres.fzVazio && /Nada encontrado/.test(tres.fzTitulo) && /essa palavra/.test(tres.fzTexto),
    `${tres.fzTitulo} · ${tres.fzTexto}`);
  t.conferir('o resumo aceita o termo sem depender de tela',
    tres.resumoDireto === 2 && tres.resumoSemTermo === 5,
    `${tres.resumoDireto} / ${tres.resumoSemTermo}`);

  // ---------- os dois avisos não podem prometer errado ----------
  // O aviso de período diz "+N lançamentos, R$ X" e oferece um toque que os
  // traz. Com busca ativa, ele contava TUDO o que estava fora do período —
  // inclusive o que a busca continuaria escondendo depois do toque. Prometia
  // dois e entregava um. Aviso que promete errado é pior que aviso nenhum:
  // ensina a não confiar nos dois.
  t.secao('o aviso de período promete o que o toque entrega');
  const promessa = await pagina.evaluate(async () => {
    const p = n => String(n).padStart(2, '0');
    const h = new Date();
    const esteMes = `${h.getFullYear()}-${p(h.getMonth() + 1)}-05`;
    const futuro = `${h.getFullYear() + 1}-03-10`;
    bovT = [
      { id: 'q1', date: esteMes, type: 'saida', amount: 100, category: 'Vacina' },
      { id: 'q2', date: futuro, type: 'saida', amount: 300, category: 'Vacina' },
      // some pelos DOIS filtros: fora do período E fora da busca
      { id: 'q3', date: futuro, type: 'saida', amount: 999, category: 'Frete' }
    ];
    avT = []; gerT = []; animals = []; weighings = []; items = []; moves = [];
    definirRegime('competencia');
    tab = 'bovinos'; seg = 'financeiro';
    $('bfin-period').value = 'this-month'; guardarPeriodo('bfin-period');
    termoBusca['bfin-busca'] = 'vacina';
    render();
    const out = { antes: $('bfin-list').querySelectorAll('[data-trans]').length };
    const av = [...$('bfin-list').querySelectorAll('.fora-periodo')].find(a => a.dataset.verTudo);
    out.texto = av ? av.innerText.replace(/\n/g, ' · ') : null;
    if (av) av.click();
    await new Promise(k => setTimeout(k, 60));
    out.depois = $('bfin-list').querySelectorAll('[data-trans]').length;
    out.ganho = out.depois - out.antes;
    termoBusca['bfin-busca'] = '';
    render();
    return out;
  });
  t.conferir('o aviso conta 1, não 2 — o outro a busca continuaria escondendo',
    /\+ 1 lançamento com data futura/.test(promessa.texto || ''), promessa.texto);
  t.conferir('e a soma é só a dele', /R\$ 300,00/.test(promessa.texto || ''), promessa.texto);
  t.conferir('o toque entrega exatamente o que prometeu',
    promessa.ganho === 1, `prometeu 1, entregou ${promessa.ganho}`);

  t.secao('busca por valor não arredonda');
  const valores = await pagina.evaluate(() => {
    const t1 = { type: 'saida', date: '2026-01-01', amount: 1234.5, category: 'X', notes: '' };
    return {
      digitado: casaBusca(t1, '1234', 'Bovinos'),
      brasileiro: casaBusca(t1, '1234,50', 'Bovinos'),
      // Havia uma forma arredondada no que se procura, e ela mentia: como a
      // busca muda o saldo, um lançamento que a pessoa não pediu vira um
      // número errado na cabeça dela.
      arredondado: casaBusca(t1, '1235', 'Bovinos'),
      comoNaTela: casaBusca(t1, '1.234,50', 'Bovinos')
    };
  });
  t.conferir('acha digitando o valor sem separador', valores.digitado === true);
  t.conferir('acha escrevendo à brasileira, com centavos',
    valores.brasileiro === true);
  t.conferir('acha copiando como está na tela', valores.comoNaTela === true);
  t.conferir('mas 1235 NÃO traz um lançamento de 1.234,50',
    valores.arredondado === false);

  t.secao('a lista e as somas contam a mesma coisa');
  const bate = await pagina.evaluate(() => {
    bovT = [{ id: 'z1', date: '2026-03-01', type: 'saida', amount: 10, category: 'Vacina' },
            { id: 'z2', date: '2026-03-02', type: 'saida', amount: 20, category: 'Frete',
              venc: '2026-12-01', pago: false }];
    avT = [{ id: 'z3', date: '2026-03-03', type: 'entrada', amount: 30, category: 'Vacina' }];
    gerT = [{ id: 'z4', date: '2026-03-04', type: 'saida', amount: 40, category: 'Manutenção' }];
    animals = []; weighings = []; items = []; moves = [];
    definirRegime('competencia');
    tab = 'fazenda'; $('fz-period').value = 'all'; guardarPeriodo('fz-period');
    const ver = termo => {
      termoBusca['fz-busca'] = termo; render();
      return {
        linhas: $('fz-lista').querySelectorAll('[data-trans]').length,
        contadas: resumoFazenda('all', 'competencia', termo).n,
        aPagar: resumoFazenda('all', 'competencia', termo).aPagarTotal
      };
    };
    const out = { semBusca: ver(''), comBusca: ver('vacina'), semResultado: ver('zzz') };
    termoBusca['fz-busca'] = ''; render();
    return out;
  });
  t.conferir('sem busca, a lista tem tantas linhas quanto o resumo conta',
    bate.semBusca.linhas === bate.semBusca.contadas && bate.semBusca.linhas === 4,
    `${bate.semBusca.linhas} vs ${bate.semBusca.contadas}`);
  t.conferir('com busca, também', bate.comBusca.linhas === bate.comBusca.contadas
    && bate.comBusca.linhas === 2, `${bate.comBusca.linhas} vs ${bate.comBusca.contadas}`);
  t.conferir('sem resultado, também', bate.semResultado.linhas === 0
    && bate.semResultado.contadas === 0, `${bate.semResultado.linhas}`);
  // Dívida é dívida: o filtro de período já não mexia nela, e a busca também
  // não pode. Um total de "a pagar" que encolhe porque alguém procurou uma
  // palavra faria a pessoa achar que deve menos do que deve.
  t.conferir('o total a pagar não muda com a busca',
    bate.semBusca.aPagar === 20 && bate.comBusca.aPagar === 20
      && bate.semResultado.aPagar === 20,
    `${bate.semBusca.aPagar} / ${bate.comBusca.aPagar} / ${bate.semResultado.aPagar}`);

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
