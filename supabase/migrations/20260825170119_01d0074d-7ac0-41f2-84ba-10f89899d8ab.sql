CREATE OR REPLACE VIEW public.v_eleicao_indicadores_cobranca AS
SELECT p.id AS indicador_id,
    p.client_id,
    p.nome,
    p.tipo,
    p.telefone,
    p.regiao,
    p.cidade,
    p.parent_id,
    t.id AS token_id,
    t.token,
    COALESCE(ind.total, 0)::integer AS total_indicacoes,
    CASE p.tipo
        WHEN 'coordenador'::eleicao_tipo THEN COALESCE(c.meta_coordenador, 40)
        WHEN 'lider'::eleicao_tipo THEN COALESCE(c.meta_lider, 25)
        WHEN 'cabo'::eleicao_tipo THEN COALESCE(c.meta_cabo, 2)
        ELSE NULL::integer
    END AS meta,
    t.ultimo_acesso_em,
    ( SELECT max(l.enviado_em) FROM eleicao_cobranca_log l WHERE l.indicador_id = p.id) AS ultima_cobranca_em,
    ( SELECT count(*) FROM eleicao_cobranca_log l WHERE l.indicador_id = p.id) AS cobrancas_enviadas,
    COALESCE(ind.total, 0) <
    CASE p.tipo
        WHEN 'coordenador'::eleicao_tipo THEN COALESCE(c.meta_coordenador, 40)
        WHEN 'lider'::eleicao_tipo THEN COALESCE(c.meta_lider, 25)
        WHEN 'cabo'::eleicao_tipo THEN COALESCE(c.meta_cabo, 2)
        ELSE 0
    END AS fora_da_meta
FROM eleicao_pessoas p
LEFT JOIN LATERAL (
    SELECT t2.* FROM eleicao_indicacao_tokens t2
    WHERE t2.indicador_id = p.id AND t2.revoked_at IS NULL
    ORDER BY t2.created_at DESC
    LIMIT 1
) t ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS total FROM eleicao_indicados i WHERE i.indicador_id = p.id
) ind ON true
LEFT JOIN eleicao_indicacao_config c ON c.client_id = p.client_id;