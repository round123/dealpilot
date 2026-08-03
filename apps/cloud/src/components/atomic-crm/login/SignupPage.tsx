import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useNotify, useTranslate } from "ra-core";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { Link, useNavigate } from "react-router";

import { Notification } from "@/components/admin/notification";
import { getErrorMessageKey } from "@/components/admin/error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivacyPolicyPage } from "@/components/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "@/components/legal/TermsOfServicePage";

import { personalAccount } from "../providers/personalAccount";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { SignUpData } from "../types";
import { ConfirmationRequired } from "./ConfirmationRequired";

type SignUpFormData = SignUpData & {
  legalConsent: boolean;
};

export const SignupPage = () => {
  const queryClient = useQueryClient();
  const { darkModeLogo: logo, title } = useConfigurationContext();
  const navigate = useNavigate();
  const notify = useNotify();
  const translate = useTranslate();
  const {
    register,
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<SignUpFormData>({
    mode: "onChange",
    defaultValues: {
      legalConsent: false,
    },
  });

  const signup = useMutation({
    mutationKey: ["signup"],
    mutationFn: (data: SignUpData) => personalAccount.signUp(data),
    onSuccess: async ({ session }) => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      if (!session) {
        navigate(ConfirmationRequired.path);
        return;
      }
      notify("crm.auth.signup.user_created", {
        type: "success",
      });
      navigate("/contacts", { replace: true });
    },
    onError: (error: Error) =>
      notify(getErrorMessageKey(error, "crm.auth.signup.error"), {
        type: "error",
      }),
  });

  const onSubmit: SubmitHandler<SignUpFormData> = ({
    legalConsent: _legalConsent,
    ...data
  }) => signup.mutate(data);

  return (
    <div className="min-h-screen p-8">
      <div className="flex items-center gap-4">
        <img
          src={logo}
          alt={title}
          width={24}
          className="filter brightness-0 dark:invert"
        />
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      <div className="min-h-[calc(100vh-6rem)]">
        <div className="max-w-md mx-auto min-h-[calc(100vh-6rem)] flex flex-col justify-center gap-4">
          <h1 className="text-2xl font-bold mb-4">
            {translate("crm.auth.signup.create_account")}
          </h1>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="first_name">
                {translate("crm.auth.first_name")}
              </Label>
              <Input
                {...register("first_name", { required: true })}
                id="first_name"
                autoComplete="given-name"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last_name">
                {translate("crm.auth.last_name")}
              </Label>
              <Input
                {...register("last_name", { required: true })}
                id="last_name"
                autoComplete="family-name"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{translate("ra.auth.email")}</Label>
              <Input
                {...register("email", { required: true })}
                id="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{translate("ra.auth.password")}</Label>
              <Input
                {...register("password", { required: true, minLength: 8 })}
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
              <Controller
                name="legalConsent"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Checkbox
                    id="legal-consent"
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                    onBlur={field.onBlur}
                    aria-label="同意隐私政策与服务条款"
                    aria-required="true"
                    aria-describedby="legal-consent-details"
                  />
                )}
              />
              <div className="space-y-1 text-sm leading-6">
                <Label
                  htmlFor="legal-consent"
                  className="font-normal leading-6"
                >
                  我已阅读并同意
                  <Link
                    to={PrivacyPolicyPage.path}
                    className="mx-1 font-medium text-primary hover:underline"
                  >
                    《隐私政策》
                  </Link>
                  和
                  <Link
                    to={TermsOfServicePage.path}
                    className="mx-1 font-medium text-primary hover:underline"
                  >
                    《服务条款》
                  </Link>
                </Label>
                <p id="legal-consent-details" className="text-muted-foreground">
                  我知悉账号和 CRM 数据将存储在新加坡的 Supabase
                  托管服务，可能涉及跨境处理；邮件、静态托管等供应商及数据保留规则详见隐私政策。
                </p>
              </div>
            </div>
            <Button
              type="submit"
              disabled={!isValid || signup.isPending}
              className="w-full"
            >
              {signup.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}
              {translate("crm.auth.signup.create_account")}
            </Button>
          </form>
          <Link to="/login" className="text-sm text-center hover:underline">
            {translate("ra.auth.sign_in")}
          </Link>
        </div>
      </div>
      <Notification />
    </div>
  );
};

SignupPage.path = "/sign-up";
