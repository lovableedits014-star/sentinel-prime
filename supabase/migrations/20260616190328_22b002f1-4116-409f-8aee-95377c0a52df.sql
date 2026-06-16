
-- =========================================================================
-- 1. RPC: aplicar dobradinha a uma raiz (coordenador ou líder avulso)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.eleicao_aplicar_dobradinha_raiz(
  _raiz_id uuid,
  _parceiro_id uuid,
  _rateio_estadual numeric,
  _rateio_parceiro numeric,
  _propagar boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_tipo text;
  v_parent uuid;
  v_count integer := 0;
  v_user uuid := auth.uid();
BEGIN
  -- Localiza raiz e valida tipo
  SELECT client_id, tipo::text, parent_id INTO v_client_id, v_tipo, v_parent
  FROM public.eleicao_pessoas WHERE id = _raiz_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Pessoa não encontrada';
  END IF;

  IF v_tipo = 'cabo' OR (v_tipo = 'lider' AND v_parent IS NOT NULL) THEN
    RAISE EXCEPTION 'Apenas coordenadores ou líderes avulsos podem definir dobradinha';
  END IF;

  -- Verifica permissão: dono do client ou team_member ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = v_client_id AND c.user_id = v_user
  ) AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.client_id = v_client_id AND tm.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  -- Validação de rateio
  IF _parceiro_id IS NULL THEN
    _rateio_estadual := 100;
    _rateio_parceiro := 0;
  END IF;

  IF ROUND((_rateio_estadual + _rateio_parceiro)::numeric, 2) <> 100 THEN
    RAISE EXCEPTION 'Soma dos rateios deve ser 100';
  END IF;

  -- Atualiza a raiz
  UPDATE public.eleicao_pessoas
  SET parceiro_id = _parceiro_id,
      rateio_estadual = _rateio_estadual,
      rateio_parceiro = _rateio_parceiro,
      updated_at = now()
  WHERE id = _raiz_id;
  v_count := 1;

  -- Propaga descendentes
  IF _propagar THEN
    WITH RECURSIVE descendentes AS (
      SELECT id FROM public.eleicao_pessoas WHERE parent_id = _raiz_id
      UNION ALL
      SELECT p.id FROM public.eleicao_pessoas p
      JOIN descendentes d ON p.parent_id = d.id
    )
    UPDATE public.eleicao_pessoas ep
    SET parceiro_id = _parceiro_id,
        rateio_estadual = _rateio_estadual,
        rateio_parceiro = _rateio_parceiro,
        updated_at = now()
    FROM descendentes d
    WHERE ep.id = d.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_count := v_count + 1; -- somar a raiz
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eleicao_aplicar_dobradinha_raiz(uuid, uuid, numeric, numeric, boolean) TO authenticated;

-- =========================================================================
-- 2. Trigger de herança: ao criar/mover descendente, herda da raiz
-- =========================================================================
CREATE OR REPLACE FUNCTION public.eleicao_pessoa_heranca_dobradinha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_raiz_parceiro uuid;
  v_raiz_est numeric;
  v_raiz_par numeric;
BEGIN
  -- Aplica só para descendentes (líder com parent ou cabo)
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sobe a árvore até achar a raiz (parent_id IS NULL)
  WITH RECURSIVE up AS (
    SELECT id, parent_id, parceiro_id, rateio_estadual, rateio_parceiro
    FROM public.eleicao_pessoas WHERE id = NEW.parent_id
    UNION ALL
    SELECT p.id, p.parent_id, p.parceiro_id, p.rateio_estadual, p.rateio_parceiro
    FROM public.eleicao_pessoas p
    JOIN up u ON p.id = u.parent_id
  )
  SELECT parceiro_id, rateio_estadual, rateio_parceiro
  INTO v_raiz_parceiro, v_raiz_est, v_raiz_par
  FROM up WHERE parent_id IS NULL LIMIT 1;

  IF v_raiz_est IS NOT NULL THEN
    NEW.parceiro_id := v_raiz_parceiro;
    NEW.rateio_estadual := v_raiz_est;
    NEW.rateio_parceiro := v_raiz_par;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_heranca_dobradinha
BEFORE INSERT OR UPDATE OF parent_id
ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.eleicao_pessoa_heranca_dobradinha();

-- =========================================================================
-- 3. Backfill: alinhar todos os descendentes às suas raízes atuais
-- =========================================================================
WITH RECURSIVE arvore AS (
  -- raízes (coordenadores e líderes avulsos)
  SELECT id AS raiz_id, id, parent_id, parceiro_id, rateio_estadual, rateio_parceiro
  FROM public.eleicao_pessoas
  WHERE parent_id IS NULL
  UNION ALL
  SELECT a.raiz_id, p.id, p.parent_id, a.parceiro_id, a.rateio_estadual, a.rateio_parceiro
  FROM public.eleicao_pessoas p
  JOIN arvore a ON p.parent_id = a.id
)
UPDATE public.eleicao_pessoas ep
SET parceiro_id = a.parceiro_id,
    rateio_estadual = a.rateio_estadual,
    rateio_parceiro = a.rateio_parceiro
FROM arvore a
WHERE ep.id = a.id
  AND ep.id <> a.raiz_id
  AND (
    COALESCE(ep.parceiro_id::text, '') <> COALESCE(a.parceiro_id::text, '')
    OR ep.rateio_estadual <> a.rateio_estadual
    OR ep.rateio_parceiro <> a.rateio_parceiro
  );
