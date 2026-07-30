import { fetchMedia } from "./mediaFetch";

export async function fetchWithTimeout(
  resource: string,
  options: RequestInit & { timeout?: number } = {},
) {
  const { timeout = 2000 } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetchMedia(resource, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}
