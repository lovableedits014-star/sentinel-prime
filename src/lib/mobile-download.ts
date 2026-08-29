import { toast } from "sonner";

/**
 * Download helper compatível com iPhone (Safari iOS + WebViews do WhatsApp/Instagram/Facebook).
 *
 * Estratégia:
 *  1. Se `navigator.canShare({ files })` for verdadeiro → usa Web Share API nativa.
 *     No iPhone isso abre a folha de compartilhamento: Salvar em Fotos / Arquivos /
 *     Enviar pelo WhatsApp etc.
 *  2. Senão, se for iOS / WebView de in-app browser → abre o arquivo numa nova
 *     aba e mostra toast com instrução para o usuário salvar manualmente.
 *  3. Caso contrário (desktop, Android) → usa o padrão clássico `<a download>`.
 */

const IOS_REGEX = /iPad|iPhone|iPod/;

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS recente se identifica como Mac com touch
  const isIPadOS =
    /Macintosh/.test(ua) && typeof (navigator as any).maxTouchPoints === "number" && (navigator as any).maxTouchPoints > 1;
  return IOS_REGEX.test(ua) || isIPadOS;
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /(FBAN|FBAV|Instagram|Line|WhatsApp|WA Business|Twitter|TikTok)/i.test(ua);
}

function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof (navigator as any).canShare === "function" &&
      (navigator as any).canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

function legacyAnchorDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function inferMime(filename: string, fallback = "application/octet-stream"): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "pdf": return "application/pdf";
    case "zip": return "application/zip";
    case "csv": return "text/csv";
    case "txt": return "text/plain";
    case "md": return "text/markdown";
    case "json": return "application/json";
    case "srt": return "application/x-subrip";
    case "vtt": return "text/vtt";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default: return fallback;
  }
}

export interface SaveOptions {
  /** Título opcional usado na folha de compartilhamento. */
  title?: string;
  /** Texto opcional na folha de compartilhamento. */
  text?: string;
  /** Não mostrar toast no fallback iOS (caso o componente queira tratar). */
  silent?: boolean;
  /**
   * Força download direto (sem abrir folha de compartilhamento).
   * Use quando o usuário clicou em "Baixar" e espera o arquivo salvar direto.
   */
  preferDownload?: boolean;
}

/**
 * Salva um Blob como arquivo, escolhendo o melhor caminho para o aparelho.
 */
export async function saveBlob(blob: Blob, filename: string, opts: SaveOptions = {}): Promise<void> {
  const type = blob.type || inferMime(filename);
  const file = new File([blob], filename, { type });

  // 0) Download direto solicitado — pula Web Share API completamente
  if (opts.preferDownload) {
    const url = URL.createObjectURL(blob);
    try {
      legacyAnchorDownload(url, filename);
      // Em WebViews (Instagram/WhatsApp/Facebook) o <a download> costuma ser ignorado.
      // Avisa o usuário pra abrir no navegador padrão.
      if (isInAppBrowser() && !opts.silent) {
        toast.info("Para baixar, abra esta página no Safari ou Chrome (toque nos 3 pontinhos → Abrir no navegador).", {
          duration: 7000,
        });
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return;
  }

  // 1) Web Share API com arquivo (iOS 15+, Android moderno)
  if (canShareFile(file)) {
    try {
      await (navigator as any).share({
        files: [file],
        title: opts.title ?? filename,
        text: opts.text,
      });
      return;
    } catch (err: any) {
      // Usuário cancelou: não cair em fallback nem em erro
      if (err?.name === "AbortError") return;
      // Outro erro: cair em fallback
    }
  }

  // 2) iOS sem Web Share: abrir em nova aba e instruir o usuário
  if (isIOS()) {
    const url = URL.createObjectURL(blob);
    try {
      const w = window.open(url, "_blank");
      if (!w) {
        // Pop-up bloqueado — tenta navegar na mesma aba
        window.location.href = url;
      }
      if (!opts.silent) {
        toast.info("Para salvar no iPhone, toque em Compartilhar ou pressione a imagem e escolha Salvar.", {
          duration: 6000,
        });
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return;
  }

  // 3) Desktop / Android: anchor download clássico
  const url = URL.createObjectURL(blob);
  try {
    legacyAnchorDownload(url, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

/**
 * Compartilha um arquivo somente quando a pessoa escolheu explicitamente
 * compartilhar. Retorna false quando o aparelho/navegador não oferece suporte.
 */
export async function shareBlob(blob: Blob, filename: string, opts: SaveOptions = {}): Promise<boolean> {
  const type = blob.type || inferMime(filename);
  const file = new File([blob], filename, { type });
  if (!canShareFile(file) || typeof navigator.share !== "function") return false;

  try {
    await navigator.share({
      files: [file],
      title: opts.title ?? filename,
      text: opts.text,
    });
    return true;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return true;
    throw err;
  }
}

/**
 * Faz fetch de uma URL pública e delega para saveBlob.
 * Em último caso (CORS bloqueando o fetch), abre a URL em nova aba.
 */
export async function saveUrl(url: string, filename: string, opts: SaveOptions = {}): Promise<void> {
  try {
    const r = await fetch(url, { credentials: "omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    await saveBlob(blob, filename, opts);
  } catch {
    // Fallback: deixar o navegador decidir
    if (isIOS()) {
      window.open(url, "_blank");
      if (!opts.silent) {
        toast.info("Para salvar no iPhone, toque em Compartilhar ou pressione a imagem e escolha Salvar.", {
          duration: 6000,
        });
      }
    } else {
      legacyAnchorDownload(url, filename);
    }
  }
}

/**
 * Converte um data:URL para Blob e salva.
 */
export async function saveDataUrl(dataUrl: string, filename: string, opts: SaveOptions = {}): Promise<void> {
  const r = await fetch(dataUrl);
  const blob = await r.blob();
  await saveBlob(blob, filename, opts);
}
