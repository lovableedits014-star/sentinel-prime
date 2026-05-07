## Plano completo: evolução da Memória em 6 fases

Vou executar as 6 fases na ordem definida. Cada fase é entregue funcional antes da próxima.

---

### Fase 1 — Promessas com status (radar de cumprimento)

**Banco** (migração):
- Tabela `ic_promessas`: `id, client_id, texto, prazo_texto, prazo_data, bairro, beneficiario, status (aberta|em_andamento|cumprida|quebrada|adiada), tipo (saude|educacao|infra|seguranca|economia|outro), documento_origem_id, transcription_id, evidencias jsonb, created_at, updated_at`
- RLS por client_id (mesmo padrão de `ic_knowledge_documents`)
- Índices em `client_id`, `status`, `prazo_data`

**Edge function** `ic-extract-promessas`: roda após cada extração de conhecimento, lê documento, usa LLM pra extrair `{texto, prazo_texto, prazo_data, bairro, beneficiario, tipo}` de cada promessa e insere em `ic_promessas`. Trigger de `ic_knowledge_documents` chama via pg_net.

**UI**: nova subaba **"Promessas"** na MemoriaPanel
- Kanban (5 colunas por status) + visão lista
- Card mostra: texto, prazo, bairro, dias restantes (vermelho se vencido), origem (link pro documento)
- Ações: mudar status, anexar evidência (URL de post/foto), editar prazo
- Filtros: por bairro, tipo, status

---

### Fase 2 — Insights automáticos no topo

**Banco**: `ic_memoria_insights` (`id, client_id, tipo, titulo, descricao, dados jsonb, status (novo|aceito|descartado|virou_pauta), created_at`)

**Edge function** `ic-memoria-insights`:
- Roda agregações: bairros sem visita há 30+ dias, bordões "esfriando", promessas vencendo, contradições novas, temas com vazio
- LLM transforma em frases curtas e acionáveis
- Schedule via pg_cron toda segunda 07:00 + botão manual

**UI**: card "Insights da semana" fixo no topo da MemoriaPanel
- 3-5 insights com badge de tipo
- Botões: "Aceitar" / "Descartar" / "Virar pauta" (cria ContentIdea)

---

### Fase 3 — Mapa de cobertura territorial

**Sem migração** (agrega de `ic_knowledge_documents.bairros_citados` + `ic_promessas`)

**RPC** `get_cobertura_territorial(p_client_id)`: retorna por bairro `{nome, ult_visita, n_falas, n_promessas_abertas, tom_predominante, dias_silencio}`

**UI**: nova subaba **"Cobertura"** na MemoriaPanel
- Tabela rica com sort por dias de silêncio
- Badges: ALERTA (>30d), NUNCA, OK
- Linha clicável: abre drawer com últimas falas + promessas + apoiadores daquele bairro (cruza com tabela `pessoas`)

---

### Fase 4 — Conexões silenciosas com outros módulos

**Comentários** (`src/pages/Comments.tsx` ou componente de resposta):
- Quando usuário abre um comentário com pergunta, hook chama `ic-search-documents` com texto do comentário
- Mostra card "💡 O candidato falou sobre isso em [data]" com sugestão de resposta

**Disparos** (`SugestoesPanel.tsx`):
- Antes de enviar pra um bairro, busca promessas abertas daquele bairro e sugere personalização

**Calendário Político**:
- Em cada data comemorativa, busca promessas/falas relacionadas ao tema e sugere

**Pessoas** (`PessoaPerfil.tsx`):
- Aba "Promessas que afetam você" filtra `ic_promessas` por bairro do apoiador

---

### Fase 5 — Importar fontes externas + edição manual

**Banco**: adicionar `origem (transcricao|pdf|url|nota_manual)` e `origem_url` em `ic_knowledge_documents`. Tabela `ic_documento_versoes` para histórico de edição.

**Edge functions**:
- `ic-import-pdf`: recebe PDF (upload), extrai texto via Lovable AI, estrutura como documento
- `ic-import-url`: scraping simples de notícia + extração

**UI**:
- Botão "+ Adicionar fonte" na aba Documentos: PDF / URL / Nota manual
- Drawer do documento ganha modo "Editar" (campos editáveis salvam nova versão)
- Aba "Histórico" no drawer mostra versões

---

### Fase 6 — Detecção de drift de discurso

**Banco**: `ic_drift_analyses` (`id, client_id, tema, periodo_inicio, periodo_fim, mudanca_detectada, descricao, exemplos jsonb, created_at`)

**Edge function** `ic-detect-drift`:
- Agrupa documentos por trimestre × tema (tags)
- Compara embeddings médios entre trimestres
- Quando distância > limiar, manda LLM explicar a mudança em português
- Cron mensal + botão manual

**UI**: nova subaba **"Drift"** com timeline visual por tema

---

## Resumo técnico

**Migrações novas**: 4 (promessas, insights, drift, versionamento)
**Edge functions novas**: 7 (extract-promessas, memoria-insights, import-pdf, import-url, detect-drift, + 2 RPCs)
**Componentes UI novos**: PromessasKanban, InsightsCard, CoberturaTerritorial, DriftTimeline, ImportSourceDialog
**Integrações cross-module**: Comments, Disparos, Calendário, Pessoas (hooks leves)

## Ordem de entrega

Implemento Fase 1 → 2 → 3 → 4 → 5 → 6, testando build entre cada uma. Em cada fase, faço migração + edge function + UI + integração, e só passo pra próxima quando estiver funcional.

## Avisos importantes

- **Tamanho**: é um trabalho grande (estimo dezenas de arquivos novos/editados). Faz sentido eu pausar pra você validar entre fases? Ou prefere que eu siga tudo de ponta a ponta?
- **PDF parsing** (Fase 5): vou usar Lovable AI Gateway com Gemini para extrair texto — funciona bem em PDFs de plano de governo.
- **Cron**: as funções agendadas (`ic-memoria-insights` semanal, `ic-detect-drift` mensal) precisam de configuração via SQL com a anon key — vou montar no momento.
