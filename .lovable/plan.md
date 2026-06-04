## Como está o Telemarketing hoje

### Universo de contatos
A central de telemarketing **só enxerga a base antiga de Contratados**:
- `contratados` (líderes e liderados)
- `contratado_indicados` (indicados)

Ela **não toca** o universo novo de `pessoas` / `eleicao_pessoas` (coordenadores, líderes, cabos eleitorais), que hoje é o coração do sistema. Toda a inteligência eleitoral nova passa por fora da central.

### Acesso do operador
- URL pública: `/telemarketing/:clientId`
- Login por **nome + senha** (tabela `telemarketing_operadores`, senha com hash, validada pela RPC `verify_telemarketing_operador`).
- Cadastro/reset de operadores em Configurações → "Central de Telemarketing".
- Após login, todos os contatos vêm via RPC `tele_list_contatos` (security definer).

### Tela de operação
- Lista filtrada por tipo: Todos / Líder / Liderado / Indicado.
- Mostra **um contato por vez** com:
  - Telefone com `tel:` (click-to-call do celular).
  - Editar cidade/bairro inline.
  - 3 botões de resultado: **Atendeu / Não atendeu / Recusou**.
  - Se Atendeu → "Vota no candidato?" (Sim / Não / Indeciso) + candidato alternativo livre.
- Salva via RPC `tele_registrar_ligacao` e **pula para o próximo pendente**.
- Contato ligado **some da fila** (não volta).

### Relatórios (admin)
Em Contratados → Relatórios:
- KPIs: total, pendentes, atenderam, não atenderam, votam, não votam, indecisos.
- Desempenho por operador (qtd de ligações + votos confirmados).
- Lista filtrável por status / voto / operador + busca.

---

## Limitações que travam o uso real

1. **Cobertura zerada na nova base.** Coordenadores/Líderes/Cabos de `eleicao_pessoas` e qualquer `pessoas` ficam de fora.
2. **Só um registro por contato.** Se ligou e não atendeu, sai da fila — não tem reagendamento.
3. **Sem "ligar mais tarde" / callback agendado** (hora marcada, retornar amanhã).
4. **Sem histórico de tentativas.** Cada ligação sobrescreve a anterior — não dá pra ver "liguei 3x, não atendeu".
5. **Sem observação livre.** O operador não consegue anotar "filho atendeu, mãe viaja terça".
6. **Sem distribuição entre operadores.** Dois operadores podem ligar pra mesma pessoa ao mesmo tempo (sem lock).
7. **Sem priorização.** Não dá pra direcionar operador A só para bairro X ou só para indecisos.
8. **Sem script configurável** (cliente pede roteiro padrão, perguntas obrigatórias).
9. **Recusa/voto sem motivo estruturado** ("já apoia outro", "não tem interesse", "número errado").
10. **Sem integração de saída**: nada dispara no WhatsApp depois ("obrigado", "vou mandar material").
11. **Sem alimentar `timeline_pessoa` / tags** — a inteligência política não recebe os dados da ligação.
12. **Sem produtividade real** (tempo médio por ligação, ligações/hora, meta diária).
13. **Sem exportação** (PDF/CSV dos resultados).
14. **Sem rate-limit / lockout** no login do operador.

---

## Plano de melhoria (4 fases)

### Fase 1 — Expandir cobertura e corrigir o que está faltando agora
**Objetivo:** o telemarketing passa a ligar para todo mundo, com histórico real.

1. **Incluir `eleicao_pessoas` e `pessoas` na fila** (mesma RPC, novos `tipo`: `coordenador`, `lider_eleicao`, `cabo`, `pessoa`).
2. **Filtros na tela do operador**: além de tipo, filtrar por **região/cidade/bairro** e por **coordenador raiz** (mesmo conceito que já fizemos no export do Eleição).
3. **Tabela `telemarketing_ligacoes`** (histórico, 1 linha por tentativa):
   - `contato_tipo`, `contato_id`, `operador_id`, `status`, `vota_candidato`, `motivo`, `observacao`, `agendar_retorno_em`, `duracao_seg`, `created_at`.
   - O campo "última ligação" continua nos registros principais (denormalizado) só para o resumo.
4. **Campo de observação livre** (até 500 chars) por tentativa.
5. **Motivos estruturados de recusa / não-voto** (select: já apoia adversário, sem interesse, número errado, pediu para não ligar, outro).
6. **Reaparecer "não atendeu" depois de X horas** (configurável por cliente, default 24h, até N tentativas).

### Fase 2 — Agendamento, lock e distribuição
**Objetivo:** vários operadores trabalhando juntos sem se atropelar.

