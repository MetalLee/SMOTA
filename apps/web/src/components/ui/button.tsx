import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5147ee] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500",
        className
      )}
      {...props}
    />
  );
}
