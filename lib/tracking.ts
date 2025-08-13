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
  diagnostics?: Record<string, number>;
}

export async function requestNext(body: NextRequest): Promise<NextResponse | null> {
  const res = await fetch("/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new Error("failed to fetch next suggestion");
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
  updatedTrack: Record<string, any>;
  suggestedNext?: NextResponse;
}

export async function postProgress(body: ProgressRequest): Promise<ProgressResponse> {
  const res = await fetch("/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error("failed to post progress");
  }
  return (await res.json()) as ProgressResponse;
}

export async function fetchTracks() {
  const res = await fetch("/tracks");
  if (!res.ok) {
    throw new Error("failed to fetch tracks");
  }
  return res.json();
}
