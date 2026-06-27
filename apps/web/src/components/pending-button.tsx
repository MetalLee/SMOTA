"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PendingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel?: ReactNode;
}

export function PendingButton({ children, disabled, pendingLabel, ...props }: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} disabled={disabled || pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
