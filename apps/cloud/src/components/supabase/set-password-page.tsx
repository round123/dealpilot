import { useState } from "react";
import {
  Form,
  required,
  useAuthProvider,
  useNotify,
  useTranslate,
} from "ra-core";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { useLocation, useNavigate } from "react-router";

import { TextInput } from "@/components/admin/text-input";
import { getErrorMessageKey } from "@/components/admin/error-message";
import type { PersonalAuthProvider } from "@/components/atomic-crm/providers/supabase/authProvider";
import { Layout } from "@/components/supabase/layout";
import { Button } from "@/components/ui/button";

import {
  getPasswordRecoveryCode,
  removeTopLevelRecoveryCode,
} from "./password-recovery-url";

interface SetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export const SetPasswordPage = () => {
  const [loading, setLoading] = useState(false);
  const authProvider = useAuthProvider() as PersonalAuthProvider | undefined;
  const location = useLocation();
  const navigate = useNavigate();
  const notify = useNotify();
  const translate = useTranslate();
  const code = getPasswordRecoveryCode(location.search, window.location.search);

  const validate = (values: FieldValues) =>
    values.password === values.confirmPassword
      ? {}
      : {
          password: "ra-supabase.validation.password_mismatch",
          confirmPassword: "ra-supabase.validation.password_mismatch",
        };

  if (!code) {
    return (
      <Layout>
        <p>{translate("ra-supabase.auth.missing_tokens")}</p>
      </Layout>
    );
  }

  const submit = async (values: SetPasswordFormData) => {
    try {
      setLoading(true);
      if (!authProvider) {
        throw new Error("crm.auth.authentication_unavailable");
      }
      await authProvider.setPassword({ code, password: values.password });
      window.history.replaceState(
        window.history.state,
        "",
        removeTopLevelRecoveryCode(window.location.href),
      );
      notify("crm.profile.password_updated", {
        type: "success",
      });
      navigate("/", { replace: true });
    } catch (error) {
      notify(getErrorMessageKey(error, "crm.auth.password_update_error"), {
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
          {translate("ra-supabase.set_password.new_password")}
        </h1>
      </div>
      <Form<SetPasswordFormData>
        className="space-y-8"
        onSubmit={submit as SubmitHandler<FieldValues>}
        validate={validate}
      >
        <TextInput
          label={translate("ra.auth.password")}
          autoComplete="new-password"
          source="password"
          type="password"
          validate={required()}
        />
        <TextInput
          label={translate("crm.auth.confirm_password")}
          autoComplete="new-password"
          source="confirmPassword"
          type="password"
          validate={required()}
        />
        <Button type="submit" className="cursor-pointer" disabled={loading}>
          {translate("ra.action.save")}
        </Button>
      </Form>
    </Layout>
  );
};

SetPasswordPage.path = "set-password";
