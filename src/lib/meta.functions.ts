import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export const publishMetaContent = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    clientId: z.string().uuid(),
    platform: z.enum(['facebook', 'instagram', 'both']),
    type: z.enum(['feed', 'story', 'reel']),
    content: z.string(),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(['IMAGE', 'VIDEO']).optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { clientId, platform, type, content, mediaUrl, mediaType } = data;

    // Get integration
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('client_id', clientId)
      .single();

    if (intError || !integration?.meta_access_token) {
      throw new Error('Integração Meta não configurada.');
    }

    const results: any[] = [];
    const storedToken = integration.meta_access_token;
    const pageId = integration.meta_page_id;

    // Helper to get Page Access Token
    async function getPageAccessToken(pId: string, accessToken: string) {
        try {
            const resp = await fetch(`https://graph.facebook.com/v21.0/${pId}?fields=access_token&access_token=${accessToken}`);
            const d = await resp.json();
            if (d.access_token) return d.access_token;
        } catch (e) {
            console.error("Erro ao obter token da página:", e);
        }
        return accessToken;
    }

    const pageToken = await getPageAccessToken(pageId || "", storedToken);

    // --- INSTAGRAM ---
    if ((platform === 'instagram' || platform === 'both') && integration.meta_instagram_id) {
      if (!mediaUrl) throw new Error('Instagram exige uma URL de mídia.');
      
      const containerParams = new URLSearchParams({
        image_url: mediaUrl,
        caption: content,
        access_token: pageToken,
      });
      if (type === 'reel') containerParams.set('media_type', 'REELS');
      if (type === 'story') containerParams.set('media_type', 'STORIES');

      const containerUrl = `https://graph.facebook.com/v21.0/${integration.meta_instagram_id}/media?${containerParams.toString()}`;
      const containerResp = await fetch(containerUrl, { method: 'POST' });
      const containerData = await containerResp.json();

      if (!containerResp.ok) {
        results.push({ platform: 'instagram', success: false, error: containerData.error?.message || 'Falha ao criar container no IG' });
      } else {
        const creationId = containerData.id;
        const publishParams = new URLSearchParams({
          creation_id: creationId,
          access_token: pageToken,
        });
        const publishUrl = `https://graph.facebook.com/v21.0/${integration.meta_instagram_id}/media_publish?${publishParams.toString()}`;
        const publishResp = await fetch(publishUrl, { method: 'POST' });
        const publishData = await publishResp.json();

        if (!publishResp.ok) {
          results.push({ platform: 'instagram', success: false, error: publishData.error?.message || 'Falha ao publicar no IG' });
        } else {
           let permalink = null;
           try {
             const infoResp = await fetch(`https://graph.facebook.com/v21.0/${publishData.id}?fields=permalink&access_token=${pageToken}`);
             const infoData = await infoResp.json();
             permalink = infoData.permalink;
           } catch(e) {}
           results.push({ platform: 'instagram', success: true, id: publishData.id, permalink });
        }
      }
    }

    // --- FACEBOOK ---
    if (platform === 'facebook' || platform === 'both') {
      const fbParams = new URLSearchParams({
        message: content,
        access_token: pageToken,
      });
      
      let fbUrl = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      if (mediaUrl) {
          fbUrl = `https://graph.facebook.com/v21.0/${pageId}/photos`;
          fbParams.set('url', mediaUrl);
      }

      const fbResp = await fetch(fbUrl, { method: 'POST', body: fbParams });
      const fbData = await fbResp.json();

      if (!fbResp.ok) {
        results.push({ platform: 'facebook', success: false, error: fbData.error?.message || 'Falha ao publicar no FB' });
      } else {
        let permalink = null;
        try {
          const infoResp = await fetch(`https://graph.facebook.com/v21.0/${fbData.id}?fields=permalink_url&access_token=${pageToken}`);
          const infoData = await infoResp.json();
          permalink = infoData.permalink_url;
        } catch(e) {}
        results.push({ platform: 'facebook', success: true, id: fbData.id, permalink });
      }
    }

    // Log to history
    for (const res of results) {
        await supabase.from('meta_scheduled_posts').insert({
            client_id: clientId,
            platform: res.platform,
            post_type: type,
            content: content,
            media_url: mediaUrl,
            status: res.success ? 'published' : 'failed',
            meta_id: res.id,
            error_message: res.error,
            scheduled_for: new Date().toISOString(),
        });
    }

    return { success: true, results };
  });
