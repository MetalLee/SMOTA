"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { shouldEnsurePreviewServer } from "@/lib/workbench";

export function SharedProjectPreview({
  runId,
  previewUrl,
  projectName
}: {
  runId: string | null;
  previewUrl: string | null;
  projectName: string;
}) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const recoveryRef = useRef<{ previewUrl: string | null; inFlight: boolean; lastAttemptAt: number | null }>({
    previewUrl: null,
    inFlight: false,
    lastAttemptAt: null
  });

  useEffect(() => {
    const recovery = recoveryRef.current;
    if (recovery.previewUrl !== previewUrl) {
      recovery.previewUrl = previewUrl;
      recovery.inFlight = false;
      recovery.lastAttemptAt = null;
    }

    if (!runId || !previewUrl) {
      return;
    }

    if (
      !shouldEnsurePreviewServer({
        activeTab: "preview",
        previewUrl,
        inFlight: recovery.inFlight,
        lastAttemptAt: recovery.lastAttemptAt,
        cooldownMs: Number.POSITIVE_INFINITY
      })
    ) {
      return;
    }

    recovery.inFlight = true;
    recovery.lastAttemptAt = Date.now();
    setRecovering(true);
    fetch(`/api/runs/${runId}/sandbox/status?ensurePreview=1`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as { previewRecovered?: boolean };
        if (payload.previewRecovered) {
          setReloadNonce((value) => value + 1);
        }
      })
      .finally(() => {
        recovery.inFlight = false;
        setRecovering(false);
      });
  }, [previewUrl, runId]);

  if (!previewUrl) {
    return <div className="flex h-[520px] items-center justify-center p-8 text-center text-sm text-slate-500">应用预览暂不可用。</div>;
  }

  return (
    <div className="relative">
      {recovering ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-soft">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            加载中
          </div>
        </div>
      ) : null}
      <iframe key={`${previewUrl}:${reloadNonce}`} title={`${projectName} 应用预览`} src={previewUrl} className="h-[66vh] min-h-[520px] w-full" />
    </div>
  );
}
