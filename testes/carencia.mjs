// Carência de medicamento: este boi já pode ir para o abate?
//
// O cadastro do item guardava a carência em dias. O cadastro do animal
// guardava a data do manejo e o produto usado. Os dois existiam desde sempre e
// NADA cruzava os dois — o aplicativo sabia as duas metades e não respondia a
// pergunta. Errar isso é resíduo de medicamento na carne, e quem responde é o
// dono da fazenda.
//
// O que este arquivo cobra, e por que cada coisa:
// - a conta é do DIA DA VENDA, não de hoje: vender mês que vem pode estar
//   liberado e vender agora não;
// - não inventar: produto fora do estoque, ou item sem carência cadastrada,
//   é "não sei" e tem de continuar sendo "não sei". Um "liberado" falso é
//   pior do que silêncio;
// - o dia em que libera já está livre. Carência de 30 dias aplicada dia 1º
//   termina no dia 31, e o dia 31 vale.
import { servir, abrirApp, placar } from './apoio.mjs';

const MONTAR = () => {
  items = [
    { id: 'i1', name: 'Ivermectina', unit: 'ml', carencia: 30 },
    { id: 'i2', name: 'Vacina aftosa', unit: 'dose', carencia: 0 },
    { id: 'i3', name: 'Sal mineral', unit: 'kg' },
    { id: 'i4', name: 'Antibiótico Terramicina', unit: 'ml', carencia: 21 }
  ];
  moves = [];
  animals = [
    // em carência: aplicou hoje, 30 dias
    { id: 'a1', ident: 'BR001', cat: 'Boi', manejoData: '2026-09-20', manejoMedicamento: 'Ivermectina' },
    // já liberado: aplicou há muito tempo
    { id: 'a2', ident: 'BR002', cat: 'Boi', manejoData: '2026-01-10', manejoMedicamento: 'Ivermectina' },
    // produto que não está no estoque
    { id: 'a3', ident: 'BR003', cat: 'Boi', manejoData: '2026-09-20', manejoMedicamento: 'Coisa qualquer' },
    // item do estoque SEM carência cadastrada
    { id: 'a4', ident: 'BR004', cat: 'Boi', manejoData: '2026-09-20', manejoMedicamento: 'Sal mineral' },
    // manejo sem produto escrito
    { id: 'a5', ident: 'BR005', cat: 'Boi', manejoData: '2026-09-20' },
    // sem manejo nenhum
    { id: 'a6', ident: 'BR006', cat: 'Boi' },
    // digitado com parte do nome do item
    { id: 'a7', ident: 'BR007', cat: 'Boi', manejoData: '2026-09-25', manejoMedicamento: 'terramicina' },
    // carência de zero dia: existe no item, mas não bloqueia nada
    { id: 'a8', ident: 'BR008', cat: 'Boi', manejoData: '2026-09-28', manejoMedicamento: 'Vacina aftosa' }
  ];
  weighings = []; bovT = []; avT = []; gerT = [];
  tab = 'bovinos'; seg = 'rebanho'; render();
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Carência de medicamento');
  await pagina.evaluate(`(${MONTAR.toString()})()`);

  // ---------- a conta ----------
  t.secao('a conta da carência');
  const c = await pagina.evaluate(() => {
    const ver = (id, hoje) => {
      const a = animals.find(x => x.id === id);
      const r = carenciaDoAnimal(a, hoje);
      return r ? { libera: r.liberadoEm, faltam: r.faltam, bloq: r.bloqueado, item: r.item.name } : null;
    };
    return {
      // 20/09 + 30 dias = 20/10
      emCarencia: ver('a1', '2026-10-01'),
      vespera: ver('a1', '2026-10-19'),
      noDia: ver('a1', '2026-10-20'),
      depois: ver('a1', '2026-10-21'),
      antigo: ver('a2', '2026-10-01'),
      foraDoEstoque: ver('a3', '2026-10-01'),
      semCarencia: ver('a4', '2026-10-01'),
      semProduto: ver('a5', '2026-10-01'),
      semManejo: ver('a6', '2026-10-01'),
      porPalavra: ver('a7', '2026-10-01'),
      zeroDias: ver('a8', '2026-10-01')
    };
  });
  t.conferir('soma a carência à data do manejo',
    c.emCarencia && c.emCarencia.libera === '2026-10-20' && c.emCarencia.faltam === 19,
    c.emCarencia && `${c.emCarencia.libera} · faltam ${c.emCarencia.faltam}`);
  t.conferir('na véspera ainda bloqueia', c.vespera && c.vespera.bloq === true);
  // A fronteira: o dia em que libera JÁ está livre. Errar um dia para mais
  // segura boi no pasto sem motivo; para menos, manda resíduo para o abate.
  t.conferir('no dia em que libera, já está liberado',
    c.noDia && c.noDia.bloq === false && c.noDia.faltam === 0,
    c.noDia && String(c.noDia.faltam));
  t.conferir('depois, liberado', c.depois && c.depois.bloq === false);
  t.conferir('manejo antigo não bloqueia', c.antigo && c.antigo.bloq === false);
  t.conferir('acha o item pelo nome digitado em parte e sem acento',
    c.porPalavra && c.porPalavra.item === 'Antibiótico Terramicina' && c.porPalavra.bloq === true,
    c.porPalavra && c.porPalavra.item);

  t.secao('o que o aplicativo NÃO sabe, ele não inventa');
  t.conferir('produto que não está no estoque: não sabe', c.foraDoEstoque === null);
  t.conferir('item sem carência cadastrada: não sabe', c.semCarencia === null);
  t.conferir('manejo sem produto escrito: não sabe', c.semProduto === null);
  t.conferir('sem manejo nenhum: não sabe', c.semManejo === null);
  // Carência zero é o mesmo que carência nenhuma: não há prazo a cumprir, então
  // não há o que mostrar. O que não pode, em hipótese alguma, é bloquear.
  t.conferir('carência de zero dia é o mesmo que sem carência', c.zeroDias === null);

  // ---------- na tela ----------
  t.secao('aparece onde a pergunta é feita');
  const tela = await pagina.evaluate(() => {
    const linha = ident => {
      const el = [...document.querySelectorAll('#animal-list [data-animal]')]
        .find(e => e.querySelector('.item-title').textContent === ident);
      return el ? el.innerText.replace(/\s+/g, ' ') : null;
    };
    return { aviso: $('bov-carencia').innerText.replace(/\s+/g, ' ').trim(),
      escondido: $('bov-carencia').hidden,
      comTarja: !!(linha('BR001') || '').match(/carência até/),
      semTarja: !(linha('BR002') || '').match(/carência até/),
      foraDoEstoqueSemTarja: !(linha('BR003') || '').match(/carência até/) };
  });
  t.conferir('o bloco do topo aparece e conta quantos', !tela.escondido && /2/.test(tela.aviso),
    tela.aviso.slice(0, 80));
  t.conferir('a linha do animal em carência traz a tarja', tela.comTarja);
  t.conferir('a de quem já cumpriu, não', tela.semTarja);
  t.conferir('e a de quem o aplicativo não sabe, também não', tela.foraDoEstoqueSemTarja);

  // A busca acha quem está bloqueado — é como se separa o lote que pode sair.
  await pagina.evaluate(() => { $('bov-busca').value = 'carencia'; $('bov-busca').dispatchEvent(new Event('input')); });
  await pagina.waitForTimeout(280);
  const achou = await pagina.evaluate(() =>
    [...document.querySelectorAll('#animal-list [data-animal]')]
      .map(e => e.querySelector('.item-title').textContent));
  t.conferir('a busca por "carencia" separa exatamente quem está bloqueado',
    achou.length === 2 && achou.includes('BR001') && achou.includes('BR007'), achou.join(','));
  await pagina.evaluate(() => { $('bov-busca').value = ''; $('bov-busca').dispatchEvent(new Event('input')); });
  await pagina.waitForTimeout(280);

  // ---------- a hora da venda ----------
  // É aqui que a carência deixa de ser aviso e vira consequência.
  t.secao('marcar como vendido');
  let perguntou = '';
  const ouvir = async d => { perguntou = d.message(); await d.dismiss(); };
  pagina.on('dialog', ouvir);
  await pagina.evaluate(() => {
    openAnimal(animals.find(x => x.id === 'a1'));
    $('an-sold').checked = true; syncSoldWrap();
    $('an-sold-date').value = '2026-10-05';   // dentro da carência
  });
  await pagina.click('#form-animal button[type="submit"]');
  await pagina.waitForTimeout(200);
  const recusou = await pagina.evaluate(() => !!animals.find(x => x.id === 'a1').sold);
  t.conferir('vender dentro da carência pergunta antes',
    /EM CARÊNCIA/.test(perguntou) && /20\/10\/26/.test(perguntou), perguntou.split('\n')[0]);
  t.conferir('e responder "não" não registra a venda', recusou === false);
  pagina.removeListener('dialog', ouvir);

  // Data de venda DEPOIS do fim da carência não pode incomodar ninguém.
  let perguntou2 = '';
  const ouvir2 = async d => { perguntou2 = d.message(); await d.accept(); };
  pagina.on('dialog', ouvir2);
  await pagina.evaluate(() => {
    openAnimal(animals.find(x => x.id === 'a1'));
    $('an-sold').checked = true; syncSoldWrap();
    $('an-sold-date').value = '2026-11-30';   // bem depois
    $('an-sold-weight').value = '480';
  });
  await pagina.click('#form-animal button[type="submit"]');
  await pagina.waitForTimeout(200);
  const vendeu = await pagina.evaluate(() => !!animals.find(x => x.id === 'a1').sold);
  t.conferir('vender depois da carência não pergunta nada',
    !/EM CARÊNCIA/.test(perguntou2), perguntou2.split('\n')[0] || '(nenhuma pergunta)');
  t.conferir('e a venda é registrada', vendeu === true);
  pagina.removeListener('dialog', ouvir2);

  // ---------- sugestão de medicamento ----------
  // É o que faz o cruzamento acontecer: digitado à mão, o nome quase nunca
  // casa com o item, e a carência nunca dispara.
  t.secao('sugestão vinda do estoque');
  const sug = await pagina.evaluate(() => {
    openAnimal(null);
    const opts = [...$('medicamentos-manejo').options].map(o => o.value);
    const rot = [...$('medicamentos-manejo').options]
      .filter(o => o.value === 'Ivermectina').map(o => o.textContent)[0];
    closeAllM();
    return { opts, rot };
  });
  t.conferir('os itens do estoque entram na sugestão',
    sug.opts.includes('Ivermectina') && sug.opts.includes('Antibiótico Terramicina'),
    sug.opts.slice(0, 5).join(' · '));
  t.conferir('e o prazo de carência vem escrito ao lado',
    /30 dias/.test(sug.rot || ''), sug.rot);
  t.conferir('os fixos continuam, para quem não cadastrou estoque',
    sug.opts.includes('Vacina brucelose'));
  t.conferir('sem repetir o que já veio do estoque',
    new Set(sug.opts).size === sug.opts.length);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
