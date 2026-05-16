import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export type PostTimelineItem = {
  post_id: string;
  platform: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  published_at: string | null;
  comments_count: number;
  sentiment_counts: { positive: number; neutral: number; negative: number };
};

/**
 * Reconstrói "posts" agregando linhas de public.comments por post_id+platform.
 * Não existe tabela posts standalone — o post vive desnormalizado em comments.
 * Pegamos a data MAIS ANTIGA dos comentários como aproximação da publicação.
 */
export function usePostsTimeline(clientId: string | null | undefined, limit = 3000) {
  return useQuery({
    queryKey: ["posts-timeline", clientId, limit],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async (): Promise<PostTimelineItem[]> => {
      const { data, error } = await supabase
        .from("comments")
        .select(
          "post_id, platform, post_message, post_permalink_url, post_full_picture, post_media_type, comment_created_time, sentiment"
        )
        .eq("client_id", clientId!)
        .not("post_id", "is", null)
        .order("comment_created_time", { ascending: false })
        .limit(limit);
      if (error) throw error;

      const map = new Map<string, PostTimelineItem>();
      for (const row of (data ?? []) as any[]) {
        const platform = row.platform ?? "unknown";
        const key = `${row.post_id}::${platform}`;
        let agg = map.get(key);
        if (!agg) {
          agg = {
            post_id: row.post_id,
            platform,
            post_message: row.post_message ?? null,
            post_permalink_url: row.post_permalink_url ?? null,
            post_full_picture: row.post_full_picture ?? null,
            post_media_type: row.post_media_type ?? null,
            published_at: row.comment_created_time ?? null,
            comments_count: 0,
            sentiment_counts: { positive: 0, neutral: 0, negative: 0 },
          };
          map.set(key, agg);
        }
        agg.comments_count++;
        if (row.sentiment === "positive") agg.sentiment_counts.positive++;
        else if (row.sentiment === "negative") agg.sentiment_counts.negative++;
        else if (row.sentiment === "neutral") agg.sentiment_counts.neutral++;
        // data mais antiga = melhor aproximação da publicação
        if (
          row.comment_created_time &&
          (!agg.published_at || row.comment_created_time < agg.published_at)
        ) {
          agg.published_at = row.comment_created_time;
        }
        if (!agg.post_message && row.post_message) agg.post_message = row.post_message;
        if (!agg.post_permalink_url && row.post_permalink_url) {
          agg.post_permalink_url = row.post_permalink_url;
        }
        if (!agg.post_full_picture && row.post_full_picture) {
          agg.post_full_picture = row.post_full_picture;
        }
        if (!agg.post_media_type && row.post_media_type) {
          agg.post_media_type = row.post_media_type;
        }
      }

      return Array.from(map.values()).sort((a, b) => {
        const da = a.published_at ?? "";
        const db = b.published_at ?? "";
        return db.localeCompare(da);
      });
    },
  });
}
