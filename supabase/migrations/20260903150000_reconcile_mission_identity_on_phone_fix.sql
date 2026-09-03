-- Ao corrigir o telefone de uma pessoa da Eleicao, religa automaticamente
-- participacoes/check-ins feitos com esse numero e reaplica as conclusoes.

CREATE OR REPLACE FUNCTION public.eleicao_reconcile_missions_after_phone_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_phone_key text;
BEGIN
  IF NEW.arquivado_em IS NOT NULL THEN RETURN NEW; END IF;

  v_phone_key := public.mission_phone_key(NEW.telefone);
  IF v_phone_key IS NULL THEN RETURN NEW; END IF;

  -- Telefone ambiguo nunca deve vincular historico automaticamente.
  IF EXISTS (
    SELECT 1
    FROM public.eleicao_pessoas other
    WHERE other.client_id = NEW.client_id
      AND other.id <> NEW.id
      AND other.arquivado_em IS NULL
      AND public.mission_phone_key(other.telefone) = v_phone_key
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.mission_participants mp
  SET pessoa_id = NEW.id,
      nome = NEW.nome,
      match_source = 'phone_corrected_in_eleicao',
      matched_at = now(),
      cargo_snapshot = CASE WHEN coalesce(NEW.is_voluntario, false)
        THEN 'voluntario' ELSE NEW.tipo::text END,
      regiao_snapshot = coalesce(nullif(NEW.regiao, ''), nullif(NEW.cidade, ''), mp.regiao_snapshot),
      updated_at = now()
  WHERE mp.client_id = NEW.client_id
    AND public.mission_phone_key(mp.phone_e164) = v_phone_key
    AND (mp.pessoa_id IS NULL OR mp.pessoa_id = NEW.id);

  -- Corrige tambem o snapshot usado nas listas das missoes. O trigger de
  -- mission_participants acima reconcilia check-ins e conclusoes historicas.
  UPDATE public.engagement_obrigacoes o
  SET nome = NEW.nome,
      telefone = NEW.telefone,
      cargo = CASE WHEN coalesce(NEW.is_voluntario, false)
        THEN 'voluntario' ELSE NEW.tipo::text END,
      regiao = coalesce(nullif(NEW.regiao, ''), nullif(NEW.cidade, ''), o.regiao),
      updated_at = now()
  WHERE o.client_id = NEW.client_id
    AND o.ref_id = NEW.id
    AND o.origem IN ('eleicao', 'eleicao_pessoas');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_eleicao_reconcile_missions_after_phone_change
  ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_reconcile_missions_after_phone_change
AFTER INSERT OR UPDATE OF telefone ON public.eleicao_pessoas
FOR EACH ROW
WHEN (NEW.telefone IS NOT NULL)
EXECUTE FUNCTION public.eleicao_reconcile_missions_after_phone_change();

REVOKE ALL ON FUNCTION public.eleicao_reconcile_missions_after_phone_change() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
