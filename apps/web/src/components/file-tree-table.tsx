"use client";

import { File, Folder } from "lucide-react";
import { WorkspaceLoadingLink } from "@/components/route-loading";
import { formatBytes, getFileTreeTableRows } from "@/lib/workbench";
import type { WorkspaceFileRow } from "@smota/shared";

export function FileTreeTable({
  projectId,
  files,
  onNavigateStart
}: {
  projectId: string;
  files: WorkspaceFileRow[];
  onNavigateStart: () => void;
}) {
  const rows = getFileTreeTableRows(files);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="grid grid-cols-[minmax(260px,1fr)_120px_140px_110px_190px] border-b border-border bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <div>path</div>
        <div>file_type</div>
        <div>change_type</div>
        <div>size</div>
        <div>last_modified_at</div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const indent = `${row.depth * 1.25}rem`;
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: indent }}>
                {row.kind === "directory" ? (
                  <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="truncate font-medium text-slate-800">{row.name}</span>
              </span>
              <span className="text-slate-500">{row.file?.file_type ?? (row.kind === "directory" ? "folder" : "file")}</span>
              <span className="text-slate-500">{row.file?.change_type ?? "-"}</span>
              <span className="text-slate-500">{row.file ? formatBytes(row.file.size) : "-"}</span>
              <span className="text-slate-500">{row.file?.last_modified_at ? new Date(row.file.last_modified_at).toLocaleString() : "-"}</span>
            </>
          );

          if (row.kind === "directory") {
            return (
              <div key={row.id} className="grid grid-cols-[minmax(260px,1fr)_120px_140px_110px_190px] px-5 py-3 text-sm">
                {content}
              </div>
            );
          }

          return (
            <WorkspaceLoadingLink
              key={row.id}
              href={`/projects/${projectId}?tab=editor&file=${encodeURIComponent(row.path)}`}
              onNavigateStart={onNavigateStart}
              className="grid grid-cols-[minmax(260px,1fr)_120px_140px_110px_190px] px-5 py-3 text-sm hover:bg-slate-50"
            >
              {content}
            </WorkspaceLoadingLink>
          );
        })}
      </div>
    </div>
  );
}
