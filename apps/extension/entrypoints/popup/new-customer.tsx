/**
 * DealPilot Popup 新建客户子页面
 *
 * 快速新建客户表单（POST /customers），
 * 使用 RHF + Zod（@dealpilot/shared CustomerCreateSchema）。
 *
 * 验收标准：
 * - AC-12: 保存失败保留内容可重试
 * - Idempotency-Key 防止重复提交
 */

import React, { useState } from "react";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { CustomerCreateSchema, CustomerGrade } from "@dealpilot/shared";
import type { CustomerCreate } from "@dealpilot/shared";
import { createCustomer } from "../../src/lib/api-client";
import { INPUT_STYLE, LABEL_STYLE, ERROR_STYLE, SECONDARY_BUTTON, PRIMARY_BUTTON } from "./form-styles";

const SOURCE_OPTIONS = ["展会", "询盘", "推荐", "主动开发", "其他"];
const COUNTRY_OPTIONS = ["中国", "美国", "德国", "英国", "日本", "韩国", "印度", "巴西", "法国", "意大利", "加拿大", "澳大利亚", "俄罗斯", "西班牙", "其他"];
const GRADE_OPTIONS = [
  { value: CustomerGrade.A, label: "A" },
  { value: CustomerGrade.B, label: "B" },
  { value: CustomerGrade.C, label: "C" },
];

const resolver = CustomerCreateSchema;

interface NewCustomerPageProps {
  onBack: () => void;
}

export function NewCustomerPage({ onBack }: NewCustomerPageProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<CustomerCreate>({
    resolver: resolver as any,
    defaultValues: {
      name: "", company: "", country: "", source: "",
      grade: CustomerGrade.C, status: "active",
    },
  });

  const selectedGrade = watch("grade");

  const onSubmit = async (data: CustomerCreate) => {
    setSubmitError(null);
    try {
      await createCustomer(data);
      setSubmitSuccess(true);
      setTimeout(() => onBack(), 1000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "创建失败，可重试");
    }
  };

  if (submitSuccess) {
    return (
      <div style={{ width: "360px", height: "480px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", backgroundColor: "var(--color-bg-page)" }}>
        <CheckCircle2 size={32} style={{ color: "var(--color-success)", marginBottom: "12px" }} />
        <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>客户已创建</div>
      </div>
    );
  }

  return (
    <div style={{ width: "360px", height: "480px", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", backgroundColor: "var(--color-bg-page)", color: "var(--color-text-primary)" }}>
      {/* 返回栏 */}
      <div style={{ height: "48px", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", borderBottom: "1px solid var(--color-border-default)", backgroundColor: "var(--color-bg-card)" }}>
        <button onClick={onBack} style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}>
          <ArrowLeft size={16} style={{ color: "var(--color-text-secondary)" }} />
        </button>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>新建客户</span>
      </div>

      {/* 表单主体 */}
      <form onSubmit={handleSubmit(onSubmit)} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* 客户名 */}
        <div>
          <label style={LABEL_STYLE}>客户名 <span style={{ color: "var(--color-error)" }}>*</span></label>
          <input {...register("name")} placeholder="输入客户名称" style={{ ...INPUT_STYLE, border: errors.name ? "1px solid var(--color-error)" : INPUT_STYLE.border }} />
          {errors.name && <div style={ERROR_STYLE}>{errors.name.message}</div>}
        </div>

        {/* 公司名 */}
        <div>
          <label style={LABEL_STYLE}>公司名</label>
          <input {...register("company")} placeholder="输入公司名称" style={INPUT_STYLE} />
        </div>

        {/* 国家 */}
        <div>
          <label style={LABEL_STYLE}>国家</label>
          <select {...register("country")} style={INPUT_STYLE} defaultValue="">
            <option value="" disabled>选择国家</option>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* 来源 */}
        <div>
          <label style={LABEL_STYLE}>来源</label>
          <select {...register("source")} style={INPUT_STYLE} defaultValue="">
            <option value="" disabled>选择来源</option>
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* 分级 */}
        <div>
          <label style={LABEL_STYLE}>分级</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {GRADE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue("grade", opt.value, { shouldValidate: true })}
                style={{
                  flex: 1, height: "36px",
                  border: selectedGrade === opt.value ? "1px solid var(--color-primary)" : "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: selectedGrade === opt.value ? "var(--color-primary-light)" : "var(--color-bg-card)",
                  color: selectedGrade === opt.value ? "var(--color-primary)" : "var(--color-text-secondary)",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
            <input type="hidden" {...register("grade")} />
          </div>
        </div>

        {submitError && (
          <div style={{ padding: "8px 10px", backgroundColor: "var(--color-error-light)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--color-error)" }}>
            {submitError}
          </div>
        )}
      </form>

      {/* 底部操作栏 */}
      <div style={{ height: "56px", display: "flex", gap: "8px", padding: "0 12px", alignItems: "center", borderTop: "1px solid var(--color-border-default)", backgroundColor: "var(--color-bg-card)" }}>
        <button onClick={onBack} style={SECONDARY_BUTTON}>取消</button>
        <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting} style={{ ...PRIMARY_BUTTON, opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}>
          {isSubmitting ? <Loader2 size={14} /> : null}
          保存
        </button>
      </div>
    </div>
  );
}
