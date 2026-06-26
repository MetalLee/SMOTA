export function getSandboxPreviewUrl(sandbox: { domain(port: number): string }, port: number): string {
  return sandbox.domain(port);
}
