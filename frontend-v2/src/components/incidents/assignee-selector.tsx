"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { userService, type UserSummary } from "@/services/user.service";
import { cn } from "@/lib/utils";

interface AssigneeSelectorProps {
  currentAssignee?: string | null;
  onAssign: (login: string | null) => void;
  disabled?: boolean;
}

export function AssigneeSelector({ currentAssignee, onAssign, disabled }: AssigneeSelectorProps) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userService.listAnalysts().then(setUsers).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="text-tiny text-muted flex items-center gap-1 shrink-0">
        <User className="w-3 h-3" /> Assigned to
      </span>
      <select
        value={currentAssignee ?? ""}
        onChange={(e) => onAssign(e.target.value || null)}
        disabled={disabled || loading}
        className={cn(
          "input-base text-small h-7 py-0 pr-6 min-w-[140px]",
          loading && "opacity-50"
        )}
      >
        <option value="">Unassigned</option>
        {users.map((user) => (
          <option key={user.id} value={user.login}>
            {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.login}
            {" "}({user.login})
          </option>
        ))}
      </select>
    </div>
  );
}
