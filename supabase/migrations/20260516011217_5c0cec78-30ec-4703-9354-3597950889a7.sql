-- Onda 4 (parte 1): adiciona SET search_path = public às funções do projeto
-- que o linter sinalizou como "Function Search Path Mutable".
-- Rollback: redefinir as funções removendo a linha `SET search_path = public`.

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$ SELECT regexp_replace(coalesce(p,''), '\D', '', 'g') $function$;

CREATE OR REPLACE FUNCTION public.touch_eleicao_pessoas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  ph text := public.normalize_phone(NEW.telefone);
  nm text := lower(btrim(coalesce(NEW.nome,'')));
  v_func_id uuid;
BEGIN
  IF ph IS NULL OR length(ph) < 8 THEN RETURN NEW; END IF;

  SELECT id INTO v_func_id
    FROM public.funcionarios
   WHERE client_id = NEW.client_id
     AND public.normalize_phone(telefone) = ph
   LIMIT 1;

  IF v_func_id IS NOT NULL THEN
    IF NEW.funcionario_id IS NULL THEN
      NEW.funcionario_id := v_func_id;
    ELSIF NEW.funcionario_id <> v_func_id THEN
      RAISE EXCEPTION 'Telefone pertence a outro funcionário. Vincule ao funcionário correto.' USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tipo IN ('lider','cabo') AND EXISTS (
    SELECT 1 FROM public.eleicao_pessoas
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND tipo IN ('lider','cabo')
      AND public.normalize_phone(telefone) = ph
  ) THEN
    RAISE EXCEPTION 'Telefone já cadastrado para outro líder/cabo neste cliente.' USING ERRCODE = '23505';
  END IF;

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
END $function$;