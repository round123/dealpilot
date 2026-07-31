import { required, useTranslate } from "ra-core";

import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";

import { REMINDER_PRIORITIES, REMINDER_TYPES } from "./reminderContract";

export const ReminderInputs = () => {
  const translate = useTranslate();
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
      <DateTimeInput
        source="due_at"
        label={translate("resources.reminders.fields.due_at", {
          _: "到期时间",
        })}
        validate={required()}
        helperText={false}
        className="md:col-span-2"
      />
    </div>
  );
};

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
