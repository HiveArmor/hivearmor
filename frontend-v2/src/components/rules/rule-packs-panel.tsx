"use client";

import { useEffect, useState } from "react";
import { Monitor, Server, Cloud, Globe, Download, CheckCircle2, Loader2 } from "lucide-react";
import { detectionService, type RulePack } from "@/services/detection.service";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PACK_ICONS: Record<string, React.ReactNode> = {
  windows:  <Monitor className="w-5 h-5" />,
  linux:    <Server className="w-5 h-5" />,
  cloud:    <Cloud className="w-5 h-5" />,
  network:  <Globe className="w-5 h-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  endpoint: "text-brand bg-brand/10",
  cloud:    "text-warning bg-warning/10",
  network:  "text-success bg-success/10",
};

export function RulePacksPanel() {
  const [packs, setPacks] = useState<RulePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    detectionService.getPacks()
      .then(setPacks)
      .catch((err) => console.error("Failed to load packs:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleInstall = async (packName: string) => {
    setInstalling(packName);
    try {
      const result = await detectionService.installPack(packName);
      setInstalled((prev) => new Set(prev).add(packName));
      toast("success", "Pack installed", `${result.imported} rule(s) added from ${packName} pack`);
    } catch (err) {
      console.error("Install failed:", err);
      toast("error", "Install failed", `Could not install ${packName} pack`);
    } finally {
      setInstalling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading rule packs…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-h3 font-semibold text-primary">Rule Packs</h2>
        <p className="text-small text-muted mt-0.5">
          Pre-built detection rule packs from the SigmaHQ community. Install to add curated rules to your detection engine.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packs.map((pack) => {
          const isInstalling = installing === pack.name;
          const isInstalled = installed.has(pack.name);
          const catColor = CATEGORY_COLORS[pack.category] ?? "text-secondary bg-surface-tertiary";

          return (
            <div
              key={pack.name}
              className="card p-5 flex flex-col gap-4 hover:border-surface-border-focus transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  "bg-surface-tertiary text-secondary"
                )}>
                  {PACK_ICONS[pack.name] ?? <Download className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-small font-semibold text-primary capitalize">{pack.name} Pack</p>
                    <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded", catColor)}>
                      {pack.category}
                    </span>
                  </div>
                  <p className="text-tiny text-muted mt-0.5 line-clamp-2">{pack.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-tiny text-muted">
                  <span className="font-semibold text-secondary">{pack.ruleCount.toLocaleString()}</span> rules
                </span>
                <button
                  onClick={() => handleInstall(pack.name)}
                  disabled={isInstalling || isInstalled}
                  className={cn(
                    "btn btn-sm gap-1.5 disabled:opacity-60",
                    isInstalled ? "btn-secondary" : "btn-primary"
                  )}
                >
                  {isInstalling ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Installing…</>
                  ) : isInstalled ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Installed</>
                  ) : (
                    <><Download className="w-3.5 h-3.5" /> Install Pack</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-tiny text-muted">
        <p className="font-medium text-secondary mb-1">About Rule Packs</p>
        Rule counts shown are approximate. Installed rules are added in <span className="text-primary">disabled</span> state
        so you can review them before enabling. Duplicate rule names are automatically skipped.
      </div>
    </div>
  );
}
