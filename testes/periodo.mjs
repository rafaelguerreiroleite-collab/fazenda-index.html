// Filtro de período: o que ele esconde precisa ser anunciado.
//
// Um lançamento com data fora do período escolhido some da tela. Isso é o
// esperado — o que não pode é sumir em silêncio: quem acabou de lançar uma
// parcela para 2027 abre o Financeiro, vê "Este mês", não encontra nada e
// conclui que o lançamento se perdeu. Foi exatamente o que aconteceu.
//
// Estes testes exigem duas coisas: que o aviso apareça contando o que ficou de
// fora, e que a escolha do período sobreviva a fechar e abrir o aplicativo.
import { servir, abrirApp, placar } from './apoio.mjs';

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('Filtro de período');

  const cenario = await pagina.evaluate(() => {
    const p = n => String(n).padStart(2, '0');
    const h = new Date();
    const esteMes = `${h.getFullYear()}-${p(h.getMonth() + 1)}-05`;
    const anoQueVem = `${h.getFullYear() + 1}-01-10`;
    const daquiADois = `${h.getFullYear() + 2}-06-01`;

    // o aviso só é visto de dentro do Financeiro, e é de lá que o clique parte:
    // sem isto, o render() do clique redesenharia o rebanho
    tab = 'bovinos';
    seg = 'financeiro';

    bovT.length = 0;
    bovT.push(
      { id: 'a', date: esteMes,    type: 'saida',   amount: 100, category: 'Ração' },
      { id: 'b', date: anoQueVem,  type: 'saida',   amount: 250, category: 'Vacina' },
      { id: 'c', date: daquiADois, type: 'entrada', amount:  80, category: 'Venda' }
    );

    const leia = () => {
      const av = document.querySelector('#bfin-list .fora-periodo');
      return {
        itens: document.querySelectorAll('#bfin-list .transaction-item').length,
        aviso: av ? av.querySelector('.fp-texto').textContent.trim() : null
      };
    };

    $('bfin-period').value = 'this-month';
    renderFin('bov');
    const mes = leia();

    $('bfin-period').value = 'this-year';
    renderFin('bov');
    const ano = leia();

    // o clique no aviso é o caminho que a pessoa realmente usa
    $('bfin-period').value = 'this-month';
    renderFin('bov');
    document.querySelector('#bfin-list .fora-periodo').click();
    const depoisDoClique = Object.assign(leia(), {
      periodo: $('bfin-period').value,
      guardado: JSON.parse(localStorage.getItem('fjs-periodo-bov') || 'null')
    });

    // nada fora do período => nenhum aviso
    $('bfin-period').value = 'all';
    renderFin('bov');
    const tudo = leia();

    return { mes, ano, depoisDoClique, tudo };
  });

  t.secao('o aviso conta o que o filtro escondeu');
  t.conferir('"Este mês" mostra só o lançamento do mês', cenario.mes.itens === 1, `(${cenario.mes.itens})`);
  t.conferir('avisa os 2 que ficaram de fora, com a soma',
    cenario.mes.aviso === '+ 2 lançamentos com data futura · R$ 330,00', `(${cenario.mes.aviso})`);
  t.conferir('"Este ano" também avisa o que é de outro ano',
    cenario.ano.aviso === '+ 2 lançamentos com data futura · R$ 330,00', `(${cenario.ano.aviso})`);

  t.secao('o aviso leva para todo o período');
  t.conferir('clicar troca o filtro para "all"', cenario.depoisDoClique.periodo === 'all');
  t.conferir('passa a mostrar os 3 lançamentos', cenario.depoisDoClique.itens === 3, `(${cenario.depoisDoClique.itens})`);
  t.conferir('o aviso some quando nada está escondido', cenario.depoisDoClique.aviso === null);
  t.conferir('a escolha fica guardada no aparelho', cenario.depoisDoClique.guardado === 'all');
  t.conferir('"Todo período" nunca mostra aviso', cenario.tudo.aviso === null && cenario.tudo.itens === 3);

  // Reabrir o aplicativo não pode desfazer a escolha: era isso que fazia o
  // lançamento escondido voltar a sumir a cada abertura.
  await pagina.reload();
  await pagina.waitForFunction(() => typeof restaurarPeriodos === 'function');
  const aoReabrir = await pagina.evaluate(() => $('bfin-period').value);

  t.secao('a escolha sobrevive a fechar e abrir');
  t.conferir('o período guardado é restaurado', aoReabrir === 'all', `(${aoReabrir})`);

  const falhas = t.fim(errosJS);
  await navegador.close();
  await s.fechar();
  return falhas;
}
