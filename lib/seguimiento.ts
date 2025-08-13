export interface NextRequest {
  slotMinutes: number;
  currentTrackSlug?: string | null;
  forceSwitch?: boolean;
}

export interface NextResponse {
  trackSlug: string;
  nextIndex: number;
  plannedActs: number;
  plannedMinutes: number;
  reason: string;
  diagnostics?: Record<string, unknown>;
}

/**
 * Request a suggestion for the next item to work on.
 * Returns `null` when the service responds with HTTP 204 (no content).
 */
export async function requestNext(
  payload: NextRequest,
): Promise<NextResponse | null> {
  const res = await fetch("/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 204) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`requestNext failed with status ${res.status}`);
  }
  return (await res.json()) as NextResponse;
}

export interface ProgressRequest {
  trackSlug: string;
  minutesSpent: number;
  activityId?: string;
  nextIndex?: number;
}

export interface ProgressResponse {
  updatedTrack: Record<string, unknown>;
  suggestedNext?: {
    trackSlug: string;
    nextIndex: number;
    plannedActs: number;
    plannedMinutes: number;
    reason: string;
  };
}

/**
 * Send the minutes spent on the current activity and receive an optional suggestion
 * for what to do next.
 */
export async function postProgress(
  payload: ProgressRequest,
): Promise<ProgressResponse> {
  const res = await fetch("/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`postProgress failed with status ${res.status}`);
  }
  return (await res.json()) as ProgressResponse;
}

export interface TracksResponse {
  tracks: Array<Record<string, unknown>>;
}

/**
 * Optional helper to fetch summary information about all tracks, useful for
 * displaying progress bars or other telemetry.
 */
export async function getTracks(): Promise<TracksResponse> {
  const res = await fetch("/tracks");
  if (!res.ok) {
    throw new Error(`getTracks failed with status ${res.status}`);
  }
  return (await res.json()) as TracksResponse;
}
