import { ApiError } from "@dealpilot/api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  FileDown,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type {
  CustomerImportOperations,
  ImportCommitResult,
  ImportFieldMapping,
  ImportParseResult,
} from "../providers/importOperations";

type Step = "upload" | "mapping" | "preview" | "result";
type DuplicateAction = "merge" | "skip" | "new";

const steps: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "上传文件" },
  { id: "mapping", label: "字段映射" },
  { id: "preview", label: "预览与冲突" },
  { id: "result", label: "导入结果" },
];

const defaultFieldMappings = [
  {
    target: "name",
    label: "客户名称",
    aliases: ["name", "名称"],
    required: true,
  },
  { target: "company", label: "公司", aliases: ["company", "公司"] },
  { target: "country", label: "国家", aliases: ["country", "国家"] },
  { target: "source", label: "来源", aliases: ["source", "来源"] },
  { target: "grade", label: "分级", aliases: ["grade", "分级"] },
  {
    target: "contact_name",
    label: "联系人",
    aliases: ["contact_name", "联系人"],
  },
  { target: "email", label: "邮箱", aliases: ["email", "邮箱"] },
  { target: "phone", label: "电话", aliases: ["phone", "电话"] },
] as const;
type FieldTarget = (typeof defaultFieldMappings)[number]["target"];
type MappingDraft = Partial<Record<FieldTarget, string>>;
const NO_SOURCE = "__no_source__";

