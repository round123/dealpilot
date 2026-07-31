import { required, useTranslate } from "ra-core";
import { useFormContext, useWatch } from "react-hook-form";

import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";

import {
  REMINDER_PRIORITIES,
  REMINDER_TYPES,
  reminderDueAfterDays,
} from "./reminderContract";

export const ReminderInputs = () => {
  const translate = useTranslate();
  const type = useWatch({ name: "type" });
  const { setValue } = useFormContext();
  const typeChoices = REMINDER_TYPES.map((type) => ({
    id: type,
    name: translate(`resources.reminders.types.${type}`, {
      _: reminderTypeFallbacks[type],
    }),
  }));
  const priorityChoices = REMINDER_PRIORITIES.map((priority) => ({
    id: priority,
    name: translate(`resources.reminders.priorities.${priority}`, {
      _: reminderPriorityFallbacks[priority],
    }),
  }));

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteInput
          label={translate("resources.reminders.fields.company_id", {
            _: "客户",
          })}
          optionText="name"
          validate={required()}
          helperText={false}
        />
      </ReferenceInput>
      <ReferenceInput source="deal_id" reference="deals">
        <AutocompleteInput
          label={translate("resources.reminders.fields.deal_id", {
            _: "项目",
          })}
          optionText="name"
          helperText={false}
        />
      </ReferenceInput>
      <SelectInput
        source="type"
        label={translate("resources.reminders.fields.type", { _: "提醒类型" })}
        choices={typeChoices}
        validate={required()}
        helperText={false}
      />
      <SelectInput
        source="priority"
        label={translate("resources.reminders.fields.priority", {
          _: "优先级",
        })}
        choices={priorityChoices}
        validate={required()}
        helperText={false}
      />
      {type === "paused" ? (
        <>
          <TextInput
            source="pause_reason"
            label="暂不跟进原因"
            validate={required()}
            helperText={false}
            multiline
            rows={3}
            className="md:col-span-2"
          />
          <DateTimeInput
            source="reevaluate_at"
            label="重新评估日期（可选）"
            helperText="不填写则不会触发提醒"
            className="md:col-span-2"
          />
        </>
      ) : (
        <div className="space-y-3 md:col-span-2">
          {type === "fixed_time" ? (
            <div className="flex flex-wrap gap-2" aria-label="提醒时间快捷选项">
              <QuickDueButton days={3} setValue={setValue}>3 天后</QuickDueButton>
              <QuickDueButton days={7} setValue={setValue}>1 周后</QuickDueButton>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  document.querySelector<HTMLInputElement>('input[name="due_at"]')?.focus()
                }
              >
                自定义
              </Button>
            </div>
          ) : null}
          <DateTimeInput
            source="due_at"
            label={translate("resources.reminders.fields.due_at", {
              _: "到期时间",
            })}
            validate={required()}
            helperText={false}
          />
        </div>
      )}
    </div>
  );
};

const QuickDueButton = ({
  days,
  setValue,
  children,
}: {
  days: number;
  setValue: ReturnType<typeof useFormContext>["setValue"];
  children: React.ReactNode;
}) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() =>
      setValue(
        "due_at",
        reminderDueAfterDays(days),
        { shouldDirty: true, shouldValidate: true },
      )
    }
  >
    {children}
  </Button>
);

const reminderTypeFallbacks: Record<(typeof REMINDER_TYPES)[number], string> = {
  fixed_time: "指定时间",
  waiting_reply: "等待回复",
  paused: "暂停提醒",
};

const reminderPriorityFallbacks: Record<
  (typeof REMINDER_PRIORITIES)[number],
  string
> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};
