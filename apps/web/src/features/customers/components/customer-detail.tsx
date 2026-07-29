import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  Pencil,
  Plus,
  MessageCircle,
  Send,
  Phone,
  Mail,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  MessageSquareText,
} from "lucide-react";
import { useCustomer } from "../api";
import { Badge, GradeBadge, StageBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatRelativeTime,
  formatDate,
  formatDateTime,
  followUpTypeLabel,
  reminderTypeLabel,
  isOverdue,
} from "@/lib/format";
import { SkeletonCard } from "@/components/skeleton";

export function CustomerDetail() {
  const { id } = useParams({ from: "/customers/$id" });
  const { data: customer, isLoading } = useCustomer(id);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    contacts: true,
    social: true,
    projects: true,
    reminders: true,
  });

  const toggle = (key: string) =>
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));

  if (isLoading) return <SkeletonCard lines={6} />;

  if (!customer) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-text-secondary">客户档案不存在或已删除</p>
        <Link to="/customers">
          <Button variant="outline" size="md" className="mt-4">返回客户列表</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="w-2/3 space-y-6">
        <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{customer.name}</h1>
              <GradeBadge grade={customer.grade} />
              <Badge variant={customer.status === "active" ? "success" : "default"}>
                {customer.status === "active" ? "活跃" : "非活跃"}
              </Badge>
            </div>
            <Button variant="ghost" size="icon">
              <Pencil size={16} />
            </Button>
          </div>
          {customer.company && (
            <p className="mt-1 text-lg text-text-secondary">{customer.company}</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <InfoItem label="国家" value={customer.country} />
            <InfoItem label="来源" value={customer.source} />
            <InfoItem label="创建时间" value={formatDate(customer.created_at)} />
            <InfoItem label="最近更新" value={formatRelativeTime(customer.updated_at)} />
          </dl>
        </div>

        <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">跟进时间线</h2>
            <Button variant="outline" size="sm">
              <Plus size={16} />
              新建跟进
            </Button>
          </div>
          <div className="mt-4 flex gap-4 border-b border-border-default pb-3">
            {["全部", "邮件", "通话", "会话标记", "备注"].map((tab, i) => (
              <button
                key={tab}
                className={`text-sm ${i === 0 ? "text-primary font-medium" : "text-text-secondary hover:text-text-primary"}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <FollowUpTimeline items={customer.recent_follow_ups ?? []} />
        </div>
      </div>

      <div className="w-1/3 space-y-4 min-w-[320px]">
        <CollapsibleCard
          title="联系人"
          expanded={expandedSections.contacts}
          onToggle={() => toggle("contacts")}
          action={<Plus size={16} className="text-text-tertiary cursor-pointer hover:text-text-primary" />}
        >
          <ContactList contacts={customer.contacts ?? []} />
        </CollapsibleCard>

        <CollapsibleCard
          title="社媒账号"
          expanded={expandedSections.social}
          onToggle={() => toggle("social")}
          action={<Plus size={16} className="text-text-tertiary cursor-pointer hover:text-text-primary" />}
        >
          <SocialList items={customer.social_accounts ?? []} />
        </CollapsibleCard>

        <CollapsibleCard
          title="关联项目"
          expanded={expandedSections.projects}
          onToggle={() => toggle("projects")}
        >
          <ProjectList items={customer.projects ?? []} />
        </CollapsibleCard>

        {(customer.open_reminders ?? []).length > 0 && (
          <CollapsibleCard
            title="未完成提醒"
            badge={(customer.open_reminders ?? []).length}
            expanded={expandedSections.reminders}
            onToggle={() => toggle("reminders")}
          >
            <ReminderList items={customer.open_reminders ?? []} />
          </CollapsibleCard>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text-primary">{value ?? "-"}</dd>
    </div>
  );
}

function CollapsibleCard({
  title,
  expanded,
  onToggle,
  action,
  badge,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-card shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <button onClick={onToggle} className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {title}
          </button>
          {badge !== undefined && <Badge variant="info">{badge}</Badge>}
        </div>
        {action}
      </div>
      {expanded && <div className="p-4">{children}</div>}
    </div>
  );
}

function FollowUpTimeline({ items }: { items: { id: string; type: string; note: string | null; occurred_at: string }[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <MessageSquareText size={32} style={{ color: "var(--color-gray-300)" }} />
        <p className="text-sm text-text-secondary">暂无跟进记录</p>
        <Button variant="outline" size="sm">
          <Plus size={16} />
          新建跟进
        </Button>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    message: "var(--color-primary)",
    call: "var(--color-success)",
    email: "var(--color-info)",
    note: "var(--color-gray-400)",
  };

  return (
    <ol className="relative mt-4 space-y-4 border-l border-border-default pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            className="absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-bg-card"
            style={{ backgroundColor: typeColors[item.type] ?? "var(--color-gray-400)" }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">{formatDateTime(item.occurred_at)}</span>
            <Badge>{followUpTypeLabel(item.type)}</Badge>
          </div>
          {item.note && (
            <p className="mt-1 text-sm text-text-primary">{item.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function ContactList({ contacts }: { contacts: { id: string; name: string; title: string | null; email: string | null; phone: string | null }[] }) {
  if (contacts.length === 0) return <EmptyHint text="暂无联系人" />;
  return (
    <ul className="space-y-3">
      {contacts.map((c) => (
        <li key={c.id} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{c.name}</span>
            {c.title && <span className="text-xs text-text-tertiary">{c.title}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-text-link">
                <Mail size={12} />
                {c.email}
              </a>
            )}
            {c.phone && (
              <span className="flex items-center gap-1">
                <Phone size={12} />
                {c.phone}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SocialList({ items }: { items: { id: string; platform: string; raw_identifier: string }[] }) {
  if (items.length === 0) return <EmptyHint text="暂无社媒账号" />;
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          {s.platform === "whatsapp" ? <MessageCircle size={16} style={{ color: "var(--color-success)" }} /> : <Send size={16} style={{ color: "var(--color-info)" }} />}
          <span className="text-sm text-text-primary">{s.raw_identifier}</span>
        </li>
      ))}
    </ul>
  );
}

function ProjectList({ items }: { items: { id: string; name: string; stage: string; amount: number | null }[] }) {
  if (items.length === 0) return <EmptyHint text="暂无关联项目" />;
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="flex items-center justify-between">
          <Link to="/projects/$id" params={{ id: p.id }} className="text-sm text-text-link hover:underline">
            {p.name}
          </Link>
          <div className="flex items-center gap-2">
            <StageBadge stage={p.stage} />
            {p.amount !== null && (
              <span className="text-xs text-text-tertiary">${p.amount.toLocaleString()}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReminderList({ items }: { items: { id: string; type: string; status: string; due_at: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const overdue = isOverdue(r.due_at);
        return (
          <li key={r.id} className="flex items-center gap-2">
            <Clock size={16} style={{ color: overdue ? "var(--color-error)" : "var(--color-text-tertiary)" }} />
            <span className="text-sm" style={{ color: overdue ? "var(--color-error)" : "var(--color-text-primary)" }}>
              {reminderTypeLabel(r.type)}
            </span>
            <span className="text-xs text-text-tertiary ml-auto">
              {formatDateTime(r.due_at)}
            </span>
            {overdue && <AlertTriangle size={14} style={{ color: "var(--color-error)" }} />}
          </li>
        );
      })}
    </ul>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-text-tertiary py-2">{text}</p>;
}
