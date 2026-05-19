ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS template_coordenador_boas_vindas TEXT
  DEFAULT 'Olá {nome}! Você foi cadastrado como coordenador da região *{regiao}*.

Entre no grupo da sua região e aguarde as próximas instruções:
{link_grupo}';