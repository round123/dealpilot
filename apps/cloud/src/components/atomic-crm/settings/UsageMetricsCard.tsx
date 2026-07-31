import { BarChart3, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessageKey } from "@/components/admin/error-message";

import {
  useLocalDataOperations,
  type RollingUsageMetrics,
} from "../providers/localDataOperations";

export const UsageMetricsCard = () => {
  const operations = useLocalDataOperations()!;
  const notify = useNotify();
  const [metrics, setMetrics] = useState<RollingUsageMetrics | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    operations.getUsageMetrics({ signal: controller.signal })
      .then(setMetrics)
      .catch(() => undefined);
    return () => controller.abort();
  }, [operations]);

  const exportReport = async () => {
    setExporting(true);
    try {
      const blob = await operations.exportUsageMetrics();
      downloadBlob(blob, `dealpilot-metrics-${new Date().toISOString().slice(0, 10)}.json`);
      notify("脱敏统计报告已导出，未上传任何数据", { type: "success" });
    } catch (error) {
      notify(getErrorMessageKey(error, "统计报告导出失败，请重试"), {
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="size-5" />
            滚动 30 天使用指标
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            仅在本机计算和展示，不会自动上传。
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          title="导出脱敏统计报告"
          aria-label="导出脱敏统计报告"
          disabled={exporting}
          onClick={exportReport}
        >
          <Download className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
          <Metric
            label="到期跟进按时完成率"
            metric={metrics?.on_time_completion}
            note={metrics && metrics.on_time_completion.denominator < 20
              ? `至少 20 条后判断目标；当前 ${metrics.on_time_completion.denominator} 条`
              : "目标 90%"}
          />
          <Metric
            label="客户自动匹配正确率"
            metric={metrics?.match_accuracy}
            note="代理值：按未被改绑的自动唯一匹配计算，并非人工逐条确认；目标 95%"
          />
          <Metric
            label="提醒处理率"
            metric={metrics?.reminder_handling}
            note="完成、曾稍后或忽略均计为处理；稍后到期仍保留计数；目标 90%"
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          导出报告只包含统计区间、计数、比率和计算口径，不包含客户身份、社媒账号或消息正文。
        </p>
      </CardContent>
    </Card>
  );
};

const Metric = ({
  label,
  metric,
  note,
}: {
  label: string;
  metric?: { numerator: number; denominator: number; rate: number | null };
  note: string;
}) => (
  <section className="min-w-0 bg-background p-4">
    <h3 className="text-sm font-medium">{label}</h3>
    <p className="mt-2 text-2xl font-semibold">
      {metric ? formatRate(metric.rate) : "正在计算..."}
    </p>
    <p className="mt-1 text-xs text-muted-foreground">
      {metric ? `${metric.numerator} / ${metric.denominator}` : "--"}
    </p>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>
  </section>
);

const formatRate = (rate: number | null) =>
  rate === null ? "暂无样本" : `${(rate * 100).toFixed(1)}%`;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
