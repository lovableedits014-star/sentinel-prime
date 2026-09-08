-- Dados operacionais usados no roteiro privado do motorista.
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS contato_nome text,
  ADD COLUMN IF NOT EXISTS contato_telefone text,
  ADD COLUMN IF NOT EXISTS endereco_completo text;

-- Preenche eventos já aprovados usando a solicitação vinculada.
UPDATE public.agenda_eventos e
SET contato_nome = coalesce(e.contato_nome, s.nome),
    contato_telefone = coalesce(e.contato_telefone, s.telefone),
    endereco_completo = coalesce(e.endereco_completo, s.local, e.local)
FROM public.agenda_solicitacoes s
WHERE e.solicitacao_id = s.id;
