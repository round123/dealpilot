import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { Customer, CustomerDetail, CustomerCreate, CustomerUpdate } from "@dealpilot/shared";

export interface CustomerListResponse {
  items: Customer[];
  next_cursor: string | null;
}

export interface CustomerListParams {
  cursor?: string;
  limit?: number;
  search?: string;
  grade?: string;
  status?: string;
  sort?: string;
}

export function useCustomers(params: CustomerListParams = {}) {
  return useQuery<CustomerListResponse>({
    queryKey: ["customers", params],
    queryFn: () => api.get<CustomerListResponse>(API_PATHS.customers, params),
    placeholderData: (prev) => prev,
  });
}

export function useCustomer(id: string) {
  return useQuery<CustomerDetail>({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(API_PATHS.customer(id)),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerCreate) =>
      api.post<Customer>(API_PATHS.customers, data, { idempotent: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerUpdate) =>
      api.put<Customer>(API_PATHS.customer(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(API_PATHS.customer(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useMergeCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { source_id: string; target_id: string; field_resolutions?: Record<string, "source" | "target"> }) =>
      api.post<Customer>(API_PATHS.customerMerge, data, { idempotent: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
