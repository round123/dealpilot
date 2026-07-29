import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomerCreateSchema } from "@dealpilot/shared";
import type { CustomerCreate } from "@dealpilot/shared";
import type { z } from "zod";
import { useCreateCustomer } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FieldGroup } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CustomerGrade } from "@dealpilot/shared";

type FormData = z.infer<typeof CustomerCreateSchema>;

export function CustomerForm({ onSuccess }: { onSuccess?: () => void }) {
  const createM = useCreateCustomer();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(CustomerCreateSchema),
    defaultValues: {
      name: "",
      company: "",
      country: "",
      source: "",
      grade: CustomerGrade.B,
    },
  });

  const onSubmit = (data: CustomerCreate) => {
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
        <FormField label="客户名" required error={errors.name?.message}>
          <Input {...register("name")} error={!!errors.name} placeholder="如：John Smith" />
        </FormField>

        <FormField label="公司名" error={errors.company?.message}>
          <Input {...register("company")} placeholder="如：Acme Industries Ltd." />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="国家" error={errors.country?.message}>
            <Input {...register("country")} placeholder="如：United States" />
          </FormField>

          <FormField label="来源" error={errors.source?.message}>
            <Select defaultValue="">
              <SelectTrigger>
                <SelectValue placeholder="选择来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exhibition">展会</SelectItem>
                <SelectItem value="inquiry">询盘</SelectItem>
                <SelectItem value="referral">推荐</SelectItem>
                <SelectItem value="outbound">主动开发</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="分级" error={errors.grade?.message}>
          <Select defaultValue={CustomerGrade.B}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CustomerGrade.A}>A 级 - 重点客户</SelectItem>
              <SelectItem value={CustomerGrade.B}>B 级 - 常规客户</SelectItem>
              <SelectItem value={CustomerGrade.C}>C 级 - 潜在客户</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
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
