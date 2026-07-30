import { useTranslate } from "ra-core";

import { EditButton } from "@/components/admin/edit-button";

import { MergeCustomerButton } from "./MergeCustomerButton";
import { SoftDeleteCustomerButton } from "./SoftDeleteCustomerButton";

export const CustomerDetailActions = () => {
  const translate = useTranslate();

  return (
    <section
      aria-label={translate("resources.companies.detail.actions", {
        _: "Customer actions",
      })}
      className="flex w-full flex-col gap-2 [&>*]:w-full [&>*]:justify-start sm:flex-row sm:flex-wrap sm:[&>*]:w-auto"
    >
      <EditButton label={translate("resources.companies.action.edit")} />
      <MergeCustomerButton />
      <SoftDeleteCustomerButton />
    </section>
  );
};
