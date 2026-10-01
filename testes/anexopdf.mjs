// Nota fiscal de várias páginas.
//
// Um registro na nuvem cabe em 1 MB, então o PDF que sobe inteiro trava em
// 700 KB — e um documento escaneado de três páginas passa disso sem esforço.
// A resposta antiga era recusar e mandar "tirar uma foto da nota", o que numa
// nota de cinco páginas é mandar fotografar cinco vezes e torcer para não
// faltar nenhuma.
//
// Agora o aplicativo desenha cada página e guarda uma foto por página. O que
// este arquivo cobra:
//   - PDF pequeno continua sendo guardado como PDF (texto vetorial, amplia
//     sem borrar — trocar por foto só pioraria);
//   - PDF grande vira N anexos, um por página, cada um dentro do limite;
//   - as páginas saem na ORDEM e numeradas, porque nota fora de ordem é nota
//     que o contador devolve;
//   - nenhuma página sai preta (página de PDF é transparente por baixo).
import { servir, abrirApp, placar } from './apoio.mjs';

// Monta um PDF válido de N páginas. Cada página recebe um bloco de enchimento
// para o arquivo passar do limite — é o caso que se quer exercitar, e um PDF
// de verdade com 700 KB não cabe num arquivo de teste.
function pdfDePaginas(n, enchimentoKB) {
  const objs = [];
  const add = txt => { objs.push(txt); return objs.length; };
  // 1 = catálogo, 2 = páginas; depois, por página: página, conteúdo
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');  // reservado para o /Pages, preenchido no fim
  const fonte = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const idsPag = [];
  for (let i = 1; i <= n; i++) {
    const texto = `BT /F1 48 Tf 70 650 Td (Pagina ${i}) Tj ET\n`
      + `1 0 0 RG 8 w 60 60 m 500 60 l S\n`
      // O enchimento é comentário dentro do fluxo: o desenho não muda, o
      // arquivo cresce. É assim que se chega no tamanho que interessa.
      + '% ' + 'x'.repeat(enchimentoKB * 1024) + '\n';
    const idConteudo = add(`<< /Length ${texto.length} >>\nstream\n${texto}endstream`);
    idsPag.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] `
      + `/Resources << /Font << /F1 ${fonte} 0 R >> >> /Contents ${idConteudo} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Count ${n} /Kids [${idsPag.map(i => i + ' 0 R').join(' ')}] >>`;

  let saida = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((corpo, i) => {
    offsets.push(saida.length);
    saida += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const inicioXref = saida.length;
  saida += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    saida += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  saida += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return saida;
}

export default async function () {
  const s = await servir();
  const { navegador, pagina, errosJS } = await abrirApp(s.url);
  await pagina.setViewportSize({ width: 390, height: 844 });
  const t = placar('Nota fiscal de várias páginas');

  const grande = pdfDePaginas(3, 300);   // 3 páginas, ~900 KB
  const pequeno = pdfDePaginas(2, 1);    // 2 páginas, poucos KB

  t.secao('o PDF pequeno continua sendo PDF');
  await pagina.evaluate(() => { bovT = []; avT = []; gerT = []; openTrans('bov'); });
  await pagina.setInputFiles('#t-anexo-input',
    { name: 'nota-curta.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pequeno, 'latin1') });
  await pagina.waitForTimeout(1200);
  const curto = await pagina.evaluate(() => anexosForm.map(a => ({ nome: a.nome, tipo: a.tipo })));
  t.conferir('fica um anexo só', curto.length === 1, String(curto.length));
  t.conferir('e guardado como PDF, não como foto',
    curto[0] && curto[0].tipo === 'application/pdf', curto[0] && curto[0].tipo);

  t.secao('o PDF grande vira uma foto por página');
  await pagina.evaluate(() => { anexosForm = []; anexosRemover = []; renderAnexosForm(); });
  await pagina.setInputFiles('#t-anexo-input',
    { name: 'nota-fiscal.pdf', mimeType: 'application/pdf', buffer: Buffer.from(grande, 'latin1') });
  // Desenhar três páginas e comprimir leva tempo de verdade.
  await pagina.waitForFunction(() => anexosForm.length >= 3, { timeout: 30000 }).catch(() => {});
  const r = await pagina.evaluate(() => ({
    n: anexosForm.length,
    nomes: anexosForm.map(a => a.nome),
    tipos: [...new Set(anexosForm.map(a => a.tipo))],
    tamanhos: anexosForm.map(a => a.tamanho),
    limite: ANEXO_MAX,
    // Cada página precisa ter virado uma imagem de verdade, com conteúdo.
    dados: anexosForm.map(a => (anexoCache.get(a.id) || '').slice(0, 30)),
    bytes: anexosForm.map(a => (anexoCache.get(a.id) || '').length)
  }));
  t.conferir('as três páginas viram três anexos', r.n === 3, String(r.n));
  t.conferir('todos como foto', r.tipos.length === 1 && r.tipos[0] === 'image/jpeg', r.tipos.join(','));
  t.conferir('cada um dentro do limite que a nuvem aceita',
    r.tamanhos.every(x => x > 0 && x <= r.limite), r.tamanhos.join(' · '));
  t.conferir('são imagens JPEG de verdade',
    r.dados.every(d => d.startsWith('data:image/jpeg;base64,')), r.dados[0]);
  // Nota fora de ordem é nota que o contador devolve.
  t.conferir('numeradas e na ordem',
    r.nomes.join(' | ') === 'nota-fiscal · página 1 de 3 | nota-fiscal · página 2 de 3 | nota-fiscal · página 3 de 3',
    r.nomes.join(' | '));
  t.conferir('e o ".pdf" sai do nome, que agora é foto',
    r.nomes.every(n => !/\.pdf/.test(n)), r.nomes[0]);

  // Página de PDF é transparente por baixo: sem o fundo branco, a foto sai
  // preta e a nota fica ilegível sem nada na tela acusando.
  t.secao('nenhuma página sai preta');
  const claro = await pagina.evaluate(() => new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let soma = 0;
      for (let i = 0; i < d.length; i += 4) soma += (d[i] + d[i + 1] + d[i + 2]) / 3;
      ok({ medio: Math.round(soma / (d.length / 4)), w: img.width, h: img.height });
    };
    img.onerror = () => ok(null);
    img.src = anexoCache.get(anexosForm[0].id);
  }));
  t.conferir('a página tem fundo claro, não preto',
    claro && claro.medio > 200, claro ? `brilho médio ${claro.medio}` : 'não carregou');
  t.conferir('e sai no tamanho de leitura, não miniatura',
    claro && Math.max(claro.w, claro.h) >= 1000, claro ? `${claro.w}×${claro.h}` : '');

  // ---------- salvar leva as páginas junto ----------
  t.secao('salvar o lançamento leva as páginas');
  await pagina.evaluate(() => {
    document.querySelector('input[name="t-type"][value="saida"]').checked = true;
    $('t-date').value = todayISO();
    $('t-amount').value = '1200';
    $('t-category').value = 'Ração/insumos';
  });
  await pagina.click('#form-transaction button[type="submit"]');
  await pagina.waitForTimeout(400);
  const salvo = await pagina.evaluate(() => {
    // A lista obedece ao filtro de período: sem abrir o período, o lançamento
    // existe e simplesmente não está na tela que está sendo lida.
    tab = 'bovinos'; seg = 'financeiro';
    $('bfin-period').value = 'all'; guardarPeriodo('bfin-period');
    render();
    const t2 = bovT[0];
    return { anexos: (t2.anexos || []).length,
      nomes: (t2.anexos || []).map(a => a.nome),
      naFila: pendentes.filter(p => p.col === 'anexos').length,
      // O que a lista mostra para quem passa o olho
      naLista: $('bfin-list').innerText.replace(/\s+/g, ' ') };
  });
  t.conferir('o lançamento guarda as três páginas', salvo.anexos === 3, String(salvo.anexos));
  t.conferir('com os nomes numerados', salvo.nomes.length === 3 && /página 3 de 3/.test(salvo.nomes[2]),
    salvo.nomes.join(' | '));
  t.conferir('a lista avisa que há notas anexadas', /3 notas anexadas/.test(salvo.naLista),
    (salvo.naLista.match(/\d+ notas? anexadas?/) || ['nada'])[0]);

  t.conferir('nenhum erro de JavaScript em todo o percurso',
    errosJS.length === 0, errosJS.join(' | '));

  const falhas = t.fim(errosJS);
  await navegador.close(); await s.fechar();
  return falhas;
}
