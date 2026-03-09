import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  className = "",
  asChild,
  children,
  ...props
}: ButtonProps) {
  void asChild;

  const base =
    "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold tracking-wide transition-all " +
    "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30";

  const styles: Record<ButtonVariant, string> = {
    primary:
      "border-teal-700 bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 text-white shadow-[0_8px_20px_rgba(13,148,136,0.25)] hover:-translate-y-[1px] hover:from-teal-600 hover:to-cyan-500",
    secondary:
      "border-slate-300 bg-white text-slate-800 shadow-sm hover:-translate-y-[1px] hover:border-slate-400 hover:bg-slate-50",
    ghost: "border-transparent bg-transparent text-slate-700 hover:bg-white/70",
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
