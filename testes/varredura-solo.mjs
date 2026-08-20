// Roda só a varredura, para as corridas grandes (VARREDURA=100000).
import varredura from './varredura.mjs';
const falhas = await varredura();
process.exit(falhas ? 1 : 0);
