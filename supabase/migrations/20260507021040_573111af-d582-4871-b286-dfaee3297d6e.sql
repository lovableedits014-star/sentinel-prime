-- Bucket privado para documentos da memória (PDFs, etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ic-documents', 'ic-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Usuários autenticados gerenciam seus próprios arquivos (path começa com user_id)
CREATE POLICY "ic-documents owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ic-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "ic-documents owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ic-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "ic-documents owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ic-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "ic-documents owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ic-documents' AND auth.uid()::text = (storage.foldername(name))[1]);