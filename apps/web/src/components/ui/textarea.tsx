import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-md border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-fast min-h-[80px] resize-y",
          "focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error
            ? "border-error focus:border-error focus:ring-error"
            : "border-border-default",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
