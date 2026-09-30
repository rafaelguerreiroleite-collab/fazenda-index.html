// Roda só as regras do Firestore, por dentro do emulador.
// Use `npm run testes:regras` — é ele que sobe o emulador em volta.
import regras from './regras.mjs';
process.exit(await regras() ? 1 : 0);
