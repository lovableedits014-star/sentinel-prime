# Relatórios por fila de ligação (geral, não só indicados)

## Problema hoje

- A aba **Relatórios** do telemarketing começa pelo *Scorecard por indicador*, que lê apenas contatos que têm indicador (fila de indicados). Filas de outras origens (planilha/Instituto, estrutura, avulsos) não têm painel próprio de mensuração.
- O painel geral (`TelemarketingReportsPanel`) recebe todos os contatos, mas o hook `useTelemarketingAdminData` descarta `campanha_id` / `campanha_nome`, então não existe filtro por fila.
- O nome da fila só pode ser definido na criação; não há como renomear depois.
- O histórico de ligações (`telemarketing_call_log`) não guarda a fila, só o contato guarda a última fila (`campanha_id`). Para medir fila a fila de forma confiável a partir de agora, a fila precisa ser gravada em cada ligação.

## O que vai ser entregue

### 1. Renomear fila (e editar descrição)
- Botão de lápis no card da fila em **Filas de ligação**, abrindo um diálogo pequeno com Nome e Descrição.
- Salva em `telemarketing_campanhas`, recarrega a lista e mostra confirmação.

### 2. Seletor de fila no topo da página de Relatórios
- Um "chip"/seletor **Fila** logo abaixo do título: *Todas as filas* + uma opção por fila existente (mostrando total de contatos).
- A escolha vale para todos os painéis da página (geral, indicadores e comparativo), permitindo mensurar cada fila separadamente (ex.: "1ª rodada" vs "Fila Instituto 1").

### 3. Novo painel: Resultado geral da fila
- Colocado **antes** do scorecard de indicadores, funciona para qualquer origem de contatos.
- KPIs: contatos na fila, trabalhados, pendentes, taxa de contato, "vota sim / não / indeciso / não quis opinar", não atendeu, números inválidos.
- Recortes: por operador, por cidade, por bairro, por origem do contato (planilha/estrutura/indicados/contratados/avulsos) e por resposta de estadual / federal / senador / governador.
- Gráficos (mesma linguagem visual atual, Recharts) + tabela detalhada com busca.
- Exportação **Excel** e **PDF** já filtradas pela fila selecionada, com o nome da fila no cabeçalho/arquivo.

### 4. Comparativo entre filas
- Tabela "Fila x Fila": total, trabalhados, % cobertura, % contato, % voto sim, indecisos, não atendeu — uma linha por fila.
- Permite comparar 1ª rodada com Instituto 1 lado a lado, ou exportar o comparativo.

### 5. Scorecard por indicador
- Continua existindo, agora rotulado explicitamente como "somente contatos com indicador" e respeitando o seletor de fila.
- Fica recolhido/oculto automaticamente quando a fila selecionada não tem contatos com indicador (ex.: fila Instituto).

## Detalhes técnicos

- Migração:
  - `ALTER TABLE telemarketing_call_log ADD COLUMN campanha_id uuid REFERENCES telemarketing_campanhas(id) ON DELETE SET NULL;` + índice `(client_id, campanha_id)`.
  - `tele_registrar_ligacao` passa a gravar `campanha_id` (a fila de onde o contato foi puxado).
  - Nova RPC `tele_fila_report_rows(_client_id uuid, _campanha_id uuid default null)`: reaproveita a união de origens de `tele_admin_listar_contatos_full` e devolve, além dos campos atuais, `origem`, `indicador_id`, `indicador_nome`, `total_tentativas`, `proxima_tentativa_em`; filtra por fila quando `_campanha_id` é informado.
  - Nova RPC `tele_fila_compare(_client_id uuid)`: agregados por fila para o comparativo.
  - Nova RPC `tele_fila_renomear(_client_id, _campanha_id, _nome, _descricao)` com checagem de admin do cliente (mesmo padrão de `_tele_assert_client_admin`).
- Frontend:
  - `useTelemarketingAdminData`: preservar `campanha_id`/`campanha_nome`/`tipo` nos objetos adaptados e aceitar filtro de fila.
  - Novos componentes `TelemarketingFilaReportPanel.tsx`, `TelemarketingFilaCompareCard.tsx`, `RenomearFilaDialog.tsx`.
  - `TelemarketingAdminRelatorios.tsx`: seletor de fila + nova ordem dos painéis.
  - `TelemarketingAdminFilas.tsx`: botão de renomear no card.
- Ligações registradas antes da migração continuam atribuídas pela fila atual do contato (`campanha_id` na linha do contato); a partir da migração a atribuição passa a ser por ligação.
