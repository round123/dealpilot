import type { CustomerDetail } from "@dealpilot/api-client";
import {
  Bell,
  Handshake,
  MessageSquareText,
  Share2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslate, type TranslateFunction } from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export type CustomerRelatedSummaryData = Pick<
  CustomerDetail,
  | "contacts"
  | "social_accounts"
  | "deals"
  | "recent_follow_ups"
  | "open_reminders"
>;

interface CustomerRelatedSummaryProps {
  detail: CustomerRelatedSummaryData | undefined;
  isPending: boolean;
  isError: boolean;
}

export const CustomerRelatedSummary = ({
  detail,
  isPending,
  isError,
}: CustomerRelatedSummaryProps) => {
  const translate = useTranslate();
  const related = (key: string, fallback: string) =>
    translate(`resources.companies.related.${key}`, { _: fallback });

  return (
    <section
      className="mt-6 border-t pt-4"
      aria-labelledby="customer-summary-title"
    >
      <h3 id="customer-summary-title" className="mb-3 text-base font-semibold">
        {related("title", "Related customer details")}
      </h3>
      {isPending ? <CustomerSummarySkeleton /> : null}
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>
            {related("error_title", "Customer details unavailable")}
          </AlertTitle>
          <AlertDescription>
            {related(
              "error_description",
              "The related customer details could not be loaded.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {!isPending && !isError && detail ? (
        <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
          <SummaryGroup
            title={related("contacts", "Contacts")}
            icon={Users}
            count={detail.contacts.length}
            emptyLabel={related("empty_contacts", "No contacts")}
          >
            {detail.contacts.slice(0, 3).map((contact) => {
              const fullName = [contact.first_name, contact.last_name]
                .filter(Boolean)
                .join(" ");
              return (
                <SummaryItem
                  key={contact.id}
                  primary={
                    contact.name ||
                    fullName ||
                    related("unnamed_contact", "Unnamed contact")
                  }
                  secondary={contact.title}
                />
              );
            })}
          </SummaryGroup>
          <SummaryGroup
            title={related("social_accounts", "Social accounts")}
            icon={Share2}
            count={detail.social_accounts.length}
            emptyLabel={related("empty_social_accounts", "No social accounts")}
          >
            {detail.social_accounts.slice(0, 3).map((account) => (
              <SummaryItem
                key={account.id}
                primary={account.platform}
                secondary={account.raw_identifier}
              />
            ))}
          </SummaryGroup>
          <SummaryGroup
            title={related("deals", "Deals")}
            icon={Handshake}
            count={detail.deals.length}
            emptyLabel={related("empty_deals", "No deals")}
          >
            {detail.deals.slice(0, 3).map((deal) => (
              <SummaryItem
                key={deal.id}
                primary={deal.name}
                secondary={`${translateEnum(deal.stage, translate)}${deal.amount === null ? "" : ` - ${formatAmount(deal.amount, deal.currency)}`}`}
              />
            ))}
          </SummaryGroup>
          <SummaryGroup
            title={related("recent_follow_ups", "Recent follow-ups")}
            icon={MessageSquareText}
            count={detail.recent_follow_ups.length}
            emptyLabel={related(
              "empty_recent_follow_ups",
              "No recent follow-ups",
            )}
          >
            {detail.recent_follow_ups.slice(0, 3).map((followUp) => (
              <SummaryItem
                key={followUp.id}
                primary={
                  followUp.note ||
                  followUp.message_body ||
                  translateEnum(followUp.type, translate)
                }
                secondary={formatDate(followUp.occurred_at)}
              />
            ))}
          </SummaryGroup>
          <SummaryGroup
            title={related("open_reminders", "Open reminders")}
            icon={Bell}
            count={detail.open_reminders.length}
            emptyLabel={related("empty_open_reminders", "No open reminders")}
          >
            {detail.open_reminders.slice(0, 3).map((reminder) => (
              <SummaryItem
                key={reminder.id}
                primary={translateEnum(reminder.type, translate)}
                secondary={`${translateEnum(reminder.status, translate)} - ${formatDate(reminder.due_at)}`}
              />
            ))}
          </SummaryGroup>
        </div>
      ) : null}
    </section>
  );
};

const SummaryGroup = ({
  title,
  icon: Icon,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  emptyLabel: string;
  children: ReactNode;
}) => (
  <section aria-label={title}>
    <div className="mb-2 flex min-h-6 items-center gap-2">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <h4 className="text-sm font-medium">{title}</h4>
      <Badge variant="secondary">{count}</Badge>
    </div>
    {count === 0 ? (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    ) : (
      <div className="space-y-2">{children}</div>
    )}
  </section>
);

const SummaryItem = ({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string | null;
}) => (
  <div className="min-w-0 text-sm">
    <p className="truncate font-medium" title={primary}>
      {primary}
    </p>
    {secondary ? (
      <p className="truncate text-muted-foreground" title={secondary}>
        {secondary}
      </p>
    ) : null}
  </div>
);

const CustomerSummarySkeleton = () => {
  const translate = useTranslate();
  return (
    <div
      className="grid gap-x-6 gap-y-5 lg:grid-cols-2"
      aria-label={translate("resources.companies.related.loading", {
        _: "Loading related customer details",
      })}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full max-w-56" />
          <Skeleton className="h-4 w-2/3 max-w-40" />
        </div>
      ))}
    </div>
  );
};

const formatEnum = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());

const translateEnum = (value: string, translate: TranslateFunction) =>
  translate(`resources.companies.related.values.${value}`, {
    _: formatEnum(value),
  });

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

const formatAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
