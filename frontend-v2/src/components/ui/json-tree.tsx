"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

interface JsonTreeProps {
  data: unknown;
  defaultExpanded?: boolean;
  depth?: number;
  path?: string;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function getValueColor(val: unknown): string {
  if (typeof val === "string")  return "text-[var(--color-low)]";
  if (typeof val === "number")  return "text-[var(--color-medium)]";
  if (typeof val === "boolean") return "text-[var(--brand-secondary)]";
  if (val === null)             return "text-muted italic";
  return "text-primary";
}

function renderPrimitive(val: unknown): string {
  if (val === null)             return "null";
  if (typeof val === "string")  return `"${val}"`;
  return String(val);
}

function JsonNode({ keyName, value, depth = 0, defaultExpanded }: {
  keyName?: string;
  value: unknown;
  depth?: number;
  defaultExpanded?: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded ?? depth < 2);
  const isPrimitive = !isObject(value) && !Array.isArray(value);
  const isArr = Array.isArray(value);
  const isObj = isObject(value);
  const childCount = isObj ? Object.keys(value).length : isArr ? value.length : 0;
  const indent = depth * 16;

  return (
    <div className="font-mono text-tiny leading-relaxed group">
      <div
        className={cn(
          "flex items-start gap-1 py-0.5 px-1 rounded hover:bg-surface-tertiary/50 transition-colors",
          (isObj || isArr) && "cursor-pointer",
        )}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => (isObj || isArr) && setOpen(!open)}
      >
        {/* Expand toggle */}
        <span className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted">
          {(isObj || isArr) && (
            open
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
          )}
        </span>

        {/* Key */}
        {keyName !== undefined && (
          <span className="text-[var(--brand-primary)] shrink-0">{keyName}:</span>
        )}

        {/* Value */}
        {isPrimitive && (
          <>
            <span className={cn("flex-1 break-all", getValueColor(value))}>
              {renderPrimitive(value)}
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton value={String(value)} />
            </span>
          </>
        )}

        {!isPrimitive && !open && (
          <span className="text-muted">
            {isArr ? `[${childCount}]` : `{${childCount}}`}
          </span>
        )}
      </div>

      {/* Children */}
      {!isPrimitive && open && (
        <div>
          {isObj && Object.entries(value).map(([k, v]) => (
            <JsonNode key={k} keyName={k} value={v} depth={depth + 1} />
          ))}
          {isArr && value.map((v, i) => (
            <JsonNode key={i} keyName={String(i)} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ data, defaultExpanded = true }: JsonTreeProps) {
  return (
    <div className="bg-surface-secondary rounded-md border border-surface-border p-2 overflow-auto">
      <JsonNode value={data} defaultExpanded={defaultExpanded} />
    </div>
  );
}
