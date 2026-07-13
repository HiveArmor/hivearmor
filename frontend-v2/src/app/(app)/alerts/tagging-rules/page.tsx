"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Tag } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1">Tagging Rules</h1>
        <p className="text-secondary mt-1">Manage alert classification and tagging rules</p>
      </div>
      <div className="card min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={<Tag className="w-6 h-6" />}
          title="Tagging Rules"
          description="Manage alert classification and tagging rules"
        />
      </div>
    </div>
  );
}
