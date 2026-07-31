import type { CustomerFollowUp } from "@dealpilot/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Form,
  useNotify,
  useRecordContext,
  useRedirect,
  useTranslate,
  type Identifier,
} from "ra-core";

import { DeleteButton } from "@/components/admin/delete-button";
import { Edit } from "@/components/admin/edit";
import { SaveButton } from "@/components/admin/form";
import { getErrorMessageKey } from "@/components/admin/error-message";

import { invalidateEngagementQueries } from "../engagements/invalidateEngagementQueries";
import { FollowUpInputs } from "./FollowUpInputs";
import { FollowUpSaveError } from "./FollowUpCreate";

export const FollowUpEdit = ({ id }: { id?: Identifier } = {}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const redirect = useRedirect();
  const translate = useTranslate();
  const [saveFailed, setSaveFailed] = useState(false);

  return (
    <Edit
      id={id}
      resource="follow_ups"
      title={translate("resources.follow_ups.action.edit", { _: "编辑跟进" })}
      actions={false}
      redirect={false}
      mutationMode="pessimistic"
      mutationOptions={{
        retry: false,
        onMutate: () => setSaveFailed(false),
        onError: (error) => {
          setSaveFailed(true);
          notify(getErrorMessageKey(error, "resources.follow_ups.notifications.save_failed"), {
            _: "跟进保存失败，请检查内容后重试",
            type: "error",
          });
        },
        onSuccess: async (data) => {
          const record = data as unknown as CustomerFollowUp;
          await invalidateEngagementQueries(
            queryClient,
            "follow_ups",
            record.company_id,
          );
          notify("resources.follow_ups.notifications.updated", {
            _: "跟进已更新",
            type: "success",
          });
          redirect("list", "follow_ups");
        },
      }}
    >
      <Form className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {saveFailed ? <FollowUpSaveError /> : null}
        <FollowUpInputs />
        <FollowUpEditToolbar />
      </Form>
    </Edit>
  );
};

const FollowUpEditToolbar = () => {
  const record = useRecordContext<CustomerFollowUp>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const redirect = useRedirect();
  const translate = useTranslate();

  if (!record) return null;

  return (
    <div className="sticky bottom-16 flex flex-wrap justify-between gap-3 border-t bg-background py-4 md:bottom-0">
      <DeleteButton
        label={translate("resources.follow_ups.action.delete", {
          _: "删除跟进",
        })}
        resource="follow_ups"
        redirect={false}
        mutationOptions={{
          mutationMode: "pessimistic",
          retry: false,
          onSuccess: async () => {
            await invalidateEngagementQueries(
              queryClient,
              "follow_ups",
              record.company_id,
            );
            notify("resources.follow_ups.notifications.deleted", {
              _: "跟进已删除",
              type: "success",
            });
            redirect("list", "follow_ups");
          },
        }}
      />
      <SaveButton
        label={translate("resources.follow_ups.action.save", {
          _: "保存跟进",
        })}
      />
    </div>
  );
};
