import { localMinutesOf } from "./time";

export function localHourOf(ms: number, tz: string): number {
  return Math.floor(localMinutesOf(ms, tz) / 60);
}
