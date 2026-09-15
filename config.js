/* =========================================================
   Ligacao com a nuvem (Firestore do projeto fazenda-e3652).

   So o projectId: o app nao usa Authentication, Storage nem
   Analytics, e o Firestore dispensa as outras chaves quando
   o acesso e anonimo. Testado em navegador, com dois perfis
   separados lendo a mesma carteira.

   Estas chaves nao sao segredo: em qualquer app web do Firebase
   elas ficam visiveis no codigo da pagina. Quem protege os dados
   sao as regras do Firestore (firestore.rules) mais o codigo da
   carteira, que tem 12 caracteres sorteados.

   O banco e compartilhado com o sistema da fazenda. As regras
   cobrem os dois: /farms para a fazenda, /carteiras para este
   app. Elas sao publicadas a mao no console do Firebase, porque
   a conta de servico do deploy so tem permissao de Hosting.
   ========================================================= */

window.CONFIG_FIREBASE = {
  projectId: "fazenda-e3652"
};
