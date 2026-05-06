
DO $$
DECLARE
  v_client uuid := '6879803f-fd2e-4a43-8d0d-4417e1b1fe15';
  lider_id uuid;
  i int; j int;
  nomes_lider text[] := ARRAY['Carlos Mendes','Ana Paula Souza','Roberto Lima','Fernanda Alves','Pedro Henrique','Mariana Costa','João Vitor Silva','Luciana Pereira','Ricardo Nogueira','Patrícia Ramos'];
  nomes_cabo text[] := ARRAY['José','Maria','Antônio','Francisca','Marcos','Juliana','Paulo','Camila','Lucas','Beatriz','Rafael','Aline','Bruno','Vanessa','Eduardo','Tatiane','Felipe','Carla','Gustavo','Renata'];
  sobrenomes text[] := ARRAY['Oliveira','Santos','Rodrigues','Almeida','Ferreira','Gomes','Martins','Carvalho','Barbosa','Ribeiro','Cardoso','Teixeira','Moreira','Araújo','Pinto'];
  regioes text[] := ARRAY['centro','segredo','prosa','bandeira','anhanduizinho','lagoa','moreninha','imbirussu'];
  cidades text[] := ARRAY['Dourados','Três Lagoas','Corumbá','Ponta Porã','Naviraí','Aquidauana','Sidrolândia','Nova Andradina','Maracaju','Coxim'];
  v_escopo text; v_regiao text; v_cidade text;
  v_lider_valor numeric; v_cabo_valor numeric;
  fone text;
BEGIN
  FOR i IN 1..10 LOOP
    IF i <= 6 THEN
      v_escopo := 'campo_grande';
      v_regiao := regioes[1 + ((i-1) % array_length(regioes,1))];
      v_cidade := NULL;
    ELSE
      v_escopo := 'interior';
      v_regiao := NULL;
      v_cidade := cidades[i-6];
    END IF;
    v_lider_valor := 2000 + (i*100);
    fone := '(67) 9' || lpad((10000000 + i*1111)::text, 8, '0');

    INSERT INTO eleicao_pessoas (client_id, tipo, escopo, regiao, cidade, nome, telefone, endereco, valor_contratacao)
    VALUES (v_client, 'lider'::eleicao_tipo, v_escopo::eleicao_escopo,
      CASE WHEN v_regiao IS NULL THEN NULL ELSE v_regiao::eleicao_regiao END,
      v_cidade, nomes_lider[i], fone, 'Rua Demonstração, ' || (100+i), v_lider_valor)
    RETURNING id INTO lider_id;

    FOR j IN 1..10 LOOP
      v_cabo_valor := 800 + (j*50);
      fone := '(67) 9' || lpad((20000000 + i*1000 + j*10)::text, 8, '0');
      INSERT INTO eleicao_pessoas (client_id, tipo, escopo, regiao, cidade, nome, telefone, endereco, parent_id, valor_contratacao)
      VALUES (v_client, 'cabo'::eleicao_tipo, v_escopo::eleicao_escopo,
        CASE WHEN v_regiao IS NULL THEN NULL ELSE v_regiao::eleicao_regiao END,
        v_cidade,
        nomes_cabo[((i*j-1) % array_length(nomes_cabo,1)) + 1] || ' ' || sobrenomes[((i+j-1) % array_length(sobrenomes,1)) + 1],
        fone, 'Rua Apoio ' || j || ', nº ' || (200 + j*7), lider_id, v_cabo_valor);
    END LOOP;
  END LOOP;
END $$;
