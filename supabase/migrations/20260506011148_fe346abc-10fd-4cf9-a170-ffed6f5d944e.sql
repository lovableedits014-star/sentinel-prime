
ALTER TABLE public.pessoa_social DISABLE TRIGGER trg_ensure_pessoa_supporter;

INSERT INTO public.pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
SELECT p.id, 'instagram', sa.instagram_username,
       'https://instagram.com/' || regexp_replace(sa.instagram_username, '^@', '')
FROM public.pessoas p
JOIN public.supporter_accounts sa ON sa.supporter_id = p.supporter_id
WHERE sa.instagram_username IS NOT NULL AND length(trim(sa.instagram_username)) > 0
  AND NOT EXISTS (SELECT 1 FROM public.pessoa_social ps WHERE ps.pessoa_id = p.id AND ps.plataforma = 'instagram');

INSERT INTO public.pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
SELECT p.id, 'facebook', sa.facebook_username,
       'https://facebook.com/' || regexp_replace(sa.facebook_username, '^@', '')
FROM public.pessoas p
JOIN public.supporter_accounts sa ON sa.supporter_id = p.supporter_id
WHERE sa.facebook_username IS NOT NULL AND length(trim(sa.facebook_username)) > 0
  AND NOT EXISTS (SELECT 1 FROM public.pessoa_social ps WHERE ps.pessoa_id = p.id AND ps.plataforma = 'facebook');

INSERT INTO public.pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
SELECT DISTINCT ON (p.id, sp.platform)
       p.id, sp.platform,
       COALESCE(sp.platform_username, sp.platform_user_id),
       CASE
         WHEN sp.platform = 'instagram' THEN 'https://instagram.com/' || COALESCE(regexp_replace(sp.platform_username, '^@', ''), sp.platform_user_id)
         WHEN sp.platform = 'facebook'  THEN 'https://facebook.com/'  || COALESCE(regexp_replace(sp.platform_username, '^@', ''), sp.platform_user_id)
         ELSE NULL
       END
FROM public.pessoas p
JOIN public.supporter_profiles sp ON sp.supporter_id = p.supporter_id
WHERE sp.platform IN ('instagram','facebook')
  AND COALESCE(sp.platform_username, sp.platform_user_id) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.pessoa_social ps WHERE ps.pessoa_id = p.id AND ps.plataforma = sp.platform);

INSERT INTO public.pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
SELECT DISTINCT ON (p.id, kv.key) p.id, kv.key, kv.value,
       CASE kv.key
         WHEN 'instagram' THEN 'https://instagram.com/' || regexp_replace(kv.value, '^@', '')
         WHEN 'facebook'  THEN 'https://facebook.com/'  || regexp_replace(kv.value, '^@', '')
         WHEN 'twitter'   THEN 'https://twitter.com/'   || regexp_replace(kv.value, '^@', '')
         WHEN 'youtube'   THEN 'https://youtube.com/'   || regexp_replace(kv.value, '^@', '')
         ELSE NULL
       END
FROM public.funcionarios f
JOIN LATERAL jsonb_each_text(f.redes_sociais) AS kv(key, value) ON jsonb_typeof(f.redes_sociais) = 'object'
JOIN public.pessoas p
  ON p.client_id = f.client_id
 AND right(regexp_replace(coalesce(p.telefone,''), '\D', '', 'g'), 10)
   = right(regexp_replace(coalesce(f.telefone,''), '\D', '', 'g'), 10)
 AND length(regexp_replace(coalesce(p.telefone,''), '\D', '', 'g')) >= 10
WHERE f.redes_sociais IS NOT NULL
  AND jsonb_typeof(f.redes_sociais) = 'object'
  AND length(trim(coalesce(kv.value,''))) > 0
  AND kv.key IN ('instagram','facebook','twitter','youtube')
  AND NOT EXISTS (SELECT 1 FROM public.pessoa_social ps WHERE ps.pessoa_id = p.id AND ps.plataforma = kv.key);

ALTER TABLE public.pessoa_social ENABLE TRIGGER trg_ensure_pessoa_supporter;
