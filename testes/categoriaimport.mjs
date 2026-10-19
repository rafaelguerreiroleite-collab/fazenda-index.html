// A PLANILHA PODE TRAZER A CATEGORIA — E NÃO PODE MANDAR NO QUE JÁ EXISTE.
//
// Pedido do dono: importar as pesagens do dia com a categoria junto, todas
// novilhas. Sem isso, o animal criado pela importação nascia só com o brinco,
// e categoria é o que separa bezerro de novilha de boi em TODO relatório —
// preenchê-la depois é ficha por ficha, na mão, uma a uma.
//
// A regra que esta bateria cobra, e que é a parte delicada:
//
//   animal NOVO      → nasce com a categoria da planilha;
//   animal que EXISTE → só recebe o que estiver EM BRANCO;
//   categoria já preenchida → NUNCA é trocada por cima.
//
// A última é a que importa: um arquivo da balança com "novilha" não pode
// rebaixar para novilha o boi que o dono classificou à mão. Trocar calado o
// cadastro de alguém é pior do que não preencher nada, porque ninguém vai
// procurar o que mudou.
//
// E a grafia: a balança escreve "novilha", o formulário escreve "Novilha". Para
// o aplicativo seriam DUAS categorias, e o relatório mostraria o mesmo lote
// partido em duas linhas, nenhuma com o total certo.
import { servir, abrirApp, placar } from './apoio.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pasta = mkdtempSync(join(tmpdir(), 'fjs-cat-'));
const arquivo = (nome, texto) => {
  const caminho = join(pasta, nome);
  writeFileSync(caminho, texto, 'utf8');
  return caminho;
};

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  const t = placar('A planilha traz a categoria, e não manda no que já existe');

  const importar = async (caminho) => {
    await pagina.evaluate(() => { $('menu-import').click(); });
    await pagina.setInputFiles('#csv-input', caminho);
    await pagina.waitForTimeout(250);
    const previa = await pagina.evaluate(() =>
      $('preview-stats').innerText.replace(/\s+/g, ' ').trim());
    await pagina.evaluate(() => { $('btn-confirm-import').click(); });
    await pagina.waitForTimeout(350);
    return previa;
  };
  const limpar = () => pagina.evaluate(() => {
    animals = []; weighings = []; render();
  });
  const bicho = b => pagina.evaluate(i => {
    const a = animals.find(x => x.ident === i);
    return a ? { cat: a.cat || '', raca: a.raca || '', id: a.id } : null;
  }, b);

  // ---------- animal novo nasce com a categoria ----------
  t.secao('o animal criado pela importação nasce com a categoria');
  await limpar();
  const previa1 = await importar(arquivo('comcat.csv',
    'identificacao,data,peso,categoria,raca\n'
    + '901,19/10/2026,187,Novilha,Nelore\n'
    + '902,19/10/2026,252,Novilha,Nelore\n'));
  const a901 = await bicho('901');
  t.conferir('a categoria da planilha vai para a ficha do animal novo',
    a901 && a901.cat === 'Novilha', a901 ? a901.cat : 'animal não criado');
  t.conferir('a raça também', a901 && a901.raca === 'Nelore', a901 ? a901.raca : '—');
  t.conferir('a prévia avisa, ANTES de confirmar, quantos nascem com ela',
    /categoria/i.test(previa1) && /2/.test(previa1), previa1);
  const n1 = await pagina.evaluate(() => ({ a: animals.length, w: weighings.length }));
  t.conferir('e as pesagens entram como sempre', n1.a === 2 && n1.w === 2,
    `${n1.a} animais · ${n1.w} pesagens`);

  // ---------- quem já existe com categoria NÃO é trocado ----------
  t.secao('quem já tem categoria não é trocado por cima');
  await pagina.evaluate(() => {
    animals = [{ id: 'fixo', ident: '903', cat: 'Boi', raca: 'Angus' }];
    weighings = []; render();
  });
  await importar(arquivo('troca.csv',
    'identificacao,data,peso,categoria,raca\n903,19/10/2026,500,Novilha,Nelore\n'));
  const a903 = await bicho('903');
  t.conferir('o boi classificado à mão continua Boi',
    a903 && a903.cat === 'Boi', a903 ? a903.cat : '—');
  t.conferir('e a raça dele continua Angus',
    a903 && a903.raca === 'Angus', a903 ? a903.raca : '—');
  t.conferir('mas a pesagem do dia entrou normalmente',
    await pagina.evaluate(() => weighings.length === 1 && weighings[0].weight === 500));

  // ---------- quem está em branco é preenchido ----------
  t.secao('quem está em branco recebe a categoria');
  await pagina.evaluate(() => {
    animals = [{ id: 'vazio', ident: '904', cat: '', raca: '' },
      { id: 'meio', ident: '905', cat: 'Vaca', raca: '' }];
    weighings = []; render();
  });
  const previa3 = await importar(arquivo('branco.csv',
    'identificacao,data,peso,categoria,raca\n'
    + '904,19/10/2026,300,Novilha,Nelore\n'
    + '905,19/10/2026,420,Novilha,Guzerá\n'));
  const a904 = await bicho('904'), a905 = await bicho('905');
  t.conferir('a ficha sem categoria é completada',
    a904 && a904.cat === 'Novilha' && a904.raca === 'Nelore',
    a904 ? a904.cat + ' · ' + a904.raca : '—');
  t.conferir('e a ficha com categoria só recebe a raça que faltava',
    a905 && a905.cat === 'Vaca' && a905.raca === 'Guzerá',
    a905 ? a905.cat + ' · ' + a905.raca : '—');
  t.conferir('a prévia avisa que vai completar ficha já cadastrada',
    /em branco/i.test(previa3), previa3);
  t.conferir('e a prévia nomeia a categoria e a raça separadas, sem embolar',
    /categoria <?b?>?\s*Novilha/i.test(previa3.replace(/\s+/g, ' ')) && /ra[çc]a/i.test(previa3),
    previa3);
  t.conferir('nenhum animal novo foi criado nesse caminho',
    await pagina.evaluate(() => animals.length === 2),
    String(await pagina.evaluate(() => animals.length)));

  // ---------- a grafia da balança ----------
  t.secao('a grafia da balança vira a grafia do aplicativo');
  await limpar();
  await importar(arquivo('grafia.csv',
    'identificacao,data,peso,categoria\n'
    + '906,19/10/2026,200,novilha\n'
    + '907,19/10/2026,210,NOVILHA\n'
    + '908,19/10/2026,220,  Novilha  \n'
    + '909,19/10/2026,230,bezerro\n'));
  const grafias = await pagina.evaluate(() =>
    animals.map(a => a.ident + '=' + a.cat).sort().join(' '));
  t.conferir('"novilha", "NOVILHA" e " Novilha " viram a mesma categoria',
    grafias === '906=Novilha 907=Novilha 908=Novilha 909=Bezerro', grafias);
  const umaSo = await pagina.evaluate(() => new Set(animals.map(a => a.cat)).size);
  t.conferir('e o rebanho fica com duas categorias, não com quatro grafias',
    umaSo === 2, `${umaSo} categorias distintas`);

  // ---------- o nome da coluna da balança ----------
  t.secao('o nome que a balança usa para a coluna');
  await limpar();
  await importar(arquivo('balanca.csv',
    'Identificador;Data;Peso;Tipo Animal\n910;19/10/2026;240;novilha\n'));
  const a910 = await bicho('910');
  t.conferir('"Tipo Animal" é lido como categoria, com ponto e vírgula e tudo',
    a910 && a910.cat === 'Novilha', a910 ? a910.cat : 'animal não criado');

  // ---------- categoria fora da lista ----------
  t.secao('categoria que não está na lista entra como veio');
  await limpar();
  await importar(arquivo('fora.csv',
    'identificacao,data,peso,categoria\n911,19/10/2026,250,Recria 2\n'));
  const a911 = await bicho('911');
  t.conferir('a categoria de fora da lista é respeitada, não inventada',
    a911 && a911.cat === 'Recria 2', a911 ? a911.cat : '—');

  // ---------- sem a coluna, nada muda ----------
  t.secao('arquivo de três colunas continua funcionando igual');
  await limpar();
  const previa6 = await importar(arquivo('semcat.csv',
    'identificacao,data,peso\n912,19/10/2026,260\n913,19/10/2026,270\n'));
  const a912 = await bicho('912');
  t.conferir('sem a coluna, o animal nasce como antes, sem categoria',
    a912 && a912.cat === '', a912 ? `"${a912.cat}"` : '—');
  t.conferir('e a prévia não fala de categoria nenhuma',
    !/categoria/i.test(previa6), previa6);
  t.conferir('as duas pesagens entraram',
    await pagina.evaluate(() => weighings.length === 2),
    String(await pagina.evaluate(() => weighings.length)));

  // ---------- a exportação do aplicativo volta para dentro ----------
  // Exportar, corrigir na planilha e trazer de volta é o caminho natural de
  // quem acerta dados em massa. Se o arquivo que o aplicativo ESCREVE não é
  // lido por ele mesmo, o caminho não existe.
  t.secao('o arquivo que o próprio aplicativo exporta volta para dentro');
  await limpar();
  const exportado = await pagina.evaluate(() => {
    animals = [{ id: 'e1', ident: '920', cat: 'Novilha', raca: 'Nelore' }];
    weighings = [{ id: 'ew1', animalId: 'e1', date: '2026-10-19', weight: 333, jejum: false }];
    let saiu = '';
    const orig = window.download;
    window.download = (n, c) => { saiu = String(c); };
    $('menu-exp-pes').click();
    window.download = orig;
    return saiu;
  });
  const caminhoExp = arquivo('reentrada.csv', exportado.replace(/^﻿/, ''));
  await limpar();
  await importar(caminhoExp);
  const a920 = await bicho('920');
  t.conferir('o brinco, a categoria e a raça voltam do arquivo exportado',
    a920 && a920.cat === 'Novilha' && a920.raca === 'Nelore',
    a920 ? a920.cat + ' · ' + a920.raca : 'animal não criado');
  t.conferir('e a pesagem volta com o peso certo',
    await pagina.evaluate(() => weighings.length === 1 && weighings[0].weight === 333),
    JSON.stringify(await pagina.evaluate(() => weighings.map(w => w.weight))));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
