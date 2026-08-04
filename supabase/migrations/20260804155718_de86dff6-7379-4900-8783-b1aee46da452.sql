CREATE TABLE IF NOT EXISTS public.engagement_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cargo text NOT NULL,
  min_interacoes integer NOT NULL DEFAULT 0,
  min_missoes integer NOT NULL DEFAULT 0,
  periodo_dias integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cargo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_metas TO authenticated;
GRANT ALL ON public.engagement_metas TO service_role;
ALTER TABLE public.engagement_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage engagement metas"
  ON public.engagement_metas FOR ALL TO authenticated
  USING (public.is_client_member(client_id))
  WITH CHECK (public.is_client_member(client_id));

CREATE TRIGGER trg_engagement_metas_updated_at
  BEFORE UPDATE ON public.engagement_metas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.engagement_metas (client_id, cargo, min_interacoes, min_missoes, periodo_dias)
SELECT c.id, v.cargo, v.mi, v.mm, 30
FROM public.clients c
CROSS JOIN (VALUES ('funcionario',8,2),('coordenador',8,2),('lider',5,1),('cabo',3,1)) AS v(cargo, mi, mm)
ON CONFLICT (client_id, cargo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.engagement_cobranca_overview(p_client_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  ref_id uuid, origem text, cargo text, nome text, telefone text, regiao text, cidade text,
  instagram_handle text, facebook_key text,
  interacoes bigint, instagram_comments bigint, facebook_comments bigint,
  missoes_abertas bigint, missoes_concluidas bigint,
  last_interaction timestamptz, dias_sem_interagir integer,
  min_interacoes integer, min_missoes integer, situacao text,
  missoes_disponiveis bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_since timestamptz; v_missoes bigint;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_since := now() - (GREATEST(COALESCE(p_days,30),1) || ' days')::interval;

  SELECT count(*) INTO v_missoes FROM portal_missions pm
   WHERE pm.client_id = p_client_id AND pm.archived_at IS NULL AND COALESCE(pm.is_active, true);

  RETURN QUERY
  WITH t AS (
    SELECT * FROM public.engagement_time_overview(p_client_id, p_days)
  ), j AS (
    SELECT t.*,
      (t.instagram_comments + t.facebook_comments + t.other_actions) AS total_inter,
      COALESCE(m.min_interacoes, 0) AS mi,
      COALESCE(m.min_missoes, 0) AS mm
    FROM t
    LEFT JOIN engagement_metas m ON m.client_id = p_client_id AND m.cargo = t.cargo
  )
  SELECT j.ref_id, j.origem, j.cargo, j.nome, j.telefone, j.regiao, j.cidade,
    j.instagram_handle, j.facebook_key,
    j.total_inter::bigint, j.instagram_comments, j.facebook_comments,
    j.missoes_abertas, j.missoes_concluidas,
    j.last_interaction,
    CASE WHEN j.last_interaction IS NULL THEN NULL
         ELSE GREATEST(0, (EXTRACT(EPOCH FROM (now() - j.last_interaction)) / 86400)::int) END,
    j.mi, j.mm,
    CASE
      WHEN j.instagram_handle IS NULL AND j.facebook_key IS NULL THEN 'sem_cadastro'
      WHEN j.total_inter = 0 AND j.missoes_concluidas = 0 THEN 'zerado'
      WHEN j.total_inter >= j.mi AND j.missoes_concluidas >= j.mm THEN 'em_dia'
      ELSE 'abaixo'
    END,
    v_missoes
  FROM j
  WHERE (j.mi > 0 OR j.mm > 0)
  ORDER BY j.cargo, COALESCE(j.regiao, j.cidade, 'zzz'), j.nome;
END $$;

GRANT EXECUTE ON FUNCTION public.engagement_cobranca_overview(uuid, integer) TO authenticated;