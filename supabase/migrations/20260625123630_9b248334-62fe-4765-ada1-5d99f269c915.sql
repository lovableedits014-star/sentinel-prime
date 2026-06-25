
-- ============================================================
-- Distribuição de Contatos por Região (Eleição)
-- ============================================================

-- 1) Template de mensagem por client
CREATE TABLE IF NOT EXISTS public.eleicao_distribuicao_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mensagem_template text NOT NULL DEFAULT 'Olá [coordenador_nome]! Segue em anexo a lista atualizada dos [qtd_contatos] contatos da região [regiao]. Importe o arquivo na sua agenda e crie uma lista de transmissão para enviar sua mensagem individual de apresentação. Qualquer dúvida me chama!',
  tag_prefixo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_distribuicao_template TO authenticated;
GRANT ALL ON public.eleicao_distribuicao_template TO service_role;
ALTER TABLE public.eleicao_distribuicao_template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edt_select" ON public.eleicao_distribuicao_template;
CREATE POLICY "edt_select" ON public.eleicao_distribuicao_template FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "edt_insert" ON public.eleicao_distribuicao_template;
CREATE POLICY "edt_insert" ON public.eleicao_distribuicao_template FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "edt_update" ON public.eleicao_distribuicao_template;
CREATE POLICY "edt_update" ON public.eleicao_distribuicao_template FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id))
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "edt_delete" ON public.eleicao_distribuicao_template;
CREATE POLICY "edt_delete" ON public.eleicao_distribuicao_template FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));

-- 2) Lote: cabeçalho do pacote enviado
CREATE TABLE IF NOT EXISTS public.eleicao_contato_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coordenador_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  escopo text NOT NULL,
  regiao_key text NOT NULL,
  regiao_label text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('instancia','manual_wa','download')),
  total_contatos integer NOT NULL DEFAULT 0,
  apenas_novos boolean NOT NULL DEFAULT true,
  mensagem_enviada text,
  whatsapp_message_id text,
  status_leitura text,
  vcf_url text,
  observacao text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ecl_client ON public.eleicao_contato_lotes(client_id);
CREATE INDEX IF NOT EXISTS idx_ecl_coord ON public.eleicao_contato_lotes(coordenador_id);
CREATE INDEX IF NOT EXISTS idx_ecl_regiao ON public.eleicao_contato_lotes(client_id, escopo, regiao_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_contato_lotes TO authenticated;
GRANT ALL ON public.eleicao_contato_lotes TO service_role;
ALTER TABLE public.eleicao_contato_lotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ecl_select" ON public.eleicao_contato_lotes;
CREATE POLICY "ecl_select" ON public.eleicao_contato_lotes FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "ecl_insert" ON public.eleicao_contato_lotes;
CREATE POLICY "ecl_insert" ON public.eleicao_contato_lotes FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "ecl_update" ON public.eleicao_contato_lotes;
CREATE POLICY "ecl_update" ON public.eleicao_contato_lotes FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id))
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "ecl_delete" ON public.eleicao_contato_lotes;
CREATE POLICY "ecl_delete" ON public.eleicao_contato_lotes FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));

