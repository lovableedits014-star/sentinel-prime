-- Agenda publica do candidato, solicitacoes e historico operacional.

CREATE TABLE public.agenda_configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  public_enabled boolean NOT NULL DEFAULT true,
  titulo_publico text NOT NULL DEFAULT 'Agenda do candidato',
  descricao_publica text NOT NULL DEFAULT 'Acompanhe os compromissos e solicite um horario.',
  cor_primaria text NOT NULL DEFAULT '#2563eb',
  visualizacao_padrao text NOT NULL DEFAULT 'semana' CHECK (visualizacao_padrao IN ('semana','mes')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agenda_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  solicitacao_id uuid,
  titulo text NOT NULL CHECK (length(trim(titulo)) BETWEEN 3 AND 160),
  categoria text NOT NULL DEFAULT 'compromisso',
  descricao_publica text,
  observacoes_internas text,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  local text,
  visibilidade text NOT NULL DEFAULT 'resumido' CHECK (visibilidade IN ('publico','resumido','privado')),
  status text NOT NULL DEFAULT 'confirmado' CHECK (status IN ('rascunho','confirmado','concluido','cancelado')),
  cancelado_em timestamptz,
  cancelado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_cancelamento_interno text,
  mensagem_cancelamento_publica text,
  exibir_cancelamento_publico boolean NOT NULL DEFAULT false,
  manter_horario_bloqueado boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim_em > inicio_em)
);

CREATE TABLE public.agenda_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  protocolo text NOT NULL UNIQUE DEFAULT ('AG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 3 AND 120),
  telefone text NOT NULL,
  email text,
  assunto text NOT NULL CHECK (length(trim(assunto)) BETWEEN 3 AND 160),
  descricao text,
  inicio_solicitado_em timestamptz NOT NULL,
  fim_solicitado_em timestamptz NOT NULL,
  modalidade text NOT NULL DEFAULT 'presencial' CHECK (modalidade IN ('presencial','online','telefone')),
  local text,
  quantidade_pessoas integer CHECK (quantidade_pessoas IS NULL OR quantidade_pessoas > 0),
  status text NOT NULL DEFAULT 'em_analise' CHECK (status IN ('em_analise','aguardando_informacoes','horario_proposto','aprovada','recusada','cancelada_solicitante','cancelada_equipe','expirada')),
  motivo_decisao text,
  mensagem_resposta text,
  analisada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  analisada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim_solicitado_em > inicio_solicitado_em)
);

ALTER TABLE public.agenda_eventos
  ADD CONSTRAINT agenda_eventos_solicitacao_fk FOREIGN KEY (solicitacao_id)
  REFERENCES public.agenda_solicitacoes(id) ON DELETE SET NULL;

