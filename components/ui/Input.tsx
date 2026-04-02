import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          "mt-1 block w-full rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm text-gray-900",
          "placeholder:text-brand-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary",
          "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          className
        )}
      />
    );
  }
);
