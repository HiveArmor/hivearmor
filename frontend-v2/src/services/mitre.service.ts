import { api } from "@/lib/api";

export interface TechniqueCoverage {
  technique: string;
  ruleCount: number;
  activeCount: number;
}

class MitreService {
  async getCoverage(): Promise<TechniqueCoverage[]> {
    return api.get<TechniqueCoverage[]>("/api/mitre/coverage");
  }

  async exportCsv(): Promise<void> {
    const res = await fetch("/api/mitre/coverage/export");
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitre-coverage.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const mitreService = new MitreService();
