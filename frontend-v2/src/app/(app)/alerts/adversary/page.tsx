"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Eye } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1">Adversary View</h1>
        <p className="text-secondary mt-1">Track threat actors across your environment</p>
      </div>
      <div className="card min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={<Eye className="w-6 h-6" />}
          title="Adversary View"
          description="Track threat actors across your environment"
        />
      </div>
    </div>
  );
}
