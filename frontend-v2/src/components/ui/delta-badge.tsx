"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeltaBadgeProps {
  value: number;
  inverted?: boolean;
  suffix?: string;
  className?: string;
}

export function DeltaBadge({ value, inverted = false, suffix = "%", className }: DeltaBadgeProps) {
  const isUp = value > 0;
  const isDown = value < 0;
  const isFlat = value === 0;

  // inverted = up is bad (e.g. alert count increasing)
  const isGood = inverted ? isDown : isUp;
  const isBad  = inverted ? isUp   : isDown;

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-tiny font-medium tabular-nums",
      isGood  && "text-success",
      isBad   && "text-critical",
      isFlat  && "text-muted",
      className,
    )}>
      {isUp   && <TrendingUp  className="w-3 h-3" />}
      {isDown && <TrendingDown className="w-3 h-3" />}
      {isFlat && <Minus        className="w-3 h-3" />}
      {Math.abs(value)}{suffix}
    </span>
  );
}
