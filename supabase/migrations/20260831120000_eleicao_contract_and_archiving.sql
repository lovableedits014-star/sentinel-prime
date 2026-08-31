-- Regra operacional da eleição:
--   remunerado com valor > 0 = contratado (contrato assinado no escritório)
--   remunerado com valor = 0 = sem contrato
--   voluntário = sem remuneração e fora das pendências de contrato
-- Arquivamento é reversível e nunca exclui o cadastro.

ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arquivamento_motivo text,
  ADD COLUMN IF NOT EXISTS arquivamento_lote_id uuid;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_situacao_contrato
  ON public.eleicao_pessoas (client_id, is_voluntario, valor_contratacao)
  WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_arquivadas
  ON public.eleicao_pessoas (client_id, arquivado_em)
  WHERE arquivado_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_arquivamento_lote
  ON public.eleicao_pessoas (client_id, arquivamento_lote_id)
  WHERE arquivamento_lote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eleicao_sync_situacao_contrato()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_voluntario, false) THEN
    NEW.valor_contratacao := 0;
    NEW.status_contratacao := 'confirmado';
    IF NEW.confirmado_em IS NULL THEN NEW.confirmado_em := now(); END IF;
  ELSIF COALESCE(NEW.valor_contratacao, 0) > 0 THEN
    NEW.status_contratacao := 'confirmado';
    IF OLD IS NULL OR COALESCE(OLD.valor_contratacao, 0) <= 0 OR OLD.is_voluntario THEN
      NEW.confirmado_em := now();
    ELSIF NEW.confirmado_em IS NULL THEN
      NEW.confirmado_em := now();
    END IF;
  ELSE
    NEW.valor_contratacao := 0;
    NEW.status_contratacao := 'pendente';
    NEW.confirmado_em := NULL;
  END IF;

  IF NEW.arquivado_em IS NULL THEN
    NEW.arquivado_por := NULL;
    NEW.arquivamento_motivo := NULL;
    NEW.arquivamento_lote_id := NULL;
  ELSIF NULLIF(btrim(COALESCE(NEW.arquivamento_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do arquivamento.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_sync_situacao_contrato ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_sync_situacao_contrato
  BEFORE INSERT OR UPDATE OF valor_contratacao, is_voluntario, arquivado_em, arquivamento_motivo
  ON public.eleicao_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.eleicao_sync_situacao_contrato();

-- Backfill determinístico conforme a regra operacional aprovada.
UPDATE public.eleicao_pessoas
SET valor_contratacao = CASE WHEN is_voluntario THEN 0 ELSE COALESCE(valor_contratacao, 0) END,
    status_contratacao = CASE
      WHEN is_voluntario OR COALESCE(valor_contratacao, 0) > 0 THEN 'confirmado'
      ELSE 'pendente'
    END,
    confirmado_em = CASE
      WHEN is_voluntario OR COALESCE(valor_contratacao, 0) > 0 THEN COALESCE(confirmado_em, updated_at, created_at, now())
      ELSE NULL
    END;

COMMENT ON COLUMN public.eleicao_pessoas.arquivado_em IS
  'Arquivamento reversível. Nulo significa cadastro ativo.';
COMMENT ON COLUMN public.eleicao_pessoas.arquivamento_lote_id IS
  'Identifica uma operação em massa para permitir reversão segura do lote.';
COMMENT ON COLUMN public.eleicao_pessoas.valor_contratacao IS
  'Na Eleição, valor maior que zero para não voluntário significa contrato assinado.';
