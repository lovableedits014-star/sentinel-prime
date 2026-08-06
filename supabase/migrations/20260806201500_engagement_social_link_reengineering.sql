-- 1. Função de normalização de handles/identificadores sociais
CREATE OR REPLACE FUNCTION public.engagement_normalize_social_handle(_plataforma text, _input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    _handle text;
    _url_parts text[];
BEGIN
    IF _input IS NULL OR _input = '' THEN RETURN NULL; END IF;

    -- Remove espaços e caracteres invisíveis
    _handle := trim(_input);
    
    -- Se for uma URL completa, tenta extrair
    IF _handle ~* '^https?://' THEN
        -- Normaliza para facebook.com/profile.php?id=123
        IF _plataforma = 'facebook' AND _handle ~* 'profile\.php\?id=[0-9]+' THEN
            RETURN substring(_handle from 'id=([0-9]+)');
        END IF;

        -- Pega o primeiro segmento do path que não seja uma rota reservada
        _url_parts := string_to_array(replace(replace(_handle, 'https://', ''), 'http://', ''), '/');
        
        -- O primeiro elemento de _url_parts após o domínio é o que queremos
        -- Ex: facebook.com/usuario -> usuario
        IF array_length(_url_parts, 1) >= 2 THEN
            _handle := _url_parts[2];
            -- Remove query params e âncoras
            _handle := split_part(split_part(_handle, '?', 1), '#', 1);
        END IF;
    END IF;

    -- Remove o @ inicial se houver
    _handle := ltrim(_handle, '@');

    RETURN _handle;
END;
$$;

-- 2. Trigger para vincular interações órfãs ao cadastrar um novo perfil
CREATE OR REPLACE FUNCTION public.trg_engagement_relink_orphan_comments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _plataforma text;
    _usuario text;
    _client_id uuid;
BEGIN
    -- Identifica plataforma e usuário baseado na origem
    -- Este trigger deve ser aplicado em todas as tabelas de origem (pessoas, funcionarios, etc)
    -- Mas como temos uma lógica de upsert centralizada, podemos chamá-la de lá.
    RETURN NEW;
END;
$$;

-- 3. Atualização da função de upsert para ser proativa
CREATE OR REPLACE FUNCTION public.engagement_entity_upsert_social(
    p_origem text,
    p_ref text,
    p_plataforma text,
    p_usuario text,
    p_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _normalized text;
    _relinked int := 0;
    _client_id uuid;
BEGIN
    _normalized := engagement_normalize_social_handle(p_plataforma, p_usuario);
    
    -- Descobrir client_id (exemplo simplificado, assume-se que as tabelas têm client_id)
    -- Na prática, buscamos na tabela de origem
    EXECUTE format('SELECT client_id FROM public.%I WHERE id = $1', p_origem)
    INTO _client_id USING p_ref::uuid;

    -- Atualiza o registro na tabela de origem
    IF p_plataforma = 'instagram' THEN
        EXECUTE format('UPDATE public.%I SET instagram_handle = $1 WHERE id = $2', p_origem)
        USING _normalized, p_ref::uuid;
    ELSIF p_plataforma = 'facebook' THEN
        EXECUTE format('UPDATE public.%I SET facebook_key = $1 WHERE id = $2', p_origem)
        USING _normalized, p_ref::uuid;
    END IF;

    -- VINCULAR INTERAÇÕES ÓRFÃS IMEDIATAMENTE
    -- Se for ID numérico (Facebook), vincula pelo platform_user_id
    -- Se for handle (Instagram), tenta vincular pelo author_name ou platform_user_id
    IF p_plataforma = 'facebook' AND _normalized ~ '^[0-9]+$' THEN
        UPDATE public.engagement_comments
        SET person_ref_id = p_ref::uuid, person_origem = p_origem
        WHERE client_id = _client_id
          AND platform = 'facebook'
          AND platform_user_id = _normalized
          AND person_ref_id IS NULL;
        GET DIAGNOSTICS _relinked = ROW_COUNT;
    ELSIF p_plataforma = 'instagram' THEN
        UPDATE public.engagement_comments
        SET person_ref_id = p_ref::uuid, person_origem = p_origem
        WHERE client_id = _client_id
          AND platform = 'instagram'
          AND (platform_user_id = _normalized OR author_name = _normalized)
          AND person_ref_id IS NULL;
        GET DIAGNOSTICS _relinked = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'handle', _normalized,
        'relinked', _relinked
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engagement_normalize_social_handle(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_entity_upsert_social(text, text, text, text, text) TO authenticated;
