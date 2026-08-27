-- Cria uma missão rastreada e seus links em uma única transação.
-- Qualquer exceção desfaz tanto a missão quanto os links.
CREATE OR REPLACE FUNCTION public.create_tracked_mission(
  p_client_id uuid,
  p_platform text,
  p_post_url text,
  p_title text DEFAULT NULL,
  p_instructions text DEFAULT NULL,
  p_link_facebook text DEFAULT NULL,
  p_link_instagram text DEFAULT NULL,
  p_links jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mission_id uuid := gen_random_uuid();
  v_link jsonb;
  v_label text;
  v_url text;
  v_kind text;
  v_order integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Sessão inválida ou expirada';
  END IF;

  IF p_client_id IS NULL OR NOT public.is_client_member(p_client_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sem permissão para criar missão neste cliente';
  END IF;

  IF p_platform NOT IN ('facebook', 'instagram') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Plataforma inválida';
  END IF;

  IF nullif(btrim(p_post_url), '') IS NULL OR p_post_url !~* '^https?://' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A missão precisa de ao menos um link HTTP ou HTTPS';
  END IF;

  IF p_link_facebook IS NOT NULL AND p_link_facebook !~* '^https?://' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Link do Facebook inválido';
  END IF;
  IF p_link_instagram IS NOT NULL AND p_link_instagram !~* '^https?://' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Link do Instagram inválido';
  END IF;
  IF jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Lista de links inválida';
  END IF;
  IF jsonb_array_length(coalesce(p_links, '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A missão aceita no máximo 50 links adicionais';
  END IF;

  INSERT INTO public.portal_missions (
    id, client_id, platform, post_url, title, description, display_order,
    is_active, tracking_enabled, link_facebook, link_instagram, link_avulso, instructions
  ) VALUES (
    v_mission_id, p_client_id, p_platform, btrim(p_post_url), nullif(btrim(p_title), ''),
    NULL, 0, true, true, nullif(btrim(p_link_facebook), ''),
    nullif(btrim(p_link_instagram), ''), NULL, nullif(btrim(p_instructions), '')
  );

  FOR v_link IN SELECT value FROM jsonb_array_elements(coalesce(p_links, '[]'::jsonb))
  LOOP
    v_label := coalesce(nullif(btrim(v_link->>'label'), ''), 'Abrir link');
    v_url := nullif(btrim(v_link->>'url'), '');
    v_kind := coalesce(nullif(btrim(v_link->>'kind'), ''), 'generico');

    IF v_url IS NULL OR v_url !~* '^https?://' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('Link adicional %s inválido', v_order + 1);
    END IF;

    INSERT INTO public.portal_mission_links (
      mission_id, client_id, label, url, kind, display_order
    ) VALUES (
      v_mission_id, p_client_id, left(v_label, 200), v_url, left(v_kind, 50), v_order
    );
    v_order := v_order + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'mission_id', v_mission_id,
    'links_created', v_order
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tracked_mission(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tracked_mission(uuid, text, text, text, text, text, text, jsonb) TO authenticated;

