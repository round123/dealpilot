import { Card, CardContent } from "@/components/ui/card";
import { EditBase, Form, useEditContext, type MutationMode } from "ra-core";

import type { Contact } from "../types";
import { ContactAside } from "./ContactAside";
import { ContactInputs } from "./ContactInputs";
import { FormToolbar } from "../layout/FormToolbar";
import {
  cleanupContactForEdit,
  defaultEmailJsonb,
  defaultPhoneJsonb,
  applyContactCapabilities,
} from "./contactModel";
import { useCrmProviderCapabilities } from "../providers/capabilities";

export const ContactEdit = ({
  mutationMode,
}: {
  mutationMode?: MutationMode;
}) => {
  const capabilities = useCrmProviderCapabilities();
  return (
    <EditBase
      redirect="show"
      transform={(data) =>
        applyContactCapabilities(cleanupContactForEdit(data), capabilities)
      }
      mutationMode={mutationMode}
    >
      <ContactEditContent />
    </EditBase>
  );
};

const normalizeContactArrayFields = (record: Contact) => ({
  ...record,
  name:
    (record as Contact & { name?: string }).name ??
    [record.first_name, record.last_name].filter(Boolean).join(" "),
  email_jsonb:
    record.email_jsonb && record.email_jsonb.length > 0
      ? record.email_jsonb
      : defaultEmailJsonb,
  phone_jsonb:
    record.phone_jsonb && record.phone_jsonb.length > 0
      ? record.phone_jsonb
      : defaultPhoneJsonb,
});

const ContactEditContent = () => {
  const { isPending, record } = useEditContext<Contact>();
  if (isPending || !record) return null;
  return (
    <div className="mt-2 flex gap-8">
      <Form
        className="flex flex-1 flex-col gap-4"
        record={normalizeContactArrayFields(record)}
      >
        <Card>
          <CardContent>
            <ContactInputs />
            <FormToolbar />
          </CardContent>
        </Card>
      </Form>

      <ContactAside link="show" />
    </div>
  );
};
