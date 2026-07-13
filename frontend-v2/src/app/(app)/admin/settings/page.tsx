"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Settings, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { adminService } from "@/services/admin.service";
import type { ConfigSection, ConfigParameter } from "@/services/admin.service";

export default function SettingsPage() {
  const [sections, setSections] = useState<ConfigSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<ConfigSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editedParams, setEditedParams] = useState<Record<number, string>>({});

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.getConfigSections();
      setSections(result);
      if (result.length > 0 && !selectedSection) {
        setSelectedSection(result[0]);
      }
    } catch {
      toast("error", "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [selectedSection]);

  useEffect(() => { loadSections(); }, [loadSections]);

  const handleParamChange = (paramId: number, value: string) => {
    setEditedParams((prev) => ({ ...prev, [paramId]: value }));
  };

  const handleSaveParam = async (param: ConfigParameter) => {
    const newValue = editedParams[param.id] ?? param.confParamValue;
    setSaving(param.id);
    try {
      await adminService.updateConfigParam({ ...param, confParamValue: newValue });
      toast("success", "Setting saved", `${param.confParamShort} updated successfully`);
      setEditedParams((prev) => {
        const next = { ...prev };
        delete next[param.id];
        return next;
      });
      loadSections();
    } catch {
      toast("error", "Failed to save setting");
    } finally {
      setSaving(null);
    }
  };

  const getParamValue = (param: ConfigParameter): string => {
    return editedParams[param.id] ?? param.confParamValue ?? "";
  };

  const isBoolean = (param: ConfigParameter): boolean => {
    const val = (param.confParamValue || "").toLowerCase();
    return val === "true" || val === "false";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-h1">System Settings</h1>
        <p className="text-secondary text-small mt-0.5">System configuration and parameters</p>
      </div>

      {loading ? (
        <div className="card">
          <TableSkeleton rows={8} cols={3} />
        </div>
      ) : sections.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Settings className="w-6 h-6" />}
            title="No configuration sections"
            description="Configuration sections will appear when the backend is connected"
          />
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left sidebar - sections list */}
          <div className="w-[200px] flex-shrink-0">
            <div className="card overflow-hidden">
              <div className="p-3 border-b border-surface-border">
                <span className="text-small font-medium text-primary">Sections</span>
              </div>
              <nav className="py-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => { setSelectedSection(section); setEditedParams({}); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-small transition-colors",
                      selectedSection?.id === section.id
                        ? "bg-brand-subtle text-brand font-medium"
                        : "text-secondary hover:bg-surface-tertiary hover:text-primary"
                    )}
                  >
                    {section.section}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main content - parameters */}
          <div className="flex-1">
            {selectedSection ? (
              <div className="card">
                <div className="px-4 py-3 border-b border-surface-border">
                  <h3 className="text-h3 text-primary">{selectedSection.section}</h3>
                  {selectedSection.description && (
                    <p className="text-small text-muted mt-0.5">{selectedSection.description}</p>
                  )}
                </div>
                <div className="p-4 space-y-6">
                  {(!selectedSection.parameters || selectedSection.parameters.length === 0) ? (
                    <p className="text-small text-muted py-4 text-center">No parameters in this section</p>
                  ) : (
                    selectedSection.parameters.map((param) => (
                      <div key={param.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-small text-primary font-medium">
                            {param.confParamShort}
                            {param.confParamRequired && <span className="text-red-400 ml-0.5">*</span>}
                          </label>
                          <button
                            onClick={() => handleSaveParam(param)}
                            disabled={saving === param.id || !(param.id in editedParams)}
                            className={cn(
                              "btn-ghost text-tiny flex items-center gap-1",
                              param.id in editedParams ? "text-brand" : "text-muted"
                            )}
                          >
                            {saving === param.id ? (
                              <CheckCircle className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            Save
                          </button>
                        </div>
                        {isBoolean(param) ? (
                          <button
                            onClick={() => {
                              const current = getParamValue(param).toLowerCase() === "true";
                              handleParamChange(param.id, String(!current));
                            }}
                            className={cn(
                              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                              getParamValue(param).toLowerCase() === "true"
                                ? "bg-brand"
                                : "bg-surface-tertiary"
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                                getParamValue(param).toLowerCase() === "true"
                                  ? "translate-x-6"
                                  : "translate-x-1"
                              )}
                            />
                          </button>
                        ) : (
                          <input
                            type="text"
                            value={getParamValue(param)}
                            onChange={(e) => handleParamChange(param.id, e.target.value)}
                            className="input-base w-full"
                            placeholder={param.confParamShort}
                          />
                        )}
                        {param.confParamDescription && (
                          <p className="text-tiny text-muted">{param.confParamDescription}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="card p-8">
                <EmptyState
                  icon={<Settings className="w-6 h-6" />}
                  title="Select a section"
                  description="Choose a configuration section from the left panel"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
