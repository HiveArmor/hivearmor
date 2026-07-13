"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1">Threat Activity</h1>
        <p className="text-secondary mt-1">Real-time threat activity dashboard</p>
      </div>
      <div className="card min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={<Activity className="w-6 h-6" />}
          title="Threat Activity"
          description="Real-time threat activity dashboard"
        />
      </div>
    </div>
  );
}
