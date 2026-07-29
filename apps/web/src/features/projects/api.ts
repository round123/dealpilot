import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { Project, ProjectDetail, ProjectCreate, ProjectUpdate, ProjectStageUpdate } from "@dealpilot/shared";

export interface ProjectListResponse {
  items: Project[];
  next_cursor: string | null;
}

export interface ProjectListParams {
  customer_id?: string;
  stage?: string;
  grade?: string;
  cursor?: string;
  limit?: number;
}

export function useProjects(params: ProjectListParams = {}) {
  return useQuery<ProjectListResponse>({
    queryKey: ["projects", params],
    queryFn: () => api.get<ProjectListResponse>(API_PATHS.projects, params),
    placeholderData: (prev) => prev,
  });
}

export function useProject(id: string) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", id],
    queryFn: () => api.get<ProjectDetail>(API_PATHS.project(id)),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectCreate) =>
      api.post<Project>(API_PATHS.projects, data, { idempotent: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectUpdate) =>
      api.put<Project>(API_PATHS.project(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.delete<void>(API_PATHS.project(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProjectStage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectStageUpdate) =>
      api.put<Project>(API_PATHS.projectStage(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
