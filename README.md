# fazenda-index.html

App simples de gestão de fazendas, em um único arquivo `index.html`, usando Firebase Authentication (email/senha) e Cloud Firestore.

## Como colocar para rodar

1. Crie um projeto em https://console.firebase.google.com.
2. Em **Authentication → Sign-in method**, habilite o provedor **Email/senha**.
3. Em **Firestore Database**, crie o banco de dados e depois publique o conteúdo de [`firestore.rules`](./firestore.rules) na aba **Regras**.
4. Em **Configurações do projeto → Seus apps**, crie um app Web e copie as credenciais.
5. Abra o `index.html` e cole essas credenciais no objeto `firebaseConfig` (topo do bloco `<script>`).
6. Abra o `index.html` no navegador (ou publique com Firebase Hosting, GitHub Pages, etc.).

## Modelo de dados

Cada fazenda é um documento na coleção `farms`, com um campo `ownerId` contendo o `uid` do usuário dono — é esse campo que as regras de segurança usam para garantir que cada usuário só veja/edite suas próprias fazendas.