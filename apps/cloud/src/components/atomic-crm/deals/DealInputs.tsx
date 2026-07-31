import { required, useTranslate } from "ra-core";
import { AutocompleteArrayInput } from "@/components/admin/autocomplete-array-input";
import { ReferenceArrayInput } from "@/components/admin/reference-array-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { TextInput } from "@/components/admin/text-input";
import { NumberInput } from "@/components/admin/number-input";
import { DateInput } from "@/components/admin/date-input";
import { SelectInput } from "@/components/admin/select-input";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

import { contactOptionText } from "../misc/ContactOption";
import { useLocalizedConfigurationContext } from "../root/ConfigurationContext";
import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput.tsx";
import {
  DEAL_GRADES,
  validateClosedReason,
  validateCurrency,
  validateProbability,
} from "./dealValidation";

export const DealInputs = () => {
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col gap-8">
      <DealInfoInputs />

      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <DealLinkedToInputs />
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <DealMiscInputs />
      </div>
    </div>
  );
};

const DealInfoInputs = () => {
  return (
    <div className="flex flex-col gap-4 flex-1">
      <TextInput source="name" validate={required()} helperText={false} />
      <TextInput source="description" multiline rows={3} helperText={false} />
    </div>
  );
};

const DealLinkedToInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">
        {translate("resources.deals.inputs.linked_to")}
      </h3>
      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteCompanyInput
          label="resources.deals.fields.company_id"
          validate={required()}
          modal
        />
      </ReferenceInput>

      <ReferenceArrayInput source="contact_ids" reference="contacts_summary">
        <AutocompleteArrayInput
          label="resources.deals.fields.contact_ids"
          optionText={contactOptionText}
          helperText={false}
        />
      </ReferenceArrayInput>
    </div>
  );
};

const DealMiscInputs = () => {
  const { dealStages, dealCategories, currency } =
    useLocalizedConfigurationContext();
  const translate = useTranslate();
  const fieldLabel = (key: string, fallback: string) =>
    translate(`resources.deals.fields.${key}`, { _: fallback });
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">
        {translate("resources.deals.field_categories.misc")}
      </h3>

      <SelectInput
        source="category"
        choices={dealCategories}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <NumberInput
        source="amount"
        defaultValue={0}
        helperText={false}
        validate={required()}
      />
      <TextInput
        source="currency"
        label={fieldLabel("currency", "币种")}
        defaultValue={currency}
        maxLength={3}
        inputClassName="uppercase"
        parse={(value) =>
          String(value ?? "")
            .trim()
            .toUpperCase()
        }
        helperText={translate("resources.deals.help.currency", {
          _: "使用 CNY、USD 等 3 位大写币种代码",
        })}
        validate={[required(), validateCurrency]}
      />
      <NumberInput
        source="probability"
        label={fieldLabel("probability", "成交概率（%）")}
        min={0}
        max={100}
        step={1}
        helperText={translate("resources.deals.help.probability", {
          _: "填写 0 到 100 之间的整数",
        })}
        validate={validateProbability}
      />
      <SelectInput
        source="grade"
        label={fieldLabel("grade", "项目评级")}
        choices={DEAL_GRADES.map((id) => ({ id, name: id }))}
        defaultValue="C"
        helperText={false}
        validate={required()}
      />
      <DateInput
        validate={required()}
        source="expected_closing_date"
        helperText={false}
        defaultValue={new Date().toISOString().split("T")[0]}
      />
      <SelectInput
        source="stage"
        choices={dealStages}
        optionText="label"
        optionValue="value"
        defaultValue="opportunity"
        helperText={false}
        validate={required()}
      />
      <TextInput
        source="closed_reason"
        label={fieldLabel("closed_reason", "失单或关闭原因")}
        multiline
        rows={3}
        helperText={translate("resources.deals.help.closed_reason", {
          _: "阶段切换为失单或关闭时，此项必须填写",
        })}
        validate={validateClosedReason}
      />
    </div>
  );
};
