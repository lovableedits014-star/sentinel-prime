-- Permite que membros autorizados da equipe consultem os horários das tentativas.
-- Antes, a policy contemplava apenas o proprietário direto do cliente.
DROP POLICY IF EXISTS "Tele log: client owner read" ON public.telemarketing_call_log;
DROP POLICY IF EXISTS "Tele log: team read" ON public.telemarketing_call_log;
CREATE POLICY "Tele log: team read"
  ON public.telemarketing_call_log FOR SELECT TO authenticated
  USING (public.reuniao_client_can_access(client_id));
