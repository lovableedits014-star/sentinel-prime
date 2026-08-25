# Monitoramento de Engajamento dos Contratados

## 1. Diagnóstico: o que já existe (auditado no código e no banco)

**Frontend** — React 19 + TanStack Start, Tailwind v4, shadcn, Sonner, React Query. Página `Engagement.tsx` com 4 abas: Influenciadores, Time (`PerfisTimeTab`), Cobrança (`CobrancaTimeTab`), Config. Existem ainda `PortalMissionsPanel` (missões do portal), `MissionReport` (relatório por missão), `PessoaPerfil` (já lista interações da pessoa), `MissionsDashboard`, `EngagementDiagnostics`, `AIMissionsPanel`.

**Backend** — Edge Functions legadas ainda em uso: `fetch-meta-comments` (sincroniza comentários FB/IG), `resolve-supporter-profiles`, `run-engagement-autoresolve`, `check-alerts`, `calculate-ied`, `cleanup-old-data`. RPCs relevantes: `engagement_time_overview`, `engagement_cobranca_overview`, `engagement_perfis_overview`, `calculate_engagement_score`, `link_orphan_engagement_actions`, `client_missions_dashboard`, `engagement_alterar_cargo`.

**Banco (o que serve de base)**
- `engagement_actions` — interação individual (supporter, plataforma, tipo, post_id, data). Populada por trigger em `comments`.
- `comments` — comentários FB/IG com `post_id`, `post_permalink_url`, autor e `platform_user_id`.
- `portal_missions` + `mission_distributions` + `mission_events` + `mission_participants` — publicação/missão, link rastreável por grupo, e evento por participante (`open`, `click_facebook`, `click_instagram`, `click_avulso`, `declared_done`).
- `eleicao_pessoas` (hierarquia coordenador/líder/cabo, região, telefone), `supporters`, `pessoa_social`/`social_profiles` (handles), `engagement_metas` (meta por cargo), `engagement_config` (pesos já existem: like/comment/share/reaction), `engagement_score_history`, `alertas`, `action_logs`, `meta_scheduled_posts`.

**Problema central encontrado (dado real do banco):** `engagement_actions` só contém `comment` (315 registros, IG+FB). **Zero** curtidas, reações ou compartilhamentos — porque a integração não coleta isso, e não é falha de implementação: é limite de API.

## 2. Limitações reais das APIs (não presumido)

| Interação | Comprovável automaticamente? | Como |
|---|---|---|
| Comentário | **Sim, alta confiança** | Graph API `/{post}/comments` (já implementado) |
| Curtida em post do Instagram | **Não** | A API não expõe quem curtiu (nunca, em nenhuma permissão) |
| Curtida/reação em post de Página do Facebook | **Não confiável** | `/{post}/reactions` só devolve usuários que autorizaram o app; retorna ID app-scoped não casável com o perfil público |
| Compartilhamento | **Não** | Nenhuma API entrega a lista de quem compartilhou |
| Clique no link da missão | **Sim, média-alta** | Já existe: link rastreável + `mission_events` |
| Declaração de conclusão | **Sim, com carimbo** | Já existe: `declared_done` |

**Consequência de arquitetura:** não é possível um índice honesto baseado em curtida/compartilhamento. O modelo será de **níveis de evidência**:
- **E1 (comprovado)** — comentário via API, clique no link rastreado.
- **E2 (declarado + carimbo)** — "concluí a missão" com data/hora/IP-hash.
- **E3 (evidência anexada)** — print/URL enviado pelo contratado, validado pelo coordenador.

Pesos passam a refletir confiabilidade, não só esforço. Os pesos de `engagement_config` são reaproveitados, com "share/like" só entrando via E2/E3.

## 3. Gap analysis

