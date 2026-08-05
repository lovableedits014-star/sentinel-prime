-- 1. Reconectar os liderados ao novo registro do Avadilson na eleição
-- O novo ID do Avadilson na eleição (criado automaticamente na tentativa anterior) é 'febdd1a8-d189-4b72-89c4-e22934f4145f'
UPDATE public.eleicao_pessoas 
SET parent_id = 'febdd1a8-d189-4b72-89c4-e22934f4145f'
WHERE id IN (
  'f9391837-0152-4762-bbce-16cd27c3a9e6', -- Jose de Lima Correa
  '10b0f378-c852-4be3-b3fe-ec0b461de833', -- Silvia
  '410ed08a-6791-4c4a-a5dc-7cb5495c8a40', -- Janete França
  '478b39ef-465e-4cdc-8530-6d8461e87cf7', -- Rogerio
  '40f01a74-70a8-4654-812b-9b9fe21d62b7', -- Wanderberg da Silva
  '4e3b61f4-6f47-4cc2-9d59-221caf7a5f58', -- Aparecida Cardoso Maciel
  '3ab10d90-5eb9-44f7-96aa-6cf740d096c8', -- Marta Rufino
  '213a7eca-6419-43d6-9014-95ddb03d4063', -- Sheila Santos
  '53bd29ab-8b3a-43cb-8bb2-531495372d05'  -- Aricelia Santos
);

