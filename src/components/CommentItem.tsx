import { useState, memo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  TrendingUp, TrendingDown, Minus, Sparkles, Send,
  Instagram, Facebook, Calendar, AlertTriangle, ExternalLink,
  Trash2, EyeOff, Eye, Ban, Loader2, PenLine, X, Repeat, UserCheck,
  ThumbsUp, SkipForward, Undo2,
} from "lucide-react";
import { AddToSupportersButton } from "@/components/AddToSupportersButton";
import { QuickRepliesGrid } from "@/components/comments/QuickRepliesGrid";
import { QuickContactsBar } from "@/components/comments/QuickContactsBar";
import { MilitantBadge } from "@/components/comments/MilitantBadge";
import type { MilitantBadgeMap, MilitantRow } from "@/hooks/useMilitants";

export type RegisteredSupportersMap = Map<string, { name: string; classification: string }>;

export interface CommentData {
  id: string;
  comment_id: string;
  post_id: string;
  client_id: string;
  text: string;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  platform: string | null;
  platform_user_id: string | null;
  social_profile_id: string | null;
  author_unavailable: boolean;
  author_unavailable_reason: string | null;
  status: string | null;
  sentiment: string | null;
  ai_response: string | null;
  final_response: string | null;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  comment_created_time: string | null;
  created_at: string;
  parent_comment_id: string | null;
  is_page_owner: boolean;
  is_hidden?: boolean;
  responded_at?: string | null;
}

export type AuthorStatsMap = Map<string, { total: number; positive: number; neutral: number; negative: number; name: string }>;

