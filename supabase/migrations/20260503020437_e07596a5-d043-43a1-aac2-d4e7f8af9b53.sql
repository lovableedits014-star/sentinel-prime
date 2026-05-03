-- Remove usuário atual com UUID diferente
DELETE FROM auth.identities WHERE user_id = 'f1f9c375-e3b6-4f61-9539-082562a6f1d2';
DELETE FROM auth.users WHERE id = 'f1f9c375-e3b6-4f61-9539-082562a6f1d2';

SET LOCAL session_replication_role = replica;

-- Recria os 34 usuários originais
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT (u->>'id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', u->>'email', '',
  COALESCE((u->>'ec')::timestamptz, now()),
  COALESCE((u->>'meta')::jsonb, '{}'::jsonb),
  '{"provider":"email","providers":["email"]}'::jsonb,
  COALESCE((u->>'ca')::timestamptz, now()), now(),
  '', '', '', ''
FROM jsonb_array_elements($j$[
{"id":"f32cbbdd-4b47-4a06-b25f-bf92d1448304","email":"lovableedits014@gmail.com","ca":"2026-02-13 13:17:24.237382+00","ec":"2026-02-13 13:17:53.795575+00","meta":{"full_name":"Mayer Baclan"}},
{"id":"4198274a-8c41-409a-b3a9-cec4d34c84cb","email":"mayer014@hotmail.com","ca":"2026-02-20 19:20:50.837722+00","ec":"2026-02-20 19:20:50.864035+00","meta":{"full_name":"Mrodrigues"}},
{"id":"ad8f6c94-8109-4ab0-87d3-60847aad41c3","email":"mayer014@gmail.com","ca":"2026-02-20 20:08:49.229968+00","ec":"2026-02-20 20:08:49.266308+00","meta":{"full_name":"Mayer Baclan 014"}},
{"id":"e25e3be5-ce2f-4da6-bd5d-a04a1b238da3","email":"leilianemartinssilva27@gmail.com","ca":"2026-02-20 23:55:07.910461+00","ec":"2026-02-20 23:56:03.854037+00","meta":{"full_name":"Leiliane Martins da Silva"}},
{"id":"8c056d2a-ec51-418b-a01c-5e3e606866c3","email":"antoniolobato.adm@gmail.com","ca":"2026-03-14 19:52:38.145821+00","ec":"2026-03-14 19:52:38.211016+00","meta":{"role":"funcionario","full_name":"ANTONIO TLAES LOBATO"}},
{"id":"12d19d3e-d9f0-4cbf-af89-2a594be414ad","email":"mariacristinaalvesdossantos91@gmail.com","ca":"2026-04-26 12:17:30.272926+00","ec":"2026-04-26 12:17:30.416119+00","meta":{"full_name":"Maria Cristina Alves Dos Santos"}},
{"id":"b59fcc06-8c32-493e-8bad-15be70ac4707","email":"marianacalazans8@gmail.com","ca":"2026-04-26 12:26:52.157662+00","ec":"2026-04-26 12:26:52.225072+00","meta":{"full_name":"Mariana Abdias de calazans"}},
{"id":"3d66e3f2-c501-4f44-80fa-ca61729b62e7","email":"mariamarluce9880@gmail.com","ca":"2026-04-26 12:34:57.844147+00","ec":"2026-04-26 12:34:57.928629+00","meta":{"full_name":"Marluce Maria"}}
]$j$::jsonb) AS u
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');