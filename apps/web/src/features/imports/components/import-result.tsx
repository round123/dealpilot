import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";
import type { ImportCommitResponse } from "@dealpilot/shared";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

export function ImportResult({ data }: { data: ImportCommitResponse }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <ResultCard
          icon={CheckCircle2}
          label="成功"
          value={data.success}
          color="var(--color-success)"
          bg="var(--color-success-light)"
        />
        <ResultCard
          icon={XCircle}
          label="失败"
          value={data.failed}
          color="var(--color-error)"
          bg="var(--color-error-light)"
        />
        <ResultCard
          icon={AlertCircle}
          label="跳过"
          value={data.skipped}
          color="var(--color-warning)"
          bg="var(--color-warning-light)"
        />
        <ResultCard
          icon={Info}
          label="重复合并"
          value={data.duplicates}
          color="var(--color-info)"
          bg="var(--color-info-light)"
        />
      </div>

      <div className="flex justify-center">
        <Button variant="primary" size="lg" onClick={() => navigate({ to: "/customers" })}>
          查看客户列表
        </Button>
      </div>
    </div>
  );
}

function ResultCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-border-default p-6"
      style={{ backgroundColor: bg }}
    >
      <Icon size={32} style={{ color }} />
      <p className="text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-sm font-medium" style={{ color }}>
        {label}
      </p>
    </div>
  );
}
