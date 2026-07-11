-- Entrega 3: painel de saúde + rotação + cotas + sticky

-- 1) Colunas em whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS reciprocity_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_daily_cap integer;

COMMENT ON COLUMN public.whatsapp_instances.reciprocity_rate IS
  'Taxa de reciprocidade 7d (0-1). Atualizada por gatilho via view v_whatsapp_instance_health.';
COMMENT ON COLUMN public.whatsapp_instances.stage_daily_cap IS
  'Override manual do cap diário; se NULL usa default do stage (novo=40, aquecendo=150, maduro=400).';

-- 2) Rastreamento da instância usada no item (para sticky por destinatário e auditoria)
ALTER TABLE public.whatsapp_dispatch_items
  ADD COLUMN IF NOT EXISTS instance_id uuid;

-- Index para sticky lookup: última instância que enviou pra este telefone
CREATE INDEX IF NOT EXISTS idx_wa_dispatch_items_sticky_lookup
  ON public.whatsapp_dispatch_items (telefone, enviado_em DESC)
  WHERE instance_id IS NOT NULL AND status = 'enviado';

-- 3) View de saúde por instância (janela 7d/24h)
CREATE OR REPLACE VIEW public.v_whatsapp_instance_health AS
WITH sent_7d AS (
  SELECT instance_id, COUNT(*)::int AS sent
  FROM public.whatsapp_dispatch_items
  WHERE status = 'enviado'
    AND enviado_em > now() - interval '7 days'
    AND instance_id IS NOT NULL
  GROUP BY instance_id
),
replied_7d AS (
  SELECT instance_id, COUNT(*)::int AS replied
  FROM public.whatsapp_dispatch_items
  WHERE status = 'enviado'
    AND replied_at IS NOT NULL
    AND enviado_em > now() - interval '7 days'
    AND instance_id IS NOT NULL
  GROUP BY instance_id
),
variants_24h AS (
  SELECT
    instance_id,
    COUNT(*)::int AS sent_24h,
    COUNT(DISTINCT variant_used)::int AS unique_variants_24h
  FROM public.whatsapp_dispatch_items
  WHERE status = 'enviado'
    AND enviado_em > now() - interval '24 hours'
    AND instance_id IS NOT NULL
    AND variant_used IS NOT NULL
  GROUP BY instance_id
),
top_cta AS (
  SELECT DISTINCT ON (instance_id)
    instance_id, cta_used, COUNT(*) OVER (PARTITION BY instance_id, cta_used) AS uso
  FROM public.whatsapp_dispatch_items
  WHERE status = 'enviado'
    AND cta_used IS NOT NULL
    AND enviado_em > now() - interval '7 days'
    AND instance_id IS NOT NULL
  ORDER BY instance_id, uso DESC
)
SELECT
  i.id AS instance_id,
  i.client_id,
  i.apelido,
  i.status,
  i.ramp_up_stage,
  i.stage_daily_cap,
  i.messages_sent_today,
  i.daily_send_limit,
  COALESCE(s.sent, 0)      AS sent_7d,
  COALESCE(r.replied, 0)   AS replied_7d,
  CASE WHEN COALESCE(s.sent, 0) > 0
       THEN ROUND((COALESCE(r.replied, 0)::numeric / s.sent) * 100, 1)
       ELSE 0 END          AS reciprocity_pct_7d,
  COALESCE(v.sent_24h, 0)  AS sent_24h,
  COALESCE(v.unique_variants_24h, 0) AS unique_variants_24h,
  CASE WHEN COALESCE(v.sent_24h, 0) > 0
       THEN ROUND((v.unique_variants_24h::numeric / v.sent_24h) * 100, 1)
       ELSE 0 END          AS unicity_pct_24h,
  t.cta_used               AS top_cta_7d
FROM public.whatsapp_instances i
LEFT JOIN sent_7d       s ON s.instance_id = i.id
LEFT JOIN replied_7d    r ON r.instance_id = i.id
LEFT JOIN variants_24h  v ON v.instance_id = i.id
LEFT JOIN top_cta       t ON t.instance_id = i.id;

GRANT SELECT ON public.v_whatsapp_instance_health TO authenticated;
GRANT ALL ON public.v_whatsapp_instance_health TO service_role;