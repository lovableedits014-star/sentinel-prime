REVOKE EXECUTE ON FUNCTION public.mission_audience_resolve(uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mission_audience_preview(uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mission_checkin_dashboard_v2(uuid, uuid, uuid, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mission_checkin_nao_obrigados(uuid, uuid, uuid) FROM PUBLIC, anon;