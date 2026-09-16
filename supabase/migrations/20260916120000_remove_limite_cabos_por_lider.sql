-- A estrutura da campanha aceita cabos ligados diretamente a coordenadores ou
-- a lideres. A quantidade de cabos por responsavel passa a ser ilimitada.
DROP TRIGGER IF EXISTS trg_eleicao_limite_cabos_lider ON public.eleicao_pessoas;
DROP FUNCTION IF EXISTS public.eleicao_validar_limite_cabos_lider();
