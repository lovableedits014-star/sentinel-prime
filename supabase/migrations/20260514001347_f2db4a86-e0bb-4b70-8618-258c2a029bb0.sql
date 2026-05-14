
-- Padroniza telefones no formato 55DDDNNNNNNNNN (com 9) ao gravar.
CREATE TRIGGER trg_eleicao_pessoas_norm_phone
BEFORE INSERT OR UPDATE OF telefone ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_telefone();

-- Backfill em registros existentes
UPDATE public.eleicao_pessoas
SET telefone = public.normalize_br_phone(telefone)
WHERE telefone IS NOT NULL
  AND telefone IS DISTINCT FROM public.normalize_br_phone(telefone);

-- Normaliza telefone da secretaria também
CREATE OR REPLACE FUNCTION public.trg_normalize_secretaria_telefone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.secretaria_telefone IS NOT NULL THEN
    NEW.secretaria_telefone := public.normalize_br_phone(NEW.secretaria_telefone);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_eleicao_notif_config_norm_phone
BEFORE INSERT OR UPDATE OF secretaria_telefone ON public.eleicao_notif_config
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_secretaria_telefone();

UPDATE public.eleicao_notif_config
SET secretaria_telefone = public.normalize_br_phone(secretaria_telefone)
WHERE secretaria_telefone IS NOT NULL
  AND secretaria_telefone IS DISTINCT FROM public.normalize_br_phone(secretaria_telefone);
