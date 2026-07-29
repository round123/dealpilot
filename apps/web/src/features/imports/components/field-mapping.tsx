import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const TARGET_FIELDS = [
  "name",
  "company",
  "country",
  "source",
  "grade",
  "status",
  "email",
  "phone",
  "title",
];

const LABELS: Record<string, string> = {
  name: "客户名 *",
  company: "公司名",
  country: "国家",
  source: "来源",
  grade: "分级 (A/B/C)",
  status: "状态 (active/inactive)",
  email: "邮箱",
  phone: "电话",
  title: "职位",
};

export function FieldMapping({
  sourceHeaders,
  mapping,
  onMappingChange,
}: {
  sourceHeaders: string[];
  mapping: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>) => void;
}) {
  const handleChange = (source: string, target: string) => {
    onMappingChange({ ...mapping, [source]: target });
  };

  return (
    <div className="rounded-lg border border-border-default bg-bg-card">
      <div className="grid grid-cols-2 gap-4 border-b border-border-default bg-bg-hover px-4 py-3 text-xs font-medium text-text-secondary">
        <div>源字段（Excel 列头）</div>
        <div>目标字段（系统字段）</div>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {sourceHeaders.map((header) => {
          const mapped = mapping[header];
          const isRequired = mapped === "name";
          const isUnmapped = !mapped && header.toLowerCase().includes("name");
          return (
            <div
              key={header}
              className={`grid grid-cols-2 gap-4 border-b border-border-subtle px-4 py-2 last:border-b-0 ${
                isUnmapped ? "bg-error-light" : mapped ? "bg-success-light" : ""
              }`}
            >
              <span className="text-sm text-text-primary">{header}</span>
              <Select
                value={mapped ?? ""}
                onValueChange={(v) => handleChange(header, v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="-- 不导入 --" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
