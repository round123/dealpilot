import { CreateBase, Form, useGetIdentity, type MutationMode } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { Loading } from "@/components/admin/loading";
import { useMemo } from "react";

import { ContactInputs } from "./ContactInputs";
import { FormToolbar } from "../layout/FormToolbar";
import {
  cleanupContactForCreate,
  defaultEmailJsonb,
  defaultPhoneJsonb,
  applyContactCapabilities,
} from "./contactModel";
import { useCrmProviderCapabilities } from "../providers/capabilities";

export const ContactCreate = ({
  mutationMode,
}: {
  mutationMode?: MutationMode;
}) => {
  const { identity, isPending } = useGetIdentity();
  const capabilities = useCrmProviderCapabilities();
  const defaultValues = useMemo(
    () => ({
      sales_id: identity?.id,
      email_jsonb: defaultEmailJsonb,
      phone_jsonb: defaultPhoneJsonb,
    }),
    [identity?.id],
  );

  if (isPending) {
    return <Loading delay={0} />;
  }

  return (
    <CreateBase
      redirect="show"
      transform={(data) =>
        applyContactCapabilities(cleanupContactForCreate(data), capabilities)
      }
      mutationMode={mutationMode}
    >
      <div className="mt-2 flex lg:mr-72">
        <div className="flex-1">
          <Form defaultValues={defaultValues}>
            <Card>
              <CardContent>
                <ContactInputs />
                <FormToolbar />
              </CardContent>
            </Card>
          </Form>
        </div>
      </div>
    </CreateBase>
  );
};
