CREATE OR REPLACE FUNCTION public.normalize_phone(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(coalesce(p,''), '\D', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ph text := public.normalize_phone(NEW.telefone);
  nm text := lower(btrim(coalesce(NEW.nome,'')));
BEGIN
  IF ph IS NULL OR length(ph) < 8 THEN RETURN NEW; END IF;

  -- Same phone already used by lider/cabo in this client
  IF NEW.tipo IN ('lider','cabo') AND EXISTS (
    SELECT 1 FROM public.eleicao_pessoas
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND tipo IN ('lider','cabo')
      AND public.normalize_phone(telefone) = ph
  ) THEN
    RAISE EXCEPTION 'Telefone já cadastrado para outro líder/cabo neste cliente.' USING ERRCODE = '23505';
  END IF;

  -- Same name + phone in this client (any tipo)
  IF EXISTS (
    SELECT 1 FROM public.eleicao_pessoas
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND lower(btrim(nome)) = nm
      AND public.normalize_phone(telefone) = ph
  ) THEN
    RAISE EXCEPTION 'Já existe um cadastro com este nome e telefone neste cliente.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eleicao_pessoas_prevent_dup ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_pessoas_prevent_dup
BEFORE INSERT OR UPDATE OF nome, telefone, tipo ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.eleicao_pessoas_prevent_dup();