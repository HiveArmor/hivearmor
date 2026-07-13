"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "right" | "bottom" | "left";
  width?: string;
  height?: string;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  width = "480px",
  height = "60vh",
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const slideClass =
    side === "right"  ? "animate-slide-in-right" :
    side === "left"   ? "animate-slide-in-left"  :
    "animate-slide-in-up";

  const positionClass =
    side === "right"  ? "right-0 top-0 bottom-0" :
    side === "left"   ? "left-0 top-0 bottom-0"  :
    "bottom-0 left-0 right-0";

  const styleProps =
    side === "right" || side === "left"
      ? { width }
      : { height };

  return (
    <div className="fixed inset-0 z-overlay flex" style={{ pointerEvents: "none" }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-overlay animate-fade-in"
        style={{ pointerEvents: "all" }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={cn(
          "absolute flex flex-col bg-surface-primary border-surface-border shadow-drawer",
          side === "right" && "border-l",
          side === "left"  && "border-r",
          side === "bottom" && "border-t rounded-t-xl",
          slideClass,
          positionClass,
          className,
        )}
        style={{ ...styleProps, pointerEvents: "all" }}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
            <h3 className="text-h3 text-primary font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="btn-icon btn-ghost w-7 h-7"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
