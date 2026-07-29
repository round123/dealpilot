import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, Plus, MoreHorizontal, Pencil, Archive, FolderKanban } from "lucide-react";
import { useProjects } from "../api";
import type { Project } from "@dealpilot/shared";
import { DataTable } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GradeBadge, StageBadge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatAmount, formatDate } from "@/lib/format";
import { useDebounce } from "@/lib/hooks";

const STAGE_TABS = [
  { key: undefined, label: "全部" },
  { key: "lead", label: "需求确认" },
  { key: "qualified", label: "方案/样品" },
  { key: "proposal", label: "报价" },
  { key: "negotiation", label: "谈判" },
  { key: "closed_won", label: "成交" },
  { key: "closed_lost", label: "失单" },
  { key: "archived", label: "已归档" },
];

export function ProjectTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [stage, setStage] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading } = useProjects({ stage, cursor, limit: 50 });

  const columns: ColumnDef<Project, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "项目名 / 客户",
        size: 240,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-text-primary">{row.original.name}</p>
            <p className="text-xs text-text-tertiary">
              客户 {row.original.customer_id.slice(0, 8)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "stage",
        header: "阶段",
        size: 100,
        cell: ({ row }) => <StageBadge stage={row.original.stage} />,
      },
      {
        accessorKey: "grade",
        header: "分级",
        size: 60,
        cell: ({ row }) => <GradeBadge grade={row.original.grade} size="sm" />,
      },
      {
        accessorKey: "amount",
        header: "金额",
        size: 120,
        cell: ({ row }) => (
          <span className="text-text-secondary">
            {formatAmount(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "probability",
        header: "成交概率",
        size: 100,
        cell: ({ row }) => (
          <span className="text-text-secondary">
            {row.original.probability !== null ? `${row.original.probability}%` : "-"}
          </span>
        ),
      },
      {
        accessorKey: "expected_close_date",
        header: "预计成交日",
        size: 120,
        cell: ({ row }) => (
          <span className="text-text-secondary">
            {formatDate(row.original.expected_close_date)}
          </span>
        ),
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
              <DropdownMenuItem onSelect={() => navigate({ to: "/projects/$id", params: { id: row.original.id } })}>
                查看详情
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Pencil size={16} />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive size={16} />
                归档
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [navigate],
  );

  const items = (data?.items ?? []).filter((p) =>
    !debouncedSearch || p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="按项目名、客户名搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="ml-auto">
          <Button variant="primary" size="md">
            <Plus size={16} />
            新建项目
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border-default">
        {STAGE_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => {
              setStage(tab.key);
              setCursor(undefined);
            }}
            className={`px-3 py-2 text-sm font-medium transition-colors rounded-t-md ${
              stage === tab.key
                ? "bg-primary-light text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
            style={stage === tab.key ? { backgroundColor: "var(--color-primary-light)" } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-text-tertiary py-8">加载中...</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <FolderKanban size={48} style={{ color: "var(--color-gray-300)" }} />
          <p className="text-sm text-text-secondary">还没有项目</p>
          <Button variant="primary" size="md">
            <Plus size={16} />
            新建项目
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          onRowClick={(row) => navigate({ to: "/projects/$id", params: { id: row.id } })}
        />
      )}
    </div>
  );
}
