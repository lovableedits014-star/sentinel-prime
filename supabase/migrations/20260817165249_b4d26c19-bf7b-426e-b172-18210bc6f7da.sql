
-- 1. Adicionar o status de contratação e data de confirmação
ALTER TABLE public.eleicao_pessoas 
ADD COLUMN IF NOT EXISTS status_contratacao TEXT DEFAULT 'pendente' CHECK (status_contratacao IN ('pendente', 'em_negociacao', 'confirmado')),
ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;

-- 2. Criar índices para performance nos filtros
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_status ON public.eleicao_pessoas(status_contratacao);

-- 3. Garantir privilégios
GRANT ALL ON public.eleicao_pessoas TO authenticated;
GRANT ALL ON public.eleicao_pessoas TO service_role;
