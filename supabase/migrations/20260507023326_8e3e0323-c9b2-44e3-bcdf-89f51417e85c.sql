-- Padroniza RLS de ic_knowledge_documents para usar user_has_client_access (dono + team members)
ALTER TABLE public.ic_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ikd_manage" ON public.ic_knowledge_documents;
DROP POLICY IF EXISTS "ikd_team_view" ON public.ic_knowledge_documents;

CREATE POLICY "ikd_select" ON public.ic_knowledge_documents
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE POLICY "ikd_insert" ON public.ic_knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE POLICY "ikd_update" ON public.ic_knowledge_documents
  FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin())
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE POLICY "ikd_delete" ON public.ic_knowledge_documents
  FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());