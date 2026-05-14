-- Coluna de favorito por região (apenas faz sentido para tipo='coordenador')
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS is_favorito_regiao boolean NOT NULL DEFAULT false;

-- No máximo 1 favorito por (client, escopo, regiao) entre coordenadores
CREATE UNIQUE INDEX IF NOT EXISTS eleicao_pessoas_um_favorito_por_regiao
  ON public.eleicao_pessoas (client_id, escopo, regiao)
  WHERE tipo = 'coordenador' AND is_favorito_regiao = true;

-- Trigger: 1º coordenador da região vira favorito automaticamente
CREATE OR REPLACE FUNCTION public.eleicao_auto_favorito_coord()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'coordenador' AND NEW.is_favorito_regiao = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.eleicao_pessoas
      WHERE client_id = NEW.client_id
        AND tipo = 'coordenador'
        AND escopo IS NOT DISTINCT FROM NEW.escopo
        AND regiao IS NOT DISTINCT FROM NEW.regiao
    ) THEN
      NEW.is_favorito_regiao := true;
    END IF;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_eleicao_auto_favorito_coord ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_auto_favorito_coord
  BEFORE INSERT ON public.eleicao_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.eleicao_auto_favorito_coord();

-- Backfill: marca o coordenador mais antigo de cada (client, escopo, regiao) como favorito
-- onde ainda não houver favorito.
WITH grupos AS (
  SELECT client_id, escopo, regiao
  FROM public.eleicao_pessoas
  WHERE tipo = 'coordenador'
  GROUP BY client_id, escopo, regiao
  HAVING bool_or(is_favorito_regiao) = false
), escolhidos AS (
  SELECT DISTINCT ON (p.client_id, p.escopo, p.regiao) p.id
  FROM public.eleicao_pessoas p
  JOIN grupos g
    ON g.client_id = p.client_id
   AND g.escopo IS NOT DISTINCT FROM p.escopo
   AND g.regiao IS NOT DISTINCT FROM p.regiao
  WHERE p.tipo = 'coordenador'
  ORDER BY p.client_id, p.escopo, p.regiao, p.created_at ASC
)
UPDATE public.eleicao_pessoas
SET is_favorito_regiao = true
WHERE id IN (SELECT id FROM escolhidos);