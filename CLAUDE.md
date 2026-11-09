# Regras de trabalho neste repositório

Instruções permanentes do dono do aplicativo. Valem para toda alteração, por
menor que ela pareça.

## 1. Nunca dar margem para erro

**Toda alteração passa por varredura criteriosa ANTES de ser publicada.** Não
existe mudança pequena demais: uma linha numa lista de categorias e um conserto
de cálculo recebem o mesmo tratamento.

O que "varredura criteriosa" quer dizer, na prática:

1. **Medir o defeito no aplicativo rodando** antes de consertar — não deduzir
   lendo o código. Número medido vai para a mensagem do commit.
2. **Conferir o caminho inteiro da alteração**, e não só o ponto que mudou.
   "A opção existe na lista" não é varredura; varredura é o lançamento feito
   com ela chegando certo no detalhamento por categoria, no "A pagar", na aba
   Fazenda, no relatório e no arquivo do contador.
3. **Rodar a bateria completa aqui** (`node testes/rodar.mjs`) e esperar o
   verde. O portão do servidor roda a mesma bateria, mas ele é a segunda
   barreira — nunca a primeira, e nunca desculpa para encurtar caminho.
4. **Testar o conferidor contra o erro de verdade** (teste de mutação):
   devolver o defeito ao código e ver a bateria acusar. Conferência que nunca
   falha não prova nada.
5. **Só então publicar**, e conferir por sha256 que o que está no ar é
   exatamente o que passou na bateria.

## 2. Conferência de propriedade, não de fórmula

Conferidor que reimplementa a fórmula só pega erro de digitação: ele foi
escrito lendo o código e concorda com ele mesmo quando a REGRA está errada —
inclusive com a regra errada de quem está consertando.

Preferir sempre propriedades que não dependem de implementação:

- a média ponderada fica entre o menor e o maior valor;
- a soma das partes dá o todo, por todos os caminhos ao mesmo tempo;
- o número que a tela declara como base reproduz o número que ela mostra;
- "custo por dia × dias por arroba" dá o número grande, na calculadora, com os
  valores arredondados que estão na tela.

Estas regras já pegaram defeito dentro do próprio conserto, duas vezes, antes
de ele sair daqui.

## 3. Uma conta mora num lugar só

Fórmula escrita à mão em dois lugares é como uma delas passa a mentir sem
ninguém descobrir qual. A arroba, o GMD, o custo médio e a projeção de peso têm
uma função cada, e toda tela chama essa função.

## 4. Nada na tela sem base declarada

Todo número mostrado diz de onde veio: qual rendimento usou, qual GMD, se é
medida ou estimativa, de quantos dias atrás é a balança. Declarar base errada é
pior do que não declarar — quem confere na calculadora erra junto e confia.

E número que o aplicativo não tem como saber sai como "—", nunca como zero:
zero é uma afirmação.

## 5. Como o dono trabalha

- Comunicação **sempre em português**.
- A fazenda **pesa sempre sem jejum**.
- Antes de perguntar, resolver sozinho o que der para resolver.
- Alteração que mexe em dinheiro é tratada como um sênior de financeiro
  trataria, e todos os cálculos em volta são reanalisados.
- Ideias de melhoria são apresentadas para aprovação antes de serem feitas.
- Recusados e não reabrir: migração de código de fazenda, lote/pasto,
  publicação das regras do Firestore.

## 6. Publicação

`VERSAO` em `app.js` e `CACHE` em `sw.js` sobem juntos a cada publicação. Push
no branch de trabalho dispara a bateria no servidor e, passando, o deploy. O
job `regras` falha de propósito: publicar as regras do Firestore foi recusado
pelo dono.

## 7. Escrita

Comentários e mensagens de commit em português, explicando POR QUE o código é
assim — com o defeito que ele evita, medido. Um comentário que diz o que a
linha faz é ruído; um que diz o que já aconteceu ali é documentação.
