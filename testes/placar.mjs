// Contagem de resultados e comparação de números — sem navegador, sem
// dependência nenhuma. Separado de apoio.mjs porque a bateria das regras do
// Firestore roda dentro do emulador, onde o Playwright nem está instalado.
export function placar(titulo) {
  let ok = 0, falhas = 0;
  const linhas = [];
  return {
    conferir(nome, passou, detalhe = '') {
      passou ? ok++ : falhas++;
      linhas.push(`  ${passou ? 'ok  ' : 'FALHA'} | ${nome}${detalhe ? '  ' + detalhe : ''}`);
    },
    secao(nome) { linhas.push(`--- ${nome} ---`); },
    fim(errosJS = []) {
      console.log(`\n### ${titulo}`);
      console.log(linhas.join('\n'));
      if (errosJS.length) { falhas += errosJS.length; console.log('  ERRO JS: ' + errosJS.join(' | ')); }
      console.log(`  => ${ok} ok, ${falhas} falhas`);
      return falhas;
    }
  };
}

export const perto = (a, b, tol = 1e-9) => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
};
