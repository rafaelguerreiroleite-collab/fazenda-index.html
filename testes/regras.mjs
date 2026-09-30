// As regras do Firestore, rodadas de verdade no emulador.
//
// Por que existe: a regra anterior trazia um comentário afirmando que a
// listagem da coleção farms estava negada. Não estava. Qualquer pessoa do
// mundo criava um login anônimo (não precisa cadastro), pedia a lista de
// /farms e recebia TODOS os códigos de fazenda — e com o código vem ler e
// apagar tudo. O comentário estava lá, convincente, e errado, porque nada
// nunca executou aquela regra.
//
// A causa: o curinga recursivo {document=**} também casa com ZERO segmentos.
// Um `match /farms/{farmId}` com um `match /{document=**}` dentro concede o
// "allow read" de dentro ao PRÓPRIO farms/{farmId} — e "read" é "get" mais
// "list". Regra do Firestore nunca nega o que outra permite, então não há
// "allow list: if false" que resolva: só a estrutura resolve.
//
// Este arquivo executa as duas versões, a quebrada e a corrigida, e cobra a
// diferença. Roda só quando o emulador está instalado; sem ele, avisa e não
// finge que conferiu.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { placar } from './apoio.mjs';

const RAIZ = resolve(import.meta.dirname, '..');

// A regra como estava antes — mantida aqui só para provar que o furo era real
// e que a correção fecha ele. Se um dia alguém reescrever as regras assim de
// novo, este teste quebra.
const REGRA_ANTIGA = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /farms/{farmId} {
      allow get, write: if request.auth != null;
      match /{document=**} {
        allow read, write: if request.auth != null;
      }
    }
  }
}`;

async function comRegras(rulesUnitTesting, regras, corpo) {
  const amb = await rulesUnitTesting.initializeTestEnvironment({
    projectId: 'regras-fazenda',
    firestore: { rules: regras, host: '127.0.0.1', port: 8080 }
  });
  try { await corpo(amb); } finally { await amb.cleanup(); }
}

export default async function () {
  const t = placar('Regras do Firestore (no emulador)');
  // Sem emulador de pé não há regra para executar. Pular calado seria repetir
  // o erro que trouxe este arquivo aqui — então avisa em voz alta e diz como
  // rodar de verdade.
  const emuladorDePe = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(1500) })
    .then(() => true, () => false);
  let rut = null;
  if (emuladorDePe) { try { rut = await import('@firebase/rules-unit-testing'); } catch (e) { rut = null; } }
  if (!rut) {
    console.log('\n### Regras do Firestore (no emulador)');
    console.log('  PULADO — o emulador do Firestore não está de pé.');
    console.log('  Rode com:  npm run testes:regras');
    return 0;
  }
  const { assertFails, assertSucceeds } = rut;
  const fs = await import('firebase/firestore');
  const { collection, doc, getDoc, getDocs, setDoc } = fs;

  const regraNova = await readFile(resolve(RAIZ, 'firestore.rules'), 'utf-8');

  // ---------- a regra que está no repositório ----------
  await comRegras(rut, regraNova, async amb => {
    const logado = amb.authenticatedContext('anon-qualquer').firestore();
    const deslogado = amb.unauthenticatedContext().firestore();

    t.secao('a regra corrigida');
    // O que o aplicativo precisa continuar fazendo.
    t.conferir('quem sabe o código lê a fazenda',
      await assertSucceeds(getDoc(doc(logado, 'farms/fazenda-de-teste'))).then(() => true, () => false));
    t.conferir('e grava nela',
      await assertSucceeds(setDoc(doc(logado, 'farms/fazenda-de-teste'), { yield: 52 })).then(() => true, () => false));
    t.conferir('lê a lista de animais da fazenda',
      await assertSucceeds(getDocs(collection(logado, 'farms/fazenda-de-teste/animals'))).then(() => true, () => false));
    t.conferir('e grava um animal',
      await assertSucceeds(setDoc(doc(logado, 'farms/fazenda-de-teste/animals/a1'), { ident: 'BR01' })).then(() => true, () => false));

    // O furo.
    t.conferir('NÃO dá para listar a coleção farms e descobrir os códigos',
      await assertFails(getDocs(collection(logado, 'farms'))).then(() => true, () => false));

    // E sem login não entra nada.
    t.secao('sem login não passa nada');
    t.conferir('não lê a fazenda',
      await assertFails(getDoc(doc(deslogado, 'farms/fazenda-de-teste'))).then(() => true, () => false));
    t.conferir('não lê os animais',
      await assertFails(getDocs(collection(deslogado, 'farms/fazenda-de-teste/animals'))).then(() => true, () => false));
    t.conferir('não grava',
      await assertFails(setDoc(doc(deslogado, 'farms/fazenda-de-teste/animals/x'), { a: 1 })).then(() => true, () => false));
  });

  // ---------- a regra antiga, para provar que o furo era real ----------
  await comRegras(rut, REGRA_ANTIGA, async amb => {
    const logado = amb.authenticatedContext('anon-qualquer').firestore();
    t.secao('a regra antiga, para registro');
    t.conferir('ela DEIXAVA listar os códigos — o furo era este',
      await assertSucceeds(getDocs(collection(logado, 'farms'))).then(() => true, () => false));
  });

  return t.fim();
}
