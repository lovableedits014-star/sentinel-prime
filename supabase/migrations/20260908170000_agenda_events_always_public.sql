-- A agenda é usada para divulgação: todos os eventos exibem título, horário,
-- local público e descrição. Dados internos/contato continuam fora da RPC pública.
UPDATE public.agenda_eventos SET visibilidade='publico' WHERE visibilidade<>'publico';

ALTER TABLE public.agenda_eventos ALTER COLUMN visibilidade SET DEFAULT 'publico';

CREATE OR REPLACE FUNCTION public.agenda_force_public_visibility()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.visibilidade:='publico';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agenda_force_public_visibility ON public.agenda_eventos;
CREATE TRIGGER trg_agenda_force_public_visibility
BEFORE INSERT OR UPDATE OF visibilidade ON public.agenda_eventos
FOR EACH ROW EXECUTE FUNCTION public.agenda_force_public_visibility();
