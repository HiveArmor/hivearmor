import type { MsspOverviewDTO } from "./msspTypes";

export async function fetchMsspOverview(): Promise<MsspOverviewDTO> {
  const response = await fetch("/api/ha-mssp/overview", { credentials: "include" });
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return response.json() as Promise<MsspOverviewDTO>;
}
