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
    "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all " +
    "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50";

  const styles: Record<ButtonVariant, string> = {
    primary:
      "border-blue-700 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] hover:-translate-y-[1px] hover:from-blue-500 hover:to-indigo-500 active:scale-95",
    secondary:
      "border-slate-700 bg-slate-900 text-slate-300 shadow-sm hover:-translate-y-[1px] hover:border-slate-600 hover:bg-slate-800 hover:text-white active:scale-95",
    ghost: "border-transparent bg-transparent text-slate-400 hover:bg-white/10 hover:text-white",
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
