# Operadores por fila (editar depois de criada) + login do operador Marcos

## O que eu encontrei

**1. A parte de "marcar operadores por fila" foi implementada só pela metade.**
- O banco já está pronto: a tabela `telemarketing_campanha_operadores` existe, com 15 vínculos (as 3 filas atuais x 5 operadores, todos marcados), e as funções `tele_fila_operadores`, `tele_fila_set_operadores` já existem. As buscas do operador (`tele_list_contatos`, `tele_proximo_contato`, `tele_buscar_contato`) já só entregam contatos das filas em que ele está marcado.
- O assistente de nova fila já tem as caixinhas de operadores (passo "Quem vai ligar", com Compartilhada / Dividir).
- **O que falta é exatamente o que você tentou usar:** na aba **Filas de ligação** não existe nenhum botão para editar os operadores de uma fila já criada. O painel `FilaOperadoresDialog` nunca foi criado. Por isso continua impossível tirar um operador de uma fila existente.
- Os textos de ajuda antigos também continuam falando em "pool livre" (é o que aparece no seu print: contadores "0 no pool livre" e a explicação em azul), o que passa a impressão de que nada mudou.

**2. Login do Marcos.** O cadastro dele está normal: ativo, senha gravada (hash bcrypt), sem bloqueio e sem tentativas erradas — mas nunca logou (`last_login_at` vazio). A causa provável está na verificação de credenciais: a checagem do nome é **exata e sensível a maiúsculas/acentos/espaços** (`o.nome = _nome`). Se ele digitar "marcos", "MARCOS" ou com um espaço sobrando, o sistema responde "Nome ou senha inválidos" mesmo com a senha certa. Como diagnóstico complementar, vou registrar o motivo real da falha na auditoria (nome não encontrado x senha errada) para não ficarmos no escuro caso não seja isso.

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

### C. Correção do login do operador
- A verificação de nome passa a ignorar maiúsculas/minúsculas, acentos e espaços sobrando (mesma regra no login e em todas as chamadas do operador), mantendo a senha exatamente como é hoje.
- Mensagens mais úteis na tela: "não encontramos esse operador" x "senha incorreta" x "conta bloqueada".
- Registro do motivo da falha na auditoria de operadores, para você ver na aba Operadores caso volte a acontecer.
- Vou validar de ponta a ponta abrindo o portal e logando como Marcos (com senha de teste redefinida por você ou por mim na tela de Operadores), confirmando que ele entra e vê as filas em que está marcado.

## Detalhes técnicos

- Migração:
  - `_tele_assert_operador` e `verify_telemarketing_operador`: trocar `o.nome = _nome` por comparação normalizada (`lower(unaccent(btrim(...)))`), com `LIMIT 1` e desempate por `created_at`.
  - `verify_telemarketing_operador` passa a distinguir "não encontrado" de "senha errada" (código de retorno) e a gravar em `telemarketing_operador_audit`; contagem de `failed_attempts`/`locked_until` preservada.
  - `tele_fila_summary` (ou `tele_operador_counts_por_campanha`) devolvendo `operadores_marcados` + nomes para o badge do card.
- Frontend:
  - novo `src/components/telemarketing/FilaOperadoresDialog.tsx` (caixinhas + ação para os contatos de quem sai, chamando `tele_fila_operadores` / `tele_fila_set_operadores`);
  - `src/pages/TelemarketingAdminFilas.tsx`: botão + badge por fila e recarga após salvar;
  - `src/components/telemarketing/AtribuicoesDialog.tsx`, `AdicionarContatosDialog.tsx`, `ImportContatosAvulsosDialog.tsx` e `telemarketing-help.ts`: substituir "pool livre" pelos novos textos;
  - `src/pages/Telemarketing.tsx`: mensagens de erro de login diferenciadas.

## Ordem de execução
1. Migração (normalização de login + auditoria + contagem de operadores marcados).
2. Painel "Operadores da fila" e botão/badge na aba Filas.
3. Ajuste dos textos "pool livre".
4. Teste real de login do Marcos e de puxada de contato numa fila onde ele está/não está marcado.
