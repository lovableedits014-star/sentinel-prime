ALTER TABLE public.eleicao_pessoas ALTER COLUMN regiao TYPE text USING regiao::text;
DROP TYPE IF EXISTS public.eleicao_regiao;