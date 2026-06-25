-- Tag por região + persistência da tag usada no lote
ALTER TABLE public.eleicao_regioes ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.eleicao_contato_lotes ADD COLUMN IF NOT EXISTS tag_regiao text;

-- Backfill: tag default a partir do label (primeiras letras, sem acento, máx 6)
UPDATE public.eleicao_regioes
SET tag = UPPER(
  SUBSTRING(
    REGEXP_REPLACE(
      TRANSLATE(label, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
      '[^A-Za-z0-9]', '', 'g'
    ),
    1, 6
  )
)
WHERE tag IS NULL OR tag = '';