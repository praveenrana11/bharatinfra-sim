import * as React from "react";

export function Label({
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={`block text-sm font-semibold text-slate-700 ${className}`} />;
}
