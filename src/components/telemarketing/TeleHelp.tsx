import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  className?: string;
}

/** Ícone de ajuda com explicação curta em tooltip. */
export default function TeleHelp({ text, className }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Ajuda"
          onClick={(e) => e.preventDefault()}
          className={cn("inline-flex text-muted-foreground hover:text-foreground align-middle", className)}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}
