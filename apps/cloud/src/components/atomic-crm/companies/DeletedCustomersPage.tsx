import { type Customer } from "@dealpilot/api-client";
import { useQuery } from "@tanstack/react-query";
import { ArchiveRestore, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useState } from "react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerOperations } from "../providers/CustomerOperationsContext";

import {
  customerCacheKeys,
  isRestoreWindowError,
  useRestoreCustomer,
} from "./customerMutations";
import { getRestoreWindow, loadDeletedCustomers } from "./deletedCustomers";

const DEFAULT_PAGE_SIZE = 25;

export const DeletedCustomersPage = () => {
  const translate = useTranslate();
  const operations = useCustomerOperations();
  const [page, setPage] = useState(1);
  const restoreMutation = useRestoreCustomer();
  const query = useQuery({
    queryKey: customerCacheKeys.deletedList(page, DEFAULT_PAGE_SIZE),
    queryFn: ({ signal }) =>
      loadDeletedCustomers(operations, page, DEFAULT_PAGE_SIZE, signal),
    retry: false,
  });
  const pageCount = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / DEFAULT_PAGE_SIZE),
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-20 md:px-0 md:pt-0 md:pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {translate("resources.companies.deleted.title", {
              _: "Deleted Customers",
            })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate("resources.companies.deleted.description", {
              _: "Customers can be restored for 30 days after deletion.",
            })}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/companies">
            <Users />
            {translate("resources.companies.deleted.back", {
              _: "Customers",
            })}
          </Link>
        </Button>
      </div>

      {restoreMutation.isError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>
            {translate("resources.companies.deleted.restore_error_title", {
              _: "Customer could not be restored",
            })}
          </AlertTitle>
          <AlertDescription>
            {isRestoreWindowError(restoreMutation.error)
              ? translate("resources.companies.deleted.restore_expired", {
                  _: "The 30-day restore window has expired. This customer can no longer be restored.",
                })
              : translate("resources.companies.deleted.restore_failed", {
                  _: "The restore failed. Refresh the list and try again.",
                })}
          </AlertDescription>
        </Alert>
      ) : null}

      {query.isPending ? <DeletedCustomersSkeleton /> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>
            {translate("resources.companies.deleted.error_title", {
              _: "Deleted Customers unavailable",
            })}
          </AlertTitle>
          <AlertDescription>
            {translate("resources.companies.deleted.error_description", {
              _: "The deleted customer list could not be loaded.",
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      {query.isSuccess && query.data.data.length === 0 ? (
        <div className="border-y py-12 text-center">
          <ArchiveRestore className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="font-medium">
            {translate("resources.companies.deleted.empty_title", {
              _: "No deleted customers",
            })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate("resources.companies.deleted.empty_description", {
              _: "Deleted customers will appear here during their restore window.",
            })}
          </p>
        </div>
      ) : null}
      {query.isSuccess && query.data.data.length > 0 ? (
        <ul className="divide-y border-y">
          {query.data.data.map((customer) => (
            <DeletedCustomerRow
              key={customer.id}
              customer={customer}
              isRestoring={
                restoreMutation.isPending &&
                restoreMutation.variables === customer.id
              }
              onRestore={() => restoreMutation.mutate(customer.id)}
            />
          ))}
        </ul>
      ) : null}

      {query.isSuccess && query.data.total > DEFAULT_PAGE_SIZE ? (
        <nav
          className="mt-4 flex items-center justify-end gap-2"
          aria-label={translate("resources.companies.deleted.pagination", {
            _: "Deleted Customers pagination",
          })}
        >
          <Button
            size="icon"
            variant="outline"
            title={translate("ra.navigation.previous", { _: "Previous page" })}
            aria-label={translate("ra.navigation.previous", {
              _: "Previous page",
            })}
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-20 text-center text-sm">
            {translate("resources.companies.deleted.page_count", {
              page,
              pageCount,
              _: "%{page} of %{pageCount}",
            })}
          </span>
          <Button
            size="icon"
            variant="outline"
            title={translate("ra.navigation.next", { _: "Next page" })}
            aria-label={translate("ra.navigation.next", { _: "Next page" })}
            disabled={page >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            <ChevronRight />
          </Button>
        </nav>
      ) : null}
    </div>
  );
};

DeletedCustomersPage.path = "/companies/deleted";

const DeletedCustomerRow = ({
  customer,
  isRestoring,
  onRestore,
}: {
  customer: Customer;
  isRestoring: boolean;
  onRestore: () => void;
}) => {
  const translate = useTranslate();
  const deletedAt = customer.deleted_at!;
  const restoreWindow = getRestoreWindow(deletedAt);

  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{customer.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {customer.company ||
            customer.country ||
            translate("resources.companies.common.no_company_details", {
              _: "No company details",
            })}
        </p>
      </div>
      <div className="text-sm">
        <p>
          {translate("resources.companies.deleted.deleted_on", {
            date: formatDeletedAt(deletedAt),
            _: "Deleted %{date}",
          })}
        </p>
        {restoreWindow.mayBeExpired ? (
          <Badge variant="destructive" className="mt-1">
            {translate("resources.companies.deleted.deadline_may_have_passed", {
              _: "Restore deadline may have passed",
            })}
          </Badge>
        ) : (
          <p className="text-muted-foreground">
            {translate("resources.companies.deleted.days_remaining", {
              smart_count: restoreWindow.remainingDays,
              _: "%{smart_count} day remaining |||| %{smart_count} days remaining",
            })}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        className="w-full md:w-auto"
        disabled={isRestoring}
        onClick={onRestore}
      >
        <ArchiveRestore />
        {isRestoring
          ? translate("resources.companies.deleted.restoring", {
              _: "Restoring...",
            })
          : translate("resources.companies.deleted.restore", { _: "Restore" })}
      </Button>
    </li>
  );
};

const DeletedCustomersSkeleton = () => {
  const translate = useTranslate();
  return (
    <div
      className="space-y-4 border-y py-4"
      aria-label={translate("resources.companies.deleted.loading", {
        _: "Loading Deleted Customers",
      })}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>
      ))}
    </div>
  );
};

const formatDeletedAt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
