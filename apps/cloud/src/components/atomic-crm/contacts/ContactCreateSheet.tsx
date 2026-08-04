import { useGetIdentity, useTranslate } from "ra-core";
import { useMemo } from "react";
import { CreateSheet } from "../misc/CreateSheet";
import { ContactInputs } from "./ContactInputs";
import {
  cleanupContactForCreate,
  defaultEmailJsonb,
  defaultPhoneJsonb,
  applyContactCapabilities,
} from "./contactModel";
import { useCrmProviderCapabilities } from "../providers/capabilities";

export interface ContactCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContactCreateSheet = ({
  open,
  onOpenChange,
}: ContactCreateSheetProps) => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  const capabilities = useCrmProviderCapabilities();
  const defaultValues = useMemo(
    () => ({
      sales_id: identity?.id,
      email_jsonb: defaultEmailJsonb,
      phone_jsonb: defaultPhoneJsonb,
    }),
    [identity?.id],
  );
  return (
    <CreateSheet
      resource="contacts"
      title={translate("resources.contacts.action.new")}
      defaultValues={defaultValues}
      transform={(data) =>
        applyContactCapabilities(cleanupContactForCreate(data), capabilities)
      }
      open={open}
      onOpenChange={onOpenChange}
    >
      <ContactInputs />
    </CreateSheet>
  );
};
