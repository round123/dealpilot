import { useTranslate, required } from "ra-core";

import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { FOLLOW_UP_TYPES, MESSAGE_DIRECTIONS } from "./followUpContract";

export const FollowUpInputs = () => {
  const translate = useTranslate();
  const typeChoices = FOLLOW_UP_TYPES.map((type) => ({
    id: type,
    name: translate(`resources.follow_ups.types.${type}`, {
      _: followUpTypeFallbacks[type],
    }),
  }));
  const directionChoices = MESSAGE_DIRECTIONS.map((direction) => ({
    id: direction,
    name: translate(`resources.follow_ups.directions.${direction}`, {
      _: direction === "inbound" ? "收到" : "发出",
    }),
  }));

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <SelectInput
        source="type"
        label={translate("resources.follow_ups.fields.type", {
          _: "跟进方式",
        })}
        choices={typeChoices}
        validate={required()}
        helperText={false}
      />
      <DateTimeInput
        source="occurred_at"
        label={translate("resources.follow_ups.fields.occurred_at", {
          _: "发生时间",
        })}
        validate={required()}
        helperText={false}
      />
      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteInput
          label={translate("resources.follow_ups.fields.company_id", {
            _: "客户",
          })}
          optionText="name"
          validate={required()}
          helperText={false}
        />
      </ReferenceInput>
      <ReferenceInput source="deal_id" reference="deals">
        <AutocompleteInput
          label={translate("resources.follow_ups.fields.deal_id", {
            _: "项目",
          })}
          optionText="name"
          helperText={false}
        />
      </ReferenceInput>
      <TextInput
        source="note"
        label={translate("resources.follow_ups.fields.note", { _: "跟进记录" })}
        multiline
        rows={4}
        helperText={false}
        className="md:col-span-2"
      />
      <TextInput
        source="message_body"
        label={translate("resources.follow_ups.fields.message_body", {
          _: "消息内容",
        })}
        multiline
        rows={3}
        helperText={false}
        className="md:col-span-2"
      />
      <SelectInput
        source="message_direction"
        label={translate("resources.follow_ups.fields.message_direction", {
          _: "消息方向",
        })}
        choices={directionChoices}
        helperText={false}
      />
    </div>
  );
};

const followUpTypeFallbacks: Record<(typeof FOLLOW_UP_TYPES)[number], string> =
  {
    call: "电话",
    email: "邮件",
    chat: "即时沟通",
    visit: "拜访",
    note: "记录",
    message: "消息",
  };
