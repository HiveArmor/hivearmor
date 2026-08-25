import type { MsspOverviewDTO } from "./msspTypes";
import { msspFetch, msspHttpError } from "./msspFetch";

export async function fetchMsspOverview(): Promise<MsspOverviewDTO> {
  const response = await msspFetch("/api/ha-mssp/overview");
  if (!response.ok) {
    throw msspHttpError(response.status);
  }
  return response.json() as Promise<MsspOverviewDTO>;
}
