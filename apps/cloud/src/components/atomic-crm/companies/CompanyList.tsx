import { useGetIdentity, useListContext, useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { SortButton } from "@/components/admin/sort-button";
import { Button } from "@/components/ui/button";
import { ArchiveRestore } from "lucide-react";
import { Link } from "react-router";

import { TopToolbar } from "../layout/TopToolbar";
import { CompanyEmpty } from "./CompanyEmpty";
import { CompanyListFilter } from "./CompanyListFilter";
import { CustomerCursorPagination } from "./CustomerCursorPagination";
import { DeletedCustomersPage } from "./DeletedCustomersPage";
import { ImageList } from "./GridList";
import {
  ACTIVE_CUSTOMER_FILTER,
  CUSTOMER_SORT_FIELDS,
} from "./customerContract";

export const CompanyList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={25}
      filter={ACTIVE_CUSTOMER_FILTER}
      sort={{ field: "created_at", order: "DESC" }}
      actions={<CompanyListActions />}
      pagination={<CustomerCursorPagination />}
    >
      <CompanyListLayout />
    </List>
  );
};

export const CompanyListMobile = () => (
  <main className="min-h-screen px-4 pb-20 pt-4" id="main-content">
    <CompanyList />
  </main>
);

const CompanyListLayout = () => {
  const { data, isPending, filterValues } = useListContext();
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters) return <CompanyEmpty />;

  return (
    <div className="flex w-full flex-col gap-4 sm:flex-row sm:gap-8">
      <CompanyListFilter />
      <div className="flex flex-col flex-1 gap-4">
        <ImageList />
      </div>
    </div>
  );
};

const CompanyListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar className="w-full flex-wrap justify-start sm:w-auto sm:flex-nowrap sm:justify-end">
      <SortButton fields={[...CUSTOMER_SORT_FIELDS]} />
      <Button variant="outline" asChild>
        <Link to={DeletedCustomersPage.path}>
          <ArchiveRestore />
          {translate("resources.companies.deleted.title", {
            _: "Deleted Customers",
          })}
        </Link>
      </Button>
      <ExportButton />
      <CreateButton
        label={translate("resources.companies.action.new", {
          _: "New Customer",
        })}
      />
    </TopToolbar>
  );
};
