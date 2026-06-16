
-- 1. Tabela de candidatos parceiros (federais em dobradinha)
CREATE TABLE public.eleicao_candidatos_parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text NOT NULL DEFAULT 'Deputado Federal',
  partido text,
  numero_urna text,
  foto_url text,
  cor text NOT NULL DEFAULT '#3b82f6',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_candidatos_parceiros TO authenticated;
GRANT ALL ON public.eleicao_candidatos_parceiros TO service_role;

ALTER TABLE public.eleicao_candidatos_parceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage parceiros"
ON public.eleicao_candidatos_parceiros FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "Team members can view parceiros"
ON public.eleicao_candidatos_parceiros FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = eleicao_candidatos_parceiros.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Team members can insert parceiros"
ON public.eleicao_candidatos_parceiros FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = eleicao_candidatos_parceiros.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Team members can update parceiros"
ON public.eleicao_candidatos_parceiros FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = eleicao_candidatos_parceiros.client_id AND tm.user_id = auth.uid()));

CREATE TRIGGER trg_parceiros_updated_at
BEFORE UPDATE ON public.eleicao_candidatos_parceiros
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_parceiros_client ON public.eleicao_candidatos_parceiros(client_id, ativo);

-- 2. Colunas de dobradinha em eleicao_pessoas
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN parceiro_id uuid REFERENCES public.eleicao_candidatos_parceiros(id) ON DELETE SET NULL,
  ADD COLUMN rateio_estadual numeric NOT NULL DEFAULT 100,
  ADD COLUMN rateio_parceiro numeric NOT NULL DEFAULT 0;

CREATE INDEX idx_eleicao_pessoas_parceiro ON public.eleicao_pessoas(parceiro_id) WHERE parceiro_id IS NOT NULL;

-- 3. Trigger de validação: soma = 100 e consistência com parceiro_id
CREATE OR REPLACE FUNCTION public.validate_dobradinha_rateio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rateio_estadual < 0 OR NEW.rateio_estadual > 100
     OR NEW.rateio_parceiro < 0 OR NEW.rateio_parceiro > 100 THEN
    RAISE EXCEPTION 'Rateio deve estar entre 0 e 100';
  END IF;

  IF ROUND((NEW.rateio_estadual + NEW.rateio_parceiro)::numeric, 2) <> 100 THEN
    RAISE EXCEPTION 'Soma dos rateios deve ser 100 (atual: %)', NEW.rateio_estadual + NEW.rateio_parceiro;
  END IF;

  IF NEW.parceiro_id IS NULL AND NEW.rateio_parceiro > 0 THEN
    RAISE EXCEPTION 'Não é possível definir rateio para parceiro sem selecionar o candidato parceiro';
  END IF;

  IF NEW.parceiro_id IS NOT NULL AND NEW.rateio_parceiro = 0 THEN
    -- parceiro vinculado mas sem custos é permitido (vínculo simbólico)
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_dobradinha
BEFORE INSERT OR UPDATE OF rateio_estadual, rateio_parceiro, parceiro_id
ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.validate_dobradinha_rateio();
