import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "amber";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-brand-primary bg-brand-primary text-white shadow-sm hover:border-brand-secondary hover:bg-brand-secondary",
  secondary:
    "border-2 border-brand-primary bg-transparent text-brand-primary hover:bg-brand-primary hover:text-white",
  danger:
    "border border-brand-danger bg-brand-danger text-white shadow-sm hover:border-red-600 hover:bg-red-600",
  ghost:
    "border border-transparent bg-transparent text-brand-muted shadow-none hover:bg-gray-100 hover:text-brand-dark",
  amber:
    "border border-brand-accent bg-brand-accent text-white shadow-sm hover:border-amber-600 hover:bg-amber-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, asChild, type = "button", children, ...props },
  ref
) {
  void asChild;

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
