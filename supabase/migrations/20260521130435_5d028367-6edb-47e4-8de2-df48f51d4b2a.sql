ALTER TABLE public.sentiment_corrections ADD COLUMN IF NOT EXISTS ai_reason TEXT, ADD COLUMN IF NOT EXISTS post_stance TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS sentiment_reason TEXT;