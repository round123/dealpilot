import type { Customer } from "@dealpilot/api-client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useRecordContext, useTranslate } from "ra-core";
import { useNavigate } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Company } from "../types";
import { useSoftDeleteCustomer } from "./customerMutations";

export const SoftDeleteCustomerButton = () => {
  const record = useRecordContext<Company>();
  const translate = useTranslate();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const mutation = useSoftDeleteCustomer({
    onSuccess: () => {
      setOpen(false);
      navigate("/companies");
    },
  });

  if (!record || typeof record.id !== "string") return null;
  const customerId = record.id as Customer["id"];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        {translate("resources.companies.soft_delete.action", {
          _: "Move to Deleted Customers",
        })}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => !mutation.isPending && setOpen(next)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate("resources.companies.soft_delete.title", {
                name: record.name,
                _: "Delete %{name}?",
              })}
            </DialogTitle>
            <DialogDescription>
              {translate("resources.companies.soft_delete.description", {
                _: "The customer and linked reminders will move to Deleted Customers. You can restore them for 30 days.",
              })}
            </DialogDescription>
          </DialogHeader>
          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {translate("resources.companies.soft_delete.error", {
                  _: "The customer could not be deleted. Try again.",
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              {translate("ra.action.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate(customerId)}
              disabled={mutation.isPending}
            >
              <Trash2 />
              {mutation.isPending
                ? translate("resources.companies.soft_delete.deleting", {
                    _: "Deleting...",
                  })
                : translate("resources.companies.soft_delete.confirm", {
                    _: "Delete customer",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
