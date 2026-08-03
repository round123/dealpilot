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

interface ParsedDataUrl extends EmbeddedImage {
  bytes: Uint8Array;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseDataUrl(resource: string): ParsedDataUrl | null {
  if (!resource.startsWith("data:")) return null;

  const commaIndex = resource.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Media source is not a valid data URL");
  }

  const metadata = resource.slice(5, commaIndex);
  const mimeType = metadata.split(";", 1)[0] || "text/plain";
  const encodedPayload = resource.slice(commaIndex + 1);
  const isBase64 = metadata
    .split(";")
    .slice(1)
    .some((part) => part.toLowerCase() === "base64");

  try {
    const bytes = isBase64
      ? Uint8Array.from(atob(encodedPayload), (character) =>
          character.charCodeAt(0),
        )
      : new TextEncoder().encode(decodeURIComponent(encodedPayload));
    return {
      base64: isBase64 ? encodedPayload : bytesToBase64(bytes),
      mimeType,
      bytes,
    };
  } catch {
    throw new Error("Media source is not a valid data URL");
  }
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
  const localImage = parseDataUrl(resource);
  if (localImage) {
    return { base64: localImage.base64, mimeType: localImage.mimeType };
  }

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
    const localData = parseDataUrl(resource);
    if (localData) {
      return new Blob([localData.bytes], { type: localData.mimeType });
    }

    const response = await fetchMedia(resource);
    if (response.status !== 200) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
