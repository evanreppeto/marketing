export type DispatchStatus = "queued" | "scheduled" | "sent" | "delivered" | "failed" | "canceled";

export const DISPATCH_STATUS_ORDER: DispatchStatus[] = ["queued", "scheduled", "sent", "delivered", "failed", "canceled"];

const LABELS: Record<DispatchStatus, string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  canceled: "Canceled",
};

export function statusLabel(status: DispatchStatus): string {
  return LABELS[status];
}

export const STATUS_TONE: Record<DispatchStatus, "amber" | "blue" | "green" | "red" | "gray"> = {
  queued: "amber",
  scheduled: "blue",
  sent: "blue",
  delivered: "green",
  failed: "red",
  canceled: "gray",
};

export type DispatchView = {
  id: string;
  campaignId: string;
  campaignName: string;
  assetId: string | null;
  deliverable: string;
  channel: string;
  status: DispatchStatus;
  scheduledFor: string | null;
  dispatchedAt: string | null;
  recipientSummary: string | null;
  audienceCount: number | null;
  resultNote: string | null;
  updatedAt: string;
};

export type DispatchGroup = { status: DispatchStatus; items: DispatchView[] };

/** Pure: bucket dispatches into lifecycle-ordered groups (empty groups kept so
 *  the console always shows every column). */
export function groupByStatus(dispatches: DispatchView[]): DispatchGroup[] {
  return DISPATCH_STATUS_ORDER.map((status) => ({
    status,
    items: dispatches.filter((dispatch) => dispatch.status === status),
  }));
}
