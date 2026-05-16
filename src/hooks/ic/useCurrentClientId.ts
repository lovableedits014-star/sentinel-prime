// Re-export the unified hook so legacy imports keep working
// and everyone shares the same impersonation-aware cache.
import { useActiveClientId } from "@/hooks/useActiveClientId";

export function useCurrentClientId() {
  const q = useActiveClientId();
  // Preserve the original useQuery-like shape: `data` is the clientId string.
  return {
    ...q,
    data: q.clientId,
  };
}
