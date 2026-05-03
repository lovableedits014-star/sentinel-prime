
-- Restaura policy pública (portais dependem disso) mas usa column-level grants
-- para esconder colunas sensíveis de usuários anônimos.

CREATE POLICY "Public can read basic client info"
ON public.clients
FOR SELECT
TO anon
USING (true);

-- Revoga acesso anônimo às colunas sensíveis
REVOKE SELECT ON public.clients FROM anon;
GRANT SELECT (
  id, user_id, name, cargo, logo_url, created_at, updated_at,
  whatsapp_oficial,
  whatsapp_window_enabled, whatsapp_window_start, whatsapp_window_end,
  whatsapp_rotation_strategy,
  whatsapp_inter_instance_delay_min, whatsapp_inter_instance_delay_max,
  presence_absence_days_threshold, presence_absence_message_template
) ON public.clients TO anon;

-- authenticated mantém acesso total (RLS continua filtrando por user_id)
GRANT SELECT ON public.clients TO authenticated;
