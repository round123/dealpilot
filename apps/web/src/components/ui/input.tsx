import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border bg-bg-card px-3 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-fast",
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
Input.displayName = "Input";
