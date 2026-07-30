import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useNotify, useTranslate } from "ra-core";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Link, useNavigate } from "react-router";

import { Notification } from "@/components/admin/notification";
import { getErrorMessageKey } from "@/components/admin/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { personalAccount } from "../providers/personalAccount";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { SignUpData } from "../types";
import { ConfirmationRequired } from "./ConfirmationRequired";

export const SignupPage = () => {
  const queryClient = useQueryClient();
  const { darkModeLogo: logo, title } = useConfigurationContext();
  const navigate = useNavigate();
  const notify = useNotify();
  const translate = useTranslate();
  const {
    register,
    handleSubmit,
    formState: { isValid },
  } = useForm<SignUpData>({
    mode: "onChange",
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

  const onSubmit: SubmitHandler<SignUpData> = (data) => signup.mutate(data);

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
        <div className="max-w-sm mx-auto min-h-[calc(100vh-6rem)] flex flex-col justify-center gap-4">
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
