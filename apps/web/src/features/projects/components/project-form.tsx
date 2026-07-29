import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ProjectCreateSchema } from "@dealpilot/shared";
import type { ProjectCreate } from "@dealpilot/shared";
import type { z } from "zod";
import { useCreateProject } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FieldGroup } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ProjectStage, ProjectGrade } from "@dealpilot/shared";

type FormData = z.infer<typeof ProjectCreateSchema>;

export function ProjectForm({ onSuccess }: { onSuccess?: () => void }) {
  const createM = useCreateProject();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(ProjectCreateSchema),
    defaultValues: {
      customer_id: "",
      name: "",
      currency: "USD",
      amount: undefined,
      probability: undefined,
      expected_close_date: "",
      stage: ProjectStage.LEAD,
      grade: ProjectGrade.B,
    },
  });

  const onSubmit = (data: ProjectCreate) => {
    createM.mutate(data, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup>
        <FormField label="项目名" required error={errors.name?.message}>
          <Input {...register("name")} error={!!errors.name} placeholder="如：500pcs LED 灯管订单" />
        </FormField>

        <FormField label="关联客户 ID" required error={errors.customer_id?.message}>
          <Input {...register("customer_id")} error={!!errors.customer_id} placeholder="客户 UUID" />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="币种" error={errors.currency?.message}>
            <Select
              defaultValue="USD"
              onValueChange={(v) => setValue("currency", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="CNY">CNY</SelectItem>
                <SelectItem value="JPY">JPY</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="金额" error={errors.amount?.message}>
            <Input
              type="number"
              step="0.01"
              {...register("amount", { setValueAs: (v) => v === "" ? undefined : Number(v) })}
              placeholder="0.00"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="成交概率 (%)" error={errors.probability?.message}>
            <Input
              type="number"
              min="0"
              max="100"
              {...register("probability", { setValueAs: (v) => v === "" ? undefined : Number(v) })}
              placeholder="0-100"
            />
          </FormField>

          <FormField label="预计成交日" error={errors.expected_close_date?.message}>
            <Input type="date" {...register("expected_close_date")} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="阶段" error={errors.stage?.message}>
            <Select
              defaultValue={ProjectStage.LEAD}
              onValueChange={(v) => setValue("stage", v as typeof ProjectStage[keyof typeof ProjectStage])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProjectStage.LEAD}>需求确认</SelectItem>
                <SelectItem value={ProjectStage.QUALIFIED}>方案/样品</SelectItem>
                <SelectItem value={ProjectStage.PROPOSAL}>报价</SelectItem>
                <SelectItem value={ProjectStage.NEGOTIATION}>谈判</SelectItem>
                <SelectItem value={ProjectStage.CLOSED_WON}>成交</SelectItem>
                <SelectItem value={ProjectStage.CLOSED_LOST}>失单</SelectItem>
                <SelectItem value={ProjectStage.ARCHIVED}>已归档</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="分级" error={errors.grade?.message}>
            <Select
              defaultValue={ProjectGrade.B}
              onValueChange={(v) => setValue("grade", v as typeof ProjectGrade[keyof typeof ProjectGrade])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProjectGrade.S}>S 级 - 战略项目</SelectItem>
                <SelectItem value={ProjectGrade.A}>A 级 - 重要项目</SelectItem>
                <SelectItem value={ProjectGrade.B}>B 级 - 常规项目</SelectItem>
                <SelectItem value={ProjectGrade.C}>C 级 - 小项目</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </FieldGroup>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => reset()}>
          重置
        </Button>
        <Button type="submit" loading={createM.isPending}>
          保存
        </Button>
      </div>

      {createM.isError && (
        <p className="text-sm text-error">
          保存失败：{createM.error?.message}
        </p>
      )}
    </form>
  );
}
