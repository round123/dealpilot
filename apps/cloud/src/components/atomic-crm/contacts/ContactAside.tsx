import { useRecordContext, useTranslate } from "ra-core";
import { EditButton } from "@/components/admin/edit-button";
import { DeleteButton } from "@/components/admin";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { ShowButton } from "@/components/admin/show-button";

import { AddTask } from "../tasks/AddTask";
import { TasksIterator } from "../tasks/TasksIterator";
import { TagsListEdit } from "./TagsListEdit";
import { ContactStatusSelector } from "./ContactInputs";
import { ContactPersonalInfo } from "./ContactPersonalInfo";
import { ContactBackgroundInfo } from "./ContactBackgroundInfo";
import { AsideSection } from "../misc/AsideSection";
import type { Contact } from "../types";
import { ContactMergeButton } from "./ContactMergeButton";
import { ExportVCardButton } from "./ExportVCardButton";
import { useCrmProviderCapabilities } from "../providers/capabilities";

export const ContactAside = ({ link = "edit" }: { link?: "edit" | "show" }) => {
  const record = useRecordContext<Contact>();
  const translate = useTranslate();
  const capabilities = useCrmProviderCapabilities();

  if (!record) return null;

  return (
    <div className="hidden sm:block w-92 min-w-92 text-sm">
      <div className="mb-4 -ml-1">
        {link === "edit" ? (
          <EditButton label="resources.contacts.action.edit" />
        ) : (
          <ShowButton label="resources.contacts.action.show" />
        )}
      </div>

      {capabilities.contacts.status ? (
        <AsideSection title={translate("resources.notes.fields.status")}>
          <ContactStatusSelector />
        </AsideSection>
      ) : null}

      <AsideSection
        title={translate("resources.contacts.field_categories.personal_info")}
      >
        <ContactPersonalInfo />
      </AsideSection>

      {capabilities.contacts.extendedProfile ? (
        <AsideSection
          title={translate(
            "resources.contacts.field_categories.background_info",
          )}
        >
          <ContactBackgroundInfo />
        </AsideSection>
      ) : null}

      {capabilities.contacts.tags ? (
        <AsideSection
          title={translate("resources.tags.name", { smart_count: 2 })}
        >
          <TagsListEdit />
        </AsideSection>
      ) : null}

      {capabilities.contacts.tasks ? (
        <AsideSection
          title={translate("resources.tasks.name", { smart_count: 2 })}
        >
          <ReferenceManyField
            target="contact_id"
            reference="tasks"
            sort={{ field: "due_date", order: "ASC" }}
            perPage={1000}
          >
            <TasksIterator />
          </ReferenceManyField>
          <AddTask />
        </AsideSection>
      ) : null}

      {link === "edit" && (
        <>
          <div className="mt-6 pt-6 border-t hidden sm:flex flex-col gap-2 items-start">
            <ExportVCardButton />
            {capabilities.contacts.merge ? <ContactMergeButton /> : null}
          </div>
          <div className="mt-6 pt-6 border-t hidden sm:flex flex-col gap-2 items-start">
            <DeleteButton
              className="h-6 cursor-pointer hover:bg-destructive/10! text-destructive! border-destructive! focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40"
              size="sm"
            />
          </div>
        </>
      )}
    </div>
  );
};
