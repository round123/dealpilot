import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Compass, LayoutDashboard, Users, FolderKanban, ListTodo, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { label: "仪表盘", path: "/", icon: LayoutDashboard },
  { label: "客户", path: "/customers", icon: Users },
  { label: "项目", path: "/projects", icon: FolderKanban },
  { label: "待办", path: "/reminders", icon: ListTodo },
  { label: "设置", path: "/settings", icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const [agentRunning, setAgentRunning] = useState(true);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="flex h-full w-[var(--shell-sidebar-width)] flex-col border-r border-border-default bg-bg-sidebar">
      <div className="flex h-[var(--shell-header-height)] items-center gap-2 px-4 border-b border-border-default">
        <Compass size={24} className="text-primary" />
        <span className="text-lg font-semibold text-text-primary tracking-tight">DealPilot</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-bg-sidebar-active text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
              )}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-default p-3">
        <button
          onClick={() => setAgentRunning(!agentRunning)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              agentRunning ? "bg-success" : "bg-warning",
            )}
          />
          {agentRunning ? "Agent 运行中" : "Agent 未运行"}
        </button>
      </div>
    </aside>
  );
}
