import type { CustomerFollowUp } from "@dealpilot/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Form, useNotify, useRedirect, useTranslate } from "ra-core";

import { Create } from "@/components/admin/create";
import { SaveButton } from "@/components/admin/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { invalidateEngagementQueries } from "../engagements/invalidateEngagementQueries";
import { FollowUpInputs } from "./FollowUpInputs";
import {
  createFollowUpDefaults,
  type FollowUpFormValues,
} from "./followUpContract";

export const FollowUpCreate = ({
  defaultValues,
}: {
  defaultValues?: Partial<FollowUpFormValues>;
} = {}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const redirect = useRedirect();
  const translate = useTranslate();
  const [saveFailed, setSaveFailed] = useState(false);
  const initialValues = useMemo(
    () => createFollowUpDefaults(defaultValues),
    [defaultValues],
  );

  return (
    <Create
      resource="follow_ups"
      title={translate("resources.follow_ups.action.create", {
        _: "新建跟进",
      })}
      redirect={false}
      mutationOptions={{
        retry: false,
        onMutate: () => setSaveFailed(false),
        onError: () => {
          setSaveFailed(true);
          notify("resources.follow_ups.notifications.save_failed", {
            _: "跟进保存失败，请检查内容后重试",
            type: "error",
          });
        },
        onSuccess: async (record: CustomerFollowUp) => {
          await invalidateEngagementQueries(
            queryClient,
            "follow_ups",
            record.company_id,
          );
          notify("resources.follow_ups.notifications.created", {
            _: "跟进已创建",
            type: "success",
          });
          redirect("list", "follow_ups");
        },
      }}
    >
      <Form
        defaultValues={initialValues}
        className="mx-auto flex w-full max-w-4xl flex-col gap-4"
      >
        {saveFailed ? <FollowUpSaveError /> : null}
        <FollowUpInputs />
        <div className="sticky bottom-16 flex justify-end border-t bg-background py-4 md:bottom-0">
          <SaveButton
            label={translate("resources.follow_ups.action.save", {
              _: "保存跟进",
            })}
          />
        </div>
      </Form>
    </Create>
  );
};

export const FollowUpSaveError = () => {
  const translate = useTranslate();
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>
        {translate("resources.follow_ups.errors.save_title", {
          _: "未能保存跟进",
        })}
      </AlertTitle>
      <AlertDescription>
        {translate("resources.follow_ups.errors.form_preserved", {
          _: "已保留当前填写内容，请修正后重试。",
        })}
      </AlertDescription>
    </Alert>
  );
};
