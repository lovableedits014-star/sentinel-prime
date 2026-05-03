import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getBadgeMeta } from "@/lib/militant-badges";
import type { MilitantRow } from "@/hooks/useMilitants";

interface Props {
  militant?: MilitantRow | null;
}

/**
 * Compact badge shown next to the author's name in CommentItem.
 * Displays only the most relevant badge (computed in DB) with tooltip detail.
 */
export const MilitantBadge = memo(function MilitantBadge({ militant }: Props) {
  if (!militant) return null;
  const meta = getBadgeMeta(militant.current_badge);
  if (!meta) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help">
            <Badge variant="outline" className={`text-[10px] gap-1 px-1.5 h-5 ${meta.className}`}>
              <span aria-hidden="true">{meta.emoji}</span>
              <span>{meta.label}</span>
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px]">
          <p className="text-xs font-semibold mb-1">{meta.emoji} {meta.label}</p>
          <p className="text-[10px] text-muted-foreground mb-2">{meta.description}</p>
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <div className="text-center">
              <p className="font-bold text-green-600">{militant.total_positive}</p>
              <p className="text-muted-foreground">positivos</p>
            </div>
            <div className="text-center">
              <p className="font-bold">{militant.total_neutral}</p>
              <p className="text-muted-foreground">neutros</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-destructive">{militant.total_negative}</p>
              <p className="text-muted-foreground">negativos</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border/50">
            Total: {militant.total_comments} coment. · Últimos 30 dias: {militant.total_30d_positive}+ / {militant.total_30d_negative}−
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});