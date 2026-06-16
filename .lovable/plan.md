## Modelo: dobradinha herdada da "raiz"

A dobradinha passa a ser uma decisão da **raiz do time**:

- **Coordenadores** são raízes.
- **Líderes avulsos** (sem coordenador) também são raízes independentes.
- Líderes vinculados a um coordenador e todos os cabos **herdam** o federal + rateio da sua raiz. Não é possível sobrescrever individualmente.

Visualmente, o "time" do coordenador (ele + líderes + cabos abaixo) inteiro vira a unidade de cálculo dos custos para aquele federal.

## Mudanças de banco

### 1. Marcar quem é "raiz" da dobradinha (conceito implícito, sem nova coluna)
- Coordenador: sempre raiz.
- Líder com `parent_id IS NULL` (avulso): raiz.
- Demais: herdam — `parceiro_id` / `rateio_*` deixam de ser editáveis na UI individual, mas continuam armazenados (servem como "cache" propagado, mais simples de consultar).

### 2. RPC `eleicao_aplicar_dobradinha_raiz`
SECURITY DEFINER, recebe `_raiz_id`, `_parceiro_id`, `_rateio_estadual`, `_rateio_parceiro`, `_propagar boolean`.
- Atualiza a raiz.
- Se `_propagar = true`: atualiza recursivamente todos os descendentes (líderes → cabos) com o mesmo federal/rateio.
- Se `_propagar = false`: só a raiz; descendentes mantêm o que tinham (útil quando o usuário responder "não" no diálogo de propagação).
- Valida que a raiz é coordenador ou líder avulso e que o cliente bate.
- Retorna a contagem de pessoas atualizadas (para o toast: "12 pessoas do time foram atualizadas").

### 3. Trigger de coerência no cadastro de pessoa
Quando uma pessoa não-raiz (líder com `parent_id` ou cabo) é inserida ou tem o `parent_id` alterado:
- O trigger preenche automaticamente `parceiro_id`, `rateio_estadual`, `rateio_parceiro` com os valores da raiz (sobe na árvore até achar coordenador ou líder avulso).
- Garante que um líder/cabo nunca fique "desalinhado" da sua raiz sem que o usuário escolha.

## Mudanças na UI

### 1. Formulário de pessoa (`Eleicao.tsx`)
- A seção "Dobradinha" **só aparece** quando `tipo === "coordenador"` OU (`tipo === "lider"` e `liderAvulso` marcado).
- Para líder/cabo vinculado: aparece um aviso somente-leitura mostrando o federal/rateio herdado da raiz, com um link "editar no coordenador".
- Ao salvar uma raiz com dobradinha **alterada** (em edição), dispara o **diálogo de propagação** (item 3 abaixo) antes de gravar.

### 2. Nova aba "Dobradinhas" (visão central de gestão)
Adicionar `<TabsTrigger value="dobradinhas">Dobradinhas</TabsTrigger>` na barra de abas da Eleição (ao lado de "Previsão de custos").

Conteúdo da aba — componente novo `DobradinhasManagerPanel.tsx`:
- Tabela de **raízes** (coordenadores + líderes avulsos), com: nome, escopo/região, qtd de pessoas no time, custo total do time, federal designado (badge colorido), rateio.
- Filtros: escopo, região/cidade, "só sem dobradinha", "só com dobradinha do federal X".
- Ações por linha:
  - Select inline do federal parceiro.
  - Atalhos de rateio (100/0, 70/30, 50/50, 0/100, custom).
  - Botão "Aplicar" → chama a RPC com `_propagar=true`.
- **Ação em massa** no topo: selecionar várias raízes via checkbox → "Designar federal X com rateio Y para selecionadas".
- Card-resumo no topo da aba: "X coordenadores sem dobradinha · Y times designados · Total já comprometido com cada federal".

### 3. Diálogo de propagação (`DobradinhaPropagarDialog.tsx`)
Disparado quando:
- Usuário edita uma raiz no formulário e muda federal ou rateio E a raiz já tem descendentes.
- Usuário muda federal de uma raiz na aba "Dobradinhas" e ela já tem descendentes.

Conteúdo:
- "O time de [Nome] tem **N líderes e M cabos**. Aplicar a nova dobradinha para todos?"
- Lista resumida dos descendentes que serão alterados.
- Botões: "Sim, aplicar para o time todo" (propagar=true) · "Não, só este coordenador" (propagar=false) · "Cancelar".

### 4. Cadastro de novo coordenador/líder avulso
- Mantém a seção dobradinha visível.
- Ao salvar, descendentes ainda não existem, então não precisa de diálogo — só grava.

### 5. Listagem de pessoas (RegionBlock e afins)
- Badge colorido do federal ao lado do nome **da raiz**.
- Líderes/cabos abaixo herdam visualmente: badge menor "↳ [cor do federal]" ou tooltip "Time do federal X".

## Mudanças em `PrevisaoCustos`

Hoje já soma `valor * rateio / 100` por pessoa. Como a propagação garante que cada descendente tem o `parceiro_id` correto, o cálculo atual continua funcionando — mas precisa de uma camada de agrupamento por "time da raiz":

- **Novo card** "Custo por time" mostrando: nome do coordenador/líder avulso + federal + custo total do time + qtd de pessoas. Ordenado pelo custo decrescente.
- O breakdown por candidato (cards no topo) já funciona corretamente.
- Tabela "Quem paga quem" ganha coluna "Time de" (mostra o nome da raiz quando a pessoa for descendente).
- Mantém todos os outros gráficos.

## Migração de dados existentes

Migration adicional para alinhar quem já está cadastrado:
- Para cada coordenador e líder avulso existente: mantém seus valores atuais como "verdade da raiz".
- Para cada líder vinculado e cabo: sobrescreve `parceiro_id`/rateio com os da raiz (ascendente). Garante consistência inicial.

## Fora do escopo

- Sobrescrita individual (já decidido: "coordenador manda no time").
- Designação por região inteira em vez de por raiz (pode virar atalho no futuro se você pedir).
- Mudanças em artes, fluxos de WhatsApp, links públicos — continua tudo centralizado no estadual.

## Detalhes técnicos

- **Migration 1**: cria a RPC `eleicao_aplicar_dobradinha_raiz` (recursive CTE descendo pela árvore `parent_id`).
- **Migration 2**: trigger `BEFORE INSERT OR UPDATE OF parent_id` em `eleicao_pessoas` que herda da raiz quando a pessoa não é raiz.
- **Migration 3**: backfill alinhando descendentes às raízes atuais.
- **Frontend**:
  - `useDobradinhaRaizes(clientId)` — hook agregando raízes com qtd de descendentes e custo do time (cálculo client-side a partir das pessoas já carregadas).
  - `DobradinhasManagerPanel.tsx` — nova aba.
  - `DobradinhaPropagarDialog.tsx` — diálogo reutilizado pelo form e pela aba.
  - Ajustes em `Eleicao.tsx` (form: esconder/exibir dobradinha por tipo, hook do diálogo) e `PrevisaoCustos.tsx` (card "Custo por time").

## Entregáveis

1. Migration: RPC de aplicação + trigger de herança + backfill.
2. Aba "Dobradinhas" com listagem de raízes, filtros e ação em massa.
3. Diálogo de propagação (raiz alterada vs. time montado).
4. Form ajustado: só raízes editam dobradinha; descendentes mostram herança em modo leitura.
5. `PrevisaoCustos`: card "Custo por time" + coluna "Time de" na tabela de dobradinhas.
6. Badge colorido do federal na listagem (raiz com badge cheio, descendentes com indicador menor).
