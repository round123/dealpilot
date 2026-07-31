import { useMutation } from "@tanstack/react-query";
import { isValid } from "date-fns";
import { Archive, ArchiveRestore } from "lucide-react";
import {
  InfiniteListBase,
  ShowBase,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useTranslate,
  useUpdate,
} from "ra-core";
import { DeleteButton } from "@/components/admin/delete-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceArrayField } from "@/components/admin/reference-array-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { NoteCreate } from "../notes/NoteCreate";
import { NotesIterator } from "../notes/NotesIterator";
import { useLocalizedConfigurationContext } from "../root/ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";
import { ContactList } from "./ContactList";
import { DealMilestones } from "./DealMilestones";
import { DealRisks } from "./DealRisks";
import { findDealLabel, formatISODateString } from "./dealUtils";
import { isClosedDealStage } from "./dealValidation";
import { useCrmProviderCapabilities } from "../providers/capabilities";

type DealDetailRecord = Deal & {
  currency?: string;
  probability?: number | null;
  grade?: "S" | "A" | "B" | "C";
  closed_reason?: string | null;
};

export const DealShow = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const handleClose = () => {
    redirect("list", "deals");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <ShowBase id={id}>
            <DealShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const DealShowContent = () => {
  const translate = useTranslate();
  const { dealStages, dealCategories, currency } =
    useLocalizedConfigurationContext();
  const record = useRecordContext<DealDetailRecord>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const capabilities = useCrmProviderCapabilities();
  if (!record) return null;
  const dealCurrency = record.currency || currency;
  const fieldLabel = (key: string, fallback: string) =>
    translate(`resources.deals.fields.${key}`, { _: fallback });

  return (
    <>
      <div className="space-y-2">
        {record.archived_at ? <ArchivedTitle /> : null}
        <div className="flex-1">
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <ReferenceField
                source="company_id"
                reference="companies"
                link="show"
              >
                <CompanyAvatar />
              </ReferenceField>
              <h2 className="text-2xl font-semibold">{record.name}</h2>
            </div>
            <div className={`flex gap-2 ${record.archived_at ? "" : "pr-12"}`}>
              {record.archived_at ? (
                <>
                  <UnarchiveButton record={record} />
                  {dataProvider.supportsPermanentDealDeletion ? (
                    <DeleteButton />
                  ) : null}
                </>
              ) : (
                <>
                  <ArchiveButton record={record} />
                  <EditButton />
                </>
              )}
            </div>
          </div>

          <div className="m-4 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.expected_closing_date")}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {isValid(new Date(record.expected_closing_date))
                    ? formatISODateString(record.expected_closing_date)
                    : translate("resources.deals.invalid_date")}
                </span>
                {new Date(record.expected_closing_date) < new Date() ? (
                  <Badge variant="destructive">
                    {translate("crm.common.past")}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.amount")}
              </span>
              <span className="text-sm">
                {record.amount.toLocaleString(undefined, {
                  notation: "compact",
                  style: "currency",
                  currency: dealCurrency,
                  currencyDisplay: "narrowSymbol",
                  minimumSignificantDigits: 3,
                })}
              </span>
            </div>

            {record.category && (
              <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground tracking-wide">
                  {translate("resources.deals.fields.category")}
                </span>
                <span className="text-sm">
                  {dealCategories.find((c) => c.value === record.category)
                    ?.label ?? record.category}
                </span>
              </div>
            )}

            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.stage")}
              </span>
              <span className="text-sm">
                {findDealLabel(dealStages, record.stage)}
              </span>
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground tracking-wide">
                {fieldLabel("grade", "项目评级")}
              </span>
              <span className="text-sm">{record.grade ?? "-"}</span>
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground tracking-wide">
                {fieldLabel("probability", "成交概率（%）")}
              </span>
              <span className="text-sm">
                {record.probability == null ? "-" : `${record.probability}%`}
              </span>
            </div>
          </div>

          {!!record.contact_ids?.length && (
            <div className="m-4">
              <div className="flex flex-col min-h-12 mr-10">
                <span className="text-xs text-muted-foreground tracking-wide">
                  {translate("resources.deals.fields.contact_ids")}
                </span>
                <ReferenceArrayField
                  source="contact_ids"
                  reference="contacts_summary"
                >
                  <ContactList />
                </ReferenceArrayField>
              </div>
            </div>
          )}

          {record.description && (
            <div className="m-4 whitespace-pre-line">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.description")}
              </span>
              <p className="text-sm leading-6">{record.description}</p>
            </div>
          )}

          {record.closed_reason ? (
            <div className="m-4 whitespace-pre-line">
              <span className="text-xs text-muted-foreground tracking-wide">
                {fieldLabel("closed_reason", "失单或关闭原因")}
              </span>
              <p className="text-sm leading-6">{record.closed_reason}</p>
            </div>
          ) : isClosedDealStage(record.stage) ? (
            <p className="m-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {translate("resources.deals.validation.closed_reason", {
                _: "项目已失单或关闭，请填写原因",
              })}
            </p>
          ) : null}

          <div className="m-4 space-y-6">
            <DealRisks dealId={record.id} />
            <DealMilestones dealId={record.id} />
          </div>

          {capabilities.deals.notes ? (
            <div className="m-4">
              <Separator className="mb-4" />
              <InfiniteListBase
                resource="deal_notes"
                filter={{ deal_id: record.id }}
                sort={{ field: "date", order: "DESC" }}
                perPage={25}
                disableSyncWithLocation
                storeKey={false}
                empty={<NoteCreate reference={"deals"} />}
              >
                <NotesIterator reference="deals" />
              </InfiniteListBase>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

const ArchivedTitle = () => {
  const translate = useTranslate();
  return (
    <div className="bg-orange-500 px-6 py-4">
      <h3 className="text-lg font-bold text-white">
        {translate("resources.deals.archived.title")}
      </h3>
    </div>
  );
};

const ArchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "deals",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "deals");
          notify("resources.deals.archived.success", {
            type: "info",
            undoable: false,
          });
          refresh();
        },
        onError: () => {
          notify("resources.deals.archived.error", {
            type: "error",
          });
        },
      },
    );
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <Archive className="w-4 h-4" />
      {translate("resources.deals.archived.action")}
    </Button>
  );
};

const UnarchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate } = useMutation({
    mutationFn: () => dataProvider.unarchiveDeal(record),
    onSuccess: () => {
      redirect("list", "deals");
      notify("resources.deals.unarchived.success", {
        type: "info",
        undoable: false,
      });
      refresh();
    },
    onError: () => {
      notify("resources.deals.unarchived.error", {
        type: "error",
      });
    },
  });

  const handleClick = () => {
    mutate();
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <ArchiveRestore className="w-4 h-4" />
      {translate("resources.deals.unarchived.action")}
    </Button>
  );
};
