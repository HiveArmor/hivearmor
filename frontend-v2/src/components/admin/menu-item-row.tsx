"use client";

import { useRef } from "react";
import { UtmMenu } from "@/services/menu-management.service";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { GripVertical, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

interface Props {
  item: UtmMenu;
  index: number;
  onEdit: (item: UtmMenu) => void;
  onDelete: (id: number) => void;
  onToggleActive: (item: UtmMenu) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

export function MenuItemRow({
  item,
  index,
  onEdit,
  onDelete,
  onToggleActive,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDragEnd={onDragEnd}
      className={[
        "flex items-center gap-3 px-4 py-3 border-b last:border-0 bg-background select-none transition-opacity",
        isDragging ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.name}</p>
        {item.url && (
          <p className="text-xs text-muted-foreground truncate">{item.url}</p>
        )}
      </div>

      {item.type !== undefined && (
        <span className="text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0">
          type {item.type}
        </span>
      )}

      <button
        type="button"
        onClick={() => onToggleActive(item)}
        title={item.menuActive ? "Deactivate" : "Activate"}
        className="p-1.5 rounded hover:bg-surface-secondary transition-colors"
        aria-label={item.menuActive ? "Deactivate menu item" : "Activate menu item"}
      >
        {item.menuActive ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <button
        type="button"
        onClick={() => onEdit(item)}
        title="Edit"
        className="p-1.5 rounded hover:bg-surface-secondary transition-colors"
        aria-label="Edit menu item"
      >
        <Pencil className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => item.id !== undefined && onDelete(item.id)}
        title="Delete"
        className="p-1.5 rounded hover:bg-surface-secondary transition-colors text-destructive"
        aria-label="Delete menu item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function MenuItemRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-4 w-4 shrink-0" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-14" />
      <Skeleton className="h-6 w-6 rounded" />
      <Skeleton className="h-6 w-6 rounded" />
      <Skeleton className="h-6 w-6 rounded" />
    </div>
  );
}
