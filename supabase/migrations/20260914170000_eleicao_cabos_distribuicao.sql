-- Exportacao incremental dos contatos de cabos eleitorais por regiao.
CREATE TABLE IF NOT EXISTS public.eleicao_cabo_export_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  escopo text NOT NULL,
  regiao_key text NOT NULL,
  regiao_label text NOT NULL,
  total_contatos integer NOT NULL DEFAULT 0,
  apenas_novos boolean NOT NULL DEFAULT true,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eleicao_cabo_export_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.eleicao_cabo_export_lotes(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  escopo text NOT NULL,
  regiao_key text NOT NULL,
  exportado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,escopo,regiao_key,pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_cabo_export_lotes_regiao
  ON public.eleicao_cabo_export_lotes(client_id,escopo,regiao_key,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cabo_export_itens_regiao
  ON public.eleicao_cabo_export_itens(client_id,escopo,regiao_key);

ALTER TABLE public.eleicao_cabo_export_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eleicao_cabo_export_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cabo_export_lotes_member ON public.eleicao_cabo_export_lotes;
CREATE POLICY cabo_export_lotes_member ON public.eleicao_cabo_export_lotes
  FOR ALL TO authenticated USING (public.is_client_member(client_id))
  WITH CHECK (public.is_client_member(client_id));
DROP POLICY IF EXISTS cabo_export_itens_member ON public.eleicao_cabo_export_itens;
CREATE POLICY cabo_export_itens_member ON public.eleicao_cabo_export_itens
  FOR ALL TO authenticated USING (public.is_client_member(client_id))
  WITH CHECK (public.is_client_member(client_id));

CREATE OR REPLACE FUNCTION public.eleicao_cabos_export_regioes(_client_id uuid)
RETURNS TABLE(escopo text,regiao_key text,regiao_label text,total_elegivel bigint,
  total_ja_exportado bigint,total_novos bigint,ultima_exportacao_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH cabos AS (
    SELECT p.id,p.escopo::text esc,
      CASE WHEN p.escopo::text='campo_grande' THEN coalesce(p.regiao,'') ELSE coalesce(p.cidade,'') END rkey,
      CASE WHEN p.escopo::text='campo_grande' THEN coalesce(nullif(p.regiao,''),'(sem regiao)') ELSE coalesce(nullif(p.cidade,''),'(sem cidade)') END rlabel
    FROM eleicao_pessoas p
    WHERE p.client_id=_client_id AND p.tipo::text='cabo' AND p.arquivado_em IS NULL
      AND NOT coalesce(p.is_voluntario,false) AND coalesce(p.valor_contratacao,0)>0
      AND public.tele_phone_key(p.telefone) IS NOT NULL
  ), ult AS (
    SELECT DISTINCT ON(l.escopo,l.regiao_key) l.escopo,l.regiao_key,l.created_at
    FROM eleicao_cabo_export_lotes l WHERE l.client_id=_client_id
    ORDER BY l.escopo,l.regiao_key,l.created_at DESC
  )
  SELECT c.esc,c.rkey,c.rlabel,count(*)::bigint,
    count(*) FILTER(WHERE i.pessoa_id IS NOT NULL)::bigint,
    count(*) FILTER(WHERE i.pessoa_id IS NULL)::bigint,u.created_at
  FROM cabos c
  LEFT JOIN eleicao_cabo_export_itens i ON i.client_id=_client_id AND i.escopo=c.esc AND i.regiao_key=c.rkey AND i.pessoa_id=c.id
  LEFT JOIN ult u ON u.escopo=c.esc AND u.regiao_key=c.rkey
  GROUP BY c.esc,c.rkey,c.rlabel,u.created_at ORDER BY c.esc,c.rlabel;
END;$function$;

CREATE OR REPLACE FUNCTION public.eleicao_cabos_export_lista(
  _client_id uuid,_escopo text,_regiao_key text,_apenas_novos boolean DEFAULT true)
RETURNS TABLE(pessoa_id uuid,nome text,telefone text,bairro text,ja_exportado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH elegiveis AS (
    SELECT p.id,p.nome,p.telefone,p.bairro,p.created_at,public.tele_phone_key(p.telefone) phone_key
    FROM eleicao_pessoas p
    WHERE p.client_id=_client_id AND p.tipo::text='cabo' AND p.arquivado_em IS NULL
      AND NOT coalesce(p.is_voluntario,false) AND coalesce(p.valor_contratacao,0)>0
      AND p.escopo::text=_escopo
      AND (CASE WHEN p.escopo::text='campo_grande' THEN coalesce(p.regiao,'') ELSE coalesce(p.cidade,'') END)=_regiao_key
      AND public.tele_phone_key(p.telefone) IS NOT NULL
  ), unicos AS (
    SELECT DISTINCT ON(e.phone_key) e.* FROM elegiveis e ORDER BY e.phone_key,e.created_at DESC,e.id
  )
  SELECT u.id,u.nome,u.telefone,u.bairro,(i.pessoa_id IS NOT NULL)
  FROM unicos u LEFT JOIN eleicao_cabo_export_itens i
    ON i.client_id=_client_id AND i.escopo=_escopo AND i.regiao_key=_regiao_key AND i.pessoa_id=u.id
  WHERE NOT _apenas_novos OR i.pessoa_id IS NULL ORDER BY u.nome;
END;$function$;

REVOKE ALL ON FUNCTION public.eleicao_cabos_export_regioes(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabos_export_lista(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabos_export_regioes(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_cabos_export_lista(uuid,text,text,boolean) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
