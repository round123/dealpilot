import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  GitMerge,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { useCustomers, type CustomerListParams } from "../api";
import type { Customer } from "@dealpilot/shared";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import { useDebounce } from "@/lib/hooks";

export function CustomerTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const params: CustomerListParams = useMemo(
    () => ({
      cursor,
      limit: 50,
      search: debouncedSearch || undefined,
      sort: "created_at",
    }),
    [cursor, debouncedSearch],
  );

  const { data, isLoading } = useCustomers(params);

  const columns: ColumnDef<Customer, unknown>[] = useMemo(
    () => [
      {
        id: "select",
        size: 40,
        header: () => null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selected[row.id] ?? false}
            onChange={(e) => {
              e.stopPropagation();
              setSelected((s) => ({ ...s, [row.id]: e.target.checked }));
            }}
            className="rounded border-border-strong"
          />
        ),
      },
      {
        accessorKey: "name",
        header: "客户名 / 公司",
        size: 240,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-text-primary">{row.original.name}</p>
            {row.original.company && (
              <p className="text-xs text-text-tertiary">{row.original.company}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "grade",
        header: "分级",
        size: 80,
        enableSorting: true,
        cell: ({ row }) => <GradeBadge grade={row.original.grade} />,
      },
      {
        accessorKey: "country",
        header: "国家",
        size: 120,
        cell: ({ row }) => <span className="text-text-secondary">{row.original.country ?? "-"}</span>,
      },
      {
        accessorKey: "source",
        header: "来源",
        size: 100,
        cell: ({ row }) => <span className="text-text-secondary">{row.original.source ?? "-"}</span>,
      },
      {
        id: "recent_followup",
        header: "最近跟进",
        size: 120,
        cell: ({ row }) => {
          const updated = row.original.updated_at;
          return (
            <span className="text-text-secondary">
              {formatRelativeTime(updated)}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        size: 50,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-text-tertiary hover:bg-bg-hover"
              >
                <MoreHorizontal size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => navigate({ to: "/customers/$id", params: { id: row.original.id } })}>
                <UsersIcon size={16} />
                查看档案
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Pencil size={16} />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem>
                <GitMerge size={16} />
                合并
              </DropdownMenuItem>
              <DropdownMenuItem className="text-error">
                <Trash2 size={16} />
                软删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [selected, navigate],
  );

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <CustomerToolbar search={search} setSearch={setSearch} />
        <div className="rounded-lg border border-border-default bg-bg-card p-8 text-center text-text-tertiary">
          加载中...
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = items.length;

  return (
    <div className="space-y-4">
      <CustomerToolbar search={search} setSearch={setSearch} />

      {Object.keys(selected).filter((k) => selected[k]).length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-border-default bg-bg-hover px-4 py-2">
          <span className="text-sm text-text-primary">
            已选 {Object.keys(selected).filter((k) => selected[k]).length}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm">
              <GitMerge size={14} />
              合并
            </Button>
            <Button variant="ghost" size="sm">
              <Trash2 size={14} />
              删除
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected({})}>
              取消选择
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <UsersIcon size={48} style={{ color: "var(--color-gray-300)" }} />
          <p className="text-sm text-text-secondary">还没有客户档案</p>
          <div className="flex gap-2">
            <Button variant="outline" size="md" onClick={() => navigate({ to: "/customers/import" })}>
              <Upload size={16} />
              导入客户
            </Button>
            <Button variant="primary" size="md">
              <Plus size={16} />
              新建客户
            </Button>
          </div>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items}
            onRowClick={(row) => navigate({ to: "/customers/$id", params: { id: row.id } })}
            getRowId={(row) => row.id}
            rowSelection={selected}
            onRowSelectionChange={setSelected}
          />
          <Pagination
            hasPrevious={!!cursor}
            hasNext={!!data?.next_cursor}
            onPrevious={() => setCursor(undefined)}
            onNext={() => setCursor(data?.next_cursor ?? undefined)}
            range={`1-${items.length}`}
            total={total}
          />
        </>
      )}
    </div>
  );
}

function CustomerToolbar({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (v: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-80">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="按公司、联系人、邮箱、手机号搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <Button variant="outline" size="md" onClick={() => navigate({ to: "/customers/import" })}>
        <Upload size={16} />
        导入客户
      </Button>
      <div className="ml-auto">
        <Button variant="primary" size="md">
          <Plus size={16} />
          新建客户
        </Button>
      </div>
    </div>
  );
}
