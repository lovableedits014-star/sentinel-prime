
-- Phase 5: script and quick tags per campaign
ALTER TABLE public.telemarketing_campanhas
  ADD COLUMN IF NOT EXISTS script_intro text,
  ADD COLUMN IF NOT EXISTS script_perguntas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags_rapidas jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Phase 6: snapshots for round-over-round comparison
CREATE TABLE IF NOT EXISTS public.telemarketing_relatorio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  campanha_id uuid NULL,
  rotulo text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  total int NOT NULL DEFAULT 0,
  ligados int NOT NULL DEFAULT 0,
  atendeu int NOT NULL DEFAULT 0,
  nao_atendeu int NOT NULL DEFAULT 0,
  recusou int NOT NULL DEFAULT 0,
  vota_sim int NOT NULL DEFAULT 0,
  vota_nao int NOT NULL DEFAULT 0,
  indeciso int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemarketing_relatorio_snapshots TO authenticated;
GRANT ALL ON public.telemarketing_relatorio_snapshots TO service_role;

ALTER TABLE public.telemarketing_relatorio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tele snap: client owner all"
  ON public.telemarketing_relatorio_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = telemarketing_relatorio_snapshots.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = telemarketing_relatorio_snapshots.client_id AND c.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tele_snap_client_captured
  ON public.telemarketing_relatorio_snapshots(client_id, captured_at DESC);
