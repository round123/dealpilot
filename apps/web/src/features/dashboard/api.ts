import { useQuery } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { Stats, Reminder } from "@dealpilot/shared";

export function useStats() {
  return useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => api.get<Stats>(API_PATHS.stats),
  });
}

export function useTodayReminders() {
  return useQuery<{ items: Reminder[]; next_cursor: string | null }>({
    queryKey: ["reminders", "today"],
    queryFn: () =>
      api.get<{ items: Reminder[]; next_cursor: string | null }>(
        API_PATHS.reminders,
        { status: "pending", limit: 5, sort_by: "due_at" },
      ),
  });
}

export function useOverdueReminders() {
  return useQuery<{ items: Reminder[]; next_cursor: string | null }>({
    queryKey: ["reminders", "overdue"],
    queryFn: () =>
      api.get<{ items: Reminder[]; next_cursor: string | null }>(
        API_PATHS.reminders,
        { status: "overdue", limit: 50 },
      ),
  });
}
