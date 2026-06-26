## Módulo Tráfego Pago — Meta Ads com Guard Eleitoral (Estadual/Federal 2026)

Você gerencia tudo por aqui: cria, edita, pausa, escala e aplica sugestões da IA com 1 clique. Toda ação da IA passa por sua aprovação (modo "Sempre pedir aprovação"). O sistema bloqueia qualquer envio que infrinja regras da Meta ou do TSE antes que vire um problema.

---

## 1. Credenciamento Meta — Wizard guiado dentro do app

Como você não tem certeza se a confirmação de identidade ainda está ativa, o **passo 1 do módulo é um wizard de diagnóstico** que faz tudo automaticamente:

**Tela "Diagnóstico Meta Ads" (executa ao abrir o módulo pela 1ª vez)**

O sistema consulta a Marketing API e te mostra um checklist visual:

```text
✓ ou ✗  Token tem permissão ads_management
✓ ou ✗  Token tem permissão ads_read, business_management, leads_retrieval
✓ ou ✗  Business Manager vinculado
✓ ou ✗  Conta de anúncio ativa (não bloqueada)
✓ ou ✗  Pixel Meta criado
✓ ou ✗  Confirmação de identidade política ATIVA (mostra data de expiração)
✓ ou ✗  Divulgador autorizado vinculado à página
✓ ou ✗  Disclaimer "Pago por..." configurado
✓ ou ✗  CNPJ eleitoral cadastrado no client
```

Para cada ✗ o sistema mostra:
- **O que é** (linguagem simples)
- **Por que precisa** (Meta exige / TSE exige)
- **Como resolver** (passo-a-passo com prints e link direto pra página correta da Meta)
- **Botão "Já fiz, revalidar"** que recheca

**Permissões a solicitar no App Review:** `ads_management`, `ads_read`, `business_management`, `leads_retrieval`, `pages_manage_ads`, `read_insights`. Recomendo **System User Token** (não expira) em vez de User Token.

---

## 2. Guard Eleitoral — Núcleo de segurança (Estadual/Federal 2026)

Antes de QUALQUER anúncio ir pro ar, passa por **9 verificações automáticas**. Se uma falhar, o botão "Publicar" fica desabilitado e o sistema explica o que corrigir.

| # | Verificação | Como funciona |
|---|---|---|
| 1 | Período eleitoral permitido | Trava criação antes de **16/ago/2026**. Pré-campanha só permite "institucional" sem pedido de voto/nº (com aviso vermelho explicando o que NÃO pode aparecer) |
| 2 | Categoria política marcada | Sistema **força** a flag `special_ad_categories: ["ISSUES_ELECTIONS_POLITICS"]` em toda campanha |
| 3 | Disclaimer "Pago por..." | Injetado automaticamente com CNPJ eleitoral do candidato |
| 4 | Número + cargo no criativo | IA analisa imagem/vídeo (OCR + visão) e copy — exige nº de candidato visível |
| 5 | Sem menção a adversário | Regex + IA verifica copy contra lista de adversários cadastrados em `adversarios_politicos` |
| 6 | Sem termos proibidos | Lista TSE (compra de voto, ataques pessoais, fake news flags) |
| 7 | Limite de gasto eleitoral | Painel acumula gasto vs limite legal do cargo (gov/sen/dep tem tetos diferentes) |
| 8 | Confirmação identidade válida | Bloqueia se expirou; alerta 30 dias antes |
| 9 | Rótulo "Conteúdo gerado por IA" | Auto-aplicado quando criativo veio do gerador IA do sistema (exigência TSE 2024+) |

**Log imutável de tudo:** cada verificação, cada publicação, cada edição fica registrada em `ads_audit_log` — pronto pra prestação de contas ao TSE se for questionado.

---

## 3. Tabelas novas

```text
ads_accounts             conta de anúncio Meta + CNPJ eleitoral + disclaimer
ads_identity_status      cache do diagnóstico Meta (revalida diário)
ads_campaigns            espelho local das campanhas
ads_adsets               conjuntos (segmentação, orçamento)
ads_creatives            criativos (imagem/vídeo/copy) + flag "gerado por IA"
ads_insights_daily       métricas diárias por nível (campanha/adset/ad)
ads_leads                leads do Lead Ads (webhook) → integra com eleicao_pessoas
ads_audiences            públicos salvos (lookalike, custom, regiões)
ads_rules                regras automatizadas (você define, IA sugere mas não executa sem aprovar)
ads_ai_suggestions       sugestões da IA aguardando sua aprovação
ads_audit_log            log imutável de toda ação (criação, edição, publicação) para TSE
ads_guard_checks         resultado dos 9 checks por anúncio (histórico)
ads_tse_limits           limites de gasto por cargo (gov/sen/dep federal/dep estadual)
```

Tudo com RLS por `client_id` + GRANTs padrão.

---

## 4. Páginas

### `/campanha/trafego` — Dashboard
- Status da conta + token + identidade Meta (semáforo verde/amarelo/vermelho)
- Cards: gasto hoje/mês, CPR médio, CTR, leads gerados
- **Cartão "Gasto eleitoral acumulado"**: barra vs limite TSE do cargo
- Gráfico gasto × resultados (30d)
- Top 3 melhores / Top 3 piores anúncios
- Mapa de calor por região (cruza com `eleicao_regioes`)
- **Caixa de sugestões IA**: cada uma com botões "Aprovar e aplicar" / "Ignorar"

