ALTER TABLE public.eleicao_pessoas 
ADD COLUMN IF NOT EXISTS participou_reuniao BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reuniao_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pre_selecionado BOOLEAN DEFAULT FALSE;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_participou_reuniao ON public.eleicao_pessoas(participou_reuniao);
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_pre_selecionado ON public.eleicao_pessoas(pre_selecionado);

-- Grant access (Standard block for public tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_pessoas TO authenticated;
GRANT ALL ON public.eleicao_pessoas TO service_role;
