UPDATE auth.users
SET encrypted_password = crypt('25896589Ba@23479612', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'lovableedits014@gmail.com';