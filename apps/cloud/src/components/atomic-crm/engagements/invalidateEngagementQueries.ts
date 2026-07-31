import type { CustomerId } from "@dealpilot/api-client";
import type { QueryClient } from "@tanstack/react-query";

export const invalidateEngagementQueries = async (
  queryClient: QueryClient,
  resource: "follow_ups" | "reminders",
  companyId: CustomerId,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [resource] }),
    queryClient.invalidateQueries({
      queryKey: ["customers", "detail", companyId],
    }),
    queryClient.invalidateQueries({ queryKey: ["companies", "getOne"] }),
  ]);
};
