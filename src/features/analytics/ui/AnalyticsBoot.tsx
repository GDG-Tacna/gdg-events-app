"use client";

import { useEffect } from "react";
import { setAnalyticsSink } from "@/shared/lib/analytics";
import { firebaseAnalyticsSink, startFirebaseAnalytics } from "../data/firebase-analytics";

/** Plugs Google Analytics into `track` once the app is open in the browser (it measures nothing outside production). */
export function AnalyticsBoot() {
  useEffect(() => {
    setAnalyticsSink(firebaseAnalyticsSink);
    startFirebaseAnalytics();
  }, []);
  return null;
}
