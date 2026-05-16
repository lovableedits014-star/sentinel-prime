ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS ai_prompt_tom_voz text,
  ADD COLUMN IF NOT EXISTS ai_prompt_restricoes text,
  ADD COLUMN IF NOT EXISTS ai_prompt_logica_comportamental text,
  ADD COLUMN IF NOT EXISTS ai_prompt_regras_estruturais text;