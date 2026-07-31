import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useLogout, useNotify, useTranslate } from "ra-core";
import { useState } from "react";

import { getErrorMessageKey } from "@/components/admin/error-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { personalAccount } from "../providers/personalAccount";
import { useCrmProviderCapabilities } from "../providers/capabilities";

export const DeleteAccountControl = ({
  compact = false,
}: {
  compact?: boolean;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const deletion = useMutation({
    mutationKey: ["deleteAccount"],
    mutationFn: () => personalAccount.deleteAccount(),
    onSuccess: async () => {
      notify("crm.profile.delete_success", { type: "success" });
      setOpen(false);
      setConfirmation("");
      // This also clears React Admin and persisted React Query account state.
      await logout();
    },
    onError: (error) => {
      notify(getErrorMessageKey(error, "crm.profile.delete_error"), {
        type: "error",
      });
    },
  });

  const expectedConfirmation = translate(
    "crm.profile.delete_confirmation_value",
  );
  const canConfirm = confirmation.trim() === expectedConfirmation;

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className={compact ? "w-full" : undefined}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4 mr-2" />
        {translate("crm.profile.delete_action")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!deletion.isPending) setOpen(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate("crm.profile.delete_dialog_title")}
            </DialogTitle>
            <DialogDescription>
              {translate("crm.profile.delete_dialog_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="delete-account-confirmation"
              className="text-sm font-medium"
            >
              {translate("crm.profile.delete_confirmation_label")}
            </label>
            <Input
              id="delete-account-confirmation"
              value={confirmation}
              placeholder={translate(
                "crm.profile.delete_confirmation_placeholder",
              )}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={deletion.isPending}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deletion.isPending}
            >
              {translate("ra.action.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirm || deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              {deletion.isPending
                ? translate("crm.profile.deleting")
                : translate("crm.profile.delete_confirm_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const AccountDeletionSection = () => {
  const translate = useTranslate();
  const capabilities = useCrmProviderCapabilities();

  if (!capabilities.accountDeletion) return null;

  return (
    <Card id="account">
      <CardContent className="space-y-3">
        <h2 className="text-xl font-semibold text-muted-foreground">
          {translate("crm.profile.account_section")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate("crm.profile.delete_description")}
        </p>
        <DeleteAccountControl />
      </CardContent>
    </Card>
  );
};
