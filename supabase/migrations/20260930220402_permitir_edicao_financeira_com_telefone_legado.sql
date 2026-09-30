-- Permite editar valor, endereco ou vinculo de um cadastro legado que ja
-- compartilha telefone, sem liberar novas duplicidades nem troca de identidade.

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_phone text := public.tele_phone_key(NEW.telefone);
  v_cpf text := public.eleicao_cabo_import_digits(NEW.cpf);
  v_func_id uuid;
  v_duplicado record;
  v_excecao_autorizada boolean := false;
BEGIN
  IF NEW.arquivado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Um UPDATE pode mencionar estas colunas mesmo quando o usuario alterou
  -- somente o contrato. Nessa situacao, nao revalida dados legados imutaveis.
  IF TG_OP = 'UPDATE'
    AND NEW.nome IS NOT DISTINCT FROM OLD.nome
    AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
    AND NEW.cpf IS NOT DISTINCT FROM OLD.cpf
    AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
    AND NEW.telefone_compartilhado_autorizado IS NOT DISTINCT FROM
      OLD.telefone_compartilhado_autorizado
  THEN
    RETURN NEW;
  END IF;

  IF NEW.telefone_compartilhado_autorizado THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.eleicao_cabo_import_excecoes e
      JOIN public.eleicao_cabo_import_itens i
        ON i.id = e.item_id
       AND i.lote_id = e.lote_id
      WHERE e.client_id = NEW.client_id
        AND e.lote_id = NEW.importacao_lote_id
        AND e.tipo = 'telefone_compartilhado'
        AND (e.pessoa_criada_id IS NULL OR e.pessoa_criada_id = NEW.id)
        AND public.tele_phone_key(i.telefone_normalizado) = v_phone
        AND public.eleicao_nome_key(i.nome) = public.eleicao_nome_key(NEW.nome)
    ) INTO v_excecao_autorizada;

    IF NOT v_excecao_autorizada THEN
      RAISE EXCEPTION
        'Telefone compartilhado so pode ser autorizado pela ocorrencia da importacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT f.id
    INTO v_func_id
    FROM public.funcionarios f
    WHERE f.client_id = NEW.client_id
      AND public.tele_phone_key(f.telefone) = v_phone
    LIMIT 1;

    IF v_func_id IS NOT NULL THEN
      IF NEW.funcionario_id IS NULL THEN
        NEW.funcionario_id := v_func_id;
      ELSIF NEW.funcionario_id <> v_func_id THEN
        RAISE EXCEPTION
          'Telefone pertence a outro funcionario. Vincule ao funcionario correto.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  SELECT p.id, p.nome, p.tipo::text AS tipo
  INTO v_duplicado
  FROM public.eleicao_pessoas p
  WHERE p.client_id = NEW.client_id
    AND p.id <> NEW.id
    AND p.arquivado_em IS NULL
    AND (
      (
        NOT NEW.telefone_compartilhado_autorizado
        AND v_phone IS NOT NULL
        AND public.tele_phone_key(p.telefone) = v_phone
      )
      OR (
        length(v_cpf) = 11
        AND public.eleicao_cabo_import_digits(p.cpf) = v_cpf
      )
    )
  ORDER BY p.created_at
  LIMIT 1;

  IF v_duplicado.id IS NOT NULL THEN
    RAISE EXCEPTION
      'Pessoa ja cadastrada para % (%) neste cliente. CPF ou telefone duplicado.',
      v_duplicado.nome,
      v_duplicado.tipo
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.eleicao_pessoas_prevent_dup() IS
  'Bloqueia novas duplicidades, mas permite editar outros campos quando a identidade nao mudou.';

NOTIFY pgrst, 'reload schema';
