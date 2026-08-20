// Roda toda a bateria. Sai com código diferente de zero se algo falhar, para
// que a publicação seja bloqueada quando um teste quebrar.
import calculos from './calculos.mjs';
import app from './app.mjs';
import pesagem from './pesagem.mjs';
import offline from './offline.mjs';
import abas from './abas.mjs';
import varredura from './varredura.mjs';

const baterias = [['Cálculos', calculos], ['Aplicativo', app], ['Pesagem', pesagem], ['Abas', abas], ['Sem sinal', offline], ['Varredura', varredura]];
let total = 0;

for (const [nome, rodar] of baterias) {
  try {
    total += await rodar();
  } catch (e) {
    console.error(`\n### ${nome}: a bateria não chegou ao fim\n`, e);
    total++;
  }
}

console.log('\n' + '='.repeat(52));
if (total === 0) {
  console.log('TUDO CERTO — nenhuma falha');
  process.exit(0);
}
console.log(`FALHAS: ${total} — publicação bloqueada`);
process.exit(1);
