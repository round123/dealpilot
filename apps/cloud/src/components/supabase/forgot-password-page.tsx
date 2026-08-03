import { useState } from "react";
import {
  Form,
  required,
  useAuthProvider,
  useNotify,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { FieldValues, SubmitHandler } from "react-hook-form";

import { TextInput } from "@/components/admin/text-input";
import { getErrorMessageKey } from "@/components/admin/error-message";
import type { PersonalAuthProvider } from "@/components/atomic-crm/providers/supabase/authProvider";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/supabase/layout";

import { getPasswordRecoveryRedirectUrl } from "./password-recovery-url";

interface FormData {
  email: string;
}

export const ForgotPasswordPage = () => {
  const [loading, setLoading] = useState(false);
  const authProvider = useAuthProvider() as PersonalAuthProvider | undefined;
  const notify = useNotify();
  const redirect = useRedirect();
  const translate = useTranslate();

  const submit = async (values: FormData) => {
    try {
      setLoading(true);
      if (!authProvider) {
        throw new Error("crm.auth.authentication_unavailable");
      }
      await authProvider.resetPassword({
        email: values.email,
        redirectTo: getPasswordRecoveryRedirectUrl(
          import.meta.env.BASE_URL,
          window.location.href,
        ),
      });
      redirect("/login?passwordRecoveryEmailSent=1");
    } catch (error) {
      notify(getErrorMessageKey(error, "crm.auth.recovery_error"), {
        type: "warning",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {translate("ra-supabase.reset_password.forgot_password")}
        </h1>
        <p>{translate("ra-supabase.reset_password.forgot_password_details")}</p>
      </div>
      <Form<FormData>
        className="space-y-8"
        onSubmit={submit as SubmitHandler<FieldValues>}
      >
        <TextInput
          source="email"
          label={translate("ra.auth.email")}
          autoComplete="email"
          validate={required()}
        />
        <Button type="submit" className="cursor-pointer" disabled={loading}>
          {translate("crm.action.reset_password")}
        </Button>
      </Form>
    </Layout>
  );
};

ForgotPasswordPage.path = "forgot-password";
