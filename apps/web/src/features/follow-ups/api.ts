import { useQuery } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { FollowUp } from "@dealpilot/shared";

export function useFollowUps(params: { customer_id?: string; project_id?: string; cursor?: string; limit?: number }) {
  return useQuery<{
    items: FollowUp[];
    next_cursor: string | null;
  }>({
    queryKey: ["follow-ups", params],
    queryFn: () => api.get(API_PATHS.followUps, params),
    enabled: !!params.customer_id || !!params.project_id,
  });
}
