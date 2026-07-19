UPDATE public.whatsapp_dispatches
SET status = 'pausado_timeout',
    pause_reason = 'Retomada automática acionada após correção do travamento.',
    paused_until = now(),
    updated_at = now()
WHERE id = '405cf8c3-6ebd-4d74-b359-7419ad556287'
  AND status = 'enviando'
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_dispatch_items i
    WHERE i.dispatch_id = whatsapp_dispatches.id
      AND i.status = 'pendente'
  );