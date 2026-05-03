UPDATE public.clients SET whatsapp_window_enabled = false WHERE id = '6879803f-fd2e-4a43-8d0d-4417e1b1fe15';

UPDATE public.whatsapp_dispatches
SET status = 'cancelado',
    pause_reason = 'Cancelado manualmente — disparo travado aguardando janela',
    completed_at = now(),
    updated_at = now()
WHERE id = 'c4ff6968-3e03-4b08-b946-07c0b1dc4494';