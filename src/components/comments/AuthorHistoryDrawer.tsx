import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Minus, Calendar, Facebook, Instagram, Loader2, ExternalLink } from "lucide-react";
import { MilitantBadge } from "./MilitantBadge";
import { Button } from "@/components/ui/button";
import { getSocialProfileUrl } from "@/lib/social-url";
import type { MilitantRow } from "@/hooks/useMilitants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  platform: string;
  platformUserId: string;
  authorName: string | null;
  avatarUrl: string | null;
  militant?: MilitantRow | null;
}

function sentimentIcon(s: string | null) {
  if (s === "positive") return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
  if (s === "negative") return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function AuthorHistoryDrawer({
  open, onOpenChange, clientId, platform, platformUserId, authorName, avatarUrl, militant,
}: Props) {
  const profileUrl = getSocialProfileUrl(platform, platformUserId);
  const { data, isLoading } = useQuery({
    queryKey: ["author-history", clientId, platform, platformUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, comment_id, text, sentiment, post_message, comment_created_time, created_at, post_permalink_url")
        .eq("client_id", clientId)
        .eq("platform", platform)
        .eq("platform_user_id", platformUserId)
        .eq("is_page_owner", false)
        .not("text", "eq", "__post_stub__")
        .order("comment_created_time", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!clientId && !!platformUserId,
    staleTime: 1000 * 60 * 2,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={authorName || ""} />}
              <AvatarFallback>{authorName?.charAt(0).toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base flex items-center gap-2">
                <span className="truncate">{authorName || "Autor desconhecido"}</span>
                {platform === "instagram"
                  ? <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
                  : <Facebook className="w-4 h-4 text-blue-600 shrink-0" />}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Últimos comentários nesta rede
              </SheetDescription>
            </div>
          </div>
          {militant && (
            <div className="space-y-2">
              <MilitantBadge militant={militant} />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <p className="font-bold text-green-700 dark:text-green-300">{militant.total_positive}</p>
                  <p className="text-[10px] text-muted-foreground">Positivos</p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <p className="font-bold">{militant.total_neutral}</p>
                  <p className="text-[10px] text-muted-foreground">Neutros</p>
                </div>
                <div className="rounded-lg bg-destructive/10 p-2">
                  <p className="font-bold text-destructive">{militant.total_negative}</p>
                  <p className="text-[10px] text-muted-foreground">Negativos</p>
                </div>
              </div>
            </div>
          )}
          {profileUrl && (
            <Button asChild size="sm" variant="outline" className="w-full gap-2">
              <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir perfil no {platform === "instagram" ? "Instagram" : "Facebook"}
              </a>
            </Button>
          )}
        </SheetHeader>

        <div className="mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Histórico (últimos 20)
          </h4>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum comentário encontrado.
            </p>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3">
                {data.map((c: any) => (
                  <div key={c.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {c.comment_created_time
                          ? new Date(c.comment_created_time).toLocaleString("pt-BR")
                          : new Date(c.created_at).toLocaleString("pt-BR")}
                      </div>
                      <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5">
                        {sentimentIcon(c.sentiment)}
                        {c.sentiment === "positive" ? "Positivo" : c.sentiment === "negative" ? "Negativo" : "Neutro"}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed">{c.text}</p>
                    {c.post_message && (
                      <p className="text-[10px] text-muted-foreground italic line-clamp-1 pt-1 border-t border-border/40">
                        em: {c.post_message.substring(0, 80)}{c.post_message.length > 80 ? "…" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}