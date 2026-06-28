export function canReadRunSandboxStatus({
  userId,
  runOwnerId,
  projectShared
}: {
  userId: string;
  runOwnerId: string;
  projectShared: boolean;
}) {
  return userId === runOwnerId || projectShared;
}

export function shouldAttemptPreviewRecovery({
  ensurePreview,
  runStatus,
  sandboxStatus,
  sandboxName,
  previewUrl
}: {
  ensurePreview: boolean;
  runStatus: string;
  sandboxStatus: string | null | undefined;
  sandboxName: string | null | undefined;
  previewUrl: string | null | undefined;
}) {
  return ensurePreview && runStatus === "succeeded" && sandboxStatus === "previewing" && Boolean(sandboxName?.trim()) && Boolean(previewUrl?.trim());
}
