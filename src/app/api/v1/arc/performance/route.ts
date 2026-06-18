import { NextResponse } from "next/server";

import { bearerGuard } from "@/app/api/v1/arc/_lib/http";
import { getPerformanceBySlice } from "@/lib/performance/slice-read-model";
import type { SliceDimension } from "@/domain";

const DIMENSIONS: SliceDimension[] = ["persona", "channel", "asset_type"];

/** What's-working slices for Arc. Bearer-gated, read-only. */
export async function GET(request: Request) {
  const denied = await bearerGuard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const dimRaw = url.searchParams.get("dimension");
  const dimension: SliceDimension = DIMENSIONS.includes(dimRaw as SliceDimension)
    ? (dimRaw as SliceDimension)
    : "persona";
  const days = Number(url.searchParams.get("days")) || 90;
  const persona = url.searchParams.get("persona") ?? undefined;
  const channel = url.searchParams.get("channel") ?? undefined;

  const result = await getPerformanceBySlice({ dimension, days, persona, channel });
  return NextResponse.json({ ok: true, status: "ok", dimension: result.dimension, slices: result.slices });
}
