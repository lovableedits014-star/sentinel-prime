## Escopo travado (nada além disto)

**3 entregas sequenciais**, cada uma auto-suficiente. Sem homóglifos, sem VPN por envio, sem auto-resposta. Proxy/IP por chip fica como "Entrega 4 opcional futura" (só quando você contratar proxies e a bridge suportar).

---

## Entrega 1 — Motor de variação + CTA de resposta + captura de respostas

Núcleo do ganho anti-ban. Retrocompatível: templates atuais continuam funcionando idênticos.

### 1.1. Migração SQL (única da entrega)
- `whatsapp_dispatches`: `humanization_config jsonb default '{}'`, `cta_config jsonb default '{}'`.
- `whatsapp_dispatch_items`: `variant_used text`, `cta_used text`, `replied_at timestamptz`, `reply_text text`.
- `clients`: `response_ctas jsonb default '[]'` (biblioteca personalizada do cliente).

Tudo nullable/default seguro. Nenhum registro existente quebra.

### 1.2. Motor puro backend — `supabase/functions/_shared/message-variation.ts`
- `protectUrls` / `restoreUrls` (tokens `⟦URL0⟧`, links intocados).
- `expandSpintax` (`{a|b|c}` e blocos `[[A|B]]` recursivos).
- `applyPlaceholders` (`{nome}`, `{primeiro_nome}`, `{saudacao}`, `{dia_semana}`, `{assinatura}`, `{emoji_positivo}`, `{cta_resposta}`).
- `renderMessage(template, recipient, ctx)` orquestra e valida que URLs originais aparecem no output.
- `message-variation.test.ts`: preservação de URL, spintax aninhada, placeholder ausente, colisão.

### 1.3. Biblioteca de CTAs — `supabase/functions/_shared/response-ctas.ts`
- ~30 CTAs default em 6 categorias (pergunta leve, confirmação, escolha binária, opinião, ajuda mútua, micro-compromisso).
- `pickCta(clientCtas, categories, seed)` — merge defaults + custom, evita repetir consecutivamente.
- `hasQuestionAtEnd(text)` — não anexa CTA se template já termina em pergunta.

### 1.4. Patch em `send-whatsapp-dispatch/index.ts`
Trocar os 2 `replace(/{nome}/g, ...)` por `renderMessage(...)`. Todo o resto (ramp-up, janela, delays, retry, cota) fica igual.

### 1.5. Patch em `whatsapp-inbound-webhook/index.ts`
Após identificar `client_id + phone`, buscar último `whatsapp_dispatch_items` desse phone com `sent_at > now() - 48h` e `replied_at is null`; se achar, grava `replied_at` e `reply_text` (500 chars). Nada mais.

### 1.6. Motor isomórfico frontend — `src/lib/message-variation.ts`
Espelho 1:1 do backend (sem I/O), para preview instantâneo.

### 1.7. Editor — `src/components/disparos/MessageEditor.tsx`
- Textarea + toolbar (spintax, placeholders, `{cta_resposta}`).
- Aba lateral CTAs: lista com toggle por categoria, botão "Gerar 10 CTAs com IA" (reusa `ic-generate-text`), toggle "Adicionar CTA automático".
- Preview: 5 amostras renderizadas com nomes reais + contador de unicidade.
- Validação bloqueia envio se spintax malformada.

### 1.8. Ordem de execução Entrega 1
1. Migração SQL → aguarda aprovação.
2. Motor puro backend + testes + biblioteca CTAs.
3. Motor isomórfico frontend.
4. `MessageEditor` + integração em `Disparos.tsx`.
5. Patch nas 2 edge functions.
6. Validação manual (1 disparo de teste com 3 contatos).

---

## Entrega 2 — Import/export de contatos

- `src/components/disparos/ImportContactsDialog.tsx`: CSV/XLSX, detecta encoding/separador, normaliza telefone, preview, destino (lista ad-hoc OU grava em `pessoas` com tag).
- Botão "Exportar contatos" no disparo → CSV com `nome, telefone, variante_enviada, status, replied_at`.
- Sem migração SQL (reusa tabelas existentes).

---

## Entrega 3 — Painel de saúde + rotação + cotas + sticky

### 3.1. Migração SQL
- `whatsapp_instances`: `reciprocity_rate numeric default 0`, `stage_daily_cap int`.

### 3.2. Backend `send-whatsapp-dispatch`
- Cap por stage antes de enviar (novo=40, aquecendo=150, maduro=400; override por disparo).
- Micro-pausa: 5% chance de 30–120s.
- **Sticky por destinatário**: consulta último `whatsapp_dispatch_items` do phone; se chip anterior saudável + com cota → reusa; senão, round-robin ponderado por saúde/reciprocidade.

### 3.3. Painel em `StatusWhatsApp.tsx`
Por chip: reciprocidade 7d, % unicidade 24h, cota consumida/cap, alertas de queda súbita. Ranking de CTAs (uso × resposta).

### 3.4. Circuit breaker
2 falhas de bridge consecutivas → `is_active=false` + log. Retomada manual.

---

## Riscos previstos e mitigação
- URL quebrada → `protectUrls` + assert no fim de `renderMessage` + teste dedicado.
- Spintax malformada → validador no editor + fallback literal no backend.
- Colisão do spintax (poucas combinações) → aviso no preview.
- IA gerando CTA com link → validador rejeita variantes que introduzem URL nova.
- Resposta atrasada → janela 48h configurável.
- Cota bloqueando urgente → override `humanization_config.ignore_cap: true`.
- Drift JS/Deno → motor puro sem deps de runtime; mesmos testes rodam nos dois lados.

## Redundâncias eliminadas
- Ramp-up, janela, `randomDelay`, `ic-generate-text`, roteamento do webhook, `whatsapp_dispatch_items` — tudo já existe e é reusado, não recriado.
- Spintax e CTA compartilham o mesmo `renderMessage`, não dois pipelines.
- Frontend e backend compartilham fixtures de teste para não divergir.

---

## Confirmação
Começo por **Entrega 1**, iniciando pela migração SQL. Nada além do combinado até você aprovar a próxima entrega.