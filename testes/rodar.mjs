// Roda toda a bateria. Sai com código diferente de zero se algo falhar, para
// que a publicação seja bloqueada quando um teste quebrar.
import calculos from './calculos.mjs';
import app from './app.mjs';
import pesagem from './pesagem.mjs';
import offline from './offline.mjs';
import abas from './abas.mjs';
import varredura from './varredura.mjs';
import integridade from './integridade.mjs';
import consistencia from './consistencia.mjs';
import financeiro from './financeiro.mjs';
import exportacao from './exportacao.mjs';
import auditoria from './auditoria.mjs';
import periodo from './periodo.mjs';
import calendario from './calendario.mjs';
import busca from './busca.mjs';
import arroba from './arroba.mjs';
import gmdmes from './gmdmes.mjs';
import layout from './layout.mjs';
import legibilidade from './legibilidade.mjs';
import icones from './icones.mjs';
import atividades from './atividades.mjs';
import buscanolista from './buscanolista.mjs';
import carencia from './carencia.mjs';
import projecao from './projecao.mjs';
import parcelado from './parcelado.mjs';
import contabil from './contabil.mjs';
import anexopdf from './anexopdf.mjs';
import acoes from './acoes.mjs';
import duplicidade from './duplicidade.mjs';
import lembrete from './lembrete.mjs';
import baixacal from './baixacalendario.mjs';
import regras from './regras.mjs';

const baterias = [['Cálculos', calculos], ['Aplicativo', app], ['Pesagem', pesagem], ['Abas', abas], ['Sem sinal', offline], ['Integridade', integridade], ['Consistência', consistencia], ['Financeiro', financeiro], ['Exportação', exportacao], ['Auditoria', auditoria], ['Período', periodo], ['Calendário', calendario], ['Busca', busca], ['Arroba na venda', arroba], ['GMD mês a mês', gmdmes], ['Layout', layout], ['Legibilidade', legibilidade], ['Ícones', icones], ['Atividades', atividades], ['Busca nas listas', buscanolista], ['Carência', carencia], ['Projeção', projecao], ['Parcelado', parcelado], ['Contábil', contabil], ['Anexo PDF', anexopdf], ['Ações', acoes], ['Duplicidade', duplicidade], ['Lembrete', lembrete], ['Baixa no calendário', baixacal], ['Regras', regras], ['Varredura', varredura]];
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
