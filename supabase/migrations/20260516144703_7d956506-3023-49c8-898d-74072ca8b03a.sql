
CREATE TABLE IF NOT EXISTS public.llm_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN (
    'token_explosion','retry_loop','provider_instability',
    'latency_spike','config_missing','cron_failure','error_rate_spike'
  )),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  threshold numeric NOT NULL,
  window_minutes integer NOT NULL DEFAULT 15,
  debounce_minutes integer NOT NULL DEFAULT 30,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_alert_rules_client_type
  ON public.llm_alert_rules(coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), alert_type);

CREATE TABLE IF NOT EXISTS public.llm_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_value numeric,
  threshold numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_alerts_client_created ON public.llm_alerts(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_alerts_open ON public.llm_alerts(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_llm_alerts_type_created ON public.llm_alerts(alert_type, created_at DESC);

ALTER TABLE public.llm_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_alerts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_client_member(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE client_id = _client_id AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "members read alert rules" ON public.llm_alert_rules;
CREATE POLICY "members read alert rules" ON public.llm_alert_rules
  FOR SELECT USING (client_id IS NULL OR public.is_client_member(client_id));
DROP POLICY IF EXISTS "members write alert rules" ON public.llm_alert_rules;
CREATE POLICY "members write alert rules" ON public.llm_alert_rules
  FOR ALL USING (client_id IS NULL OR public.is_client_member(client_id))
  WITH CHECK (client_id IS NULL OR public.is_client_member(client_id));

DROP POLICY IF EXISTS "members read alerts" ON public.llm_alerts;
CREATE POLICY "members read alerts" ON public.llm_alerts
  FOR SELECT USING (client_id IS NULL OR public.is_client_member(client_id));
DROP POLICY IF EXISTS "members ack alerts" ON public.llm_alerts;
CREATE POLICY "members ack alerts" ON public.llm_alerts
  FOR UPDATE USING (client_id IS NULL OR public.is_client_member(client_id))
  WITH CHECK (client_id IS NULL OR public.is_client_member(client_id));

INSERT INTO public.llm_alert_rules (client_id, alert_type, severity, threshold, window_minutes, debounce_minutes)
SELECT * FROM (VALUES
  (NULL::uuid, 'token_explosion',      'warning',  100000::numeric, 15, 60),
  (NULL::uuid, 'retry_loop',           'warning',  3::numeric,      10, 30),
  (NULL::uuid, 'provider_instability', 'critical', 5::numeric,      10, 30),
  (NULL::uuid, 'latency_spike',        'warning',  15000::numeric,  10, 30),
  (NULL::uuid, 'config_missing',       'critical', 1::numeric,      5,  60),
  (NULL::uuid, 'cron_failure',         'critical', 1::numeric,      30, 30),
  (NULL::uuid, 'error_rate_spike',     'warning',  0.30::numeric,   15, 30)
) AS v(client_id, alert_type, severity, threshold, window_minutes, debounce_minutes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_alert_rules r WHERE r.client_id IS NULL AND r.alert_type = v.alert_type
);

CREATE OR REPLACE FUNCTION public.llm_ops_latency_percentiles(p_minutes int DEFAULT 60)
RETURNS TABLE(provider text, model text, calls bigint, p50_ms numeric, p95_ms numeric, p99_ms numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT provider, model, count(*)::bigint,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms)::numeric,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::numeric
  FROM public.llm_usage_log
  WHERE created_at > now() - make_interval(mins => p_minutes) AND latency_ms IS NOT NULL
  GROUP BY provider, model ORDER BY count(*) DESC;
$$;

CREATE OR REPLACE FUNCTION public.llm_ops_cost_by_tenant(p_minutes int DEFAULT 1440)
RETURNS TABLE(client_id uuid, calls bigint, total_tokens bigint, estimated_cost_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id, count(*)::bigint, coalesce(sum(total_tokens),0)::bigint,
         coalesce(sum(estimated_cost_usd),0)::numeric
  FROM public.llm_usage_log
  WHERE created_at > now() - make_interval(mins => p_minutes)
  GROUP BY client_id ORDER BY 4 DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.llm_ops_top_functions(p_minutes int DEFAULT 60, p_limit int DEFAULT 20)
RETURNS TABLE(function_name text, calls bigint, total_tokens bigint, avg_latency_ms numeric, error_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT function_name, count(*)::bigint, coalesce(sum(total_tokens),0)::bigint,
         avg(latency_ms)::numeric,
         (count(*) FILTER (WHERE NOT success))::numeric / NULLIF(count(*),0)
  FROM public.llm_usage_log
  WHERE created_at > now() - make_interval(mins => p_minutes)
  GROUP BY function_name ORDER BY 3 DESC NULLS LAST LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.llm_ops_chain(p_correlation_id text)
RETURNS SETOF public.llm_usage_log
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.llm_usage_log WHERE correlation_id = p_correlation_id ORDER BY created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.llm_ops_error_heatmap(p_minutes int DEFAULT 1440)
RETURNS TABLE(bucket timestamptz, function_name text, errors bigint, error_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('hour', created_at), function_name, count(*)::bigint, error_type
  FROM public.llm_usage_log
  WHERE created_at > now() - make_interval(mins => p_minutes) AND NOT success
  GROUP BY 1,2,4 ORDER BY 1 DESC;
$$;

CREATE OR REPLACE FUNCTION public.llm_ops_retry_heatmap(p_minutes int DEFAULT 1440)
RETURNS TABLE(bucket timestamptz, provider text, retries bigint, calls bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('hour', created_at), provider,
         coalesce(sum(retries),0)::bigint, count(*)::bigint
  FROM public.llm_usage_log
  WHERE created_at > now() - make_interval(mins => p_minutes)
  GROUP BY 1,2 ORDER BY 1 DESC;
$$;

CREATE OR REPLACE FUNCTION public.detect_llm_alerts()
RETURNS TABLE(alert_id uuid, alert_type text, client_id uuid, severity text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_now timestamptz := now(); v_last timestamptz; v_id uuid;
BEGIN
  FOR r IN
    SELECT u.client_id, sum(coalesce(u.total_tokens,0)) AS observed, rule.threshold, rule.severity, rule.debounce_minutes
    FROM public.llm_usage_log u
    JOIN public.llm_alert_rules rule ON rule.alert_type='token_explosion' AND rule.enabled
       AND (rule.client_id = u.client_id OR rule.client_id IS NULL)
    WHERE u.created_at > v_now - make_interval(mins => rule.window_minutes)
    GROUP BY u.client_id, rule.threshold, rule.severity, rule.debounce_minutes
    HAVING sum(coalesce(u.total_tokens,0)) > rule.threshold
  LOOP
    SELECT max(created_at) INTO v_last FROM public.llm_alerts
      WHERE alert_type='token_explosion' AND client_id IS NOT DISTINCT FROM r.client_id;
    IF v_last IS NULL OR v_last < v_now - make_interval(mins => r.debounce_minutes) THEN
      INSERT INTO public.llm_alerts(client_id, alert_type, severity, title, message, observed_value, threshold)
      VALUES (r.client_id, 'token_explosion', r.severity, 'Token explosion detected',
              format('Consumo de %s tokens excede limite %s', r.observed, r.threshold), r.observed, r.threshold)
      RETURNING id INTO v_id;
      alert_id:=v_id; alert_type:='token_explosion'; client_id:=r.client_id; severity:=r.severity; RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN
    SELECT u.client_id, avg(u.retries)::numeric AS observed, rule.threshold, rule.severity, rule.debounce_minutes
    FROM public.llm_usage_log u
    JOIN public.llm_alert_rules rule ON rule.alert_type='retry_loop' AND rule.enabled
       AND (rule.client_id = u.client_id OR rule.client_id IS NULL)
    WHERE u.created_at > v_now - make_interval(mins => rule.window_minutes)
    GROUP BY u.client_id, rule.threshold, rule.severity, rule.debounce_minutes
    HAVING avg(u.retries) > rule.threshold
  LOOP
    SELECT max(created_at) INTO v_last FROM public.llm_alerts
      WHERE alert_type='retry_loop' AND client_id IS NOT DISTINCT FROM r.client_id;
    IF v_last IS NULL OR v_last < v_now - make_interval(mins => r.debounce_minutes) THEN
      INSERT INTO public.llm_alerts(client_id, alert_type, severity, title, message, observed_value, threshold)
      VALUES (r.client_id, 'retry_loop', r.severity, 'Retry loop detected',
              format('Média de retries %s > %s', round(r.observed,2), r.threshold), r.observed, r.threshold)
      RETURNING id INTO v_id;
      alert_id:=v_id; alert_type:='retry_loop'; client_id:=r.client_id; severity:=r.severity; RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN
    SELECT u.client_id, u.provider, count(*) AS observed, rule.threshold, rule.severity, rule.debounce_minutes
    FROM public.llm_usage_log u
    JOIN public.llm_alert_rules rule ON rule.alert_type='provider_instability' AND rule.enabled
       AND (rule.client_id = u.client_id OR rule.client_id IS NULL)
    WHERE u.created_at > v_now - make_interval(mins => rule.window_minutes)
      AND u.error_type='provider_unstable'
    GROUP BY u.client_id, u.provider, rule.threshold, rule.severity, rule.debounce_minutes
    HAVING count(*) > rule.threshold
  LOOP
    SELECT max(created_at) INTO v_last FROM public.llm_alerts
      WHERE alert_type='provider_instability' AND client_id IS NOT DISTINCT FROM r.client_id
        AND context->>'provider' = r.provider;
    IF v_last IS NULL OR v_last < v_now - make_interval(mins => r.debounce_minutes) THEN
      INSERT INTO public.llm_alerts(client_id, alert_type, severity, title, message, observed_value, threshold, context)
      VALUES (r.client_id, 'provider_instability', r.severity,
              format('Provider %s instável', r.provider),
              format('%s falhas 5xx em janela', r.observed),
              r.observed, r.threshold, jsonb_build_object('provider', r.provider))
      RETURNING id INTO v_id;
      alert_id:=v_id; alert_type:='provider_instability'; client_id:=r.client_id; severity:=r.severity; RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN
    SELECT u.client_id, u.function_name,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY u.latency_ms) AS observed,
           rule.threshold, rule.severity, rule.debounce_minutes
    FROM public.llm_usage_log u
    JOIN public.llm_alert_rules rule ON rule.alert_type='latency_spike' AND rule.enabled
       AND (rule.client_id = u.client_id OR rule.client_id IS NULL)
    WHERE u.created_at > v_now - make_interval(mins => rule.window_minutes)
    GROUP BY u.client_id, u.function_name, rule.threshold, rule.severity, rule.debounce_minutes
    HAVING percentile_cont(0.95) WITHIN GROUP (ORDER BY u.latency_ms) > rule.threshold
  LOOP
    SELECT max(created_at) INTO v_last FROM public.llm_alerts
      WHERE alert_type='latency_spike' AND client_id IS NOT DISTINCT FROM r.client_id
        AND context->>'function_name' = r.function_name;
    IF v_last IS NULL OR v_last < v_now - make_interval(mins => r.debounce_minutes) THEN
      INSERT INTO public.llm_alerts(client_id, alert_type, severity, title, message, observed_value, threshold, context)
      VALUES (r.client_id, 'latency_spike', r.severity,
              format('Latency spike em %s', r.function_name),
              format('p95 %sms > %sms', round(r.observed), r.threshold),
              r.observed, r.threshold, jsonb_build_object('function_name', r.function_name))
      RETURNING id INTO v_id;
      alert_id:=v_id; alert_type:='latency_spike'; client_id:=r.client_id; severity:=r.severity; RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN
    SELECT u.client_id, count(*) AS observed, rule.threshold, rule.severity, rule.debounce_minutes
    FROM public.llm_usage_log u
    JOIN public.llm_alert_rules rule ON rule.alert_type='config_missing' AND rule.enabled
       AND (rule.client_id = u.client_id OR rule.client_id IS NULL)
    WHERE u.created_at > v_now - make_interval(mins => rule.window_minutes)
      AND u.error_type='config_missing'
    GROUP BY u.client_id, rule.threshold, rule.severity, rule.debounce_minutes
    HAVING count(*) >= rule.threshold
  LOOP
    SELECT max(created_at) INTO v_last FROM public.llm_alerts
      WHERE alert_type='config_missing' AND client_id IS NOT DISTINCT FROM r.client_id;
    IF v_last IS NULL OR v_last < v_now - make_interval(mins => r.debounce_minutes) THEN
      INSERT INTO public.llm_alerts(client_id, alert_type, severity, title, message, observed_value, threshold)
      VALUES (r.client_id, 'config_missing', r.severity, 'LLM config ausente',
              format('%s chamadas bloqueadas por LLM_CONFIG_MISSING', r.observed), r.observed, r.threshold)
      RETURNING id INTO v_id;
      alert_id:=v_id; alert_type:='config_missing'; client_id:=r.client_id; severity:=r.severity; RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN
    SELECT u.client_id,
           (count(*) FILTER (WHERE NOT success))::numeric / NULLIF(count(*),0) AS observed,
           rule.threshold, rule.severity, rule.debounce_minutes,
           count(*) AS total_calls
    FROM public.llm_usage_log u
    JOIN public.llm_alert_rules rule ON rule.alert_type='error_rate_spike' AND rule.enabled
       AND (rule.client_id = u.client_id OR rule.client_id IS NULL)
    WHERE u.created_at > v_now - make_interval(mins => rule.window_minutes)
    GROUP BY u.client_id, rule.threshold, rule.severity, rule.debounce_minutes
    HAVING count(*) >= 10
       AND (count(*) FILTER (WHERE NOT success))::numeric / NULLIF(count(*),0) > rule.threshold
  LOOP
    SELECT max(created_at) INTO v_last FROM public.llm_alerts
      WHERE alert_type='error_rate_spike' AND client_id IS NOT DISTINCT FROM r.client_id;
    IF v_last IS NULL OR v_last < v_now - make_interval(mins => r.debounce_minutes) THEN
      INSERT INTO public.llm_alerts(client_id, alert_type, severity, title, message, observed_value, threshold, context)
      VALUES (r.client_id, 'error_rate_spike', r.severity, 'Error rate elevada',
              format('Taxa de erro %s%% em %s chamadas', round(r.observed*100,1), r.total_calls),
              r.observed, r.threshold, jsonb_build_object('total_calls', r.total_calls))
      RETURNING id INTO v_id;
      alert_id:=v_id; alert_type:='error_rate_spike'; client_id:=r.client_id; severity:=r.severity; RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;
