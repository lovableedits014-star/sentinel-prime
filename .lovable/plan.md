
# Telemarketing × Eleição: confirmação de "votos orgânicos" e ranking de indicadores

## Objetivo do fluxo (refinado)

Hoje o módulo **Eleição** já tem `eleicao_indicados` (com tracking de telemarketing: `status_telemarketing`, `ultimo_status_ligacao`, `total_tentativas`) gerado por:
- Coordenadores/regionais (`eleicao_pessoas` tipo coordenador/líder/cabo)
- Páginas públicas de indicação (`eleicao_indicacao_tokens`)
- Contratados via `contratado_indicados` (fluxo paralelo)

O Telemarketing hoje liga em 3 fontes separadas: `contratados`, `contratado_indicados` e `telemarketing_contatos_avulsos`. **`eleicao_indicados` está fora da fila** — é exatamente o universo que o usuário quer "confirmar como pesquisa disfarçada" e usar para medir quem está realmente trazendo voto.

Adaptação proposta:

1. **Eleição vira a 4ª fonte da fila de telemarketing**, com campanhas dedicadas (ex.: "Confirmação Indicados — Zona Norte", "Cabos do João — rodada 2").
2. Cada ligação atualiza `eleicao_indicados` E gera um registro em `telemarketing_call_log` (já existente), preservando histórico por rodada.
3. Relatórios novos cruzam `eleicao_indicados.indicador_id/indicador_tipo` × resultado da ligação → **scorecard de qualidade por coordenador / líder / cabo**.
4. Admin pode **designar listas** (subset de indicados filtrados por região, indicador, status) a uma campanha de telemarketing, opcionalmente fixando operadores.

## Etapas

### 1. Fila do operador inclui indicados de Eleição
- Estender RPC `tele_next_contact` (e a leitura do operador em `Telemarketing.tsx`) para considerar `eleicao_indicados` quando a campanha apontar para essa fonte ou quando a campanha for "mista".
- Card do operador mostra badge "Indicado por: {nome do coordenador/líder/cabo} ({tipo})" e bairro/cidade.
- Ao salvar resultado: grava em `telemarketing_call_log`, atualiza `eleicao_indicados.status_telemarketing` (`pendente|confirmado|recusou|nao_atende|invalido`), `ultimo_status_ligacao`, `ultima_ligacao_em`, `total_tentativas`.

### 2. Designação de listas (admin)
- Em `TelemarketingAdminCampanhas`, nova aba **"Eleição"** ao criar/editar campanha:
  - Filtros: região, cidade, bairro, tipo de indicador (coordenador/líder/cabo), indicador específico, status atual, intervalo de criação, "só os que ainda não foram ligados".
  - Preview com contagem ("523 indicados elegíveis").
  - Botão **Designar à campanha** persiste o filtro em `telemarketing_campanhas.filtros` (jsonb já existe) com `fonte:"eleicao_indicados"`.
- Opcional: atribuir a operadores específicos via `telemarketing_call_assignments`.

### 3. Métricas de qualidade do indicador
- Nova view/RPC `tele_indicador_scorecard(client_id, campanha_id?, periodo?)` retornando por `indicador_id`:
  - total_indicados, ligados, confirmados (vota_sim), recusou, não_atende, inválidos
  - **taxa_confirmacao** = confirmados / ligados
  - **taxa_voto_efetivo** = confirmados / total_indicados (KPI principal de qualidade)
  - **score_qualidade** ponderado (ex.: confirmados×1 − recusou×1 − invalido×0,5) / total
- Nova página/aba **"Qualidade dos Indicadores"** em `TelemarketingAdminRelatorios`:
  - Ranking top/bottom por tipo (coordenador, líder, cabo).
  - Drill-down: clicar no indicador abre lista de seus indicados com status da ligação.
  - Comparativo com rodadas anteriores via `telemarketing_relatorio_snapshots` (já existe).
  - Exportação CSV/PDF.

### 4. Pesquisa "disfarçada" (script de campanha)
- Aproveitar `script_intro`, `script_perguntas`, `tags_rapidas` (já criados na fase 5) para roteirizar a confirmação como pesquisa de intenção de voto, sem revelar que é checagem do indicador.
- Tag rápida pré-pronta: "Confirmou voto", "Conhece o indicador", "Não lembra de quem foi indicado" (sinal de indicação fantasma).

### 5. Alertas de qualidade
- Em `dashboard/AlertasWidget` (ou painel próprio): destacar indicadores com `taxa_voto_efetivo < X%` ou alto índice de telefones inválidos — sinal de "indicação inflada".
- Snapshot por rodada permite ver evolução (mesmo indicador piorando entre rodadas).

## Detalhes técnicos

- **Migration**:
  - RPC `tele_next_contact` atualizada para incluir `eleicao_indicados` quando `campanha.filtros->>'fonte' = 'eleicao_indicados'` (ou múltiplas fontes).
  - RPC `tele_save_call_result` aceita `tabela = 'eleicao_indicados'` e atualiza colunas correspondentes.
  - RPC `tele_designar_eleicao_indicados(campanha_id, filtros jsonb)` apenas valida ownership e grava `filtros` (não duplica linhas; fila lê on-the-fly).
  - RPC `tele_indicador_scorecard(...)` — SECURITY DEFINER, validando que o caller é dono do client.
  - Índices: `eleicao_indicados(client_id, status_telemarketing)`, `eleicao_indicados(indicador_id, indicador_tipo)`.

- **Frontend**:
  - `Telemarketing.tsx`: render condicional do bloco "Indicado por" quando `tabela === 'eleicao_indicados'`.
  - `TelemarketingAdminCampanhas.tsx`: nova aba/seção "Designar de Eleição" com filtros e preview.
  - `TelemarketingAdminRelatorios.tsx`: nova seção "Qualidade dos Indicadores" + gráfico de ranking (recharts) + drill-down dialog.
  - Reaproveita `TelemarketingSnapshotsPanel` para comparativo entre rodadas.

- **Permissões**:
  - Operadores só veem dados via RPCs com `tele_validar_operador` (padrão existente).
  - Admin RPCs exigem ownership de `clients`.

## Entregáveis por fase

1. **Fase A — Backend (1 migration)**: extender RPCs `tele_next_contact`, `tele_save_call_result`; criar `tele_designar_eleicao_indicados`, `tele_indicador_scorecard`; índices.
2. **Fase B — Designar listas**: aba na página de Campanhas com filtros + preview.
3. **Fase C — Operador**: card mostrando "Indicado por" e gravando na tabela certa.
4. **Fase D — Relatórios de qualidade**: ranking, drill-down, alertas e exportação.
5. **Fase E — Polimento**: tags rápidas pré-prontas, snapshots por rodada, alerta de "indicação fantasma".

Se aprovado, sigo na ordem A → E (A+B juntos, depois C, depois D+E).
