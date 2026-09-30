import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { sanitizeText } from "@/lib/mission-link-kind";

type Platform = "facebook" | "instagram";
type PostOption = {
  post_id: string;
  post_message: string | null;
  post_permalink_url: string;
  post_full_picture: string | null;
  post_media_type: string | null;
  platform: Platform;
  comment_created_time: string | null;
};

const DAYS_TO_SHOW = 15;
const postKey = (post: PostOption | null) => (post ? `${post.platform}:${post.post_id}` : "");

export default function SharePublicationsTab({ clientId }: { clientId: string }) {
  const [facebook, setFacebook] = useState<PostOption | null>(null);
  const [instagram, setInstagram] = useState<PostOption | null>(null);
  const [customText, setCustomText] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const postsQuery = useQuery<PostOption[]>({
    queryKey: ["share-publication-options", clientId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - DAYS_TO_SHOW);
      const { data, error } = await supabase
        .from("comments")
        .select(
          "post_id, post_message, post_permalink_url, post_full_picture, post_media_type, platform, comment_created_time",
        )
        .eq("client_id", clientId)
        .like("comment_id", "post_stub_%")
        .in("platform", ["facebook", "instagram"])
        .not("post_permalink_url", "is", null)
        .gte("comment_created_time", since.toISOString())
        .order("comment_created_time", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as PostOption[];
    },
    enabled: !!clientId,
  });

  const facebookPosts = useMemo(
    () => (postsQuery.data || []).filter((p) => p.platform === "facebook"),
    [postsQuery.data],
  );
  const instagramPosts = useMemo(
    () => (postsQuery.data || []).filter((p) => p.platform === "instagram"),
    [postsQuery.data],
  );
  const sourceText = sanitizeText(facebook?.post_message || instagram?.post_message || "");
  const generatedMessage = [
    sourceText,
    facebook?.post_permalink_url ? `Facebook: ${facebook.post_permalink_url}` : "",
    instagram?.post_permalink_url ? `Instagram: ${instagram.post_permalink_url}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const message = customText ?? generatedMessage;

  const selectPost = (post: PostOption) => {
    if (post.platform === "facebook")
      setFacebook((p) => (postKey(p) === postKey(post) ? null : post));
    else setInstagram((p) => (postKey(p) === postKey(post) ? null : post));
    setCustomText(null);
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-meta-comments", {
        body: { clientId, postsLimit: 30 },
      });
      if (error) throw error;
      await postsQuery.refetch();
      toast.success("Publicações atualizadas");
    } catch (error) {
      await postsQuery.refetch();
      toast.error("Não foi possível sincronizar com a Meta agora", {
        description:
          error instanceof Error ? error.message : "Exibindo as publicações já carregadas.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Texto completo e links copiados");
    } catch {
      toast.error("Não foi possível copiar automaticamente");
    }
  };

  const PostList = ({ posts }: { posts: PostOption[] }) => (
    <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
      {postsQuery.isLoading && (
        <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
      )}
      {!postsQuery.isLoading && posts.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma publicação dos últimos {DAYS_TO_SHOW} dias. Clique em “Sincronizar publicações”.
        </p>
      )}
      {posts.map((post) => {
        const selected =
          post.platform === "facebook"
            ? postKey(facebook) === postKey(post)
            : postKey(instagram) === postKey(post);
        return (
          <button
            key={postKey(post)}
            type="button"
            onClick={() => selectPost(post)}
            className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
          >
            {post.post_full_picture ? (
              <img
                src={post.post_full_picture}
                alt=""
                className="h-16 w-16 shrink-0 rounded object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted">
                {post.platform === "facebook" ? (
                  <FacebookIcon className="h-6 w-6" />
                ) : (
                  <InstagramIcon className="h-6 w-6" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 whitespace-pre-wrap text-sm">
                {post.post_message || "(publicação sem texto)"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  {post.comment_created_time
                    ? new Date(post.comment_created_time).toLocaleString("pt-BR")
                    : ""}
                </span>
                {post.post_media_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {post.post_media_type}
                  </Badge>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Share2 className="h-4 w-4" /> Escolha a publicação
              </CardTitle>
              <CardDescription>
                Se o conteúdo estiver nas duas redes, selecione uma publicação em cada aba para
                enviar os dois links diretos.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={sync}
              disabled={syncing}
              className="gap-1.5"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}{" "}
              Sincronizar publicações
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="facebook">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="facebook" className="gap-1.5">
                <FacebookIcon className="h-4 w-4" /> Facebook
              </TabsTrigger>
              <TabsTrigger value="instagram" className="gap-1.5">
                <InstagramIcon className="h-4 w-4" /> Instagram
              </TabsTrigger>
            </TabsList>
            <TabsContent value="facebook">
              <PostList posts={facebookPosts} />
            </TabsContent>
            <TabsContent value="instagram">
              <PostList posts={instagramPosts} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mensagem para o WhatsApp</CardTitle>
          <CardDescription>
            A legenda é carregada por inteiro. Os links são os endereços diretos das publicações,
            sem link de missão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={facebook ? "default" : "outline"} className="gap-1">
              <FacebookIcon className="h-3 w-3" />{" "}
              {facebook ? "Facebook selecionado" : "Sem Facebook"}
            </Badge>
            <Badge variant={instagram ? "default" : "outline"} className="gap-1">
              <InstagramIcon className="h-3 w-3" />{" "}
              {instagram ? "Instagram selecionado" : "Sem Instagram"}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label>Texto completo da publicação</Label>
            <Textarea
              rows={14}
              value={message}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Selecione uma publicação para carregar o texto completo e o link direto."
              className="whitespace-pre-wrap"
            />
            {customText !== null && customText !== generatedMessage && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => setCustomText(null)}
              >
                Restaurar texto original completo
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Button variant="outline" onClick={copy} disabled={!message} className="gap-1.5">
              <Copy className="h-4 w-4" /> Copiar tudo
            </Button>
            <Button
              onClick={() =>
                message &&
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(message)}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              disabled={!message}
              className="gap-1.5"
            >
              <MessageCircle className="h-4 w-4" /> Abrir no WhatsApp
            </Button>
          </div>
          {(facebook || instagram) && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">Conferir links diretos</p>
              {facebook && (
                <a
                  href={facebook.post_permalink_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FacebookIcon className="h-3.5 w-3.5" /> Abrir no Facebook{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {instagram && (
                <a
                  href={instagram.post_permalink_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <InstagramIcon className="h-3.5 w-3.5" /> Abrir no Instagram{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
