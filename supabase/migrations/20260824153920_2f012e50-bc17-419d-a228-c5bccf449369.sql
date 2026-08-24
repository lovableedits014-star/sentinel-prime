ALTER TABLE public.eleicao_indicados DROP CONSTRAINT IF EXISTS eleicao_indicados_origem_check;
ALTER TABLE public.eleicao_indicados ADD CONSTRAINT eleicao_indicados_origem_check
  CHECK (origem = ANY (ARRAY['link_publico','manual_interno','import_csv','importacao_planilha']));