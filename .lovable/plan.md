## Objetivo

1. **Remover a seção "Gestão de Crise"** do Dashboard (a lista de comentários negativos pendentes).
2. **Atualizar a "Visão Executiva da Campanha"** para refletir os cadastros da aba **Eleição** — Coordenadores, Líderes e Cabos eleitorais — que hoje não aparecem nos KPIs.

## Diagnóstico

- `src/pages/Dashboard.tsx` (linhas ~787–890) tem o bloco **Gestão de Crise** com `negativeComments`, checkboxes, "Ocultar selecionados", etc. Também referencia o tema na linha 437–440 do export de PDF.
- `src/components/dashboard/DashboardOverview.tsx` ("Visão Executiva da Campanha") consulta apenas as tabelas `pessoas`, `contratados` (com `is_lider`) e `funcionarios`. **Não lê `eleicao_pessoas`**, onde estão os perfis cadastrados na aba Eleição com `tipo ∈ { 'coordenador', 'lider', 'cabo' }`.
- Em `src/pages/Eleicao.tsx` confirmamos a estrutura: a tabela `eleicao_pessoas` é a fonte da estrutura eleitoral (escopo `campo_grande`/`interior`, hierarquia coordenador → líder → cabo).

## Plano de execução

### 1. Remover "Gestão de Crise" do Dashboard
- Em `src/pages/Dashboard.tsx`:
  - Excluir todo o `Card` "Gestão de Crise" (≈ linhas 787–890), incluindo a barra de bulk actions, a lista renderizada e o estado vazio.
  - Remover estados/handlers que ficam órfãos: `selectedCrisis`, `toggleCrisisSelection`, `toggleAllCrisis`, `handleBulkHide`, `bulkHiding` e imports não utilizados (`Checkbox`, `EyeOff`, `Shield`, `ShieldAlert`, etc., conforme uso restante).
  - Manter o cálculo de `negativeComments` apenas se ainda for usado pelo IED/PDF; caso contrário, remover. Atualizar o highlight do PDF (linhas 437–441) para refletir apenas "comentários negativos no período" sem mencionar "gestão de crise".
- A operacionalização de comentários negativos continua disponível na página **Comentários** (não vamos duplicar lá nenhuma funcionalidade — só removendo o atalho do dashboard).

### 2. Refletir Coordenadores / Líderes / Cabos na Visão Executiva
Em `src/components/dashboard/DashboardOverview.tsx`:

a) **Novos KPIs vindos de `eleicao_pessoas`** (filtrados por `client_id`):
   - `coordenadoresTotal` — `tipo = 'coordenador'`
   - `lideresEleicaoTotal` — `tipo = 'lider'`
   - `cabosTotal` — `tipo = 'cabo'`
   - `equipeEleicaoTotal` = soma dos três (usar como métrica principal "Estrutura Eleitoral").

b) **Reorganizar a grade de KPIs** (hoje 6 cartões) para acomodar a estrutura eleitoral sem poluir:
   ```text
   [Base Política] [Apoio comprometido] [Estrutura Eleitoral] [Contratados] [Funcionários] [Check-ins hoje]
   ```
   - O cartão "Estrutura Eleitoral" mostra o total e, em texto pequeno, o breakdown: `X coord · Y líderes · Z cabos`.
   - Ícone sugerido: `Crown` (já importado) ou `Network`.
   - Clique leva para `/eleicao`.

c) **Novo bloco "Estrutura da Campanha Eleitoral"** abaixo do gráfico "Crescimento da base":
   - Card com 3 mini-KPIs (Coordenadores, Líderes, Cabos) lado a lado, cada um com seu ícone (`Crown`, `Users`, `UserCheck`) e link para a aba Eleição com filtro pré-aplicado por tipo.
   - Mini gráfico de barras (recharts) com a distribuição por **região/cidade** (top 5) usando `regiao` ou `cidade` de `eleicao_pessoas` agrupada.
   - Estado vazio: "Nenhum cadastro eleitoral ainda — comece pela aba Eleição".

d) **Adaptar "Top Líderes por Equipe"**:
   - Hoje conta `contratados.is_lider`. Adicionar um seletor (ou um segundo card) "Top Coordenadores por Equipe Eleitoral" baseado em `eleicao_pessoas` (coordenadores com mais líderes vinculados por `parent_id`).

e) **Inclusão no export de PDF (`Dashboard.tsx → exportDashboardPdf`)**:
   - Adicionar highlight: `Estrutura eleitoral: X coordenadores, Y líderes, Z cabos.`
   - (Sem mudanças no PDF se o usuário preferir manter mínimo — confirmo depois se necessário.)

### 3. Pós-mudança
- Verificar `src/components/dashboard/SuggestedActions.tsx` e `AlertasWidget.tsx` para não referenciarem "Gestão de Crise" como destino (sugestões existentes apontam para `/comments` — manter).
- Rodar build/typecheck.

## Detalhes técnicos

- Sem alterações de schema: `eleicao_pessoas` já existe com colunas `tipo`, `client_id`, `parent_id`, `regiao`, `cidade`.
- Todas as queries novas usam `supabase.from("eleicao_pessoas" as any).select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("tipo", X)` — mesmo padrão atual do arquivo.
- RLS já valida acesso por cliente (consistente com o uso em `src/pages/Eleicao.tsx`).
- Manter `staleTime` de 2 min nos KPIs novos.

## Itens fora de escopo (a confirmar se quiser)

- Não vou mexer no funcionamento da página de Comentários (continua sendo o lugar para gestão real de negativos).
- Não vou mover a "Gestão de Crise" para outra página — apenas remover do dashboard, como pedido.
- Não vou criar novos relatórios PDF — apenas ajustar os highlights existentes.