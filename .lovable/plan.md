## Migração SENTINELLE → Sentinelle 2.0

Vou clonar o projeto SENTINELLE original para esta base e migrar tudo que for tecnicamente possível para o Supabase já conectado a este projeto.

### Escopo do projeto original (verificado)

- **41 páginas** (Dashboard, Comments, Engagement, Disparos, Inteligência Eleitoral/Conteúdo, Militância, Territorial, WhatsApp, SuperAdmin, Portais, etc.)
- **~25 pastas de componentes** + UI shadcn completa
- **156 migrations SQL** (schema + RLS + triggers + funções)
- **60+ Edge Functions** (Meta, WhatsApp, IA, TSE, IBGE, GDELT, cron jobs, etc.)
- **Storage buckets**: `client-logos`, `birthday-images`
- **Integrações**: Meta (Facebook/Instagram), WhatsApp (UAZAPI), provedores de LLM, push VAPID, pg_cron

### ⚠️ Diferenças importantes que afetam a migração

1. **Framework difere**: o original é **Vite + React Router DOM**; este projeto é **TanStack Start** (file-based routing, server functions). Isso exige reescrever cada rota — não dá para copiar `src/pages/*.tsx` cru.
2. **Dados das tabelas não podem ser copiados pelo agente.** Eu só posso recriar o **schema** (estrutura, RLS, funções, triggers) via migrations. Para mover os **registros existentes** (usuários, comentários, contatos, etc.) você precisa rodar `pg_dump`/`psql` manualmente conforme o `MIGRATION.md` do projeto original — não tenho acesso ao banco do Lovable Cloud de lá.
3. **Edge Functions Supabase**: posso recriar todas as 60+ functions neste projeto, e o deploy é automático.
4. **Storage**: posso criar os buckets, mas os arquivos em si precisam ser copiados por script (você executando) — não consigo ler binários do storage do projeto original.
5. **Secrets** (Meta tokens, WhatsApp bridge, VAPID, LLM keys): você precisa fornecer; vou pedir conforme cada integração for sendo ativada.

### Estratégia recomendada — em fases

Tentar fazer tudo de uma vez vai falhar (volume gigantesco + framework diferente). Proposta dividida:

#### Fase 1 — Fundação (esta etapa)
- Substituir o template em branco por:
  - Estrutura de rotas TanStack equivalente (`/`, `/auth`, `/dashboard`, `/comments`, `/engagement`, etc. — esqueletos navegáveis)
  - Layout principal (`DashboardLayout`) e tema/branding do Sentinelle
  - Cliente Supabase já apontando para o Supabase deste projeto
- Aplicar **todas as 156 migrations** consolidadas no Supabase atual (schema + RLS + funções + triggers)
- Criar buckets de storage (`client-logos`, `birthday-images`)

#### Fase 2 — Edge Functions
- Copiar as 60+ edge functions para `supabase/functions/`
- Cadastrar segredos conforme você for me fornecendo (Meta, WhatsApp, LLM, VAPID)
- Deploy automático

#### Fase 3 — Telas (em lotes)
Migrar páginas em grupos temáticos, convertendo de React Router DOM → TanStack Router:
1. Auth + Dashboard + Settings
2. Comments + Engagement + Disparos
3. Inteligência Eleitoral + Conteúdo + Militância
4. Territorial + Calendário + Mídia
5. Portais (Funcionário, Contratado, Apoiador) + SuperAdmin
6. Telas restantes (Recrutamento, Telemarketing, etc.)

#### Fase 4 — Dados e integrações externas
- Você executa o `pg_dump` do Lovable Cloud do projeto original e importa no Supabase deste projeto (vou te dar os comandos exatos com a connection string nova)
- Reapontar webhooks Meta/WhatsApp para as URLs deste projeto
- Validação ponta-a-ponta

### Detalhes técnicos

- Roteamento: cada `src/pages/X.tsx` vira `src/routes/x.tsx` com `createFileRoute`. Hooks `useNavigate`/`Link` migram de `react-router-dom` para `@tanstack/react-router`.
- Componentes (`src/components/**`) podem ser copiados quase 1:1 — só ajusto imports de roteamento.
- Cliente Supabase: uso o `@/integrations/supabase/client` já gerado (anon key deste projeto).
- Migrations SQL: aplico em ordem cronológica via tool de migration. Algumas podem precisar de pequenos ajustes (ex.: extensões já instaladas).

### O que preciso de você antes de começar

1. **Confirmação para iniciar pela Fase 1** (fundação + schema completo + buckets).
2. Saber se quer que eu **mantenha o nome interno "Sentinelle"** nas telas ou troque para "Sentinelle 2.0".
3. Confirmar que tudo bem o **Supabase deste projeto receber 156 migrations** de uma vez (vou consolidar em poucos arquivos grandes).

Após aprovar este plano, começo pela Fase 1 imediatamente.