-- 3) Distribuicoes: 1 linha por contato enviado
CREATE TABLE IF NOT EXISTS public.eleicao_contato_distribuicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.eleicao_contato_lotes(id) ON DELETE CASCADE,
  coordenador_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  escopo text NOT NULL,
  regiao_key text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coordenador_id, pessoa_id)
);
CREATE INDEX IF NOT EXISTS idx_ecd_client ON public.eleicao_contato_distribuicoes(client_id);
CREATE INDEX IF NOT EXISTS idx_ecd_lote ON public.eleicao_contato_distribuicoes(lote_id);
CREATE INDEX IF NOT EXISTS idx_ecd_coord ON public.eleicao_contato_distribuicoes(coordenador_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_contato_distribuicoes TO authenticated;
GRANT ALL ON public.eleicao_contato_distribuicoes TO service_role;
ALTER TABLE public.eleicao_contato_distribuicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ecd_select" ON public.eleicao_contato_distribuicoes;
CREATE POLICY "ecd_select" ON public.eleicao_contato_distribuicoes FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "ecd_insert" ON public.eleicao_contato_distribuicoes;
CREATE POLICY "ecd_insert" ON public.eleicao_contato_distribuicoes FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));
DROP POLICY IF EXISTS "ecd_delete" ON public.eleicao_contato_distribuicoes;
CREATE POLICY "ecd_delete" ON public.eleicao_contato_distribuicoes FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS trg_edt_updated ON public.eleicao_distribuicao_template;
CREATE TRIGGER trg_edt_updated BEFORE UPDATE ON public.eleicao_distribuicao_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ecl_updated ON public.eleicao_contato_lotes;
CREATE TRIGGER trg_ecl_updated BEFORE UPDATE ON public.eleicao_contato_lotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RPC: regiões com coordenador principal + contadores
CREATE OR REPLACE FUNCTION public.eleicao_listar_regioes_distribuicao(_client_id uuid)
RETURNS TABLE (
  escopo text,
  regiao_key text,
  regiao_label text,
  coordenador_id uuid,
  coordenador_nome text,
  coordenador_telefone text,
  total_elegivel bigint,
  total_ja_enviado bigint,
  total_novos bigint,
  ultima_distribuicao_em timestamptz,
  ultimo_canal text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_can_access_client(_client_id)) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH principais AS (
    SELECT
      p.id AS coord_id,
      p.nome AS coord_nome,
      p.telefone AS coord_telefone,
      p.escopo::text AS escopo,
      CASE WHEN p.escopo::text = 'campo_grande' THEN COALESCE(p.regiao,'') ELSE COALESCE(p.cidade,'') END AS r_key,
      CASE WHEN p.escopo::text = 'campo_grande' THEN COALESCE(NULLIF(p.regiao,''),'(sem região)') ELSE COALESCE(NULLIF(p.cidade,''),'(sem cidade)') END AS r_label
    FROM public.eleicao_pessoas p
    WHERE p.client_id = _client_id
      AND p.tipo::text = 'coordenador'
      AND p.is_favorito_regiao = true
  ),
  elegiveis AS (
    SELECT pr.coord_id, pr.r_key, pr.escopo, pe.id AS pessoa_id
    FROM principais pr
    JOIN public.eleicao_pessoas pe
      ON pe.client_id = _client_id
     AND pe.escopo::text = pr.escopo
     AND CASE WHEN pe.escopo::text = 'campo_grande' THEN COALESCE(pe.regiao,'') ELSE COALESCE(pe.cidade,'') END = pr.r_key
     AND pe.id <> pr.coord_id
     AND COALESCE(NULLIF(regexp_replace(pe.telefone, '\D', '', 'g'),''),'') <> ''
  ),
  ja_env AS (
    SELECT d.coordenador_id, d.pessoa_id
    FROM public.eleicao_contato_distribuicoes d
    WHERE d.client_id = _client_id
  ),
  ult AS (
    SELECT DISTINCT ON (l.coordenador_id) l.coordenador_id, l.created_at, l.canal
    FROM public.eleicao_contato_lotes l
    WHERE l.client_id = _client_id
    ORDER BY l.coordenador_id, l.created_at DESC
  )
  SELECT
    pr.escopo,
    pr.r_key,
    pr.r_label,
    pr.coord_id,
    pr.coord_nome,
    pr.coord_telefone,
    COUNT(DISTINCT e.pessoa_id)::bigint,
    COUNT(DISTINCT e.pessoa_id) FILTER (WHERE je.pessoa_id IS NOT NULL)::bigint,
    COUNT(DISTINCT e.pessoa_id) FILTER (WHERE je.pessoa_id IS NULL)::bigint,
    u.created_at,
    u.canal
  FROM principais pr
  LEFT JOIN elegiveis e ON e.coord_id = pr.coord_id
  LEFT JOIN ja_env je ON je.coordenador_id = pr.coord_id AND je.pessoa_id = e.pessoa_id
  LEFT JOIN ult u ON u.coordenador_id = pr.coord_id
  GROUP BY pr.escopo, pr.r_key, pr.r_label, pr.coord_id, pr.coord_nome, pr.coord_telefone, u.created_at, u.canal
  ORDER BY pr.escopo, pr.r_label;
END;
$$;

-- 6) RPC: lista contatos elegíveis para um pacote
CREATE OR REPLACE FUNCTION public.eleicao_listar_contatos_pacote(
  _client_id uuid,
  _coordenador_id uuid,
  _apenas_novos boolean DEFAULT true
)
RETURNS TABLE (
  pessoa_id uuid,
  nome text,
  telefone text,
  tipo text,
  bairro text,
  ja_enviado boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_escopo text;
  v_rkey text;
BEGIN
  IF NOT (public.is_super_admin() OR public.user_can_access_client(_client_id)) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT
    p.escopo::text,
    CASE WHEN p.escopo::text = 'campo_grande' THEN COALESCE(p.regiao,'') ELSE COALESCE(p.cidade,'') END
  INTO v_escopo, v_rkey
  FROM public.eleicao_pessoas p
  WHERE p.id = _coordenador_id AND p.client_id = _client_id
    AND p.tipo::text = 'coordenador' AND p.is_favorito_regiao = true;

  IF v_escopo IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    pe.id,
    pe.nome,
    pe.telefone,
    pe.tipo::text,
    pe.bairro,
    (d.pessoa_id IS NOT NULL) AS ja_enviado
  FROM public.eleicao_pessoas pe
  LEFT JOIN public.eleicao_contato_distribuicoes d
    ON d.coordenador_id = _coordenador_id AND d.pessoa_id = pe.id
  WHERE pe.client_id = _client_id
    AND pe.escopo::text = v_escopo
    AND CASE WHEN pe.escopo::text = 'campo_grande' THEN COALESCE(pe.regiao,'') ELSE COALESCE(pe.cidade,'') END = v_rkey
    AND pe.id <> _coordenador_id
    AND COALESCE(NULLIF(regexp_replace(pe.telefone, '\D', '', 'g'),''),'') <> ''
    AND (NOT _apenas_novos OR d.pessoa_id IS NULL)
  ORDER BY pe.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eleicao_listar_regioes_distribuicao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eleicao_listar_contatos_pacote(uuid, uuid, boolean) TO authenticated;
