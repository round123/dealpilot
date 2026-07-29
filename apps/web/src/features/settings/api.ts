import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { Settings, SettingsUpdate } from "@dealpilot/shared";

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>(API_PATHS.settings),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SettingsUpdate) =>
      api.put<Settings>(API_PATHS.settings, data),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
    },
  });
}
