
ALTER TABLE public.whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS humanization_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_dispatch_items
  ADD COLUMN IF NOT EXISTS variant_used text,
  ADD COLUMN IF NOT EXISTS cta_used text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_text text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS response_ctas jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Casamento no webhook: "última mensagem enviada a este telefone ainda sem resposta".
CREATE INDEX IF NOT EXISTS idx_wa_dispatch_items_reply_lookup
  ON public.whatsapp_dispatch_items (telefone, enviado_em DESC)
  WHERE replied_at IS NULL;
