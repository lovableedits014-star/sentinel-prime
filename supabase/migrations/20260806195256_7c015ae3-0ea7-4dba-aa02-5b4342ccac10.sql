-- 1. Identificar duplicatas e manter apenas uma (a vinculada se houver)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT telefone, client_id
        FROM public.eleicao_pessoas
        GROUP BY telefone, client_id
        HAVING COUNT(*) > 1
    ) LOOP
        -- Remove a duplicata que não tem parent_id (avulsa) se houver uma com parent_id
        IF EXISTS (SELECT 1 FROM public.eleicao_pessoas WHERE telefone = r.telefone AND client_id = r.client_id AND parent_id IS NOT NULL) THEN
            DELETE FROM public.eleicao_pessoas 
            WHERE telefone = r.telefone 
            AND client_id = r.client_id 
            AND parent_id IS NULL;
        END IF;
        
        -- Se ainda sobrar mais de uma (ex: duas vinculadas ou duas avulsas), remove as mais recentes mantendo a primeira
        DELETE FROM public.eleicao_pessoas
        WHERE id IN (
            SELECT id
            FROM (
                SELECT id, row_number() OVER (PARTITION BY telefone, client_id ORDER BY created_at ASC) as rn
                FROM public.eleicao_pessoas
                WHERE telefone = r.telefone AND client_id = r.client_id
            ) t
            WHERE rn > 1
        );
    END LOOP;
END $$;

-- 2. Criar índice único para impedir novas duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_eleicao_pessoas_unique_phone ON public.eleicao_pessoas (client_id, telefone);

-- 3. GRANT para garantir acesso (boa prática)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_pessoas TO authenticated;
GRANT ALL ON public.eleicao_pessoas TO service_role;