| Necessidade | Já existe? | O que existe | O que falta | Complex. |
|---|---|---|---|---|
| Cadastro de contratado + equipe/cargo | Sim | `eleicao_pessoas` + hierarquia | nada | — |
| Publicação oficial monitorada | Parcial | `portal_missions` (+ `meta_scheduled_posts`) | campos de obrigação e janela de prazo | Baixa |
| Definir quem deve interagir | Não | distribuição só por grupo WhatsApp | público-alvo por regra (cargo/região/coordenador/grupo) | Média |
| Obrigação por pessoa × publicação | **Não** | — | tabela de obrigações + geração | Média |
| Captura de interação | Parcial | comentários + eventos de missão | consolidar em uma trilha só, com evidência | Média |
| Índice de cumprimento | Parcial | `engagement_cobranca_overview` (contagem vs meta por cargo) | índice composto, tendência, pré-cálculo | Média |
| Escala 🟢🟡🟠🔴 configurável | Não | — | faixas por cliente | Baixa |
| Dashboard do coordenador | Parcial | abas atuais | visão geral + ranking + evoluções | Média |
| Perfil individual com histórico post a post | Parcial | `PessoaPerfil` lista ações | histórico de obrigações e resultado | Média |
| Registro de cobrança | Não | `alertas` genérico | log de cobrança com histórico | Baixa |
| Regras por grupo (A/B/C/D) | Não | `engagement_metas` só por cargo | motor de regras | Média |
| Automação/pré-cálculo | Parcial | crons e `check-alerts` | snapshot diário de índices | Média |

**Reuso decidido:** nada de nova tabela de pessoas, de posts, de handles ou de ações. `portal_missions` passa a ser a entidade "publicação monitorada"; `engagement_actions` e `mission_events` continuam sendo as fontes de verdade das interações.

**Novas tabelas (3, justificadas):** regras de obrigação, obrigações geradas (grão pessoa×publicação — não existe hoje) e snapshot diário de índice (performance). Cobranças ficam como novo tipo em `alertas` + tabela leve de log.

## 4. Modelo de dados proposto

- `engagement_regras` — nome, escopo (cargos, regiões, coordenadores, grupos), tipo de obrigação (comentar / clicar+concluir / evidência), quantidade esperada, prazo em horas, peso mínimo exigido, ativo.
- `portal_missions` (alterar) — `monitorada`, `regra_id`, `prazo_horas`, `publicado_em`, `peso_extra`.
- `engagement_obrigacoes` — `client_id`, `mission_id`, `pessoa_ref` (origem + id, mesmo padrão de `engagement_time_overview`), `regra_id`, `esperado`, `status` (pendente/cumprida/parcial/nao_cumprida/dispensada), `evidencia_nivel` (E1/E2/E3), `pontos`, `cumprida_em`, `atraso_horas`, `justificativa`.
- `engagement_indices_diarios` — snapshot por pessoa/dia: cumprimento, qualidade, regularidade, pontualidade, tendência, índice final, faixa.
- `engagement_cobrancas` — pessoa, período, índice no momento, canal, texto, autor, resultado.
- `engagement_config` (alterar) — faixas 🟢🟡🟠🔴, prazo padrão, exigir evidência para share/like.

## 5. Metodologia de pontuação e índice

Por obrigação: pontos = peso do tipo de interação × fator de confiança da evidência (E1 = 1,0 · E2 = 0,7 · E3 = 0,85 após validação) × fator de pontualidade (dentro do prazo 1,0; até 2× o prazo 0,8; depois 0,5).

Índice individual (0–100), pesos configuráveis:
- **50% Cumprimento** — obrigações cumpridas ÷ obrigações atribuídas.
- **20% Qualidade** — pontos obtidos ÷ pontos possíveis (comentário vale mais que clique).
- **15% Regularidade** — proporção de semanas do período com ao menos uma obrigação cumprida.
- **10% Pontualidade** — média do fator de pontualidade.
- **5% Tendência** — comparação dos últimos 15 dias com os 15 anteriores (↑ ↔ ↓).

