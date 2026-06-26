# Fase 2 — Criação de Campanhas + Guard Eleitoral

Já temos a Fase 1 (diagnóstico, dashboard read-only, configuração da conta). Agora vamos permitir **criar e gerenciar campanhas direto pela plataforma**, com as travas eleitorais aplicadas automaticamente antes de qualquer publicação.

## O que será entregue

### 1. Wizard de criação de campanha (4 passos)
- **Passo 1 — Objetivo**: Reconhecimento, Tráfego, Engajamento, Mensagens (WhatsApp), Leads. Cada um com explicação em linguagem leiga ("para quê serve").
- **Passo 2 — Público**: localização (cidade/região/raio), idade 18+, interesses sugeridos por cargo. Bloqueios automáticos do TSE aplicados (sem lookalike de eleitores, sem dados sensíveis).
- **Passo 3 — Criativo**: upload de imagem/vídeo + texto. IA analisa e mostra alertas (número do candidato presente? cargo claro? menção a adversário?).
- **Passo 4 — Orçamento + revisão**: diário ou total, datas, e tela final com o "Guard Eleitoral" rodando 9 checks visíveis antes de liberar o botão "Publicar".

### 2. Guard Eleitoral (executado antes do publish)
Cada check vira um cartão verde/amarelo/vermelho. Vermelho **bloqueia** a publicação:
1. Período eleitoral liberado (>= 16/ago/2026)
2. Categoria `ISSUES_ELECTIONS_POLITICS` marcada
3. Disclaimer "Pago por..." injetado no criativo
4. Identidade Meta confirmada e não expirada
5. CNPJ eleitoral cadastrado
6. Sem menção a adversários (IA analisa texto)
7. Número e cargo do candidato presentes (IA analisa imagem/texto)
8. Dentro do teto de gasto TSE para o cargo
9. Rótulo "Conteúdo IA" quando criativo foi gerado por IA

### 3. Gestão da campanha publicada
- Botões **Pausar / Reativar / Duplicar / Encerrar** com confirmação.
- Edição de orçamento (slider com novo valor; chama API Meta e registra em `ads_audit_log`).
- Histórico de alterações (auditoria visível por campanha).

### 4. IA Estrategista (modo "sempre pedir aprovação")
- Card na campanha: "A IA sugere: aumentar orçamento de R$50→R$80 (CPR caiu 30%)".
- Botões **Aprovar / Recusar / Ver detalhes**. Nada é executado sem aprovação.
- Sugestões geradas por job diário lendo `ads_insights_daily`.

## Arquivos a criar/editar

### Edge Functions (novas)
- `ads-create-campaign` — recebe payload validado, roda Guard, cria Campaign+AdSet+Ad+Creative na Marketing API, persiste local.
- `ads-update-campaign` — pausar/reativar/editar orçamento, com auditoria.
- `ads-guard-check` — roda os 9 checks isoladamente (chamada do wizard antes de publicar).
- `ads-ai-suggestions` — lê insights, gera sugestões via Lovable AI, grava em nova tabela `ads_ai_suggestions`.

### Frontend
- `src/components/trafego/CriarCampanhaWizard.tsx` — wizard 4 passos.
- `src/components/trafego/GuardChecklist.tsx` — UI dos 9 checks.
- `src/components/trafego/CampanhaCard.tsx` — card com pause/play/edit + sugestões IA.
- `src/components/trafego/IAEstrategistaPanel.tsx` — lista de sugestões pendentes.
- Atualizar `src/pages/TrafegoPago.tsx` para integrar wizard e ações nas campanhas.

### Banco
- Nova tabela `ads_ai_suggestions` (campanha, tipo, descrição, ação proposta, status: pendente/aprovada/recusada).
- Migração das limits TSE 2026 (seed em `ads_tse_limits` por cargo).

## Ordem de implementação
1. Migração: `ads_ai_suggestions` + seed TSE 2026.
2. Edge `ads-guard-check` (isolada, usada pelo wizard).
3. Edge `ads-create-campaign` (usa o guard internamente).
4. Wizard frontend + integração na página.
5. Edge `ads-update-campaign` + botões pause/play.
6. Edge `ads-ai-suggestions` + painel IA + cron diário.

Posso ir direto na ordem acima ou prefere fatiar (ex: só itens 1-4 agora, IA depois)?
