import type { ApiClient } from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";

import { createCloudBusinessApi } from "./cloudBusinessApi";

const userId = "3fef2a38-1c5b-4bb8-a8fd-50dc735e8751";

const createClient = () => {
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
    },
    getOne: vi.fn().mockResolvedValue({
      owner_user_id: userId,
      config: { title: "DealPilot" },
    }),
    update: vi.fn().mockResolvedValue({
      owner_user_id: userId,
      config: { title: "Updated" },
    }),
    invoke: vi.fn().mockResolvedValue({ merged: true }),
    storage: {
      upload: vi.fn().mockResolvedValue({ path: `${userId}/note.txt` }),
      createSignedUrl: vi.fn().mockResolvedValue({
        path: `${userId}/note.txt`,
        signedUrl: "https://example.test/signed/note.txt",
        expiresIn: 3600,
      }),
    },
  };
  return client;
};

describe("cloud business API", () => {
  it("uses owner_user_id for personal configuration", async () => {
    const client = createClient();
    const api = createCloudBusinessApi(client as unknown as ApiClient);

    await expect(api.getConfiguration()).resolves.toEqual({ title: "DealPilot" });
    await api.updateConfiguration({ title: "Updated" } as never);

    expect(client.getOne).toHaveBeenCalledWith(
      "configuration",
      userId,
      expect.anything(),
      { idField: "owner_user_id", select: "owner_user_id,config" },
    );
    expect(client.update).toHaveBeenCalledWith(
      "configuration",
      userId,
      { config: { title: "Updated" } },
      expect.anything(),
      { idField: "owner_user_id", select: "owner_user_id,config" },
    );
  });

  it("uses the API client for merge commands and private attachments", async () => {
    const client = createClient();
    const api = createCloudBusinessApi(client as unknown as ApiClient);

    await api.mergeContacts("source", "target");
    await expect(
      api.uploadAttachment("note.txt", new Blob(["note"]), "text/plain"),
    ).resolves.toBe("https://example.test/signed/note.txt");

    expect(client.invoke).toHaveBeenCalledWith(
      "merge_contacts",
      expect.anything(),
      { body: { loserId: "source", winnerId: "target" } },
    );
    expect(client.storage.upload).toHaveBeenCalledWith(
      "attachments",
      "note.txt",
      expect.any(Blob),
      { contentType: "text/plain" },
    );
  });
});
