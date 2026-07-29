import { useState } from "react";
import { Check, Download } from "lucide-react";
import { FileUpload } from "./components/file-upload";
import { FieldMapping } from "./components/field-mapping";
import { ImportPreview } from "./components/import-preview";
import { ImportResult } from "./components/import-result";
import { Button } from "@/components/ui/button";
import { useImportParse, useImportCommit } from "./api";
import type { ImportParseResponse, ImportCommitResponse } from "@dealpilot/shared";

const STEPS = ["上传文件", "字段映射", "预览与冲突", "导入结果"];

export function ImportPage() {
  const [step, setStep] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseResult, setParseResult] = useState<ImportParseResponse | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);

  const parseM = useImportParse();
  const commitM = useImportCommit();

  const handleFile = (f: File) => {
    parseM.mutate(f, {
      onSuccess: (data) => {
        setParseResult(data);
        const headers = data.preview.length > 0 ? Object.keys(data.preview[0]) : [];
        const autoMapping: Record<string, string> = {};
        for (const h of headers) {
          const lower = h.toLowerCase();
          if (lower.includes("name") && !autoMapping[h]) autoMapping[h] = "name";
          else if (lower.includes("company")) autoMapping[h] = "company";
          else if (lower.includes("country")) autoMapping[h] = "country";
          else if (lower.includes("source")) autoMapping[h] = "source";
          else if (lower.includes("email")) autoMapping[h] = "email";
          else if (lower.includes("phone")) autoMapping[h] = "phone";
        }
        setMapping(autoMapping);
        setStep(1);
      },
    });
  };

  const handleCommit = () => {
    if (!parseResult) return;
    commitM.mutate(
      { jobId: parseResult.job_id, resolutions: [] },
      {
        onSuccess: (data) => {
          setCommitResult(data);
          setStep(3);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium"
                style={{
                  backgroundColor: i < step ? "var(--color-success)" : i === step ? "var(--color-primary)" : "var(--color-gray-100)",
                  color: i <= step ? "var(--color-text-inverse)" : "var(--color-text-tertiary)",
                }}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span
                className="text-sm"
                style={{ color: i === step ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-px"
                style={{ backgroundColor: i < step ? "var(--color-primary)" : "var(--color-border-default)" }}
              />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <FileUpload onFileSelected={handleFile} />
          <div className="flex justify-center">
            <Button variant="link" size="sm">
              <Download size={16} />
              下载导入模板
            </Button>
          </div>
          {parseM.isPending && (
            <p className="text-center text-sm text-text-secondary">正在解析文件...</p>
          )}
          {parseM.isError && (
            <p className="text-center text-sm text-error">
              解析失败：{parseM.error?.message}
            </p>
          )}
        </div>
      )}

      {step === 1 && parseResult && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            检测到 {parseResult.total_rows} 行数据，请确认字段映射：
          </p>
          <FieldMapping
            sourceHeaders={parseResult.preview.length > 0 ? Object.keys(parseResult.preview[0]) : []}
            mapping={mapping}
            onMappingChange={setMapping}
          />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              上一步
            </Button>
            <Button onClick={() => setStep(2)}>下一步</Button>
          </div>
        </div>
      )}

      {step === 2 && parseResult && (
        <div className="space-y-4">
          <ImportPreview data={parseResult} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              上一步
            </Button>
            <Button
              onClick={handleCommit}
              loading={commitM.isPending}
            >
              确认导入
            </Button>
          </div>
        </div>
      )}

      {step === 3 && commitResult && <ImportResult data={commitResult} />}
    </div>
  );
}
