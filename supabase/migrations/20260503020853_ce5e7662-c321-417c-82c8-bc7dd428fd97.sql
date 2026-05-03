CREATE OR REPLACE FUNCTION public.__lovable_migrate_exec(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

REVOKE ALL ON FUNCTION public.__lovable_migrate_exec(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.__lovable_migrate_exec(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.__lovable_migrate_exec(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.__lovable_migrate_exec(text) TO service_role;