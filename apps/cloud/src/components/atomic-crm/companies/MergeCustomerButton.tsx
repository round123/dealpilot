import {
  type Customer,
  type CustomerMergeChoice,
  type CustomerMergeChoices,
  type CustomerSummary,
} from "@dealpilot/api-client";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Merge, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useRecordContext,
  useTranslate,
  type TranslateFunction,
} from "ra-core";
import { useNavigate } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";

import type { Company } from "../types";
import { useCustomerOperations } from "../providers/CustomerOperationsContext";
import { useMergeCustomers } from "./customerMutations";
import { loadMergeCandidates } from "./mergeCandidates";

const PAGE_SIZE = 10;
const MERGE_FIELDS = [
  "name",
  "company",
  "country",
  "source",
  "grade",
  "status",
] as const;
type MergeField = (typeof MERGE_FIELDS)[number];

const defaultChoices = (): CustomerMergeChoices =>
  Object.fromEntries(
    MERGE_FIELDS.map((field) => [field, "target"]),
  ) as CustomerMergeChoices;

export const MergeCustomerButton = () => {
  const record = useRecordContext<Company>();
  const translate = useTranslate();
  const navigate = useNavigate();
  const operations = useCustomerOperations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<CustomerSummary>();
  const [choices, setChoices] = useState<CustomerMergeChoices>(defaultChoices);
  const source = useMemo(() => toMergeCustomer(record), [record]);
  const candidates = useQuery({
    queryKey: ["customers", "merge-candidates", source?.id, search, page],
    queryFn: ({ signal }) =>
      loadMergeCandidates(
        operations,
        source!.id,
        search,
        page,
        PAGE_SIZE,
        signal,
      ),
    enabled: open && source !== undefined,
    retry: false,
  });
  const mutation = useMergeCustomers({
    onSuccess: (_customer, selectedTarget) => {
      closeDialog();
      navigate(`/companies/${selectedTarget.id}/show`);
    },
  });

  if (!source) return null;

  const closeDialog = () => {
    if (mutation.isPending) return;
    setOpen(false);
    setSearch("");
    setPage(1);
    setTarget(undefined);
    setChoices(defaultChoices());
    mutation.reset();
  };

  const pageCount = Math.max(
    1,
    Math.ceil((candidates.data?.total ?? 0) / PAGE_SIZE),
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Merge />
        {translate("resources.companies.merge.action", { _: "Merge" })}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {translate("resources.companies.merge.title", {
                name: source.name,
                _: "Merge %{name}",
              })}
            </DialogTitle>
            <DialogDescription>
              {translate("resources.companies.merge.description", {
                _: "Choose the Customer to keep, then resolve the six Customer fields.",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label htmlFor="merge-customer-search">
              {translate("resources.companies.merge.target_customer", {
                _: "Target Customer",
              })}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="merge-customer-search"
                className="pl-9"
                value={search}
                placeholder={translate(
                  "resources.companies.merge.search_placeholder",
                  { _: "Search active Customers" },
                )}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                disabled={mutation.isPending}
              />
            </div>
            <CandidateList
              query={candidates}
              selected={target}
              onSelect={setTarget}
              disabled={mutation.isPending}
            />
            {candidates.isSuccess && candidates.data.total > PAGE_SIZE ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  title={translate("resources.companies.merge.previous", {
                    _: "Previous candidates",
                  })}
                  aria-label={translate("resources.companies.merge.previous", {
                    _: "Previous candidates",
                  })}
                  disabled={page === 1 || mutation.isPending}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-16 text-center text-sm">
                  {translate("resources.companies.merge.page_count", {
                    page,
                    pageCount,
                    _: "%{page} of %{pageCount}",
                  })}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  title={translate("resources.companies.merge.next", {
                    _: "Next candidates",
                  })}
                  aria-label={translate("resources.companies.merge.next", {
                    _: "Next candidates",
                  })}
                  disabled={page >= pageCount || mutation.isPending}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </div>

          {target ? (
            <MergeFieldChoices
              source={source}
              target={target}
              choices={choices}
              onChange={(field, choice) =>
                setChoices((current) => ({ ...current, [field]: choice }))
              }
              disabled={mutation.isPending}
            />
          ) : null}

          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {translate("resources.companies.merge.error_title", {
                  _: "Customers could not be merged",
                })}
              </AlertTitle>
              <AlertDescription>
                {translate("resources.companies.merge.error_description", {
                  _: "No changes were made. Review the selection and try again.",
                })}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={closeDialog}
              disabled={mutation.isPending}
            >
              {translate("ra.action.cancel")}
            </Button>
            <Button
              onClick={() =>
                target && mutation.mutate({ source, target, choices })
              }
              disabled={!target || mutation.isPending}
            >
              <Merge />
              {mutation.isPending
                ? translate("resources.companies.merge.merging", {
                    _: "Merging...",
                  })
                : translate("resources.companies.merge.confirm", {
                    _: "Merge Customers",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const CandidateList = ({
  query,
  selected,
  onSelect,
  disabled,
}: {
  query: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof loadMergeCandidates>>>
  >;
  selected: CustomerSummary | undefined;
  onSelect: (customer: CustomerSummary) => void;
  disabled: boolean;
}) => {
  const translate = useTranslate();
  if (query.isPending) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {translate("resources.companies.merge.candidates_error", {
            _: "Merge candidates could not be loaded.",
          })}
        </AlertDescription>
      </Alert>
    );
  }
  if (!query.data?.data.length) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {translate("resources.companies.merge.candidates_empty", {
          _: "No active Customers found.",
        })}
      </p>
    );
  }

  return (
    <RadioGroup
      value={selected?.id ?? ""}
      onValueChange={(id) => {
        const customer = query.data?.data.find((item) => item.id === id);
        if (customer) onSelect(customer);
      }}
      className="max-h-44 overflow-y-auto rounded-md border p-2"
      disabled={disabled}
    >
      {query.data.data.map((customer) => (
        <Label
          key={customer.id}
          htmlFor={`merge-target-${customer.id}`}
          className="cursor-pointer rounded p-2 hover:bg-muted"
        >
          <RadioGroupItem
            value={customer.id}
            id={`merge-target-${customer.id}`}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">
              {customer.name}
            </span>
            <span className="block truncate">
              {customer.company ||
                customer.country ||
                translate("resources.companies.common.no_company_details", {
                  _: "No company details",
                })}
            </span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
};

const MergeFieldChoices = ({
  source,
  target,
  choices,
  onChange,
  disabled,
}: {
  source: Customer;
  target: CustomerSummary;
  choices: CustomerMergeChoices;
  onChange: (field: MergeField, choice: CustomerMergeChoice) => void;
  disabled: boolean;
}) => {
  const translate = useTranslate();
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="grid grid-cols-[7rem_1fr_1fr] gap-3 text-xs font-medium text-muted-foreground">
        <span>
          {translate("resources.companies.merge.field", { _: "Field" })}
        </span>
        <span>
          {translate("resources.companies.merge.source", { _: "Source" })}
        </span>
        <span>
          {translate("resources.companies.merge.target", { _: "Target" })}
        </span>
      </div>
      {MERGE_FIELDS.map((field) => (
        <RadioGroup
          key={field}
          value={choices[field] ?? "target"}
          onValueChange={(choice) =>
            onChange(field, choice as CustomerMergeChoice)
          }
          disabled={disabled}
          className="grid grid-cols-[7rem_1fr_1fr] items-start gap-3"
        >
          <span className="pt-1 text-sm font-medium">
            {translatedFieldLabel(field, translate)}
          </span>
          <FieldChoice
            field={field}
            side="source"
            value={displayValue(source[field], translate)}
          />
          <FieldChoice
            field={field}
            side="target"
            value={displayValue(target[field], translate)}
          />
        </RadioGroup>
      ))}
    </div>
  );
};

const FieldChoice = ({
  field,
  side,
  value,
}: {
  field: MergeField;
  side: CustomerMergeChoice;
  value: string;
}) => {
  const translate = useTranslate();
  const id = `merge-${field}-${side}`;
  return (
    <Label
      htmlFor={id}
      className="min-w-0 cursor-pointer items-start rounded border p-2"
    >
      <RadioGroupItem
        id={id}
        value={side}
        aria-label={`${translatedFieldLabel(field, translate)} ${translate(
          `resources.companies.merge.${side}`,
          { _: side === "source" ? "Source" : "Target" },
        )}`}
      />
      <span className="break-words text-foreground">{value}</span>
    </Label>
  );
};

const toMergeCustomer = (record: Company | undefined): Customer | undefined => {
  if (!record) return undefined;
  return {
    id: String(record.id) as Customer["id"],
    name: record.name,
    company: record.company,
    country: record.country || null,
    source: record.source,
    grade: record.grade,
    status: record.status,
  } as Customer;
};

const displayValue = (value: string | null, translate: TranslateFunction) =>
  value || translate("resources.companies.merge.empty_value", { _: "Empty" });
const fieldLabel = (field: MergeField) =>
  field.replace(/^./, (character) => character.toUpperCase());

const translatedFieldLabel = (
  field: MergeField,
  translate: TranslateFunction,
) => translate(`resources.companies.fields.${field}`, { _: fieldLabel(field) });
