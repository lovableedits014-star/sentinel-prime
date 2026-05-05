-- Limpa dados antigos
DELETE FROM public.contratado_checkins;
DELETE FROM public.contratado_indicados;
DELETE FROM public.contratados;

-- Tipos
DO $$ BEGIN
  CREATE TYPE public.eleicao_tipo AS ENUM ('coordenador', 'lider', 'cabo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.eleicao_escopo AS ENUM ('campo_grande', 'interior');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.eleicao_regiao AS ENUM ('centro','segredo','prosa','bandeira','anhanduizinho','lagoa','moreninha');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela
CREATE TABLE IF NOT EXISTS public.eleicao_pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo public.eleicao_tipo NOT NULL,
  escopo public.eleicao_escopo NOT NULL,
  regiao public.eleicao_regiao,
  cidade text,
  nome text NOT NULL,
  telefone text NOT NULL,
  endereco text NOT NULL,
  parent_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacoes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eleicao_escopo_localizacao CHECK (
    (escopo = 'campo_grande' AND regiao IS NOT NULL) OR
    (escopo = 'interior' AND cidade IS NOT NULL AND length(trim(cidade)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_client ON public.eleicao_pessoas(client_id);
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_parent ON public.eleicao_pessoas(parent_id);
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_tipo ON public.eleicao_pessoas(client_id, tipo);
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_user ON public.eleicao_pessoas(user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_eleicao_pessoas()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_eleicao_pessoas ON public.eleicao_pessoas;
CREATE TRIGGER trg_touch_eleicao_pessoas
BEFORE UPDATE ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.touch_eleicao_pessoas();

-- RLS
ALTER TABLE public.eleicao_pessoas ENABLE ROW LEVEL SECURITY;

-- Helper: client_id pertence ao usuário (dono ou team_member ativo)?
CREATE OR REPLACE FUNCTION public.user_can_access_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members t
    WHERE t.client_id = _client_id AND t.user_id = auth.uid() AND t.status = 'active'
  );
$$;

DROP POLICY IF EXISTS "team can view eleicao" ON public.eleicao_pessoas;
CREATE POLICY "team can view eleicao" ON public.eleicao_pessoas
FOR SELECT TO authenticated
USING (public.user_can_access_client(client_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "team can insert eleicao" ON public.eleicao_pessoas;
CREATE POLICY "team can insert eleicao" ON public.eleicao_pessoas
FOR INSERT TO authenticated
WITH CHECK (public.user_can_access_client(client_id));

DROP POLICY IF EXISTS "team can update eleicao" ON public.eleicao_pessoas;
CREATE POLICY "team can update eleicao" ON public.eleicao_pessoas
FOR UPDATE TO authenticated
USING (public.user_can_access_client(client_id))
WITH CHECK (public.user_can_access_client(client_id));

DROP POLICY IF EXISTS "team can delete eleicao" ON public.eleicao_pessoas;
CREATE POLICY "team can delete eleicao" ON public.eleicao_pessoas
FOR DELETE TO authenticated
USING (public.user_can_access_client(client_id));