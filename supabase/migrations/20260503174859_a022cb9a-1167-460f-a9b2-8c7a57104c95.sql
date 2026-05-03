UPDATE storage.buckets SET public = true WHERE id = 'whatsapp-media';

-- Garante leitura pública do bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read whatsapp-media'
  ) THEN
    CREATE POLICY "Public read whatsapp-media"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'whatsapp-media');
  END IF;
END $$;