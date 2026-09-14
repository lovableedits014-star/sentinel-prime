-- Molduras e links publicos exclusivos por dobradinha.
-- Molduras antigas permanecem oficiais (parceiro_id IS NULL).
ALTER TABLE public.eleicao_candidatos_parceiros
  ADD COLUMN IF NOT EXISTS public_token text NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS eleicao_candidatos_parceiros_public_token_key
  ON public.eleicao_candidatos_parceiros(public_token);

ALTER TABLE public.campaign_frames
  ADD COLUMN IF NOT EXISTS parceiro_id uuid
    REFERENCES public.eleicao_candidatos_parceiros(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_campaign_frames_parceiro
  ON public.campaign_frames(client_id, parceiro_id, is_active, display_order);

CREATE OR REPLACE FUNCTION public.campaign_frame_validate_parceiro()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
BEGIN
  IF NEW.parceiro_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM eleicao_candidatos_parceiros p
    WHERE p.id=NEW.parceiro_id AND p.client_id=NEW.client_id
  ) THEN RAISE EXCEPTION 'A dobradinha precisa pertencer a mesma campanha'; END IF;
  RETURN NEW;
END;$function$;

DROP TRIGGER IF EXISTS trg_campaign_frame_validate_parceiro ON public.campaign_frames;
CREATE TRIGGER trg_campaign_frame_validate_parceiro
  BEFORE INSERT OR UPDATE OF client_id,parceiro_id ON public.campaign_frames
  FOR EACH ROW EXECUTE FUNCTION public.campaign_frame_validate_parceiro();

DROP FUNCTION IF EXISTS public.get_active_campaign_frames(uuid);
CREATE FUNCTION public.get_active_campaign_frames(_client_id uuid,_parceiro_token text DEFAULT NULL)
RETURNS TABLE(id uuid,nome text,image_url text,composition jsonb,display_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT f.id,f.nome,f.image_url,f.composition,f.display_order
  FROM campaign_frames f
  WHERE f.client_id=_client_id AND f.is_active
    AND ((_parceiro_token IS NULL AND f.parceiro_id IS NULL)
      OR f.parceiro_id=(SELECT p.id FROM eleicao_candidatos_parceiros p
        WHERE p.client_id=_client_id AND p.public_token=_parceiro_token AND p.ativo))
  ORDER BY f.display_order,f.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_frame_partner_public_info(_client_id uuid,_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT CASE WHEN p.id IS NULL THEN jsonb_build_object('ok',false)
    ELSE jsonb_build_object('ok',true,'nome',p.nome,'cargo',p.cargo,'foto_url',p.foto_url) END
  FROM (SELECT 1) seed LEFT JOIN eleicao_candidatos_parceiros p
    ON p.client_id=_client_id AND p.public_token=_token AND p.ativo;
$function$;

REVOKE ALL ON FUNCTION public.get_active_campaign_frames(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_frame_partner_public_info(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_campaign_frames(uuid,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.campaign_frame_partner_public_info(uuid,text) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
