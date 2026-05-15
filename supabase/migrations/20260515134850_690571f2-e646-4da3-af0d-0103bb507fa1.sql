DROP POLICY IF EXISTS "Users can view their own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can manage their own comments" ON public.comments;
DROP POLICY IF EXISTS "Client access can view comments" ON public.comments;
DROP POLICY IF EXISTS "Client access can manage comments" ON public.comments;

CREATE POLICY "Client access can view comments"
ON public.comments FOR SELECT
USING (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "Client access can manage comments"
ON public.comments FOR ALL
USING (public.user_has_client_access(client_id, auth.uid()))
WITH CHECK (public.user_has_client_access(client_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view their own integrations" ON public.integrations;
DROP POLICY IF EXISTS "Users can manage their own integrations" ON public.integrations;
DROP POLICY IF EXISTS "Client access can view integrations" ON public.integrations;
DROP POLICY IF EXISTS "Client access can manage integrations" ON public.integrations;

CREATE POLICY "Client access can view integrations"
ON public.integrations FOR SELECT
USING (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "Client access can manage integrations"
ON public.integrations FOR ALL
USING (public.user_has_client_access(client_id, auth.uid()))
WITH CHECK (public.user_has_client_access(client_id, auth.uid()));