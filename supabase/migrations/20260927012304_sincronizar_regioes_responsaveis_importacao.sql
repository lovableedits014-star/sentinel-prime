-- Alguns responsaveis de Campo Grande possuem regioes legitimas criadas antes
-- do catalogo eleicao_regioes (ou rebatizadas diretamente no cadastro). A
-- importacao herda essa regiao e validacoes que consultam o catalogo recusam o
-- lote, embora o proprio responsavel continue valido.
--
-- Torna o catalogo coerente com os cadastros existentes. Isso cobre regioes
-- personalizadas, como "anhandui" e grupos de lideranca, sem manter uma lista
-- fixa de nomes no codigo.
INSERT INTO public.eleicao_regioes (
  client_id,
  value,
  label,
  ordem,
  ativo,
  escopo
)
SELECT
  p.client_id,
  btrim(p.regiao),
  pg_catalog.initcap(pg_catalog.replace(btrim(p.regiao), '_', ' ')),
  coalesce(maximo.maior_ordem, 0)
    + row_number() OVER (PARTITION BY p.client_id ORDER BY p.regiao)::integer,
  true,
  'campo_grande'
FROM (
  SELECT DISTINCT client_id, btrim(regiao) AS regiao
  FROM public.eleicao_pessoas
  WHERE escopo::text = 'campo_grande'
    AND arquivado_em IS NULL
    AND nullif(btrim(coalesce(regiao, '')), '') IS NOT NULL
) p
LEFT JOIN LATERAL (
  SELECT max(r.ordem) AS maior_ordem
  FROM public.eleicao_regioes r
  WHERE r.client_id = p.client_id
    AND r.escopo = 'campo_grande'
) maximo ON true
ON CONFLICT (client_id, escopo, value) DO UPDATE
SET ativo = true;

NOTIFY pgrst, 'reload schema';
