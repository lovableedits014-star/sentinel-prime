-- Create table for scheduled posts
CREATE TABLE IF NOT EXISTS public.meta_scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
    post_type TEXT NOT NULL CHECK (post_type IN ('feed', 'story', 'reel')),
    content TEXT,
    media_urls TEXT[] DEFAULT '{}',
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed')),
    meta_id TEXT, -- ID returned by Meta after publishing
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_scheduled_posts TO authenticated;
GRANT ALL ON public.meta_scheduled_posts TO service_role;

-- RLS
ALTER TABLE public.meta_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their client's scheduled posts"
    ON public.meta_scheduled_posts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR role = 'client')
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.clients
            WHERE id = client_id AND user_id = auth.uid()
        )
    );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_meta_scheduled_posts_updated_at
    BEFORE UPDATE ON public.meta_scheduled_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();