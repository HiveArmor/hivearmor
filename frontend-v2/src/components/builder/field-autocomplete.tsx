"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, X } from "lucide-react";
import type { IndexPatternField, FieldDataType } from "@/types/visualization-builder";

interface FieldAutocompleteProps {
  fields: IndexPatternField[];
  value: string | null;
  onChange: (field: string) => void;
  filterByType?: FieldDataType[];
  placeholder?: string;
  disabled?: boolean;
}

const TYPE_BADGE_COLORS: Record<FieldDataType, { bg: string; text: string }> = {
  string: { bg: "bg-gray-500/15", text: "text-gray-400" },
  number: { bg: "bg-blue-500/15", text: "text-blue-400" },
  date: { bg: "bg-green-500/15", text: "text-green-400" },
  boolean: { bg: "bg-purple-500/15", text: "text-purple-400" },
  ip: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  geo_point: { bg: "bg-orange-500/15", text: "text-orange-400" },
  object: { bg: "bg-gray-500/15", text: "text-gray-500" },
};

function TypeBadge({ type }: { type: FieldDataType }) {
  const colors = TYPE_BADGE_COLORS[type];
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase", colors.bg, colors.text)}>
      {type}
    </span>
  );
}

export function FieldAutocomplete({
  fields,
  value,
  onChange,
  filterByType,
  placeholder = "Select field...",
  disabled = false,
}: FieldAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter fields by type prop
  const typeFilteredFields = useMemo(() => {
    if (!filterByType || filterByType.length === 0) return fields;
    return fields.filter((f) => filterByType.includes(f.type));
  }, [fields, filterByType]);

  // Filter fields by search query
  const searchFilteredFields = useMemo(() => {
    if (!search.trim()) return typeFilteredFields;
    const query = search.toLowerCase();
    return typeFilteredFields.filter((f) => f.name.toLowerCase().includes(query));
  }, [typeFilteredFields, search]);

  // Group fields by type when search is empty
  const groupedFields = useMemo(() => {
    if (search.trim()) return null;
    const groups: Partial<Record<FieldDataType, IndexPatternField[]>> = {};
    for (const field of searchFilteredFields) {
      if (!groups[field.type]) {
        groups[field.type] = [];
      }
      groups[field.type]!.push(field);
    }
    return groups;
  }, [searchFilteredFields, search]);

  const handleSelect = (fieldName: string) => {
    onChange(fieldName);
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
    setIsOpen(false);
  };

  const selectedField = fields.find((f) => f.name === value);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input trigger */}
      <div
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-small transition-colors",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:border-surface-border-strong cursor-pointer",
          isOpen && "border-brand ring-1 ring-brand/30"
        )}
        onClick={() => !disabled && setIsOpen(true)}
      >
        {isOpen ? (
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter fields..."
              className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted text-small"
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedField ? (
              <>
                <TypeBadge type={selectedField.type} />
                <span className="text-primary truncate">{selectedField.name}</span>
              </>
            ) : (
              <span className="text-muted">{placeholder}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted hover:text-primary p-0.5 rounded transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className={cn("w-3.5 h-3.5 text-muted transition-transform", isOpen && "rotate-180")} />
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-surface-border bg-surface-secondary shadow-lg">
          {searchFilteredFields.length === 0 ? (
            <div className="px-3 py-4 text-center text-small text-muted">
              No matching fields
            </div>
          ) : groupedFields ? (
            // Grouped view (no search query)
            Object.entries(groupedFields).map(([type, groupFields]) => (
              <div key={type}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted bg-surface-tertiary sticky top-0">
                  {type}
                </div>
                {groupFields!.map((field) => (
                  <button
                    key={field.name}
                    type="button"
                    onClick={() => handleSelect(field.name)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-1.5 text-small text-left hover:bg-surface-tertiary transition-colors",
                      value === field.name && "bg-brand/10 text-brand"
                    )}
                  >
                    <TypeBadge type={field.type} />
                    <span className="truncate">{field.name}</span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            // Flat filtered view (search active)
            searchFilteredFields.map((field) => (
              <button
                key={field.name}
                type="button"
                onClick={() => handleSelect(field.name)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-small text-left hover:bg-surface-tertiary transition-colors",
                  value === field.name && "bg-brand/10 text-brand"
                )}
              >
                <TypeBadge type={field.type} />
                <span className="truncate">{field.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
