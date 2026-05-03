import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Zap } from "lucide-react";
import { useQuickReplies } from "@/hooks/useQuickReplies";

interface Props {
  clientId: string | undefined;
  onPick: (text: string) => void;
}

export function QuickRepliesGrid({ clientId, onPick }: Props) {
  const { replies, isGenerating, regenerate } = useQuickReplies(clientId);

  return (
    <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Respostas rápidas (clique para preencher)
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={regenerate}
          disabled={isGenerating || !clientId}
          className="h-6 text-[11px] px-2"
          title="Gerar 12 novas respostas com IA"
        >
          {isGenerating ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          {isGenerating ? "Gerando..." : "Gerar novas"}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {replies.map((r, i) => (
          <Button
            key={`${i}-${r}`}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPick(r)}
            title={r}
            className="h-auto min-h-8 py-1.5 px-2 text-[11px] leading-tight whitespace-normal text-left justify-start"
          >
            <span className="line-clamp-2">{r}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}