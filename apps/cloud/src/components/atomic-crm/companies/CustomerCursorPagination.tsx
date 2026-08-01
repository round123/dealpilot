import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Translate, useListPaginationContext, useTranslate } from "ra-core";

export const CustomerCursorPagination = ({
  rowsPerPageOptions = [10, 25, 50, 100],
}: {
  rowsPerPageOptions?: number[];
}) => {
  const translate = useTranslate();
  const {
    hasPreviousPage,
    hasNextPage,
    page,
    perPage,
    setPerPage,
    setPage,
    total,
  } = useListPaginationContext();
  const recordCount = total ?? 0;
  const pageStart = recordCount > 0 ? (page - 1) * perPage + 1 : 0;
  const pageEnd = Math.min(page * perPage, recordCount);

  const changePage =
    (nextPage: number) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setPage(nextPage);
    };

  return (
    <div className="flex flex-wrap items-center justify-end gap-4">
      <div className="hidden items-center gap-2 md:flex">
        <p className="text-sm font-medium">
          <Translate i18nKey="ra.navigation.page_rows_per_page">
            每页行数：
          </Translate>
        </p>
        <Select
          value={perPage.toString()}
          onValueChange={(value) => setPerPage(Number(value))}
        >
          <SelectTrigger className="h-8 w-fit">
            <SelectValue placeholder={perPage} />
          </SelectTrigger>
          <SelectContent side="top">
            {rowsPerPageOptions.map((pageSize) => (
              <SelectItem key={pageSize} value={pageSize.toString()}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground">
        {pageStart}-{pageEnd} / {recordCount}
      </p>

      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            {hasPreviousPage ? (
              <PaginationLink
                href="#"
                onClick={changePage(page - 1)}
                aria-label={translate("ra.navigation.previous", {
                  _: "上一页",
                })}
              >
                <ChevronLeft />
              </PaginationLink>
            ) : (
              <span className="inline-flex size-9 items-center justify-center text-muted-foreground">
                <ChevronLeft aria-hidden="true" />
              </span>
            )}
          </PaginationItem>
          <PaginationItem>
            <span className="inline-flex h-9 min-w-9 items-center justify-center px-2 text-sm">
              {page}
            </span>
          </PaginationItem>
          <PaginationItem>
            {hasNextPage ? (
              <PaginationLink
                href="#"
                onClick={changePage(page + 1)}
                aria-label={translate("ra.navigation.next", { _: "下一页" })}
              >
                <ChevronRight />
              </PaginationLink>
            ) : (
              <span className="inline-flex size-9 items-center justify-center text-muted-foreground">
                <ChevronRight aria-hidden="true" />
              </span>
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};
