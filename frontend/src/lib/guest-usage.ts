"use client";

const GUEST_USAGE_KEY = "cloudsizer.guest-usage";

export const MAX_GUEST_RUNS = 3;

export interface GuestUsageSummary {
  used: number;
  remaining: number;
  max: number;
}

interface GuestUsageState {
  used: number;
  last_feature?: string;
  updated_at?: string;
}

function readGuestUsageState(): GuestUsageState {
  if (typeof window === "undefined") {
    return { used: 0 };
  }

  const rawState = window.localStorage.getItem(GUEST_USAGE_KEY);
  if (!rawState) {
    return { used: 0 };
  }

  try {
    const parsed = JSON.parse(rawState) as GuestUsageState;
    return {
      used: Number.isFinite(parsed.used) ? Math.max(0, Math.min(MAX_GUEST_RUNS, parsed.used)) : 0,
      last_feature: parsed.last_feature,
      updated_at: parsed.updated_at
    };
  } catch {
    return { used: 0 };
  }
}

function buildSummary(used: number): GuestUsageSummary {
  const normalizedUsed = Math.max(0, Math.min(MAX_GUEST_RUNS, used));

  return {
    used: normalizedUsed,
    remaining: Math.max(0, MAX_GUEST_RUNS - normalizedUsed),
    max: MAX_GUEST_RUNS
  };
}

export function loadGuestUsageSummary() {
  return buildSummary(readGuestUsageState().used);
}

export function recordGuestUsage(feature: string) {
  const currentState = readGuestUsageState();
  const nextUsed = Math.min(MAX_GUEST_RUNS, currentState.used + 1);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      GUEST_USAGE_KEY,
      JSON.stringify({
        used: nextUsed,
        last_feature: feature,
        updated_at: new Date().toISOString()
      } satisfies GuestUsageState)
    );
  }

  return buildSummary(nextUsed);
}
