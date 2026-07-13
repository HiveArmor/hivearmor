import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build a window of up to 5 page numbers centered around currentPage
  const windowSize = Math.min(5, totalPages);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, currentPage - half);
  const end = Math.min(totalPages - 1, start + windowSize - 1);
  // Shift start left if window is smaller on right side
  start = Math.max(0, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
      <div className="text-small text-muted">
        Page {currentPage + 1} of {totalPages}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          aria-label="Previous page"
          className="flex items-center gap-1 px-2.5 py-1.5 text-small border border-surface-border rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Previous
        </button>

        {start > 0 && (
          <>
            <button
              onClick={() => onPageChange(0)}
              className="px-2.5 py-1.5 text-small border border-surface-border rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
            >
              1
            </button>
            {start > 1 && (
              <span className="px-1.5 py-1.5 text-small text-muted">…</span>
            )}
          </>
        )}

        {pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? "page" : undefined}
            className={cn(
              "px-2.5 py-1.5 text-small border rounded-md transition-colors",
              page === currentPage
                ? "bg-brand text-white border-brand font-medium"
                : "border-surface-border text-secondary hover:text-primary hover:bg-surface-tertiary"
            )}
          >
            {page + 1}
          </button>
        ))}

        {end < totalPages - 1 && (
          <>
            {end < totalPages - 2 && (
              <span className="px-1.5 py-1.5 text-small text-muted">…</span>
            )}
            <button
              onClick={() => onPageChange(totalPages - 1)}
              className="px-2.5 py-1.5 text-small border border-surface-border rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          aria-label="Next page"
          className="flex items-center gap-1 px-2.5 py-1.5 text-small border border-surface-border rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
