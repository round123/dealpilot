import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";

export const FormToolbar = () => (
  <div
    role="toolbar"
    className="sticky bottom-16 flex flex-row justify-end gap-2 bg-linear-to-b from-transparent to-card to-10% pt-4 pb-4 md:bottom-0 md:pb-0"
  >
    <CancelButton />
    <SaveButton />
  </div>
);
