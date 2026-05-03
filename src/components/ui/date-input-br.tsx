import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateInputBrProps {
  /** valor no formato ISO yyyy-mm-dd (ou string vazia) */
  value: string;
  onChange: (isoValue: string) => void;
  id?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

/** Converte yyyy-mm-dd → dd/mm/aaaa (somente os dígitos disponíveis). */
function isoToBr(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Aplica máscara dd/mm/aaaa a uma string já filtrada para apenas dígitos. */
function maskBr(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Converte dd/mm/aaaa → yyyy-mm-dd quando totalmente preenchido e válido. */
function brToIso(br: string): string {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12) return "";
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return "";
  if (year < 1900 || year > 2100) return "";
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Campo de data com digitação no formato brasileiro (dd/mm/aaaa).
 * Internamente armazena/expõe o valor em ISO (yyyy-mm-dd) compatível com o backend.
 */
export function DateInputBr({
  value,
  onChange,
  id,
  required,
  className,
  disabled,
}: DateInputBrProps) {
  const [text, setText] = React.useState<string>(isoToBr(value));

  // Sync externo → interno se o pai trocar o valor
  React.useEffect(() => {
    const next = isoToBr(value);
    if (next !== text) setText(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    const masked = maskBr(digits);
    setText(masked);
    const iso = brToIso(masked);
    onChange(iso);
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="dd/mm/aaaa"
      value={text}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      maxLength={10}
      className={cn(className)}
    />
  );
}
