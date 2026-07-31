import type { CustomerReminder } from "@dealpilot/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Form, useNotify, useRedirect, useTranslate } from "ra-core";

import { Create } from "@/components/admin/create";
import { SaveButton } from "@/components/admin/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { invalidateEngagementQueries } from "../engagements/invalidateEngagementQueries";
import { ReminderInputs } from "./ReminderInputs";
import {
  createReminderDefaults,
  type ReminderFormValues,
} from "./reminderContract";

export const ReminderCreate = ({
  defaultValues,
}: {
  defaultValues?: Partial<ReminderFormValues>;
} = {}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const redirect = useRedirect();
  const translate = useTranslate();
  const [saveFailed, setSaveFailed] = useState(false);
  const initialValues = useMemo(
    () => createReminderDefaults(defaultValues),
    [defaultValues],
  );

  return (
    <Create
      resource="reminders"
      title={translate("resources.reminders.action.create", {
        _: "新建提醒",
      })}
      redirect={false}
      mutationOptions={{
        retry: false,
        onMutate: () => setSaveFailed(false),
        onError: () => {
          setSaveFailed(true);
          notify("resources.reminders.notifications.save_failed", {
            _: "提醒保存失败，请检查内容后重试",
            type: "error",
          });
        },
        onSuccess: async (record: CustomerReminder) => {
          await invalidateEngagementQueries(
            queryClient,
            "reminders",
            record.company_id,
          );
          notify("resources.reminders.notifications.created", {
            _: "提醒已创建",
            type: "success",
          });
          redirect("list", "reminders");
        },
      }}
    >
      <Form
        defaultValues={initialValues}
        className="mx-auto flex w-full max-w-3xl flex-col gap-4"
      >
        {saveFailed ? <ReminderSaveError /> : null}
        <ReminderInputs />
        <p className="text-sm text-muted-foreground">
          {translate("resources.reminders.manual_reply_note", {
            _: "等待回复提醒不会自动监听消息；收到回复后请手动标记。",
          })}
        </p>
        <div className="sticky bottom-16 flex justify-end border-t bg-background py-4 md:bottom-0">
          <SaveButton
            label={translate("resources.reminders.action.save", {
              _: "保存提醒",
            })}
          />
        </div>
      </Form>
    </Create>
  );
};

const ReminderSaveError = () => {
  const translate = useTranslate();
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>
        {translate("resources.reminders.errors.save_title", {
          _: "未能保存提醒",
        })}
      </AlertTitle>
      <AlertDescription>
        {translate("resources.reminders.errors.form_preserved", {
          _: "已保留当前填写内容，请修正后重试。",
        })}
      </AlertDescription>
    </Alert>
  );
};
