import type { ApiClient, StorageUploadBody } from "@dealpilot/api-client";
import { z } from "zod/v3";

import type { ConfigurationContextValue } from "../root/ConfigurationContext";
import { ATTACHMENTS_BUCKET } from "./commons/attachments";
import { getCloudApiClient } from "./apiClient";

const ConfigurationSchema = z.object({
  owner_user_id: z.string().uuid(),
  config: z.record(z.unknown()),
});

type ConfigurationRecord = z.infer<typeof ConfigurationSchema>;
type ConfigClient = {
  getOne(
    resource: string,
    id: string,
    schema: unknown,
    options: { idField: string; select: string },
  ): Promise<ConfigurationRecord>;
  update(
    resource: string,
    id: string,
    input: object,
    schema: unknown,
    options: { idField: string; select: string },
  ): Promise<ConfigurationRecord>;
};
type FunctionInvoker = (
  name: string,
  schema: unknown,
  options: { body: unknown },
) => Promise<unknown>;

export const createCloudBusinessApi = (client: ApiClient) => {
  const configClient = client as unknown as ConfigClient;
  const invoke = client.invoke.bind(client) as FunctionInvoker;

  const currentUserId = async () => {
    const session = await client.auth.getSession();
    if (!session) throw new Error("Authentication required");
    return session.user.id;
  };

  const getAttachmentUrl = async (relativePath: string) => {
    const result = await client.storage.createSignedUrl(
      ATTACHMENTS_BUCKET,
      relativePath,
      3600,
    );
    return result.signedUrl;
  };

  return {
    mergeContacts(sourceId: string, targetId: string) {
      return invoke("merge_contacts", z.unknown(), {
        body: { loserId: sourceId, winnerId: targetId },
      });
    },

    async getConfiguration(): Promise<ConfigurationContextValue> {
      const userId = await currentUserId();
      const record = await configClient.getOne(
        "configuration",
        userId,
        ConfigurationSchema,
        { idField: "owner_user_id", select: "owner_user_id,config" },
      );
      return record.config as unknown as ConfigurationContextValue;
    },

    async updateConfiguration(
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> {
      const userId = await currentUserId();
      const record = await configClient.update(
        "configuration",
        userId,
        { config },
        ConfigurationSchema,
        { idField: "owner_user_id", select: "owner_user_id,config" },
      );
      return record.config as unknown as ConfigurationContextValue;
    },

    getAttachmentUrl,

    async uploadAttachment(
      relativePath: string,
      body: StorageUploadBody,
      contentType?: string,
    ) {
      await client.storage.upload(ATTACHMENTS_BUCKET, relativePath, body, {
        contentType,
      });
      return getAttachmentUrl(relativePath);
    },
  };
};

let businessApi: ReturnType<typeof createCloudBusinessApi> | undefined;

export const getCloudBusinessApi = () => {
  businessApi ??= createCloudBusinessApi(getCloudApiClient());
  return businessApi;
};
