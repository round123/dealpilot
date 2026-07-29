import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dialog({ children, ...props }: DialogPrimitive.DialogProps) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}

export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  children,
  className,
  title,
  description,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-modal w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-card shadow-lg border border-border-default",
          "focus:outline-none",
          className,
        )}
      >
        {(title || description) && (
          <div className="p-6 pb-4">
            {title && (
              <DialogPrimitive.Title className="text-lg font-semibold text-text-primary">
                {title}
              </DialogPrimitive.Title>
            )}
            {description && (
              <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
        )}
        <div className={cn(title || description ? "px-6 pb-6" : "p-6")}>
          {children}
        </div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors">
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogFooter = ({ children }: { children: ReactNode }) => (
  <div className="mt-6 flex justify-end gap-2">{children}</div>
);
