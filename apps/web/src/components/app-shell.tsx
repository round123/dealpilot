import { useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Search, Plus, Bell, UserPlus, FolderPlus, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Sidebar } from "@/components/sidebar";

const ROUTE_LABELS: Record<string, string> = {
  "/": "仪表盘",
  "/customers": "客户",
  "/projects": "项目",
  "/reminders": "待办",
  "/settings": "设置",
  "/settings/backup": "备份与恢复",
};

export function Header() {
  const location = useLocation();
  const [search, setSearch] = useState("");

  const breadcrumbs = buildBreadcrumbs(location.pathname);

  return (
    <header className="flex h-[var(--shell-header-height)] items-center gap-4 border-b border-border-default bg-bg-card px-6">
      <div className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, idx) => (
          <span key={idx} className="flex items-center gap-2">
            {idx > 0 && <span className="text-text-tertiary">/</span>}
            <span
              className={
                idx === breadcrumbs.length - 1
                  ? "font-medium text-text-primary"
                  : "text-text-secondary"
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="relative ml-auto w-80">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="搜索客户、项目、待办"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="primary" size="md">
              <Plus size={16} />
              新建
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <UserPlus size={16} />
              新建客户
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FolderPlus size={16} />
              新建项目
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Clock size={16} />
              新建提醒
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="relative">
          <Bell size={20} />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-error" />
        </Button>
      </div>
    </header>
  );
}

function buildBreadcrumbs(pathname: string): string[] {
  const labels: string[] = [];
  const parts = pathname.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    const label = ROUTE_LABELS[current];
    if (label) {
      labels.push(label);
    } else if (part.length === 36 && part.includes("-")) {
      labels.push("详情");
    } else if (part === "import") {
      labels.push("导入客户");
    } else {
      labels.push(part);
    }
  }
  if (labels.length === 0) labels.push("仪表盘");
  return labels;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-page">
      <div className="flex-shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[var(--shell-content-max-width)] px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
