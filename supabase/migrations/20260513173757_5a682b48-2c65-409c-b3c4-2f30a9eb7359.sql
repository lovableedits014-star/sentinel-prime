
-- Seed test data for notification flow test
INSERT INTO public.eleicao_notif_config (client_id, secretaria_telefone, auto_enviar, grupos_links)
VALUES ('6879803f-fd2e-4a43-8d0d-4417e1b1fe15', '67992773931', true, '{"centro":"https://chat.whatsapp.com/teste-centro"}'::jsonb)
ON CONFLICT (client_id) DO UPDATE
SET secretaria_telefone = EXCLUDED.secretaria_telefone,
    auto_enviar = true,
    grupos_links = COALESCE(public.eleicao_notif_config.grupos_links, '{}'::jsonb) || EXCLUDED.grupos_links;

-- Coordenador fake (teste)
INSERT INTO public.eleicao_pessoas (id, client_id, nome, telefone, tipo, escopo, regiao, endereco)
VALUES ('11111111-1111-1111-1111-111111111111', '6879803f-fd2e-4a43-8d0d-4417e1b1fe15',
        'TESTE Coordenador', '67992773931', 'coordenador', 'campo_grande', 'centro', 'Endereço teste')
ON CONFLICT (id) DO UPDATE SET telefone='67992773931', regiao='centro', escopo='campo_grande', tipo='coordenador';

-- Líder fake (teste)
INSERT INTO public.eleicao_pessoas (id, client_id, nome, telefone, tipo, escopo, regiao, parent_id, rua, numero, bairro, endereco)
VALUES ('22222222-2222-2222-2222-222222222222', '6879803f-fd2e-4a43-8d0d-4417e1b1fe15',
        'TESTE Líder', '67992773931', 'lider', 'campo_grande', 'centro',
        '11111111-1111-1111-1111-111111111111',
        'Rua Teste', '100', 'Bairro Teste', 'Rua Teste, 100 - Bairro Teste')
ON CONFLICT (id) DO UPDATE SET telefone='67992773931', regiao='centro', escopo='campo_grande', tipo='lider',
        parent_id='11111111-1111-1111-1111-111111111111',
        rua='Rua Teste', numero='100', bairro='Bairro Teste';
