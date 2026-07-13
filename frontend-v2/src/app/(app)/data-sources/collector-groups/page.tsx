"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { FolderTree } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1">Collector Groups</h1>
        <p className="text-secondary mt-1">Organize collectors into groups</p>
      </div>
      <div className="card min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={<FolderTree className="w-6 h-6" />}
          title="Collector Groups"
          description="Organize collectors into groups"
        />
      </div>
    </div>
  );
}
