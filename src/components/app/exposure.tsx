"use client";
import * as React from "react";
import { recordExposureAction } from "@/app/actions";

/** Records (once per suggestion, server-side) that these suggestions were actually shown. Renders nothing. */
export function ExposureBeacon({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  React.useEffect(() => {
    if (!key) return;
    void recordExposureAction(key.split(","));
  }, [key]);
  return null;
}
