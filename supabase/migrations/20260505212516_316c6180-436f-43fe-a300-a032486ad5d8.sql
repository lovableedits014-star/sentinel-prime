ALTER TABLE public.eleicao_pessoas ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_eleicao_pessoas_email_client
  ON public.eleicao_pessoas(client_id, lower(email)) WHERE email IS NOT NULL;

-- Função recursiva: pessoa pertence à árvore do coordenador logado?
CREATE OR REPLACE FUNCTION public.eleicao_pessoa_in_user_tree(_pessoa_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.eleicao_pessoas WHERE user_id = _user_id
    UNION ALL
    SELECT ep.id FROM public.eleicao_pessoas ep JOIN tree t ON ep.parent_id = t.id
  )
  SELECT EXISTS(SELECT 1 FROM tree WHERE id = _pessoa_id);
$$;

DROP POLICY IF EXISTS "coord can view own tree" ON public.eleicao_pessoas;
CREATE POLICY "coord can view own tree" ON public.eleicao_pessoas
FOR SELECT TO authenticated
USING (public.eleicao_pessoa_in_user_tree(id, auth.uid()));

DROP POLICY IF EXISTS "coord can insert in own tree" ON public.eleicao_pessoas;
CREATE POLICY "coord can insert in own tree" ON public.eleicao_pessoas
FOR INSERT TO authenticated
WITH CHECK (
  parent_id IS NOT NULL AND public.eleicao_pessoa_in_user_tree(parent_id, auth.uid())
);

DROP POLICY IF EXISTS "coord can update own tree" ON public.eleicao_pessoas;
CREATE POLICY "coord can update own tree" ON public.eleicao_pessoas
FOR UPDATE TO authenticated
USING (public.eleicao_pessoa_in_user_tree(id, auth.uid()))
WITH CHECK (public.eleicao_pessoa_in_user_tree(id, auth.uid()));

DROP POLICY IF EXISTS "coord can delete own tree" ON public.eleicao_pessoas;
CREATE POLICY "coord can delete own tree" ON public.eleicao_pessoas
FOR DELETE TO authenticated
USING (
  public.eleicao_pessoa_in_user_tree(id, auth.uid())
  AND user_id IS DISTINCT FROM auth.uid()
);