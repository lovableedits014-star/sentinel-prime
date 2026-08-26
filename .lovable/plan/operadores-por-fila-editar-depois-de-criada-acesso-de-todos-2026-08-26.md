# Operadores por fila (editar depois de criada) + acesso de todos os operadores

## O que eu encontrei

**1. A parte de "marcar operadores por fila" foi implementada só pela metade.**
- O banco já está pronto: a tabela `telemarketing_campanha_operadores` existe, com 15 vínculos (as 3 filas atuais x 5 operadores, todos marcados), e as funções `tele_fila_operadores`, `tele_fila_set_operadores` já existem. As buscas do operador (`tele_list_contatos`, `tele_proximo_contato`, `tele_buscar_contato`) já só entregam contatos das filas em que ele está marcado.
- O assistente de nova fila já tem as caixinhas de operadores (passo "Quem vai ligar", com Compartilhada / Dividir).
- **O que falta é exatamente o que você tentou usar:** na aba **Filas de ligação** não existe nenhum botão para editar os operadores de uma fila já criada. O painel `FilaOperadoresDialog` nunca foi criado. Por isso continua impossível tirar um operador de uma fila existente.
- Os textos de ajuda antigos também continuam falando em "pool livre" (é o que aparece no seu print: contadores "0 no pool livre" e a explicação em azul), o que passa a impressão de que nada mudou.

**2. O problema não é a senha nem o cadastro do Marcos: nenhum operador consegue entrar após o último deploy.** O novo anexo confirma que a autenticação passa e o erro acontece na etapa seguinte, ao carregar os contatos: `column reference "campanha_id" is ambiguous`.

A causa está confirmada na função `tele_list_contatos`, alterada para aplicar os operadores permitidos por fila. Ela declara `campanha_id` como coluna de retorno e também usa `campanha_id` sem qualificar dentro da CTE `allowed` (`SELECT campanha_id FROM allowed`). O PostgreSQL não consegue decidir se a referência é a variável de saída da função ou a coluna da consulta e interrompe o carregamento para Ariana, Marcos e todos os demais operadores.

## O que vou entregar

### A. Operadores da fila (aba Filas de ligação)
- Novo botão **Operadores da fila** em cada card, ao lado de "Gerenciar designações".
- No painel: uma caixinha por operador ativo, com marcar/desmarcar, "Marcar todos", "Desmarcar todos" e, ao lado de cada nome, quantos contatos pendentes e ligados ele tem naquela fila.
- Ao desmarcar alguém que tinha contatos, escolha do que fazer com esses contatos:
  - devolver para a fila (livre para quem continua),
  - repassar para um operador específico,
  - manter parados com ele (só bloqueia novas puxadas).
- Badge no card mostrando os operadores liberados (ex.: "Ariana, Marcos +2") e etiqueta **"Sem operador — ninguém liga"** quando a fila fica vazia de operadores.
- Depois de salvar, a lista de filas e as contagens por operador recarregam.

### B. Limpeza dos textos "pool livre"
- Os contadores e as explicações de "Designações" passam a dizer **"Livre para os operadores da fila"** em vez de "pool livre", incluindo o balão de ajuda do print.

### C. Correção do acesso de todos os operadores
- Corrigir a ambiguidade de `campanha_id` em `tele_list_contatos`, qualificando todas as colunas e aliases da CTE que controla quais filas cada operador pode acessar.
- Auditar e corrigir a mesma ambiguidade nas funções irmãs alteradas no mesmo deploy (`tele_proximo_contato`, `tele_buscar_contato` e `tele_operador_campanhas`), para o operador não conseguir entrar e depois falhar ao puxar ou buscar um contato.
- Preservar a regra nova: o operador só lista, busca e puxa contatos das filas em que está marcado.
- Exibir uma mensagem específica de falha de carregamento, separada de “nome ou senha inválidos”, evitando dar a impressão de senha errada quando o banco falha depois da autenticação.
- Validar de ponta a ponta com uma conta operacional: entrar no portal, listar campanhas, carregar contatos, puxar o próximo e buscar um telefone.
- Validar também a barreira: retirar esse operador de uma fila e confirmar que ele não consegue mais listar nem puxar contatos dela, sem afetar as filas em que continua marcado.

## Detalhes técnicos

- Migração:
  - `tele_list_contatos`: usar aliases explícitos em toda referência a `campanha_id`, especialmente no filtro da CTE `allowed`, eliminando o conflito com a coluna `RETURNS TABLE`.
  - revisar `tele_proximo_contato`, `tele_buscar_contato` e `tele_operador_campanhas` pelo mesmo padrão e qualificar qualquer referência potencialmente ambígua.
  - `tele_fila_summary` (ou `tele_operador_counts_por_campanha`) devolvendo `operadores_marcados` + nomes para o badge do card.
- Frontend:
  - novo `src/components/telemarketing/FilaOperadoresDialog.tsx` (caixinhas + ação para os contatos de quem sai, chamando `tele_fila_operadores` / `tele_fila_set_operadores`);
  - `src/pages/TelemarketingAdminFilas.tsx`: botão + badge por fila e recarga após salvar;
  - `src/components/telemarketing/AtribuicoesDialog.tsx`, `AdicionarContatosDialog.tsx`, `ImportContatosAvulsosDialog.tsx` e `telemarketing-help.ts`: substituir "pool livre" pelos novos textos;
  - `src/pages/Telemarketing.tsx`: manter separadas as mensagens de autenticação e de carregamento de contatos.

## Ordem de execução
1. Correção emergencial das RPCs do portal (`tele_list_contatos` e funções irmãs) e teste de acesso de um operador.
2. Painel "Operadores da fila" e botão/badge na aba Filas.
3. Ajuste dos textos "pool livre".
4. Teste completo: login, listagem, busca e puxada em fila permitida; bloqueio em fila desmarcada.
