import * as React from "react";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={
          "mt-1 block w-full rounded-lg border border-slate-300/90 bg-white px-3 py-2 text-sm " +
          "text-slate-900 placeholder:text-slate-400 shadow-sm " +
          "focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30 " +
          className
        }
      />
    );
  }
);