export function AgentCustomerImportPage({
  operations,
}: {
  operations: CustomerImportOperations;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(
    null,
  );
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(
    null,
  );
  const [resolutions, setResolutions] = useState<
    Record<number, DuplicateAction>
  >({});
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<MappingDraft>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectFile = (selected: File | null) => {
    abortRef.current?.abort();
    setError(null);
    setParseResult(null);
    setCommitResult(null);
    setResolutions({});
    setSourceColumns([]);
    setFieldMapping({});
    setStep("upload");
    if (selected && !isSupportedFile(selected.name)) {
      setFile(null);
      setError("请选择 .xlsx、.xls 或 .csv 文件。");
      return;
    }
    setFile(selected);
  };

  const parseFile = async () => {
    if (!file || isParsing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsParsing(true);
    setError(null);
    try {
      const parsed = await operations.parseFile(file, {
        signal: controller.signal,
      });
      setParseResult(parsed);
      const columns =
        parsed.source_columns.length > 0
          ? parsed.source_columns
          : previewColumns(parsed.preview);
      setSourceColumns(columns);
      setFieldMapping(createDefaultMapping(columns));
      setResolutions({});
      idempotencyKeyRef.current = createIdempotencyKey();
      setStep("mapping");
    } catch (caught) {
      if (!controller.signal.aborted) setError(importErrorMessage(caught));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsParsing(false);
    }
  };

  const parseWithMapping = async (mapping: ImportFieldMapping) => {
    if (!file || isParsing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsParsing(true);
    setError(null);
    try {
      const parsed = await operations.parseFile(file, {
        signal: controller.signal,
        mapping,
      });
      setParseResult(parsed);
      setResolutions({});
      idempotencyKeyRef.current = createIdempotencyKey();
      setStep("preview");
    } catch (caught) {
      if (!controller.signal.aborted) setError(importErrorMessage(caught));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsParsing(false);
    }
  };

  const commit = async () => {
    if (!parseResult || isCommitting) return;
    setIsCommitting(true);
    setError(null);
    try {
      const result = await operations.commit(
        {
          job_id: parseResult.job_id,
          resolutions: parseResult.duplicate_candidates.map((candidate) => {
            const action = resolutions[candidate.row_index];
            return {
              row_index: candidate.row_index,
              action,
              ...(action === "merge"
                ? { target_customer_id: candidate.existing_customer_id }
                : {}),
            };
          }),
        },
        { idempotencyKey: idempotencyKeyRef.current },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["contacts"] }),
      ]);
      setCommitResult(result);
      setStep("result");
    } catch (caught) {
      setError(importErrorMessage(caught));
    } finally {
      setIsCommitting(false);
    }
  };

  const downloadErrors = async () => {
    if (!parseResult || isDownloading) return;
    setIsDownloading(true);
    setError(null);
    try {
      const blob = await operations.downloadErrors(parseResult.job_id);
      downloadBlob(blob, `客户导入错误-${parseResult.job_id}.csv`);
    } catch (caught) {
      setError(importErrorMessage(caught));
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setFile(null);
    setParseResult(null);
    setCommitResult(null);
    setResolutions({});
    setSourceColumns([]);
    setFieldMapping({});
    setError(null);
    setStep("upload");
  };

  const allDuplicatesResolved =
    parseResult?.duplicate_candidates.every(
      (candidate) => resolutions[candidate.row_index] !== undefined,
    ) ?? false;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="size-4" />
        <Link to="/companies" className="hover:text-foreground">
          客户
        </Link>
        <span>/</span>
        <span className="text-foreground">导入客户</span>
      </div>

      <Card className="overflow-hidden rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>导入客户</CardTitle>
          <StepIndicator current={step} />
        </CardHeader>
        <CardContent className="pt-6">
          {error ? (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle />
              <AlertTitle>操作未完成</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {step === "upload" ? (
            <UploadStep
              file={file}
              isParsing={isParsing}
              onFile={selectFile}
              onParse={parseFile}
              onCancel={() => abortRef.current?.abort()}
            />
          ) : null}
          {step === "mapping" && parseResult ? (
            <MappingStep
              columns={sourceColumns}
              mapping={fieldMapping}
              isParsing={isParsing}
              onChange={(target, source) =>
                setFieldMapping((current) => ({
                  ...current,
                  [target]: source,
                }))
              }
              onBack={() => setStep("upload")}
              onNext={parseWithMapping}
            />
          ) : null}
          {step === "preview" && parseResult ? (
            <PreviewStep
              result={parseResult}
              resolutions={resolutions}
              isCommitting={isCommitting}
              isDownloading={isDownloading}
              canCommit={allDuplicatesResolved}
              onResolution={(rowIndex, action) =>
                setResolutions((current) => ({
                  ...current,
                  [rowIndex]: action,
                }))
              }
              onBack={() => setStep("mapping")}
              onCommit={commit}
              onDownloadErrors={downloadErrors}
            />
          ) : null}
          {step === "result" && parseResult && commitResult ? (
            <ResultStep
              result={commitResult}
              hasErrors={parseResult.errors.length > 0}
              isDownloading={isDownloading}
              onDownloadErrors={downloadErrors}
              onReset={reset}
            />
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const currentIndex = steps.findIndex(({ id }) => id === current);
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="导入进度">
      {steps.map((item, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={item.id} className="min-w-0">
            <div className="flex items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  complete && "border-emerald-600 bg-emerald-600 text-white",
                  active && "border-primary bg-primary text-primary-foreground",
                  !complete && !active && "border-border text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {complete ? <Check className="size-4" /> : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "mx-1 h-px flex-1",
                    complete ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                "mt-2 block text-xs sm:text-sm",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function UploadStep({
  file,
  isParsing,
  onFile,
  onParse,
  onCancel,
}: {
  file: File | null;
  isParsing: boolean;
  onFile(file: File | null): void;
  onParse(): void;
  onCancel(): void;
}) {
  return (
    <section>
      <label
        className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 text-center transition-colors hover:bg-muted/50"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFile(event.dataTransfer.files.item(0));
        }}
      >
        <UploadCloud className="mb-4 size-12 text-muted-foreground" />
        <span className="font-medium">
          拖拽 Excel 或 CSV 文件到此处，或点击选择
        </span>
        <span className="mt-2 text-sm text-muted-foreground">
          支持 .xlsx、.xls、.csv
        </span>
        <input
          className="sr-only"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => onFile(event.target.files?.item(0) ?? null)}
        />
      </label>

      {file ? (
        <div className="mt-4 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="移除文件"
            onClick={() => onFile(null)}
            disabled={isParsing}
          >
            <X />
          </Button>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        {isParsing ? (
          <Button variant="outline" onClick={onCancel}>
            取消解析
          </Button>
        ) : null}
        <Button onClick={onParse} disabled={!file || isParsing}>
          {isParsing ? (
            <>
              <Spinner className="mr-2" />
              正在解析
            </>
          ) : (
            "解析并继续"
          )}
        </Button>
      </div>
    </section>
  );
}

function MappingStep({
  columns,
  mapping,
  isParsing,
  onChange,
  onBack,
  onNext,
}: {
  columns: string[];
  mapping: MappingDraft;
  isParsing: boolean;
  onChange(target: FieldTarget, source: string | undefined): void;
  onBack(): void;
  onNext(mapping: ImportFieldMapping): void;
}) {
  const duplicateSources = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const source of Object.values(mapping)) {
      if (!source) continue;
      if (seen.has(source)) duplicates.add(source);
      seen.add(source);
    }
    return duplicates;
  }, [mapping]);
  const hasNameMapping = Boolean(mapping.name);
  const isValid = hasNameMapping && duplicateSources.size === 0;

  const submit = () => {
    if (!isValid || !mapping.name) return;
    onNext({
      name: mapping.name,
      ...optionalMappingFields(mapping),
    });
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">字段映射</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            为系统字段选择文件中的源列，不需要的字段可设为不导入。
          </p>
        </div>
        <Badge variant="outline">客户名称为必填</Badge>
      </div>

      {!hasNameMapping ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>客户名称尚未映射</AlertTitle>
          <AlertDescription>请选择包含客户名称的源列。</AlertDescription>
        </Alert>
      ) : null}

      {duplicateSources.size > 0 ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>源列重复映射</AlertTitle>
          <AlertDescription>同一源列只能映射到一个系统字段。</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>系统字段</TableHead>
              <TableHead>字段键</TableHead>
              <TableHead>源列</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
                  文件中没有可预览的列
                </TableCell>
              </TableRow>
            ) : (
              defaultFieldMappings.map((field) => (
                <TableRow
                  key={field.target}
                  className={cn(
                    mapping[field.target] &&
                      "bg-emerald-50/60 dark:bg-emerald-950/20",
                  )}
                >
                  <TableCell className="font-medium">
                    {field.label}
                    {field.target === "name" ? " *" : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {field.target}
                  </TableCell>
                  <TableCell className="min-w-52">
                    <Select
                      value={mapping[field.target] ?? NO_SOURCE}
                      onValueChange={(source) =>
                        onChange(
                          field.target,
                          source === NO_SOURCE ? undefined : source,
                        )
                      }
                      disabled={isParsing}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`${field.label}源列`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SOURCE}>不导入</SelectItem>
                        {columns.map((source) => {
                          const usedByOther = Object.entries(mapping).some(
                            ([target, selected]) =>
                              target !== field.target && selected === source,
                          );
                          return (
                            <SelectItem
                              key={source}
                              value={source}
                              disabled={usedByOther}
                            >
                              {source}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 flex justify-between gap-2">
        <Button variant="outline" onClick={onBack} disabled={isParsing}>
          <ArrowLeft />
          上一步
        </Button>
        <Button onClick={submit} disabled={!isValid || isParsing}>
          {isParsing ? (
            <>
              <Spinner className="mr-2" />
              正在应用映射
            </>
          ) : (
            "下一步"
          )}
        </Button>
      </div>
    </section>
  );
}

function PreviewStep({
  result,
  resolutions,
  isCommitting,
  isDownloading,
  canCommit,
  onResolution,
  onBack,
  onCommit,
  onDownloadErrors,
}: {
  result: ImportParseResult;
  resolutions: Record<number, DuplicateAction>;
  isCommitting: boolean;
  isDownloading: boolean;
  canCommit: boolean;
  onResolution(row: number, action: DuplicateAction): void;
  onBack(): void;
  onCommit(): void;
  onDownloadErrors(): void;
}) {
  return (
    <section>
      <StatsRow
        items={[
          ["总行数", result.total_rows, "text-foreground"],
          ["有效行", result.valid_rows, "text-emerald-700"],
          ["错误行", result.errors.length, "text-destructive"],
          ["重复候选", result.duplicate_candidates.length, "text-blue-700"],
        ]}
      />

      <Tabs defaultValue="valid" className="mt-6">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="valid">有效预览</TabsTrigger>
          <TabsTrigger value="errors">
            错误行 ({result.errors.length})
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            重复候选 ({result.duplicate_candidates.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="valid">
          <PreviewTable rows={result.preview} />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTable
            result={result}
            isDownloading={isDownloading}
            onDownload={onDownloadErrors}
          />
        </TabsContent>
        <TabsContent value="duplicates">
          <DuplicateChoices
            candidates={result.duplicate_candidates}
            resolutions={resolutions}
            onChange={onResolution}
          />
        </TabsContent>
      </Tabs>

      {!canCommit ? (
        <p className="mt-4 text-sm text-amber-700">
          请为每条重复候选选择合并、跳过或新建。
        </p>
      ) : null}
      <div className="mt-6 flex justify-between gap-2">
        <Button variant="outline" onClick={onBack} disabled={isCommitting}>
          <ArrowLeft />
          上一步
        </Button>
        <Button onClick={onCommit} disabled={!canCommit || isCommitting}>
          {isCommitting ? (
            <>
              <Spinner className="mr-2" />
              正在导入
            </>
          ) : (
            "确认导入"
          )}
        </Button>
      </div>
    </section>
  );
}

function PreviewTable({ rows }: { rows: ImportParseResult["preview"] }) {
  const columns = previewColumns(rows);
  return (
    <div className="mt-3 max-h-[32rem] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">行</TableHead>
            {columns.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + 1}
                className="py-8 text-center text-muted-foreground"
              >
                没有可预览的数据
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell>{index + 1}</TableCell>
                {columns.map((column) => (
                  <TableCell key={column} className="max-w-64 truncate">
                    {formatCell(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ErrorsTable({
  result,
  isDownloading,
  onDownload,
}: {
  result: ImportParseResult;
  isDownloading: boolean;
  onDownload(): void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-3 flex justify-end">
        <Button
          variant="outline"
          onClick={onDownload}
          disabled={result.errors.length === 0 || isDownloading}
        >
          <FileDown />
          {isDownloading ? "正在下载" : "下载错误报告"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>行号</TableHead>
              <TableHead>字段</TableHead>
              <TableHead>错误原因</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.errors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
                  没有错误行
                </TableCell>
              </TableRow>
            ) : (
              result.errors.map((item, index) => (
                <TableRow key={`${item.row}-${item.field ?? ""}-${index}`}>
                  <TableCell>{item.row}</TableCell>
                  <TableCell>{item.field ?? "-"}</TableCell>
                  <TableCell>{item.message}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DuplicateChoices({
  candidates,
  resolutions,
  onChange,
}: {
  candidates: ImportParseResult["duplicate_candidates"];
  resolutions: Record<number, DuplicateAction>;
  onChange(row: number, action: DuplicateAction): void;
}) {
  if (candidates.length === 0)
    return (
      <p className="mt-3 rounded-md border p-8 text-center text-sm text-muted-foreground">
        没有重复候选
      </p>
    );
  return (
    <div className="mt-3 space-y-3">
      {candidates.map((candidate) => (
        <div key={candidate.row_index} className="rounded-md border p-4">
          <div className="grid gap-1 text-sm sm:grid-cols-3">
            <span className="text-muted-foreground">
              第 {candidate.row_index} 行
            </span>
            <span>
              导入：<strong>{candidate.new_name}</strong>
            </span>
            <span>
              现有：<strong>{candidate.existing_name}</strong>
            </span>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label={`第 ${candidate.row_index} 行重复处理`}
          >
            {(
              [
                ["merge", "合并"],
                ["skip", "跳过"],
                ["new", "新建"],
              ] as const
            ).map(([action, label]) => (
              <Button
                key={action}
                size="sm"
                variant={
                  resolutions[candidate.row_index] === action
                    ? "default"
                    : "outline"
                }
                aria-pressed={resolutions[candidate.row_index] === action}
                onClick={() => onChange(candidate.row_index, action)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultStep({
  result,
  hasErrors,
  isDownloading,
  onDownloadErrors,
  onReset,
}: {
  result: ImportCommitResult;
  hasErrors: boolean;
  isDownloading: boolean;
  onDownloadErrors(): void;
  onReset(): void;
}) {
  return (
    <section>
      <div className="mb-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-6" />
        </span>
        <h2 className="mt-3 text-lg font-semibold">导入完成</h2>
      </div>
      <StatsRow
        items={[
          ["成功", result.success, "text-emerald-700"],
          ["失败", result.failed, "text-destructive"],
          ["跳过", result.skipped, "text-amber-700"],
          ["重复合并", result.duplicates, "text-blue-700"],
        ]}
      />
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {hasErrors ? (
          <Button
            variant="outline"
            onClick={onDownloadErrors}
            disabled={isDownloading}
          >
            <Download />
            {isDownloading ? "正在下载" : "下载错误报告"}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onReset}>
          继续导入
        </Button>
        <Button asChild>
          <Link to="/companies">查看客户列表</Link>
        </Button>
      </div>
    </section>
  );
}

function StatsRow({ items }: { items: Array<[string, number, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
      {items.map(([label, value, color]) => (
        <div key={label} className="bg-background p-4 text-center">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className={cn("mt-1 text-2xl font-semibold", color)}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function createDefaultMapping(columns: string[]): MappingDraft {
  const mapping: MappingDraft = {};
  for (const field of defaultFieldMappings) {
    const source = field.aliases.find((alias) => columns.includes(alias));
    if (source) mapping[field.target] = source;
  }
  return mapping;
}

function optionalMappingFields(mapping: MappingDraft) {
  return {
    ...(mapping.company ? { company: mapping.company } : {}),
    ...(mapping.country ? { country: mapping.country } : {}),
    ...(mapping.source ? { source: mapping.source } : {}),
    ...(mapping.grade ? { grade: mapping.grade } : {}),
    ...(mapping.contact_name ? { contact_name: mapping.contact_name } : {}),
    ...(mapping.email ? { email: mapping.email } : {}),
    ...(mapping.phone ? { phone: mapping.phone } : {}),
  };
}

function previewColumns(rows: ImportParseResult["preview"]): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function isSupportedFile(fileName: string): boolean {
  return /\.(xlsx|xls|csv)$/i.test(fileName);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function importErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "导入操作失败，请重试。";
  if (error.code === "ABORTED") return "解析已取消，客户数据未写入。";
  if (error.code === "NETWORK_ERROR")
    return "无法连接本地 Agent，请确认 DealPilot 正在运行。";
  if (error.code === "VALIDATION_ERROR")
    return "文件格式或导入内容不符合要求，请检查后重试。";
  if (error.code === "CONFLICT") return "该导入任务已经提交，请重新选择文件。";
  return "导入操作失败，请稍后重试。";
}

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `import-${Date.now().toString(36)}`
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
