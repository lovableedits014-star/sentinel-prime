-- A tabela ja foi projetada para aceitar telefone opcional, mas alguns
-- ambientes mantiveram a restricao NOT NULL da definicao antiga. A autorizacao
-- continua sendo controlada exclusivamente pelo fluxo administrativo de
-- importacao e registrada em eleicao_cabo_import_excecoes.

ALTER TABLE public.eleicao_pessoas
  ALTER COLUMN telefone DROP NOT NULL;

COMMENT ON COLUMN public.eleicao_pessoas.telefone IS
  'Telefone opcional no armazenamento; cadastros sem telefone exigem autorizacao no fluxo de importacao de cabos.';

NOTIFY pgrst, 'reload schema';
