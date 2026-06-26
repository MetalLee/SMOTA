"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StartSandboxButtonProps {
  runId: string;
  enabled: boolean;
}

export function StartSandboxButton({ runId, enabled }: StartSandboxButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSandbox() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/runs/${runId}/sandbox/start`, {
      method: "POST"
    });
    const payload = (await response.json()) as { error?: string; reason?: string };

    if (!response.ok || payload.error || payload.reason) {
      setError(payload.error ?? payload.reason ?? "Sandbox build failed.");
    }

    setPending(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={!enabled || pending} onClick={startSandbox} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        启动 Vercel Sandbox 构建
      </Button>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
