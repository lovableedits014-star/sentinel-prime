
-- 1) Backfill: preencher cidade "Campo Grande" para todos os cadastros sem cidade.
-- Esses cadastros vieram de fluxos antigos de Campo Grande (escopo=campo_grande).
UPDATE public.eleicao_pessoas
SET cidade = 'Campo Grande',
    lat = NULL,
    lng = NULL,
    geocode_status = NULL,
    geocoded_at = NULL,
    geocode_endereco_hash = NULL
WHERE (cidade IS NULL OR btrim(cidade) = '');

-- 2) Trigger: limpar geocodificação quando endereço mudar
CREATE OR REPLACE FUNCTION public.eleicao_pessoas_reset_geocode_on_address_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.rua,'')     IS DISTINCT FROM COALESCE(OLD.rua,'')
    OR COALESCE(NEW.numero,'')  IS DISTINCT FROM COALESCE(OLD.numero,'')
    OR COALESCE(NEW.bairro,'')  IS DISTINCT FROM COALESCE(OLD.bairro,'')
    OR COALESCE(NEW.cidade,'')  IS DISTINCT FROM COALESCE(OLD.cidade,'')
    OR COALESCE(NEW.endereco,'') IS DISTINCT FROM COALESCE(OLD.endereco,'')
    THEN
      NEW.lat := NULL;
      NEW.lng := NULL;
      NEW.geocode_status := NULL;
      NEW.geocoded_at := NULL;
      NEW.geocode_endereco_hash := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_pessoas_reset_geocode ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_pessoas_reset_geocode
BEFORE UPDATE ON public.eleicao_pessoas
FOR EACH ROW
EXECUTE FUNCTION public.eleicao_pessoas_reset_geocode_on_address_change();
