ALTER TABLE public.telemarketing_call_log DROP CONSTRAINT IF EXISTS telemarketing_call_log_tabela_check;
ALTER TABLE public.telemarketing_call_log ADD CONSTRAINT telemarketing_call_log_tabela_check CHECK (tabela = ANY (ARRAY['contratados','contratado_indicados','contatos_avulsos','eleicao_indicados','eleicao_pessoas']));

ALTER TABLE public.telemarketing_call_assignments DROP CONSTRAINT IF EXISTS telemarketing_call_assignments_tabela_check;
ALTER TABLE public.telemarketing_call_assignments ADD CONSTRAINT telemarketing_call_assignments_tabela_check CHECK (tabela = ANY (ARRAY['contratados','contratado_indicados','contatos_avulsos','eleicao_indicados','eleicao_pessoas']));