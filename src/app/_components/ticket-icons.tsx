import type { ReactNode } from "react";

type IconProps = { className?: string };

export function statusIcon(status: string): ReactNode {
  const normalized = status.toLowerCase();
  if (["running", "processing"].includes(normalized)) return <PlayIcon />;
  if (["blocked", "failed", "error", "canceled"].includes(normalized)) return <StopIcon />;
  if (["needs_approval", "pending_owner_approval", "pending approval"].includes(normalized)) return <ReviewIcon />;
  if (["completed", "approved", "passed", "auto_approved"].includes(normalized)) return <CheckIcon />;
  return <QueueIcon />;
}

export function priorityIcon(priority: string): ReactNode {
  const normalized = priority.toLowerCase();
  if (normalized.includes("urgent")) return <UrgentIcon />;
  if (normalized.includes("high")) return <FlagIcon />;
  if (normalized.includes("low")) return <LowPriorityIcon />;
  return <MediumPriorityIcon />;
}

export function labelIcon(label: "calendar" | "driver" | "lock" | "output" | "owner" | "tag"): ReactNode {
  if (label === "calendar") return <CalendarIcon />;
  if (label === "driver") return <SparkIcon />;
  if (label === "lock") return <LockIcon />;
  if (label === "output") return <OutputIcon />;
  if (label === "owner") return <OwnerIcon />;
  return <TagIcon />;
}

export function QueueIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="4.75" />
      <path d="M8 5.5V8l1.75 1.25" />
    </svg>
  );
}

export function PlayIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="currentColor" viewBox="0 0 16 16">
      <path d="M5.5 3.9v8.2c0 .55.6.9 1.08.62l6.2-4.1a.74.74 0 0 0 0-1.24l-6.2-4.1a.72.72 0 0 0-1.08.62Z" />
    </svg>
  );
}

export function StopIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M5.6 2.75h4.8l2.85 2.85v4.8l-2.85 2.85H5.6L2.75 10.4V5.6L5.6 2.75Z" />
      <path strokeLinecap="round" d="M5.9 5.9 10.1 10.1M10.1 5.9 5.9 10.1" />
    </svg>
  );
}

export function ReviewIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M2.75 8s1.85-3.5 5.25-3.5S13.25 8 13.25 8 11.4 11.5 8 11.5 2.75 8 2.75 8Z" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}

export function CheckIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16">
      <path d="m4 8.25 2.6 2.6L12.25 5.2" />
    </svg>
  );
}

export function UrgentIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M8 2.5 2.8 12.2h10.4L8 2.5Z" />
      <path d="M8 6.1v2.7M8 11.2h.01" />
    </svg>
  );
}

export function FlagIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M4.5 13.5v-11" />
      <path d="M4.5 3h6.4l-.8 2 1 2H4.5" />
    </svg>
  );
}

export function MediumPriorityIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" viewBox="0 0 16 16">
      <path d="M4 6h8M4 10h8" />
    </svg>
  );
}

export function LowPriorityIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" viewBox="0 0 16 16">
      <path d="M4 9.5h8" />
    </svg>
  );
}

export function CalendarIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 16 16">
      <rect height="10" rx="1.5" width="11" x="2.5" y="3.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );
}

export function OwnerIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <circle cx="8" cy="5.6" r="2.35" />
      <path d="M3.75 13c.55-2.3 2.05-3.45 4.25-3.45s3.7 1.15 4.25 3.45" />
    </svg>
  );
}

export function SparkIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M8 2.6 9.25 6.4 13 8l-3.75 1.6L8 13.4 6.75 9.6 3 8l3.75-1.6L8 2.6Z" />
    </svg>
  );
}

export function LockIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <rect height="6.8" rx="1.4" width="9.6" x="3.2" y="7" />
      <path d="M5.4 7V5.35a2.6 2.6 0 0 1 5.2 0V7" />
    </svg>
  );
}

export function OutputIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M4 2.75h5.4L12 5.35v7.9H4v-10.5Z" />
      <path d="M9.25 2.9v2.6h2.55M5.8 8h4.4M5.8 10.6h3.4" />
    </svg>
  );
}

export function TagIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16">
      <path d="M2.8 8.15 8.15 2.8h4.7v4.7L7.5 12.85 2.8 8.15Z" />
      <circle cx="10.8" cy="4.85" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}
