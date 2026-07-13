"use client";

import { useState } from "react";
import { Activity, Database, FileCode, Shield, Camera } from "lucide-react";
import { ClusterOverview } from "@/components/opensearch/cluster-overview";
import { IndicesPanel } from "@/components/opensearch/indices-panel";
import { TemplatesPanel } from "@/components/opensearch/templates-panel";
import { IsmPoliciesPanel } from "@/components/opensearch/ism-policies-panel";
import { SnapshotsPanel } from "@/components/opensearch/snapshots-panel";
import { cn } from "@/lib/utils";

type Tab = "cluster" | "indices" | "templates" | "ism" | "snapshots";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "cluster",   label: "Cluster",    icon: <Activity className="w-3.5 h-3.5" /> },
  { id: "indices",   label: "Indices",    icon: <Database className="w-3.5 h-3.5" /> },
  { id: "templates", label: "Templates",  icon: <FileCode  className="w-3.5 h-3.5" /> },
  { id: "ism",       label: "ISM",        icon: <Shield   className="w-3.5 h-3.5" /> },
  { id: "snapshots", label: "Snapshots",  icon: <Camera   className="w-3.5 h-3.5" /> },
];

export default function OpenSearchPage() {
  const [tab, setTab] = useState<Tab>("cluster");

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div>
          <h1 className="text-h3 font-bold text-primary">OpenSearch</h1>
          <p className="text-tiny text-muted">Cluster health, index management, templates, ISM policies and snapshots</p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 px-6 border-b border-surface-border shrink-0 bg-surface-secondary">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-small font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-secondary hover:border-surface-border"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "cluster"   && <div className="h-full overflow-y-auto"><ClusterOverview /></div>}
        {tab === "indices"   && <IndicesPanel />}
        {tab === "templates" && <TemplatesPanel />}
        {tab === "ism"       && <IsmPoliciesPanel />}
        {tab === "snapshots" && <SnapshotsPanel />}
      </div>
    </div>
  );
}
