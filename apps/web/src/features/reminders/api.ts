import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { Reminder, ReminderStatusUpdate } from "@dealpilot/shared";

export interface ReminderListResponse {
  items: Reminder[];
  next_cursor: string | null;
}

export function useReminders(params: { status?: string; cursor?: string; limit?: number; sort_by?: string } = {}) {
  return useQuery<ReminderListResponse>({
    queryKey: ["reminders", params],
    queryFn: () => api.get<ReminderListResponse>(API_PATHS.reminders, params),
    placeholderData: (prev) => prev,
  });
}

export function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReminderStatusUpdate }) =>
      api.put<Reminder>(API_PATHS.reminder(id), data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ["reminders"] });
      const previousQueries = qc.getQueriesData<ReminderListResponse>({ queryKey: ["reminders"] });
      qc.setQueriesData<ReminderListResponse>({ queryKey: ["reminders"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((r) => (r.id === id ? { ...r, status: data.status } : r)),
        };
      });
      return { previousQueries };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousQueries) {
        for (const [key, value] of ctx.previousQueries) {
          qc.setQueryData(key, value);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function usePopupReminders() {
  return useQuery<Reminder[]>({
    queryKey: ["reminders", "popup"],
    queryFn: () => api.get<Reminder[]>(API_PATHS.remindersPopup),
  });
}