CREATE TABLE public.agenda_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  evento_id uuid REFERENCES public.agenda_eventos(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES public.agenda_solicitacoes(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agenda_eventos_periodo_idx ON public.agenda_eventos(client_id, inicio_em);
CREATE INDEX agenda_solicitacoes_status_idx ON public.agenda_solicitacoes(client_id, status, created_at DESC);

ALTER TABLE public.agenda_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team manage agenda config" ON public.agenda_configuracoes FOR ALL TO authenticated
  USING (public.reuniao_client_can_access(client_id)) WITH CHECK (public.reuniao_client_can_access(client_id));
CREATE POLICY "team manage agenda eventos" ON public.agenda_eventos FOR ALL TO authenticated
  USING (public.reuniao_client_can_access(client_id)) WITH CHECK (public.reuniao_client_can_access(client_id));
CREATE POLICY "team manage agenda solicitacoes" ON public.agenda_solicitacoes FOR ALL TO authenticated
  USING (public.reuniao_client_can_access(client_id)) WITH CHECK (public.reuniao_client_can_access(client_id));
CREATE POLICY "team view agenda historico" ON public.agenda_historico FOR SELECT TO authenticated
  USING (public.reuniao_client_can_access(client_id));
CREATE POLICY "team add agenda historico" ON public.agenda_historico FOR INSERT TO authenticated
  WITH CHECK (public.reuniao_client_can_access(client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_configuracoes, public.agenda_eventos, public.agenda_solicitacoes TO authenticated;
GRANT SELECT, INSERT ON public.agenda_historico TO authenticated;

CREATE TRIGGER trg_agenda_config_updated BEFORE UPDATE ON public.agenda_configuracoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agenda_eventos_updated BEFORE UPDATE ON public.agenda_eventos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agenda_solicitacoes_updated BEFORE UPDATE ON public.agenda_solicitacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.agenda_auditar_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.agenda_historico(client_id,evento_id,solicitacao_id,acao,user_id,detalhes)
  VALUES(NEW.client_id,NEW.id,NEW.solicitacao_id,
    CASE WHEN TG_OP='INSERT' THEN 'evento_criado' WHEN NEW.status='cancelado' AND OLD.status<>'cancelado' THEN 'evento_cancelado' WHEN OLD.status='cancelado' AND NEW.status<>'cancelado' THEN 'evento_restaurado' ELSE 'evento_atualizado' END,
    auth.uid(),jsonb_build_object('status',NEW.status,'inicio_em',NEW.inicio_em));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_agenda_evento_audit AFTER INSERT OR UPDATE ON public.agenda_eventos
FOR EACH ROW EXECUTE FUNCTION public.agenda_auditar_evento();

CREATE OR REPLACE FUNCTION public.agenda_publica(_slug text, _inicio timestamptz, _fim timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_client public.clients; v_cfg public.agenda_configuracoes; v_events jsonb;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE public_slug=_slug OR id::text=_slug LIMIT 1;
  IF v_client.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','nao_encontrada'); END IF;
  SELECT * INTO v_cfg FROM public.agenda_configuracoes WHERE client_id=v_client.id;
  IF v_cfg.id IS NULL OR NOT v_cfg.public_enabled THEN RETURN jsonb_build_object('ok',false,'motivo','indisponivel'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'titulo',CASE WHEN e.visibilidade='publico' THEN e.titulo WHEN e.visibilidade='resumido' THEN 'Compromisso agendado' ELSE 'Horario indisponivel' END,
    'inicio_em',e.inicio_em,'fim_em',e.fim_em,
    'local',CASE WHEN e.visibilidade='publico' THEN e.local ELSE NULL END,
    'descricao',CASE WHEN e.visibilidade='publico' THEN e.descricao_publica ELSE NULL END,
    'status',e.status,'mensagem_cancelamento',e.mensagem_cancelamento_publica
  ) ORDER BY e.inicio_em),'[]'::jsonb) INTO v_events
  FROM public.agenda_eventos e WHERE e.client_id=v_client.id AND e.inicio_em < _fim AND e.fim_em > _inicio
    AND e.status IN ('confirmado','concluido','cancelado')
    AND (e.status <> 'cancelado' OR e.exibir_cancelamento_publico=true)
    AND e.visibilidade <> 'privado';
  RETURN jsonb_build_object('ok',true,'client_id',v_client.id,'nome',v_client.name,'logo_url',v_client.logo_url,
    'titulo',v_cfg.titulo_publico,'descricao',v_cfg.descricao_publica,'cor',v_cfg.cor_primaria,
    'visualizacao_padrao',v_cfg.visualizacao_padrao,'eventos',v_events);
END $$;
REVOKE ALL ON FUNCTION public.agenda_publica(text,timestamptz,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.agenda_publica(text,timestamptz,timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.agenda_solicitar(_slug text,_nome text,_telefone text,_email text,_assunto text,_descricao text,_inicio timestamptz,_fim timestamptz,_modalidade text,_local text,_quantidade integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_client_id uuid; v_tel text; v_id uuid; v_protocolo text;
BEGIN
  SELECT c.id INTO v_client_id FROM public.clients c JOIN public.agenda_configuracoes a ON a.client_id=c.id
    WHERE (c.public_slug=_slug OR c.id::text=_slug) AND a.public_enabled=true;
  IF v_client_id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','indisponivel'); END IF;
  v_tel:=regexp_replace(coalesce(_telefone,''),'\D','','g');
  IF length(trim(coalesce(_nome,'')))<3 THEN RETURN jsonb_build_object('ok',false,'motivo','nome_invalido'); END IF;
  IF length(v_tel)<10 THEN RETURN jsonb_build_object('ok',false,'motivo','telefone_invalido'); END IF;
  IF length(trim(coalesce(_assunto,'')))<3 THEN RETURN jsonb_build_object('ok',false,'motivo','assunto_invalido'); END IF;
  IF _inicio <= now() OR _fim <= _inicio OR _fim > now()+interval '366 days' THEN RETURN jsonb_build_object('ok',false,'motivo','horario_invalido'); END IF;
  IF (SELECT count(*) FROM public.agenda_solicitacoes WHERE client_id=v_client_id AND telefone=v_tel AND created_at>now()-interval '1 hour')>=5
    THEN RETURN jsonb_build_object('ok',false,'motivo','limite_excedido'); END IF;
  INSERT INTO public.agenda_solicitacoes(client_id,nome,telefone,email,assunto,descricao,inicio_solicitado_em,fim_solicitado_em,modalidade,local,quantidade_pessoas)
  VALUES(v_client_id,trim(_nome),v_tel,nullif(trim(coalesce(_email,'')),''),trim(_assunto),nullif(trim(coalesce(_descricao,'')),''),_inicio,_fim,
    CASE WHEN _modalidade IN ('presencial','online','telefone') THEN _modalidade ELSE 'presencial' END,nullif(trim(coalesce(_local,'')),''),_quantidade)
  RETURNING id,protocolo INTO v_id,v_protocolo;
  INSERT INTO public.agenda_historico(client_id,solicitacao_id,acao,user_id) VALUES(v_client_id,v_id,'solicitacao_criada',NULL);
  RETURN jsonb_build_object('ok',true,'protocolo',v_protocolo);
END $$;
REVOKE ALL ON FUNCTION public.agenda_solicitar(text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.agenda_solicitar(text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_solicitacoes;