-- 2. Atualizar a função para o futuro (Proteção contra desvinculação)
CREATE OR REPLACE FUNCTION public.engagement_alterar_cargo(
  p_origem text, p_ref uuid, p_novo_cargo text,
  p_telefone text DEFAULT NULL, p_cidade text DEFAULT NULL, p_regiao text DEFAULT NULL,
  p_orfaos text DEFAULT 'avulso'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client uuid; v_nome text; v_tel text; v_cidade text; v_regiao text; v_endereco text;
  v_email text; v_sid uuid; v_dest text; v_new_id uuid; v_cargo_atual text;
  v_orfaos int := 0; v_kept boolean := false; v_motivo text; v_escopo text; v_valuable boolean := false;
  v_has_subordinates boolean := false;
BEGIN
  IF p_novo_cargo NOT IN ('funcionario','coordenador','lider','cabo','apoiador','eleitor','lideranca',
                          'jornalista','influenciador','voluntario','cidadao','liderado','indicado') THEN
    RAISE EXCEPTION 'Cargo inválido: %', p_novo_cargo;
  END IF;

  IF p_origem = 'pessoas' THEN
    SELECT client_id, nome, telefone, cidade, bairro, endereco, email, supporter_id, COALESCE(tipo_pessoa::text,'apoiador')
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM pessoas WHERE id = p_ref;
  ELSIF p_origem = 'funcionarios' THEN
    SELECT client_id, nome, telefone, cidade, bairro, endereco, email, supporter_id, 'funcionario'
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM funcionarios WHERE id = p_ref;
  ELSIF p_origem = 'eleicao_pessoas' THEN
    SELECT client_id, nome, telefone, cidade, COALESCE(NULLIF(regiao,''), bairro), endereco, email, supporter_id, tipo::text
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM eleicao_pessoas WHERE id = p_ref;
  ELSIF p_origem = 'contratados' THEN
    SELECT client_id, nome, telefone, cidade, bairro, endereco, email, supporter_id, 'contratado'
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM contratados WHERE id = p_ref;
  ELSIF p_origem = 'supporter_accounts' THEN
    SELECT client_id, name, phone, city, neighborhood, endereco, email, supporter_id, 'portal'
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM supporter_accounts WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;

  IF v_client IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_tel := COALESCE(NULLIF(TRIM(COALESCE(p_telefone,'')),''), v_tel);
  v_cidade := COALESCE(NULLIF(TRIM(COALESCE(p_cidade,'')),''), v_cidade);
  v_regiao := COALESCE(NULLIF(TRIM(COALESCE(p_regiao,'')),''), v_regiao);
  v_endereco := COALESCE(NULLIF(TRIM(COALESCE(v_endereco,'')),''), v_regiao, v_cidade);

  v_dest := CASE
    WHEN p_novo_cargo = 'funcionario' THEN 'funcionarios'
    WHEN p_novo_cargo IN ('coordenador','lider','cabo') THEN 'eleicao_pessoas'
    ELSE 'pessoas' END;

  IF v_dest IN ('funcionarios','eleicao_pessoas') AND length(public.only_digits(COALESCE(v_tel,''))) < 10 THEN
    RAISE EXCEPTION 'TELEFONE_OBRIGATORIO';
  END IF;

  v_sid := public.engagement_ensure_entity_supporter(p_origem, p_ref);

  -- Proteção de hierarquia na eleição (A GESTÃO DE ELEIÇÃO É PRESERVADA)
  IF p_origem = 'eleicao_pessoas' THEN
    SELECT EXISTS (SELECT 1 FROM eleicao_pessoas WHERE parent_id = p_ref) INTO v_has_subordinates;
    IF v_has_subordinates THEN
       v_valuable := true;
       v_motivo := 'Cadastro de Eleição preservado para manter a hierarquia de liderados.';
    END IF;
  END IF;

  IF v_dest = p_origem THEN
    IF v_dest = 'pessoas' THEN
      UPDATE pessoas SET tipo_pessoa = p_novo_cargo::tipo_pessoa,
        telefone = COALESCE(v_tel, telefone), cidade = COALESCE(v_cidade, cidade), bairro = COALESCE(v_regiao, bairro)
       WHERE id = p_ref;
    ELSIF v_dest = 'eleicao_pessoas' THEN
      UPDATE eleicao_pessoas SET tipo = p_novo_cargo::eleicao_tipo,
        telefone = COALESCE(v_tel, telefone), cidade = COALESCE(v_cidade, cidade),
        regiao = COALESCE(v_regiao, regiao)
       WHERE id = p_ref;
    END IF;
    v_new_id := p_ref;
  ELSE
    v_escopo := CASE WHEN public.normalize_person_name(COALESCE(v_cidade,'')) IN ('campo grande','') THEN 'campo_grande' ELSE 'interior' END;

    IF v_dest = 'funcionarios' THEN
      INSERT INTO funcionarios (client_id, nome, telefone, email, cidade, bairro, endereco, supporter_id, status)
      VALUES (v_client, v_nome, v_tel, v_email, v_cidade, v_regiao, v_endereco, v_sid, 'ativo')
      RETURNING id INTO v_new_id;
      
      -- Sincronizar eleicao_pessoas com o novo registro de funcionario_id
      IF p_origem = 'eleicao_pessoas' THEN
         UPDATE eleicao_pessoas SET funcionario_id = v_new_id WHERE id = p_ref;
      END IF;
    ELSIF v_dest = 'eleicao_pessoas' THEN
      INSERT INTO eleicao_pessoas (client_id, tipo, escopo, nome, telefone, email, cidade, regiao, bairro, endereco, supporter_id, created_by, funcionario_id)
      VALUES (v_client, p_novo_cargo::eleicao_tipo, v_escopo::eleicao_escopo, v_nome, v_tel, v_email,
              v_cidade, v_regiao, v_regiao, COALESCE(v_endereco, v_regiao, v_cidade, v_nome), v_sid, auth.uid(), 
              CASE WHEN p_origem = 'funcionarios' THEN p_ref ELSE NULL END)
      RETURNING id INTO v_new_id;
    ELSE
      INSERT INTO pessoas (client_id, nome, telefone, email, cidade, bairro, endereco, tipo_pessoa, supporter_id)
      VALUES (v_client, v_nome, v_tel, v_email, v_cidade, v_regiao, v_endereco, p_novo_cargo::tipo_pessoa, v_sid)
      RETURNING id INTO v_new_id;
    END IF;

    -- Lógica de preservação aprimorada (Garante que dados valiosos não sumam)
    IF NOT v_valuable THEN
        IF p_origem = 'eleicao_pessoas' THEN
          SELECT EXISTS (SELECT 1 FROM eleicao_indicados WHERE indicador_id = p_ref)
              OR EXISTS (SELECT 1 FROM eleicao_contato_lotes WHERE coordenador_id = p_ref)
              OR EXISTS (SELECT 1 FROM eleicao_contato_distribuicoes WHERE pessoa_id = p_ref OR coordenador_id = p_ref)
            INTO v_valuable;
          IF v_valuable THEN v_motivo := 'Cadastro mantido na Eleição por possuir histórico de indicações/lotes.';
          ELSE DELETE FROM eleicao_pessoas WHERE id = p_ref; END IF;
        ELSIF p_origem = 'pessoas' THEN
          SELECT EXISTS (SELECT 1 FROM interacoes_pessoa WHERE pessoa_id = p_ref)
              OR EXISTS (SELECT 1 FROM timeline_pessoa WHERE pessoa_id = p_ref)
              OR EXISTS (SELECT 1 FROM funcionario_referrals WHERE pessoa_id = p_ref)
              OR EXISTS (SELECT 1 FROM pessoas WHERE lider_id = p_ref)
            INTO v_valuable;
          IF v_valuable THEN v_motivo := 'Cadastro anterior preservado devido ao histórico acumulado.';
          ELSE
            DELETE FROM pessoa_social WHERE pessoa_id = p_ref;
            DELETE FROM pessoas_tags WHERE pessoa_id = p_ref;
            DELETE FROM pessoas WHERE id = p_ref;
          END IF;
        ELSIF p_origem = 'funcionarios' THEN
          SELECT EXISTS (SELECT 1 FROM funcionario_checkins WHERE funcionario_id = p_ref)
              OR EXISTS (SELECT 1 FROM acao_externa_funcionarios WHERE funcionario_id = p_ref)
              OR EXISTS (SELECT 1 FROM eleicao_pessoas WHERE funcionario_id = p_ref)
            INTO v_valuable;
          IF v_valuable THEN v_motivo := 'Funcionário mantido por possuir histórico operacional.';
          ELSE DELETE FROM funcionarios WHERE id = p_ref; END IF;
        ELSE
          v_motivo := 'Origem preservada (Portal/Contrato).';
        END IF;
    END IF;
    v_kept := v_motivo IS NOT NULL;
  END IF;

  INSERT INTO action_logs (client_id, user_id, action, status, details)
  VALUES (v_client, auth.uid(), 'engagement_alterar_cargo', 'success',
    jsonb_build_object('origem', p_origem, 'ref', p_ref, 'cargo_anterior', v_cargo_atual,
      'novo_cargo', p_novo_cargo, 'novo_id', v_new_id, 'destino', v_dest, 'origem_preservada', v_kept));

  RETURN jsonb_build_object('ok', true, 'origem', v_dest, 'ref_id', v_new_id, 'origem_preservada', v_kept, 'motivo', v_motivo);
END $$;