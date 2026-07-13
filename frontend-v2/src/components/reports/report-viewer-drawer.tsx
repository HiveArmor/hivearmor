"use client";

import { useState } from "react";
import { Download, FileText, Calendar, User } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { reportService, GeneratedReport } from "@/services/report.service";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Props {
  report: GeneratedReport | null;
  onClose: () => void;
}

function fmtTs(ts?: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const STATUS_UI: Record<string, { cls: string }> = {
  completed: { cls: "text-brand" },
  pending:   { cls: "text-warning" },
  failed:    { cls: "text-severity-critical" },
};

export function ReportViewerDrawer({ report, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!report) return;
    setDownloading(true);
    try {
      await reportService.exportReport(report.id, report.pdfPath ?? undefined);
      toast("success", "Download started");
    } catch (err) {
      toast("error", "Download failed", err instanceof Error ? err.message : undefined);
    } finally {
      setDownloading(false);
    }
  }

  const status = (report?.status ?? "pending").toLowerCase();
  const statusUi = STATUS_UI[status] ?? STATUS_UI.pending;

  return (
    <Drawer open={!!report} onClose={onClose} title="Report Details" width="440px">
      {report && (
        <div className="flex flex-col h-full">
          <div className="flex-1 p-5 space-y-5">
            {/* Name & icon */}
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-surface-tertiary shrink-0">
                <FileText className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="font-semibold text-primary text-body">{report.reportName}</p>
                <span className={cn("text-small mt-1 capitalize", statusUi.cls)}>{status}</span>
              </div>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-surface-secondary border border-surface-border space-y-0.5">
                <p className="text-tiny text-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Generated
                </p>
                <p className="text-small text-primary">{fmtTs(report.createdDate)}</p>
              </div>
              <div className="p-3 rounded-lg bg-surface-secondary border border-surface-border space-y-0.5">
                <p className="text-tiny text-muted flex items-center gap-1">
                  <User className="w-3 h-3" /> Created By
                </p>
                <p className="text-small text-primary font-mono">{report.createdBy ?? "—"}</p>
              </div>
              <div className="p-3 rounded-lg bg-surface-secondary border border-surface-border space-y-0.5 col-span-2">
                <p className="text-tiny text-muted">Standard</p>
                <p className="text-small text-primary">{report.standard}</p>
              </div>
            </div>

            {report.pdfPath && (
              <div className="p-3 rounded-lg bg-surface-secondary border border-surface-border">
                <p className="text-tiny text-muted mb-0.5">File path</p>
                <p className="text-small text-primary font-mono break-all">{report.pdfPath}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {status.toLowerCase() === "completed" && (
            <div className="px-5 py-4 border-t border-surface-border shrink-0">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="btn-primary w-full text-small flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloading ? "Downloading…" : "Download Report"}
              </button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
