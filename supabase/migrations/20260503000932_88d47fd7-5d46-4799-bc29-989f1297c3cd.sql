-- Migration 11
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_comment_id text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_page_owner boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON public.comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_is_page_owner ON public.comments(is_page_owner) WHERE is_page_owner = true;

-- Migration 12
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS meta_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_token_type text DEFAULT 'short_lived';

-- Migration 13: link_orphan_engagement_actions (versão inicial — será sobrescrita pela 14)
CREATE OR REPLACE FUNCTION public.link_orphan_engagement_actions(p_client_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_linked INTEGER := 0;
BEGIN
  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN v_linked;
END; $$;

-- Migration 14: engagement_score_history + funções atualizadas
CREATE TABLE public.engagement_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id uuid NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month_year text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  action_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_supporter_month UNIQUE (supporter_id, month_year)
);

ALTER TABLE public.engagement_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own score history" ON public.engagement_score_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_score_history.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own score history" ON public.engagement_score_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_score_history.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own score history" ON public.engagement_score_history FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_score_history.client_id AND clients.user_id = auth.uid()));

CREATE INDEX idx_score_history_supporter ON public.engagement_score_history(supporter_id);
CREATE INDEX idx_score_history_client_month ON public.engagement_score_history(client_id, month_year);

CREATE OR REPLACE FUNCTION public.link_orphan_engagement_actions(p_client_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_linked INTEGER := 0; v_linked2 INTEGER := 0;
BEGIN
  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_username IS NOT NULL
    AND sp.platform = ea.platform AND sp.platform_username IS NOT NULL
    AND LOWER(TRIM(BOTH '@' FROM sp.platform_username)) = LOWER(TRIM(BOTH '@' FROM ea.platform_username));
  GET DIAGNOSTICS v_linked2 = ROW_COUNT;
  v_linked := v_linked + v_linked2;

  UPDATE supporter_profiles sp SET platform_user_id = c.author_id
  FROM comments c
  WHERE sp.platform_user_id NOT SIMILAR TO '[0-9]+'
    AND c.client_id = p_client_id AND c.platform = sp.platform
    AND c.author_id IS NOT NULL AND c.author_name IS NOT NULL
    AND (LOWER(REPLACE(REPLACE(c.author_name, ' ', '.'), '''', '')) LIKE '%' || LOWER(sp.platform_user_id) || '%'
         OR LOWER(REPLACE(sp.platform_user_id, '.', ' ')) = LOWER(c.author_name));

  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_linked2 = ROW_COUNT;
  v_linked := v_linked + v_linked2;

  UPDATE supporters s SET last_interaction_date = sub.max_date, updated_at = NOW()
  FROM (SELECT ea.supporter_id, MAX(ea.action_date) AS max_date
        FROM engagement_actions ea
        WHERE ea.client_id = p_client_id AND ea.supporter_id IS NOT NULL
        GROUP BY ea.supporter_id) sub
  WHERE s.id = sub.supporter_id AND s.client_id = p_client_id
    AND (s.last_interaction_date IS NULL OR s.last_interaction_date < sub.max_date);

  PERFORM calculate_engagement_score(s.id) FROM supporters s WHERE s.client_id = p_client_id;
  RETURN v_linked;
END; $$;

CREATE OR REPLACE FUNCTION public.snapshot_monthly_scores(p_client_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month text; v_count integer := 0;
BEGIN
  v_month := TO_CHAR(NOW(), 'YYYY-MM');
  INSERT INTO engagement_score_history (supporter_id, client_id, month_year, score, action_count)
  SELECT s.id, s.client_id, v_month, COALESCE(s.engagement_score, 0),
         COALESCE((SELECT COUNT(*) FROM engagement_actions ea
                   WHERE ea.supporter_id = s.id AND TO_CHAR(ea.action_date, 'YYYY-MM') = v_month), 0)
  FROM supporters s WHERE s.client_id = p_client_id
  ON CONFLICT (supporter_id, month_year)
  DO UPDATE SET score = EXCLUDED.score, action_count = EXCLUDED.action_count;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE EXECUTE ON FUNCTION public.link_orphan_engagement_actions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_orphan_engagement_actions(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_monthly_scores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_monthly_scores(uuid) TO authenticated;

-- Migration 15
ALTER TABLE public.integrations ADD COLUMN ai_custom_prompt text;