-- Fase A: Envio em massa de cobrança de indicações
-- 1) Permitir mensagem personalizada por item (cada indicador recebe seu próprio link/contagem)
ALTER TABLE public.whatsapp_dispatch_items
  ADD COLUMN IF NOT EXISTS mensagem_personalizada text;

-- 2) Log opcional de cobrança por indicador (usado na Fase B/C para anti-reenvio)
CREATE TABLE IF NOT EXISTS public.eleicao_cobranca_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  indicador_id uuid NOT NULL,
  dispatch_id uuid,
  dispatch_item_id uuid,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eleicao_cobranca_log_client_indicador
  ON public.eleicao_cobranca_log (client_id, indicador_id, enviado_em DESC);

GRANT SELECT, INSERT ON public.eleicao_cobranca_log TO authenticated;
GRANT ALL ON public.eleicao_cobranca_log TO service_role;

ALTER TABLE public.eleicao_cobranca_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client members can read cobranca log"
  ON public.eleicao_cobranca_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = eleicao_cobranca_log.client_id
        AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Service role inserts cobranca log"
  ON public.eleicao_cobranca_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 3) View com última cobrança por indicador (para painel e anti-reenvio)
DROP VIEW IF EXISTS public.v_eleicao_indicadores_cobranca;
CREATE VIEW public.v_eleicao_indicadores_cobranca AS
SELECT p.id AS indicador_id,
       p.client_id,
       p.nome,
       p.tipo,
       p.telefone,
       p.regiao,
       p.cidade,
       p.parent_id,
       t.id AS token_id,
       t.token,
       COALESCE(t.total_indicacoes, 0) AS total_indicacoes,
       CASE p.tipo
         WHEN 'coordenador'::eleicao_tipo THEN COALESCE(c.meta_coordenador, 30)
         WHEN 'lider'::eleicao_tipo THEN COALESCE(c.meta_lider, 30)
         WHEN 'cabo'::eleicao_tipo THEN COALESCE(c.meta_cabo, 5)
         ELSE NULL::integer
       END AS meta,
       t.ultimo_acesso_em,
       (SELECT max(l.enviado_em) FROM public.eleicao_cobranca_log l WHERE l.indicador_id = p.id) AS ultima_cobranca_em,
       (SELECT count(*) FROM public.eleicao_cobranca_log l WHERE l.indicador_id = p.id) AS cobrancas_enviadas
FROM eleicao_pessoas p
LEFT JOIN eleicao_indicacao_tokens t
  ON t.indicador_id = p.id AND t.revoked_at IS NULL
LEFT JOIN eleicao_indicacao_config c
  ON c.client_id = p.client_id;

GRANT SELECT ON public.v_eleicao_indicadores_cobranca TO authenticated;
GRANT SELECT ON public.v_eleicao_indicadores_cobranca TO service_role;