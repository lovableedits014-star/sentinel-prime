ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS eleicao_pessoas_funcionario_role_unique
  ON public.eleicao_pessoas(client_id, funcionario_id, tipo)
  WHERE funcionario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS eleicao_pessoas_funcionario_id_idx
  ON public.eleicao_pessoas(funcionario_id) WHERE funcionario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  ph text := public.normalize_phone(NEW.telefone);
  nm text := lower(btrim(coalesce(NEW.nome,'')));
  v_func_id uuid;
BEGIN
  IF ph IS NULL OR length(ph) < 8 THEN RETURN NEW; END IF;

  -- Se o telefone já pertence a um funcionário do mesmo client,
  -- exigimos vínculo (funcionario_id) em vez de bloquear o cadastro.
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
    -- Vínculo válido — pula checagens de duplicação por telefone abaixo.
    RETURN NEW;
  END IF;

  -- Mesmo telefone já usado por outro líder/cabo neste client
  IF NEW.tipo IN ('lider','cabo') AND EXISTS (
    SELECT 1 FROM public.eleicao_pessoas
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND tipo IN ('lider','cabo')
      AND public.normalize_phone(telefone) = ph
  ) THEN
    RAISE EXCEPTION 'Telefone já cadastrado para outro líder/cabo neste cliente.' USING ERRCODE = '23505';
  END IF;

  -- Mesmo nome + telefone neste client (qualquer tipo)
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