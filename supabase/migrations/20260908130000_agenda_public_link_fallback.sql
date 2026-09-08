-- Garante link publico para clientes antigos e novos que ainda nao tenham slug.
-- O UUID e um identificador compartilhavel, nao concede acesso a dados privados.
UPDATE public.clients SET public_slug=id::text WHERE public_slug IS NULL OR trim(public_slug)='';

CREATE OR REPLACE FUNCTION public.ensure_client_public_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.public_slug IS NULL OR trim(NEW.public_slug)='' THEN NEW.public_slug:=NEW.id::text; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_client_public_slug ON public.clients;
CREATE TRIGGER trg_ensure_client_public_slug BEFORE INSERT OR UPDATE OF public_slug ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.ensure_client_public_slug();

-- As RPCs aceitam tanto um slug amigavel quanto o UUID, mantendo links antigos válidos.
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
    'inicio_em',e.inicio_em,'fim_em',e.fim_em,'local',CASE WHEN e.visibilidade='publico' THEN e.local ELSE NULL END,
    'descricao',CASE WHEN e.visibilidade='publico' THEN e.descricao_publica ELSE NULL END,'status',e.status,
    'mensagem_cancelamento',e.mensagem_cancelamento_publica) ORDER BY e.inicio_em),'[]'::jsonb) INTO v_events
  FROM public.agenda_eventos e WHERE e.client_id=v_client.id AND e.inicio_em<_fim AND e.fim_em>_inicio
    AND e.status IN ('confirmado','concluido','cancelado') AND (e.status<>'cancelado' OR e.exibir_cancelamento_publico=true) AND e.visibilidade<>'privado';
  RETURN jsonb_build_object('ok',true,'client_id',v_client.id,'nome',v_client.name,'logo_url',v_client.logo_url,
    'titulo',v_cfg.titulo_publico,'descricao',v_cfg.descricao_publica,'cor',v_cfg.cor_primaria,
    'visualizacao_padrao',v_cfg.visualizacao_padrao,'eventos',v_events);
END $$;
REVOKE ALL ON FUNCTION public.agenda_publica(text,timestamptz,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.agenda_publica(text,timestamptz,timestamptz) TO anon,authenticated;

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
  IF _inicio<=now() OR _fim<=_inicio OR _fim>now()+interval '366 days' THEN RETURN jsonb_build_object('ok',false,'motivo','horario_invalido'); END IF;
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
GRANT EXECUTE ON FUNCTION public.agenda_solicitar(text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer) TO anon,authenticated;
