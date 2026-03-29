import * as React from "react";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={
          "mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm " +
          "text-white placeholder:text-slate-500 shadow-inner " +
          "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 " +
          className
        }
      />
    );
  }
);
