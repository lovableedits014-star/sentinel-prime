CREATE OR REPLACE FUNCTION public.verify_telemarketing_operador(_client_id uuid, _nome text, _senha text)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_op public.telemarketing_operadores%ROWTYPE; v_ok boolean;
BEGIN
  SELECT * INTO v_op FROM public.telemarketing_operadores o
   WHERE o.client_id=_client_id AND o.nome=_nome AND o.ativo=true;

  IF v_op.id IS NULL THEN
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento, detalhe)
    VALUES (_client_id, _nome, 'login_falha', jsonb_build_object('motivo','operador_inexistente'));
    RETURN;
  END IF;

  IF v_op.locked_until IS NOT NULL AND v_op.locked_until > now() THEN
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento, detalhe)
    VALUES (_client_id, _nome, 'login_bloqueado', jsonb_build_object('locked_until', v_op.locked_until));
    RAISE EXCEPTION 'Operador bloqueado até %', v_op.locked_until USING ERRCODE='42501';
  END IF;

  v_ok := v_op.senha = extensions.crypt(_senha, v_op.senha);

  IF v_ok THEN
    UPDATE public.telemarketing_operadores o
       SET failed_attempts=0, locked_until=NULL, last_login_at=now()
     WHERE o.id=v_op.id;
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento)
    VALUES (_client_id, _nome, 'login_ok');
    RETURN QUERY SELECT v_op.id AS id, v_op.nome AS nome;
  ELSE
    UPDATE public.telemarketing_operadores o
       SET failed_attempts = COALESCE(o.failed_attempts,0)+1,
           locked_until = CASE WHEN COALESCE(o.failed_attempts,0)+1 >= 5 THEN now() + interval '15 minutes' ELSE o.locked_until END
     WHERE o.id=v_op.id;
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento, detalhe)
    VALUES (_client_id, _nome, 'login_falha',
            jsonb_build_object('failed_attempts', COALESCE(v_op.failed_attempts,0)+1));
    RETURN;
  END IF;
END;
$function$;