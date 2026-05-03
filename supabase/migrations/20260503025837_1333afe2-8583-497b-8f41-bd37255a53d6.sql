UPDATE public.whatsapp_instances
SET bridge_api_key = 'f67218798a4a923b5b604072bfb0fc58e262c90e97c1944ac3ab23da0fa008dd',
    status = 'connected',
    consecutive_failures = 0,
    last_health_check_at = now(),
    updated_at = now()
WHERE id = '143715dd-0417-4c6a-926e-38b1410438ca';