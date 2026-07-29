DROP FUNCTION IF EXISTS public.tele_list_campanhas_scripts(uuid, text, text);
CREATE OR REPLACE FUNCTION public.tele_list_campanhas_scripts(_client_id uuid, _nome text, _senha text)
 RETURNS TABLE(id uuid, nome text, script_intro text, script_perguntas jsonb, tags_rapidas jsonb, whatsapp_template text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  RETURN QUERY
    SELECT c.id, c.nome, c.script_intro, c.script_perguntas, c.tags_rapidas, c.whatsapp_template
    FROM public.telemarketing_campanhas c
    WHERE c.client_id = _client_id AND c.ativo = true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_list_campanhas_scripts(uuid, text, text) TO anon, authenticated;