import { type MediaKind } from "@/domain";

export type MediaAssetRow = {
  id: string;
  folder_id: string | null;
  file_name: string;
  storage_path: string;
  public_url: string;
  content_type: string;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  duration_seconds: number | null;
  source: string;
  provenance: Record<string, unknown>;
  risk_flags: string[];
  tags: string[];
  available_to_arc: boolean;
  uploaded_by: string | null;
  created_at: string;
};

export type MediaFolderView = { id: string; name: string; count: number };

export type MediaAssetView = {
  id: string;
  folderId: string | null;
  fileName: string;
  url: string;
  kind: MediaKind;
  badge: string;
  dimensions: string | null;
  size: string | null;
  source: string;
  tags: string[];
  riskFlags: string[];
  availableToArc: boolean;
  uploadedBy: string | null;
  usedInCount: number;
};

export type MediaLibraryData =
  | { status: "live"; folders: MediaFolderView[]; assets: MediaAssetView[]; totalBytes: number }
  | { status: "unavailable"; message: string };
