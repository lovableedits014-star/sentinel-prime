
DO $$
DECLARE
  v_client uuid := '6879803f-fd2e-4a43-8d0d-4417e1b1fe15';
  v_coord_id uuid;
  v_lider_id uuid;
  v_regioes text[] := ARRAY['centro','segredo','prosa','bandeira','anhanduizinho','lagoa'];
  v_cidades text[] := ARRAY['Dourados','Ponta Porã','Corumbá','Três Lagoas','Naviraí'];
  v_coord_nomes text[] := ARRAY['Ricardo Almeida','Patrícia Souza','Fernando Lima','Juliana Castro','Marcelo Pereira'];
  v_lider_nomes text[] := ARRAY['Ana Ribeiro','Bruno Cardoso','Carla Mendes','Diego Araújo','Eduarda Pinto','Felipe Rocha','Gabriela Nunes','Henrique Dias','Isabela Freitas','João Vitor','Larissa Moreira','Mateus Silva','Natália Gomes','Otávio Barros','Priscila Tavares'];
  v_cabo_nomes text[] := ARRAY['Adriano','Beatriz','Caio','Daniela','Elaine','Fábio','Giovana','Hugo','Iara','Júlio','Karina','Lucas','Mariana','Nilton','Olívia','Paulo','Quésia','Rafael','Sabrina','Tiago','Ursula','Vinícius','Wesley','Xênia','Yasmin','Zeca'];
  i int; j int; k int; c int := 0;
  v_escopo eleicao_escopo; v_regiao eleicao_regiao; v_cidade text;
BEGIN
  FOR i IN 1..5 LOOP
    IF i <= 3 THEN
      v_escopo := 'campo_grande'::eleicao_escopo;
      v_regiao := v_regioes[i]::eleicao_regiao;
      v_cidade := NULL;
    ELSE
      v_escopo := 'interior'::eleicao_escopo;
      v_regiao := NULL;
      v_cidade := v_cidades[i-3];
    END IF;

    INSERT INTO eleicao_pessoas (client_id, tipo, escopo, regiao, cidade, nome, telefone, endereco, valor_contratacao)
    VALUES (v_client, 'coordenador'::eleicao_tipo, v_escopo, v_regiao, v_cidade, v_coord_nomes[i],
            '67 9' || lpad((90000000 + floor(random()*9999999)::int)::text, 8, '0'),
            'Rua Teste ' || i || ', Centro', 0)
    RETURNING id INTO v_coord_id;

    FOR j IN 1..3 LOOP
      INSERT INTO eleicao_pessoas (client_id, tipo, escopo, regiao, cidade, nome, telefone, endereco, parent_id, valor_contratacao)
      VALUES (v_client, 'lider'::eleicao_tipo, v_escopo, v_regiao, v_cidade, v_lider_nomes[(i-1)*3 + j],
              '67 9' || lpad((90000000 + floor(random()*9999999)::int)::text, 8, '0'),
              'Av. Líder ' || j || ', bairro ' || i, v_coord_id, 0)
      RETURNING id INTO v_lider_id;

      FOR k IN 1..5 LOOP
        c := c + 1;
        INSERT INTO eleicao_pessoas (client_id, tipo, escopo, regiao, cidade, nome, telefone, endereco, parent_id, valor_contratacao)
        VALUES (v_client, 'cabo'::eleicao_tipo, v_escopo, v_regiao, v_cidade,
                v_cabo_nomes[((c-1) % array_length(v_cabo_nomes,1)) + 1] || ' ' || c,
                '67 9' || lpad((90000000 + floor(random()*9999999)::int)::text, 8, '0'),
                'Rua Cabo ' || k || ', quadra ' || j, v_lider_id, 0);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
