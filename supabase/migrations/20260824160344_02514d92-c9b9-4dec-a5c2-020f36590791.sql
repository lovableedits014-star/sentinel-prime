
REVOKE ALL ON FUNCTION public._tele_like(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tele_preview_fila(uuid, text, jsonb, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tele_popular_fila(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tele_create_fila_wizard(uuid, text, text, text, text[], text[], text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tele_remover_da_fila(uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._tele_like(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_preview_fila(uuid, text, jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_popular_fila(uuid, uuid, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_create_fila_wizard(uuid, text, text, text, text[], text[], text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_remover_da_fila(uuid, uuid, text, uuid[]) TO authenticated;
