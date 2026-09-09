-- Cada lider pode ter no maximo quatro cabos eleitorais ativos.
-- A trava vale para qualquer origem de escrita (administracao, portal ou API).
CREATE OR REPLACE FUNCTION public.eleicao_validar_limite_cabos_lider()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_tipo public.eleicao_tipo;
  v_parent_client_id uuid;
  v_total integer;
BEGIN
  IF NEW.tipo <> 'cabo'::public.eleicao_tipo OR NEW.parent_id IS NULL OR NEW.arquivado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tipo, p.client_id
    INTO v_parent_tipo, v_parent_client_id
    FROM public.eleicao_pessoas p
   WHERE p.id = NEW.parent_id AND p.arquivado_em IS NULL;

  IF v_parent_tipo IS DISTINCT FROM 'lider'::public.eleicao_tipo THEN
    RETURN NEW;
  END IF;
  IF v_parent_client_id IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'O lider e o cabo precisam pertencer ao mesmo cliente';
  END IF;

  -- Serializa inclusoes concorrentes para o mesmo lider.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.parent_id::text, 0));
  SELECT count(*)::integer INTO v_total
    FROM public.eleicao_pessoas c
   WHERE c.parent_id = NEW.parent_id
     AND c.tipo = 'cabo'::public.eleicao_tipo
     AND c.arquivado_em IS NULL
     AND c.id IS DISTINCT FROM NEW.id;

  IF v_total >= 4 THEN
    RAISE EXCEPTION 'Este lider ja possui o limite de 4 cabos eleitorais ativos';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_eleicao_limite_cabos_lider ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_limite_cabos_lider
BEFORE INSERT OR UPDATE OF tipo, parent_id, arquivado_em, client_id
ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.eleicao_validar_limite_cabos_lider();