7. **Agendar retorno**: botão "Ligar de novo em…" com data/hora; entra como "Pendente agendado" na fila do operador no horário certo.
8. **Lock de contato (5 min)**: ao receber um contato, ele é marcado como "em atendimento por X"; outros operadores não veem. Libera por timeout ou ao salvar.
9. **Atribuição opcional**: admin pode atribuir lotes (por região, coordenador ou tag) a operadores específicos.
10. **Painel "Minhas pendências"** para o operador: separa "agendadas para agora" / "novas" / "retornar mais tarde".

### Fase 3 — Inteligência e integração com o resto do sistema
**Objetivo:** o telemarketing alimenta a base e dispara ações.

11. **Gravar interação em `timeline_pessoa`** (quando o contato é uma `pessoa`/`eleicao_pessoas`): "Ligação registrada por Operador X — Atendeu, vota SIM".
12. **Aplicar tag automática**: "vota sim" → tag `apoiador_confirmado`; "indeciso" → `indeciso`; "não vota" → `nao_apoiador`. Tags configuráveis.
13. **Disparo WhatsApp pós-ligação** (opcional, via instância do cliente): templates por resultado ("obrigado pelo apoio", "vou te mandar nosso material", aniversário).
14. **Script de atendimento por cliente**: o admin escreve um roteiro (markdown) que aparece ao lado do contato durante a ligação.
15. **Priorização inteligente**: ordenar fila por (a) coordenador com menos cobertura, (b) bairro estratégico, (c) data de cadastro.

### Fase 4 — Produtividade, exportação e segurança
**Objetivo:** medir e exportar.

16. **KPIs por operador**: ligações/hora, tempo médio, taxa de conversão (vota sim ÷ atendeu), comparativo entre operadores no painel.
17. **Meta diária** por operador + barra de progresso na tela dele.
18. **Exportações**: CSV/PDF dos resultados — com os mesmos filtros do export de Eleição (por coordenador raiz, por região, por operador, por período).
19. **Rate-limit no login** do operador (5 tentativas / 15 min, registrado em `security_events`).
20. **Auditoria**: log de quem mudou cadastro de operador e quem fez reset de senha.

---

## Detalhes técnicos

**Banco**
- Nova tabela `telemarketing_ligacoes` (1 linha por tentativa) + índice em `(client_id, contato_tipo, contato_id, created_at desc)`.
- Nova tabela `telemarketing_locks` (`contato_tipo`, `contato_id`, `operador_id`, `locked_until`) — TTL 5 min via cleanup na própria RPC.
- Nova tabela `telemarketing_config` (por cliente): `script_markdown`, `reagendar_apos_horas`, `max_tentativas`, `meta_diaria`, `wpp_enabled`, `tags_auto`.
- Estender RPC `tele_list_contatos` para unir `contratados`, `contratado_indicados`, `eleicao_pessoas`, `pessoas`, aplicar filtros (regiao/cidade/coordenador_raiz/tipo) e respeitar locks + agendamentos.
- Nova RPC `tele_agendar_retorno`, `tele_liberar_lock`.
- Trigger pós-`tele_registrar_ligacao` para gravar em `timeline_pessoa` e aplicar tag automática.

**Frontend**
- `src/pages/Telemarketing.tsx`: novos filtros (região / coordenador), painel "Minhas pendências", script lateral, observação, motivo, botão "Ligar de novo em…", histórico de tentativas do contato atual.
- `src/components/contratados/TelemarketingResultsPanel.tsx`: incluir os novos tipos, motivos, tentativas, KPIs por operador (tempo, conversão), botão export.
- `src/components/contratados/TelemarketingReportsPanel.tsx`: gráficos de produtividade.
- `src/components/settings/TelemarketingSettingsCard.tsx`: editor de script, config de reagendamento, meta diária, atribuições.

**Segurança**
- Manter login via RPC security-definer; adicionar contador de tentativas em `security_events`.
- Locks evitam dupla edição; salvar sempre via RPC (nunca update direto).

---

## Sugestão de ordem de execução

Recomendo fechar primeiro a **Fase 1** (cobrir `pessoas`/`eleicao_pessoas` + histórico de tentativas + observação + motivo + reagendamento de "não atendeu") — é o que muda o uso diário imediatamente. Depois Fase 2 (agendar + lock + distribuição), e em seguida Fase 3 e 4.

Me confirma:
1. Pode seguir com a **Fase 1 completa** já?
2. Quer que o telemarketing inclua **também `pessoas`** ou só `eleicao_pessoas` (coordenador/líder/cabo) + a base antiga de contratados?
3. O reagendamento automático de "não atendeu" deve ser **24h** por padrão e até **3 tentativas**, ou outro número?