export interface CommentItemProps {
  comment: CommentData;
  authorStats?: AuthorStatsMap;
  registeredSupporters?: RegisteredSupportersMap;
  militants?: MilitantBadgeMap;
  onOpenAuthorHistory?: (info: {
    platform: string;
    platformUserId: string;
    authorName: string | null;
    avatarUrl: string | null;
    militant: MilitantRow | null;
  }) => void;
  onGenerateResponse: (commentId: string, isRegenerate: boolean, userGuidance?: string) => void;
  onSendResponse: (commentId: string, responseText: string, platform: string) => void;
  onManageComment?: (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => Promise<void>;
  onReactToComment?: (commentId: string) => void;
  onClassifySentiment?: (commentId: string, sentiment: 'positive' | 'neutral' | 'negative') => Promise<void>;
  onIgnoreComment?: (commentId: string) => Promise<void>;
  onUnignoreComment?: (commentId: string) => Promise<void>;
  isGenerating?: boolean;
  isResponding?: boolean;
  isManaging?: boolean;
  isClassifying?: boolean;
  isReacting?: boolean;
  showPostInfo?: boolean;
}

function getPlatformIcon(platform: string) {
  if (platform === "instagram") return <Instagram className="w-4 h-4 text-pink-500" />;
  return <Facebook className="w-4 h-4 text-blue-600" />;
}

function getSentimentIcon(sentiment: string) {
  switch (sentiment) {
    case "positive": return <TrendingUp className="w-3.5 h-3.5" />;
    case "negative": return <TrendingDown className="w-3.5 h-3.5" />;
    default: return <Minus className="w-3.5 h-3.5" />;
  }
}

function getSentimentBadge(sentiment: string) {
  const config: Record<string, { variant: "default" | "destructive" | "secondary"; label: string; tip: string }> = {
    positive: { variant: "default", label: "Positivo", tip: "A IA analisou este comentário e identificou um tom positivo ou de apoio" },
    negative: { variant: "destructive", label: "Negativo", tip: "A IA analisou este comentário e identificou um tom crítico ou negativo" },
    neutral: { variant: "secondary", label: "Neutro", tip: "A IA analisou este comentário e identificou um tom neutro, sem opinião forte" },
  };
  const c = config[sentiment] || config.neutral;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help">
            <Badge variant={c.variant} className="gap-1 text-xs">
              {getSentimentIcon(sentiment)}
              {c.label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          <p className="text-xs">{c.tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getStatusBadge(status: string, respondedExternally?: boolean) {
  if (status === 'responded' && respondedExternally) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help">
              <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600 bg-blue-50 gap-1">
                📱 Respondido externo
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px]">
            <p className="text-xs">Este comentário foi respondido fora do sistema (pelo celular, Meta Business Suite ou outro usuário logado).</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "border-warning/50 text-warning bg-warning/10" },
    responded: { label: "Respondido", className: "border-green-500/50 text-green-600 bg-green-50" },
    ignored: { label: "Ignorado", className: "border-muted-foreground/30 text-muted-foreground" },
  };
  const c = config[status] || { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs ${c.className}`}>{c.label}</Badge>;
}

export const CommentItem = memo(function CommentItem({
  comment,
  authorStats,
  registeredSupporters,
  militants,
  onOpenAuthorHistory,
  onGenerateResponse,
  onSendResponse,
  onManageComment,
  onReactToComment,
  onClassifySentiment,
  onIgnoreComment,
  onUnignoreComment,
  isGenerating = false,
  isResponding = false,
  isManaging = false,
  isClassifying = false,
  isReacting = false,
  showPostInfo = false,
}: CommentItemProps) {
  const isResponded = comment.status === 'responded';
  const isIgnored = comment.status === 'ignored';
  const isPageOwner = comment.is_page_owner;
  const isHidden = comment.is_hidden;
  const [showManualReply, setShowManualReply] = useState(false);
  const [manualText, setManualText] = useState("");
  const [localEditText, setLocalEditText] = useState("");
  const [showGuidance, setShowGuidance] = useState(false);
  const [guidanceText, setGuidanceText] = useState("");

  // Author recurrence stats
  const authorKey = comment.platform_user_id ? `${comment.platform}:${comment.platform_user_id}` : null;
  const stats = authorKey && authorStats ? authorStats.get(authorKey) : null;
  // Check if author is already a registered supporter
  const registeredSupporter = authorKey && registeredSupporters ? registeredSupporters.get(authorKey) : null;
  // Militant profile (badge + history)
  const militant = authorKey && militants ? militants.get(authorKey) ?? null : null;
  const handleOpenHistory = () => {
    if (!onOpenAuthorHistory || !comment.platform_user_id || !comment.platform) return;
    onOpenAuthorHistory({
      platform: comment.platform,
      platformUserId: comment.platform_user_id,
      authorName: comment.author_name,
      avatarUrl: comment.author_profile_picture,
      militant,
    });
  };

  const classificationLabels: Record<string, string> = {
    apoiador_ativo: "Apoiador Ativo",
    apoiador_passivo: "Apoiador Passivo",
    neutro: "Neutro",
    critico: "Crítico",
  };
  const isRespondedExternally = isResponded && !comment.final_response;

  const isRecurrent = stats && stats.total >= 3;
  const dominantSentiment = stats ? (
    stats.positive >= stats.negative && stats.positive >= stats.neutral ? "positive" :
    stats.negative >= stats.positive && stats.negative >= stats.neutral ? "negative" : "neutral"
  ) : null;

  // Build profile URL for the author
  const profileUrl = (() => {
    if (comment.author_unavailable) return null;
    const platform = comment.platform || 'facebook';
    if (platform === 'instagram') {
      const handle = comment.author_name?.replace(/^@/, '').trim();
      if (handle) return `https://www.instagram.com/${handle}/`;
      return null;
    }
    // Facebook
    if (comment.author_id) return `https://www.facebook.com/${comment.author_id}`;
    if (comment.platform_user_id) return `https://www.facebook.com/${comment.platform_user_id}`;
    return null;
  })();

  return (
    <div className={`p-4 transition-colors ${
      isHidden ? 'bg-muted/60 opacity-70 border-l-2 border-muted-foreground/30' :
      isPageOwner ? 'bg-primary/5 border-l-2 border-primary/30' : 
      isResponded ? 'bg-muted/40 opacity-60' : 'bg-muted/10 hover:bg-muted/20'
    }`}>
      {/* Hidden badge */}
      {isHidden && (
        <div className="flex items-center gap-1.5 mb-2">
          <Badge variant="outline" className="text-[10px] border-muted-foreground/40 text-muted-foreground bg-muted/30 gap-1">
            <EyeOff className="w-3 h-3" />
            Comentário oculto
          </Badge>
        </div>
      )}

      {/* Page owner badge */}
      {isPageOwner && !isHidden && (
        <div className="flex items-center gap-1.5 mb-2">
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10">
            👤 Sua resposta
          </Badge>
        </div>
      )}

      {/* Post context (for flat list view) */}
      {showPostInfo && comment.post_message && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
          <span className="text-xs text-muted-foreground truncate max-w-[80%]">
            📝 {comment.post_message.slice(0, 80)}{comment.post_message.length > 80 ? '…' : ''}
          </span>
          {comment.post_permalink_url && (
            <a
              href={comment.post_permalink_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              Ver
            </a>
          )}
        </div>
      )}

      {/* Comment Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    {comment.author_profile_picture && (
                      <AvatarImage src={comment.author_profile_picture} alt={comment.author_name || 'Autor'} />
                    )}
                    <AvatarFallback
                      className={
                        comment.platform === 'instagram'
                          ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs'
                          : 'bg-primary/10 text-primary text-xs'
                      }
                    >
                      {comment.author_name ? comment.author_name.replace('@', '').charAt(0).toUpperCase() : '?'}
                    </AvatarFallback>
                  </Avatar>
                  {comment.author_unavailable && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-warning rounded-full p-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 text-warning-foreground" />
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {comment.author_unavailable ? (
                  <p className="text-xs">{comment.author_unavailable_reason || 'Dados não fornecidos'}</p>
                ) : comment.platform === 'instagram' ? (
                  <p className="text-xs">Instagram limita dados de perfil</p>
                ) : (
                  <p className="text-xs">Perfil identificado</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                  title="Abrir perfil em nova aba"
                >
                  {comment.author_name || "Desconhecido"}
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              ) : (
                <span className="text-sm font-medium">
                  {comment.author_name || (comment.author_unavailable ? "Não identificado" : "Desconhecido")}
                </span>
              )}
              {getPlatformIcon(comment.platform || 'facebook')}
              {/* Militant badge (most relevant — computed in DB) */}
              {!isPageOwner && militant && <MilitantBadge militant={militant} />}
              {/* Author history button */}
              {!isPageOwner && onOpenAuthorHistory && comment.platform_user_id && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleOpenHistory}
                        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="Ver histórico do autor"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Ver últimos 20 comentários deste autor</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Registered supporter badge */}
              {registeredSupporter && !isPageOwner && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help">
                        <Badge className="text-[10px] gap-1 px-1.5 h-5 bg-green-600 hover:bg-green-700 text-white border-transparent">
                          <UserCheck className="w-3 h-3" />
                          Apoiador
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[220px]">
                      <p className="text-xs font-semibold mb-1">✅ Apoiador cadastrado</p>
                      <p className="text-[10px] text-muted-foreground">
                        <strong>{registeredSupporter.name}</strong> · {classificationLabels[registeredSupporter.classification] || registeredSupporter.classification}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Recurrence badge */}
              {stats && stats.total >= 2 && !isPageOwner && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help">
                        <Badge
                          variant={isRecurrent ? "default" : "secondary"}
                          className="text-[10px] gap-1 px-1.5 h-5"
                        >
                          <Repeat className="w-3 h-3" />
                          {stats.total}x
                          {dominantSentiment === "positive" && <TrendingUp className="w-3 h-3" />}
                          {dominantSentiment === "negative" && <TrendingDown className="w-3 h-3" />}
                          {dominantSentiment === "neutral" && <Minus className="w-3 h-3" />}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px]">
                      <p className="text-xs font-semibold mb-1.5">
                        🔄 {comment.author_name} comentou {stats.total} vezes
                      </p>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Este número mostra quantas vezes esta pessoa comentou nas suas publicações. Quanto mais vezes, mais engajada ela é.
                      </p>
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-2 text-[10px]">
                          <TrendingUp className="w-3 h-3 text-green-600 flex-shrink-0" />
                          <span><strong className="text-green-600">{stats.positive}</strong> positivo{stats.positive !== 1 ? 's' : ''} — comentários de apoio ou elogio</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <Minus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span><strong>{stats.neutral}</strong> neutro{stats.neutral !== 1 ? 's' : ''} — perguntas ou observações</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <TrendingDown className="w-3 h-3 text-destructive flex-shrink-0" />
                          <span><strong className="text-destructive">{stats.negative}</strong> negativo{stats.negative !== 1 ? 's' : ''} — críticas ou reclamações</span>
                        </div>
                      </div>
                      <div className="border-t border-border/50 pt-1.5">
                        <p className="text-[10px] text-muted-foreground">
                          Perfil predominante: <strong>{
                            dominantSentiment === "positive" ? "👍 Positivo — tende a apoiar" :
                            dominantSentiment === "negative" ? "👎 Negativo — tende a criticar" : "😐 Neutro — sem padrão claro"
                          }</strong>
                        </p>
                        {isRecurrent && (
                          <p className="text-[10px] text-primary mt-0.5">✓ Seguidor recorrente — considere cadastrá-lo como apoiador</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {comment.comment_created_time
                ? new Date(comment.comment_created_time).toLocaleString("pt-BR")
                : new Date(comment.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isHidden && (
            <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground gap-1">
              <EyeOff className="w-3 h-3" />
              Oculto
            </Badge>
          )}
          {/* Manual sentiment classification */}
          {!isPageOwner && onClassifySentiment && (
            <div className="flex items-center gap-0.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={comment.sentiment === 'positive' ? 'default' : 'ghost'}
                      className={`h-6 w-6 p-0 ${comment.sentiment === 'positive' ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-muted-foreground hover:text-green-600'}`}
                      onClick={() => onClassifySentiment(comment.id, 'positive')}
                      disabled={isClassifying}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Classificar como positivo</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={comment.sentiment === 'neutral' ? 'default' : 'ghost'}
                      className={`h-6 w-6 p-0 ${comment.sentiment === 'neutral' ? 'bg-muted-foreground hover:bg-muted-foreground/80 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => onClassifySentiment(comment.id, 'neutral')}
                      disabled={isClassifying}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Classificar como neutro</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={comment.sentiment === 'negative' ? 'default' : 'ghost'}
                      className={`h-6 w-6 p-0 ${comment.sentiment === 'negative' ? 'bg-destructive hover:bg-destructive/80 text-destructive-foreground' : 'text-muted-foreground hover:text-destructive'}`}
                      onClick={() => onClassifySentiment(comment.id, 'negative')}
                      disabled={isClassifying}
                    >
                      <TrendingDown className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Classificar como negativo</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          {comment.sentiment && getSentimentBadge(comment.sentiment)}
          {comment.status && getStatusBadge(comment.status, isRespondedExternally)}
        </div>
      </div>

      {/* Comment Text */}
      <div className={`rounded-lg p-3 mb-3 ml-12 ${isHidden ? 'bg-muted/50' : 'bg-background'}`}>
        <p className={`text-sm leading-relaxed ${isHidden ? 'text-muted-foreground' : ''}`}>{comment.text}</p>
      </div>

      {/* AI Response */}
      {comment.ai_response && !isResponded && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-3 ml-12">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-primary">Resposta sugerida</span>
          </div>
          <Textarea
            value={localEditText || comment.ai_response}
            onChange={(e) => setLocalEditText(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </div>
      )}

      {/* Final Response */}
      {comment.status === 'responded' && comment.final_response && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 ml-12">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-green-700">✅ Resposta publicada</span>
          </div>
          <p className="text-sm text-green-800">{comment.final_response}</p>
        </div>
      )}

      {/* Actions */}
      {!isPageOwner && (
        <div className="ml-12 space-y-2">
          {/* Manual reply box */}
          {showManualReply && !isResponded && (
            <div className="border border-border rounded-lg p-3 bg-background space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <PenLine className="w-3.5 h-3.5" />
                  Sua resposta
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => { setShowManualReply(false); setManualText(""); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Escreva sua resposta aqui..."
                className="min-h-[80px] text-sm resize-none"
                autoFocus
              />
              <QuickRepliesGrid
                clientId={comment.client_id}
                onPick={(text) => setManualText(text)}
              />
              <QuickContactsBar
                clientId={comment.client_id}
                onPick={(snippet) => {
                  setManualText((prev) => {
                    const base = (prev ?? "").trimEnd();
                    return base ? `${base}\n\n${snippet}` : snippet;
                  });
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => { setShowManualReply(false); setManualText(""); }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    onSendResponse(comment.id, manualText, comment.platform || 'facebook');
                    setShowManualReply(false);
                    setManualText("");
                  }}
                  disabled={!manualText.trim() || isResponding}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {isResponding ? "Publicando..." : "Publicar"}
                </Button>
              </div>
            </div>
          )}

          {/* AI Guidance box — opens when clicking "Usar IA" */}
          {showGuidance && !isResponded && (
            <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {comment.ai_response ? 'Nova resposta IA' : 'Usar IA'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => { setShowGuidance(false); setGuidanceText(""); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Textarea
                value={guidanceText}
                onChange={(e) => setGuidanceText(e.target.value)}
                placeholder="Opcional: oriente a IA (ex: responda de forma informal, mencione o evento de sábado...)"
                className="min-h-[60px] text-sm resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => {
                    onGenerateResponse(comment.id, !!comment.ai_response);
                    setShowGuidance(false);
                    setGuidanceText("");
                  }}
                  disabled={isGenerating}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  {isGenerating ? "Gerando..." : "Gerar resposta"}
                </Button>
                {guidanceText.trim() && (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      onGenerateResponse(comment.id, !!comment.ai_response, guidanceText.trim());
                      setShowGuidance(false);
                    }}
                    disabled={isGenerating}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {isGenerating ? "Gerando..." : "Gerar com orientação"}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Like/React button */}
            {!isPageOwner && onReactToComment && comment.platform === 'facebook' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReactToComment(comment.id)}
                      disabled={isReacting}
                      className="h-8 text-xs"
                    >
                      {isReacting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />}
                      Curtir
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Curtir este comentário como sua página</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Standard response actions */}
            {!isResponded && !isIgnored && (
              <>
                {comment.author_id && !registeredSupporter && <AddToSupportersButton comment={comment} />}

                {!showManualReply && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowManualReply(true)}
                    className="h-8 text-xs"
                  >
                    <PenLine className="w-3.5 h-3.5 mr-1.5" />
                    Responder
                  </Button>
                )}

                {!showGuidance && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowGuidance(true)}
                    disabled={isGenerating}
                    className="h-8 text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {comment.ai_response ? "Nova Resposta IA" : "Usar IA"}
                  </Button>
                )}

                {comment.ai_response && (
                  <Button
                    size="sm"
                    onClick={() => onSendResponse(
                      comment.id,
                      localEditText || comment.ai_response!,
                      comment.platform || 'facebook'
                    )}
                    disabled={isResponding}
                    className="h-8 text-xs"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {isResponding ? "Publicando..." : "Publicar IA"}
                  </Button>
                )}

                {/* Ignore button */}
                {onIgnoreComment && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onIgnoreComment(comment.id)}
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <SkipForward className="w-3.5 h-3.5 mr-1.5" />
                          Ignorar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Pular este comentário — remove da fila de pendentes</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}

            {/* Restore ignored comment */}
            {isIgnored && onUnignoreComment && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUnignoreComment(comment.id)}
                className="h-8 text-xs gap-1.5"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Restaurar
              </Button>
            )}

          </div>{/* end flex flex-wrap gap-2 */}

          {/* Moderation actions - always visible */}
          {onManageComment && (
            <div className="flex gap-1 ml-auto">
              {/* Hide / Unhide */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onManageComment(comment.id, isHidden ? 'unhide' : 'hide')}
                      disabled={isManaging}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isManaging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                        isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />
                      }
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{isHidden ? 'Desocultar comentário' : 'Ocultar comentário'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Block user */}
              {(comment.author_id || comment.platform_user_id) && (
                <AlertDialog>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isManaging}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Bloquear usuário</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Bloquear usuário</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja bloquear <strong>{comment.author_name || 'este usuário'}</strong> da sua página? 
                        Esta pessoa não poderá mais comentar em suas publicações.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onManageComment(comment.id, 'block_user')}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Bloquear
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Delete comment */}
              <AlertDialog>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isManaging}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Excluir comentário</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir comentário</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir este comentário? Esta ação não pode ser desfeita e o comentário será 
                      removido da rede social.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onManageComment(comment.id, 'delete')}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