Faixas padrão configuráveis: 🟢 ≥ 85 · 🟡 70–84 · 🟠 50–69 · 🔴 < 50. Reincidência (3+ não cumpridas consecutivas) é sinalizada como flag, não como punição.

## 6. Fluxo operacional

Coordenador marca a publicação como monitorada e escolhe a regra → o sistema gera as obrigações para o público-alvo (e já monta o link rastreável por grupo, mecanismo que já existe) → interações chegam por sincronização de comentários, cliques do link e declaração no portal → um job casa cada interação com a obrigação (por `post_id`/`mission_id` e handle/telefone) → índices são recalculados no snapshot diário → dashboard, ranking e alertas se atualizam → coordenador registra a cobrança com o histórico como evidência → exportação Excel/PDF nos padrões já usados no projeto.

## 7. Dashboard, perfil e alertas

- **Visão geral:** contratados ativos, publicações monitoradas, obrigações geradas/cumpridas/não cumpridas, % geral, distribuição por faixa.
- **Ranking:** melhores, piores, maiores evoluções e maiores quedas (a partir do snapshot).
- **Por publicação:** taxa de adesão, quem cumpriu e quem não cumpriu — permite identificar posts com baixa adesão.
- **Perfil individual:** índice geral, últimos 30 dias, tendência, obrigações recebidas/cumpridas, última interação e histórico linha a linha (data · publicação · obrigação · interação · resultado · evidência).
- **Alertas:** gerados no job diário em `alertas` (abaixo da meta, N publicações seguidas sem interagir, queda brusca), com botão para registrar cobrança.

## 8. Segurança

RLS por `client_id` com `is_client_member` (padrão já vigente); contratado vê apenas as próprias obrigações; coordenador vê apenas sua árvore via a lógica de hierarquia já existente (`eleicao_pessoa_in_user_tree`); admin vê tudo. Funções agregadoras como `SECURITY DEFINER` com checagem de permissão no início, igual às atuais. GRANTs explícitos em toda tabela nova. Nenhum token Meta trafega para o cliente. Cobranças e alterações de status ficam em `action_logs`.

## 9. Performance

Índices em `(client_id, mission_id)`, `(client_id, pessoa_ref)`, `(status)` e `(client_id, dia)`. Dashboard lê **somente** `engagement_indices_diarios` (uma linha por pessoa/dia) — nunca agrega o histórico inteiro em tempo real. Casamento de interações e recálculo em job noturno, em lotes, com recálculo pontual sob demanda. Listagens paginadas.

## 10. Roadmap

**Fase 1 — Fundação (prioridade máxima, complexidade média).** Tabelas de regras e obrigações, campos novos em `portal_missions` e `engagement_config`, geração manual de obrigações, marcação manual de cumprimento, exportação. Já permite medir. Sem dependência de API.

**Fase 2 — Monitoramento (alta, média).** Casamento automático: comentários (`engagement_actions`) e eventos de missão (`mission_events`) → obrigações. Upload de evidência E3 com validação. Dependência: sincronização Meta atual, que já funciona.

**Fase 3 — Inteligência (média, média).** Índice composto, snapshot diário, faixas configuráveis, ranking, tendências, painel por publicação e perfil individual completo.

**Fase 4 — Automação (média, baixa-média).** Geração automática de obrigações ao publicar/agendar (integra `meta_scheduled_posts`), alertas automáticos, relatório semanal, detecção de queda.

**Fase 5 — Evolução (baixa).** Metas por região, previsão de risco de descumprimento, correlação entre adesão dos contratados e alcance do post, gamificação/ranking público interno.

## 11. Recomendações honestas

1. **Não prometer "curtidas comprovadas".** O sistema deve rotular cada evidência com seu nível — é isso que sustenta uma cobrança.
2. **O link rastreável já construído é o ativo mais forte** para medir adesão: começar por ele em vez de perseguir reações via API.
3. **Confirmar identidade pelo telefone** (`mission_participants`), que é mais confiável no público de campanha do que casar handles de rede social.
