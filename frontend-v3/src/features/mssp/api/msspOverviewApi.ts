import { msspFetch, msspHttpError } from "./msspFetch";
import type { MsspOverviewDTO } from "./msspTypes";

export async function fetchMsspOverview(): Promise<MsspOverviewDTO> {
  const response = await msspFetch("/api/ha-mssp/overview");
  if (!response.ok) {
    throw msspHttpError(response.status);
  }
  return response.json() as Promise<MsspOverviewDTO>;
}
