-- 1) Data fix: mover descendentes do Jaime pra região Bandeira
WITH RECURSIVE descendentes AS (
  SELECT id FROM public.eleicao_pessoas WHERE parent_id = '01756eb0-0691-4359-be68-73b2cc135ab4'
  UNION ALL
  SELECT p.id FROM public.eleicao_pessoas p JOIN descendentes d ON p.parent_id = d.id
)
UPDATE public.eleicao_pessoas
SET regiao = 'bandeira', escopo = 'campo_grande'
WHERE id IN (SELECT id FROM descendentes);

-- 2) Trigger de propagação: ao mudar regiao/escopo/cidade de um pai, replicar em todos os descendentes.
CREATE OR REPLACE FUNCTION public.eleicao_pessoas_propagate_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Evita cascata infinita: propaga apenas quando a mudança veio de fora (profundidade 0).
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.regiao IS DISTINCT FROM OLD.regiao
     OR NEW.escopo IS DISTINCT FROM OLD.escopo
     OR NEW.cidade IS DISTINCT FROM OLD.cidade THEN
    WITH RECURSIVE desc_tree AS (
      SELECT id FROM public.eleicao_pessoas WHERE parent_id = NEW.id
      UNION ALL
      SELECT p.id FROM public.eleicao_pessoas p JOIN desc_tree d ON p.parent_id = d.id
    )
    UPDATE public.eleicao_pessoas
    SET regiao = NEW.regiao,
        escopo = NEW.escopo,
        cidade = NEW.cidade
    WHERE id IN (SELECT id FROM desc_tree);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_propagate_scope ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_propagate_scope
AFTER UPDATE OF regiao, escopo, cidade ON public.eleicao_pessoas
FOR EACH ROW
EXECUTE FUNCTION public.eleicao_pessoas_propagate_scope();