
ALTER VIEW public.v_eleicao_indicadores_cobranca SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.eleicao_indicados_touch_updated()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$fn$;