### `/campanha/trafego/nova` — Wizard de criação (5 passos)
1. **Objetivo** em linguagem simples (conhecimento / votos / cadastros / engajamento)
2. **Público**: mapa com regiões da eleição + idade/gênero + interesses sugeridos por IA
3. **Criativo**: upload OU escolher de `campaign_materials` + IA gera 3 variações de copy
4. **Orçamento**: slider R$/dia + estimativa de alcance + datas
5. **🛡️ Guard Eleitoral**: roda os 9 checks AO VIVO — você só vê "Publicar" se passar tudo

### `/campanha/trafego/campanha/:id` — Detalhe
- Métricas em tempo real (refresh 15 min)
- Comparativo A/B entre criativos
- Botões: Pausar, Duplicar, Escalar +30%, Editar público
- Leads capturados → "Enviar para funil eleição" (1 clique → vira `eleicao_pessoas`)

### `/campanha/trafego/regras` — Automações
- Você cria regras ("Se CPR > R$X por 2 dias → pausar")
- IA sugere regras baseado no seu histórico (você aprova antes de ativar)

### `/campanha/trafego/prestacao-contas` — TSE
- Relatório mensal pronto: data, valor, beneficiário (CNPJ), alcance, criativo usado
- Exporta CSV no formato que a Justiça Eleitoral aceita
- PDF com todos os criativos veiculados + textos + período

---

## 5. Diferenciais inovadores

1. **Orgânico → Pago em 1 clique**: detecta seus posts com melhor engajamento e sugere impulsionar
2. **Leads → Eleição automático**: lead vira `eleicao_pessoas` com tag de origem + boas-vindas WhatsApp
3. **IA Estrategista (com aprovação)**: roda diário, analisa 7d, propõe ações — você aprova
4. **Cruzamento territorial**: "Moreninhas teve 230 leads a R$2,10 — Centro 45 leads a R$8,90"
5. **Modo Eleição Estadual/Federal 2026**: presets prontos por fase ("Apresentação ago/set", "Reta final out", "Dia da eleição")
6. **Alertas WhatsApp críticos**: te avisa no Z se: conta bloqueada, anúncio reprovado, identidade expirando, gasto perto do limite TSE, CPR disparou

---

## 6. Problemas previsíveis — todos tratados

| Risco | Mitigação no sistema |
|---|---|
| Anunciar antes de 16/ago/2026 | Guard bloqueia + explica o que pode (institucional sem nº/cargo) |
| Conta bloqueada por violação | Health check diário + alerta WhatsApp imediato |
| Anúncio reprovado por falta de disclaimer | Disclaimer injetado **automaticamente** |
| Esquecer categoria política | Auto-marcado, não tem como esquecer |
| Mencionar adversário | Bloqueado por regex+IA antes de publicar |
| Estourar limite TSE | Barra vermelha + bloqueio de novas campanhas |
| Identidade Meta venceu | Alerta 30d antes + wizard de revalidação |
| Token expirou no meio da campanha | System User Token (não expira) + check diário |
| IA "tomou conta" sozinha | **Toda ação pede sua aprovação** (modo escolhido) |
| Criativo IA sem rótulo | Auto-aplica "Conteúdo criado com IA" |
| Lead capturado e ignorado | SLA 1h → escala pro coordenador da região |
| Auditoria TSE | Log imutável + relatório CSV/PDF pronto |
| Pixel não tracking conversão | Diagnóstico mostra se Pixel está disparando |

---

## 7. Implementação técnica

- **Server functions** (`src/lib/ads-meta.functions.ts`) — todas as chamadas Marketing API, token nunca vai pro client
- **Server route** `/api/public/webhooks/meta-leads` — recebe Lead Ads em tempo real com verificação de assinatura HMAC
- **pg_cron diário 02h**: roda `ads-sync-insights` (puxa métricas) + `ads-guard-recheck` (valida identidade)
- **pg_cron diário 09h**: roda `ads-ia-estrategista` (gera sugestões, **não executa**)
- Reusa `MetaTokenStatusCard` para mostrar status do token
- Usa Lovable AI Gateway para análise de copy/imagem (Gemini 3 Flash + visão)

---

## 8. Entrega faseada

**Fase 1 — Fundação + Guard (entregar primeiro):**
- Wizard de diagnóstico Meta
- Tabelas + RLS
- Guard Eleitoral funcional
- Dashboard read-only (sincroniza campanhas que você já tenha)

**Fase 2 — Criação:** Wizard 5 passos + pausar/escalar/duplicar com aprovação

**Fase 3 — Leads + WhatsApp:** Lead Ads → eleição + alertas críticos

**Fase 4 — IA + TSE:** IA Estrategista + regras de automação + relatório TSE + cruzamento territorial

---

## 9. O que você precisa preparar (em paralelo à Fase 1)

1. **CNPJ eleitoral** da campanha 2026 (assim que sair do TSE)
2. **Confirmação de identidade Meta** — refazer para 2026 (o sistema vai te guiar via wizard)
3. **Texto do disclaimer**: "Pago por [Nome do candidato] – CNPJ XX.XXX.XXX/XXXX-XX"
4. **System User Token** (sistema gera link guiado para criar no Business Manager)

Posso começar pela **Fase 1**?
