import { CreateBase, Form, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";

import { CompanyInputs } from "./CompanyInputs";

export const CompanyCreate = () => {
  const translate = useTranslate();
  return (
    <CreateBase
      redirect="show"
      transform={(values) => {
        // add https:// before website if not present
        if (values.website && !values.website.startsWith("http")) {
          values.website = `https://${values.website}`;
        }
        return values;
      }}
    >
      <div className="mt-2 flex lg:mr-72">
        <div className="flex-1">
          <Form
            defaultValues={{
              grade: "B",
              status: "active",
              deleted_at: null,
            }}
          >
            <Card>
              <CardContent>
                <CompanyInputs />
                <div
                  role="toolbar"
                  className="sticky bottom-16 flex flex-row justify-end gap-2 bg-linear-to-b from-transparent to-card to-10% pt-4 pb-4 md:bottom-0 md:pb-0"
                >
                  <CancelButton />
                  <SaveButton
                    label={translate("resources.companies.action.create", {
                      _: "Create Customer",
                    })}
                  />
                </div>
              </CardContent>
            </Card>
          </Form>
        </div>
      </div>
    </CreateBase>
  );
};
