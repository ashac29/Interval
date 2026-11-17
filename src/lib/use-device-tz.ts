"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
/** Device timezone (client only; null during SSR). Only ever shown as a suggestion, never silently applied to limits. */
export function useDeviceTimezone(): string | null {
  return useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => null);
}
