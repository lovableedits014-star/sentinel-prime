
-- 1. Tabela para armazenar as listas importadas
CREATE TABLE IF NOT EXISTS public.telemarketing_listas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    campanha_id uuid NOT NULL REFERENCES public.telemarketing_campanhas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    descricao text,
    total_contatos integer DEFAULT 0,
    status text DEFAULT 'ativa',
    criado_em timestamptz DEFAULT now(),
    arquivado_em timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemarketing_listas TO authenticated;
GRANT ALL ON public.telemarketing_listas TO service_role;

ALTER TABLE public.telemarketing_listas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listas_client_read" ON public.telemarketing_listas
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

-- 2. Vincular contatos avulsos às listas
ALTER TABLE public.telemarketing_contatos_avulsos 
    ADD COLUMN IF NOT EXISTS lista_id uuid REFERENCES public.telemarketing_listas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tele_avulsos_lista 
    ON public.telemarketing_contatos_avulsos(client_id, lista_id);

-- 3. Rastrear qual lista o operador está trabalhando no momento
ALTER TABLE public.telemarketing_operadores
    ADD COLUMN IF NOT EXISTS lista_atual_id uuid REFERENCES public.telemarketing_listas(id) ON DELETE SET NULL;
