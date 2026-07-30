export interface EmbeddedImage {
  base64: string;
  mimeType: string;
}

type MediaFetcher = (
  resource: RequestInfo | URL,
  options?: RequestInit,
) => Promise<Response>;

type BlobDataUrlReader = (blob: Blob) => Promise<string>;

interface EmbeddedImageDependencies {
  fetcher?: MediaFetcher;
  readBlobAsDataUrl?: BlobDataUrlReader;
}

export function fetchMedia(
  resource: RequestInfo | URL,
  options?: RequestInit,
): Promise<Response> {
  return fetch(resource, options);
}

export function extractBase64Payload(dataUrl: string): string {
  const match = /^data:[^,]*;base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1]) {
    throw new Error("Media reader did not return a valid base64 data URL");
  }
  return match[1];
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Media reader did not return a data URL"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Media read failed"));
    reader.readAsDataURL(blob);
  });
}

export async function fetchEmbeddedImage(
  resource: string,
  dependencies: EmbeddedImageDependencies = {},
): Promise<EmbeddedImage> {
  const fetcher = dependencies.fetcher ?? fetchMedia;
  const response = await fetcher(resource);
  const blob = await response.blob();
  const dataUrl = await (dependencies.readBlobAsDataUrl ?? readBlobAsDataUrl)(
    blob,
  );

  return {
    base64: extractBase64Payload(dataUrl),
    mimeType: blob.type || "image/png",
  };
}

export async function fetchBlobSource(resource: string): Promise<Blob | null> {
  try {
    const response = await fetchMedia(resource);
    if (response.status !== 200) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
