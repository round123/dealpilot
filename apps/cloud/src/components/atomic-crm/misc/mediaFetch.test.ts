import {
  extractBase64Payload,
  fetchBlobSource,
  fetchEmbeddedImage,
} from "./mediaFetch";

describe("mediaFetch", () => {
  it("extracts a base64 payload without leaking the data URL prefix", () => {
    expect(extractBase64Payload("data:image/png;base64,AAEC")).toBe("AAEC");
  });

  it("rejects malformed data URLs at the media boundary", () => {
    expect(() =>
      extractBase64Payload("https://example.com/avatar.png"),
    ).toThrow("valid base64 data URL");
  });

  it("fetches and converts an image through injected boundary dependencies", async () => {
    const blob = new Blob(["avatar"], { type: "image/webp" });
    const fetcher = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(blob),
    } as unknown as Response);
    const readBlobAsDataUrl = vi
      .fn()
      .mockResolvedValue("data:image/webp;base64,YXZhdGFy");

    await expect(
      fetchEmbeddedImage("https://example.com/avatar.webp", {
        fetcher,
        readBlobAsDataUrl,
      }),
    ).resolves.toEqual({
      base64: "YXZhdGFy",
      mimeType: "image/webp",
    });
    expect(fetcher).toHaveBeenCalledWith("https://example.com/avatar.webp");
    expect(readBlobAsDataUrl).toHaveBeenCalledWith(blob);
  });

  it("converts a local initials data URL without calling a fetcher", async () => {
    const fetcher = vi.fn();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>AL</text></svg>';
    const resource = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

    const embedded = await fetchEmbeddedImage(resource, { fetcher });

    expect(embedded.mimeType).toBe("image/svg+xml");
    expect(atob(embedded.base64)).toBe(svg);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a Blob from local data without calling global fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const blob = await fetchBlobSource("data:text/plain;base64,SGVsbG8=");

    expect(blob?.type).toBe("text/plain");
    await expect(blob?.text()).resolves.toBe("Hello");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns null when a blob source cannot be downloaded", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchBlobSource("blob:missing")).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith("blob:missing", undefined);
    fetchSpy.mockRestore();
  });
});
