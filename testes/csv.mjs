// Leitor de CSV de verdade, para os conferidores.
//
// Vários conferidores liam o arquivo com split(';'), e isso mente exatamente
// nos casos que importam: campo entre aspas pode conter ponto-e-vírgula, aspas
// dobradas e quebra de linha. Uma categoria chamada "Ração; insumos", um item
// "Milho; moído" ou uma atividade "Soja; Trigo" — tudo nome que a fazenda pode
// escrever — faz o split devolver cinco pedaços onde há quatro campos, e o
// conferidor acusa um defeito que não existe (ou, pior, lê a coluna errada e
// aprova um defeito que existe).
//
// Mora num arquivo só para não haver três versões disto, cada uma com um
// descuido diferente.
export function lerCSV(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  const t = String(texto == null ? '' : texto).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
// Acha a coluna pelo NOME do cabeçalho. Índice fixo é a outra forma de o
// conferidor passar a olhar para o lugar errado quando o arquivo ganha coluna.
export const colunaDe = (cab, nome) => cab.indexOf(nome);
