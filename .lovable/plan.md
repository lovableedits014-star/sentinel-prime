
# Envio de vídeo/PDF/documentos + envio de teste

Duas melhorias no sistema de disparo, entregues juntas porque compartilham o mesmo state e a mesma edge function.

---

## Parte 1 — Suportar vídeo, PDF e documentos

Hoje o botão só aceita imagem (`file.type.startsWith("image/")`, 8 MB). O motor de envio (`send_media` na ponte) já aceita `media_url` genérica — só precisamos aceitar mais tipos no upload e informar à ponte que tipo de mídia é.

**1. Upload (`src/pages/Disparos.tsx` — `handleMediaUpload`)**
- Aceitar: imagem (jpg/png/webp), vídeo (mp4), PDF, e documentos (docx, xlsx, pptx, doc, xls, ppt, txt, csv, zip).
- Limites por tipo: imagem 8 MB · vídeo 25 MB · PDF/doc 20 MB.
- Detectar `mediaKind` (`image` | `video` | `document`) por MIME + extensão.
- State: `mediaUrl`, `mediaKind`, `mediaFilename`, `mediaMime`.

**2. UI do anexo**
- Botão "Anexar imagem" vira "Anexar mídia" com `accept` amplo.
- Preview:
  - imagem → thumbnail (como hoje)
  - vídeo → `<video controls>` compacto
  - documento/PDF → ícone + nome + tamanho + link "abrir"
- Título padrão vira "Vídeo"/"Documento" conforme o kind quando não houver título.

**3. Payload → edge function**
- Envia também: `media_kind`, `media_filename`, `media_mime`.

**4. Edge function (`supabase/functions/send-whatsapp-dispatch/index.ts`)**
- `fetchBridgeSend` recebe `mediaKind`, `mediaFilename`, `mediaMime`.
- No corpo para a ponte (UAZ), incluir campos redundantes que as bridges reconhecem: `media_type`, `mimetype`, `filename`, `file_name`, `document_name`.
- Persiste `media_kind`/`media_filename` no `payload` do `whatsapp_dispatches` e nos itens (JSON existente — sem coluna nova).
- Retrocompatível: se `media_kind` não vier, assume `image` (disparos antigos continuam retomando).

**5. Log (`DispatchLogDialog.tsx`)**
- Mostra ícone do tipo + nome do arquivo quando houver.

**Sem migração SQL.** Bucket `whatsapp-media` já aceita qualquer MIME.

---

## Parte 2 — Enviar teste para número específico

Botão "Enviar teste" ao lado do "Disparar", para você testar em um número seu antes do disparo real, usando exatamente a mesma mensagem, anexo, spintax e CTA.

**1. UI (`src/pages/Disparos.tsx`)**
- Botão secundário "Enviar teste".
- Abre um `Dialog` pequeno:
  - Input de telefone (máscara BR, aceita DDD + número ou já com 55).
  - Input opcional "Nome" (default: "Teste") — preenche `{{nome}}` no preview.
  - Preview da mensagem final (spintax resolvida + CTA anexado, uma amostra).
  - Aviso: "Cada teste consome 1 do limite diário da instância."
  - Botão "Enviar agora".
- Reaproveita todo o state atual: mensagem, mídia (imagem/vídeo/PDF/doc), `humanizationConfig`, `ctaConfig`.
- Valida: mensagem OU anexo obrigatório, número válido, instância pronta (mesma checagem do `handleSend`).

**2. Backend — sem função nova**
- Chama a mesma `send-whatsapp-dispatch` com:
  - `tipo: "lista_adhoc"`
  - `recipients_list: [{ nome, telefone }]`
  - `titulo: "🧪 TESTE — " + <título original ou primeiras palavras>`
  - `is_test: true` (flag opcional para marcar o registro no log)
  - Mesma `humanization_config`, `cta_config`, `media_url`, `media_kind`, `media_filename`, `media_mime`.
- Edge function apenas guarda `is_test: true` no `payload` — nada mais muda no motor.

**3. Feedback**
- Toast "Teste enviado — verifique seu WhatsApp em alguns segundos."

---

## Não-escopo (ambas as partes)

- Áudio/voice notes.
- Múltiplos anexos por mensagem.
- Sandbox separado (o teste usa o motor real, é essa a graça).
- Editar variação manualmente antes de disparar (preview mostra amostra; motor gera outra na hora, como faria com destinatário real).

## Riscos e mitigação

- Ponte pode rejeitar vídeo grande → limite 25 MB no client, erro por item já é logado.
- PDF sem `filename` chega sem nome → mandamos `filename` explícito.
- Clicar "Enviar teste" várias vezes gasta cap → aviso no dialog.
- Retomar disparos antigos (só imagem) → retrocompatível.

## Testes manuais após implementar

1. Anexar `.mp4` e disparar para 1 contato → chega como vídeo com legenda.
2. Anexar `.pdf` → chega como documento com nome original.
3. Anexar `.docx` → chega como documento.
4. "Enviar teste" com texto + spintax + CTA no seu número → chega variação com CTA.
5. "Enviar teste" com vídeo/PDF → chega o anexo.
6. Número inválido no teste → toast de erro, nada dispara.
7. Retomar disparo em andamento com anexo de vídeo mantém o mesmo anexo.
