// A lista de categorias precisa ABRIR, e precisa achar sem acento.
//
// Relato do dono: "no financeiro bovinos não tem opção lançamento mão de obra".
// Tinha. A opção estava lá, no código e no ar, desde sempre — o que não dava
// era ENCONTRÁ-LA. A lista nativa do navegador tem dois defeitos no celular:
//
//   1. só aparece depois de digitar, nunca com um toque no campo;
//   2. compara LITERALMENTE, com acento. Quem escreve "mao" não encontra
//      "Mão de obra"; quem escreve "racao" não encontra "Ração/insumos".
//
// E quem escreve no curral, com uma mão no celular, não põe acento. A conclusão
// natural é que a categoria não existe — e aí o lançamento vai para "Outros",
// ou para uma categoria escrita de outro jeito a cada vez, e o relatório por
// categoria deixa de somar o que deveria.
import { servir, abrirApp, placar } from './apoio.mjs';

const itens = () => [...document.querySelectorAll('#t-cat-lista [data-cat]')].map(b => b.dataset.cat);

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Lista de categorias');

  // ---------- a opção sempre existiu ----------
  t.secao('a opção existe');
  const existe = await pagina.evaluate(() => ({
    bov: [...document.getElementById('cats-bov').options].map(o => o.value),
    av: [...document.getElementById('cats-av').options].map(o => o.value)
  }));
  t.conferir('"Mão de obra" está na lista dos Bovinos',
    existe.bov.includes('Mão de obra'), existe.bov.join(' · '));
  t.conferir('e na dos Aviários também', existe.av.includes('Mão de obra'));

  // ---------- abre com um toque ----------
  t.secao('abre com um toque');
  await pagina.evaluate(() => { bovT = []; avT = []; gerT = []; openTrans('bov'); });
  const fechada = await pagina.evaluate(() => $('t-cat-lista').hidden);
  t.conferir('nasce fechada, para não tapar o formulário', fechada === true);

  await pagina.click('#t-cat-abrir');
  const aberta = await pagina.evaluate(`(function(){
    const itens = ${itens.toString()};
    return { escondida: $('t-cat-lista').hidden, lista: itens() };
  })()`);
  t.conferir('o botão abre a lista', aberta.escondida === false);
  t.conferir('e mostra TODAS as categorias, sem precisar digitar nada',
    aberta.lista.length === existe.bov.length, `${aberta.lista.length} de ${existe.bov.length}`);
  t.conferir('"Mão de obra" está entre elas, visível', aberta.lista.includes('Mão de obra'));

  // ---------- acha sem acento ----------
  // É o cerne: quem digita no curral não põe acento.
  t.secao('acha sem acento e sem maiúscula');
  const digitar = async texto => {
    await pagina.evaluate(v => {
      $('t-category').value = v;
      $('t-category').dispatchEvent(new Event('input'));
    }, texto);
    return pagina.evaluate(`(${itens.toString()})()`);
  };
  t.conferir('"mao" acha "Mão de obra"',
    (await digitar('mao')).includes('Mão de obra'), (await digitar('mao')).join(' · '));
  t.conferir('"racao" acha "Ração/insumos"',
    (await digitar('racao')).includes('Ração/insumos'));
  t.conferir('"COMBUST" acha "Combustível"',
    (await digitar('COMBUST')).includes('Combustível'));
  t.conferir('"leilao" acha "Comissão de leilão"',
    (await digitar('leilao')).includes('Comissão de leilão'));
  t.conferir('"eletrica" acha "Energia elétrica"',
    (await digitar('eletrica')).includes('Energia elétrica'));
  // Filtrar de verdade: não pode devolver a lista inteira e fingir que achou.
  const soUma = await digitar('mao');
  t.conferir('e filtra de verdade, em vez de mostrar tudo',
    soUma.length < existe.bov.length && soUma.length >= 1, `${soUma.length} resultado(s)`);

  // ---------- escolher preenche o campo ----------
  t.secao('escolher');
  await pagina.evaluate(() => {
    $('t-category').value = 'mao'; $('t-category').dispatchEvent(new Event('input'));
  });
  await pagina.click('#t-cat-lista [data-cat="Mão de obra"]');
  const escolheu = await pagina.evaluate(() => ({
    valor: $('t-category').value, fechou: $('t-cat-lista').hidden }));
  t.conferir('tocar na categoria preenche o campo com o nome certo, com acento',
    escolheu.valor === 'Mão de obra', escolheu.valor);
  t.conferir('e a lista fecha sozinha', escolheu.fechou === true);

  // ---------- o campo continua livre ----------
  // A lista é sugestão. Categoria que a fazenda usa e não está lá tem de poder
  // ser escrita — e a tela precisa dizer isso em vez de parecer que travou.
  t.secao('o campo continua aceitando texto livre');
  // A lista fechou ao escolher, e de propósito ela não reabre sozinha enquanto
  // se digita — pop-up subindo a cada letra, no celular, tapa o formulário.
  // Quem quer ver a lista toca no botão.
  await pagina.click('#t-cat-abrir');
  const livre = await digitar('empreita de cerca');
  const vazia = await pagina.evaluate(() => $('t-cat-lista').innerText.replace(/\s+/g, ' '));
  t.conferir('categoria que não existe não trava nada', livre.length === 0);
  t.conferir('e a tela avisa que dá para escrever a sua',
    /aceita qualquer texto/.test(vazia), vazia.slice(0, 70));
  await pagina.evaluate(() => {
    abrirListaCategorias(false);
    $('t-date').value = todayISO(); $('t-amount').value = '120';
    $('t-category').value = 'Empreita de cerca';
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => closeAllM());
  const salvou = await pagina.evaluate(() => bovT.map(x => x.category));
  t.conferir('e a categoria escrita à mão é gravada como foi escrita',
    salvou.includes('Empreita de cerca'), salvou.join(' · '));

  // ---------- a lista acompanha a atividade ----------
  t.secao('a lista acompanha a atividade');
  const porAtividade = await pagina.evaluate(`(function () {
    const itens = ${itens.toString()};
    openTrans('bov');
    $('t-livro').value = 'av'; sincronizarLivroTrans();
    $('t-cat-abrir').click();
    const av = itens();
    $('t-livro').value = 'ger'; sincronizarLivroTrans();
    const fechouAoTrocar = $('t-cat-lista').hidden;
    $('t-cat-abrir').click();
    const ger = itens();
    closeAllM();
    return { av, ger, fechouAoTrocar };
  })()`);
  t.conferir('nos Aviários aparece "Pagamento Seara"',
    porAtividade.av.includes('Pagamento Seara') && !porAtividade.av.includes('Venda de gado'),
    porAtividade.av.slice(0, 4).join(' · '));
  t.conferir('no Geral aparecem Soja e Trigo',
    porAtividade.ger.includes('Soja') && porAtividade.ger.includes('Trigo'),
    porAtividade.ger.slice(0, 4).join(' · '));
  // Trocar de atividade com a lista aberta mostraria as categorias da outra.
  t.conferir('trocar de atividade fecha a lista, para não mostrar a lista errada',
    porAtividade.fechouAoTrocar === true);

  // ---------- não nasce aberta ----------
  const reabriu = await pagina.evaluate(() => { openTrans('bov'); return $('t-cat-lista').hidden; });
  t.conferir('abrir um lançamento novo começa com a lista fechada', reabriu === true);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
