"use client";

import { cn } from "@/lib/utils";
import { AlertStatus, statusToLabel } from "@/types/alert";
import { Circle, Clock, CheckCircle, XCircle, Eye } from "lucide-react";

interface AlertStatusBadgeProps {
  status: AlertStatus;
  showIcon?: boolean;
  className?: string;
  onClick?: () => void;
}

const statusConfig: Record<number, { icon: React.ReactNode; bg: string; text: string }> = {
  [AlertStatus.OPEN]: { icon: <Circle className="w-3 h-3" />, bg: "bg-green-500/15", text: "text-green-400" },
  [AlertStatus.IN_REVIEW]: { icon: <Eye className="w-3 h-3" />, bg: "bg-blue-500/15", text: "text-blue-400" },
  [AlertStatus.COMPLETED]: { icon: <CheckCircle className="w-3 h-3" />, bg: "bg-brand/15", text: "text-brand" },
  [AlertStatus.IGNORED]: { icon: <XCircle className="w-3 h-3" />, bg: "bg-yellow-500/15", text: "text-yellow-400" },
  [AlertStatus.AUTOMATIC_REVIEW]: { icon: <Clock className="w-3 h-3" />, bg: "bg-gray-500/15", text: "text-gray-400" },
};

export function AlertStatusBadge({ status, showIcon = true, className, onClick }: AlertStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig[AlertStatus.OPEN];
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-small font-medium transition-colors",
        config.bg, config.text,
        onClick && "hover:opacity-80 cursor-pointer",
        !onClick && "cursor-default",
        className
      )}
    >
      {showIcon && config.icon}
      {statusToLabel(status)}
    </button>
  );
}
