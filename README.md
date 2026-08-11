# Fazenda JS

PWA de gestão de fazenda (bovinos e aviários) — pesagens, GMD, estoque e financeiro — com sincronização entre aparelhos via Firebase/Firestore.

## Como colocar para rodar

1. Crie um projeto em https://console.firebase.google.com.
2. Em **Authentication → Sign-in method**, habilite o provedor **Anônimo** (é assim que cada aparelho se autentica, sem precisar de conta/senha).
3. Em **Firestore Database**, crie o banco de dados e depois publique o conteúdo de [`firestore.rules`](./firestore.rules) na aba **Regras**.
4. Em **Configurações do projeto → Seus apps**, crie um app Web e copie o bloco `firebaseConfig`.
5. Abra o app (`index.html`) no navegador. Na tela de configuração inicial, cole o `firebaseConfig` e escolha um **código da fazenda** (ex: `fazendajs-2026`).

## Modelo de dados e segurança

Não existe login por usuário — o acesso aos dados de uma fazenda é controlado pelo **código da fazenda**, usado como parte do caminho dos documentos (`farms/{codigo}/...`). Qualquer aparelho que use o mesmo código acessa e sincroniza os mesmos dados; por isso o código deve ser tratado como uma senha (longo e não óbvio) e compartilhado apenas com quem deve ter acesso.

As regras do Firestore (`firestore.rules`) apenas exigem que o usuário esteja autenticado (autenticação anônima já conta) — a proteção real vem de manter o código da fazenda em segredo.

Para usar o mesmo código em outro aparelho, repita o passo 5 colando o mesmo `firebaseConfig` e o mesmo código da fazenda.
