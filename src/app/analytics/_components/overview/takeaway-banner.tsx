export function TakeawayBanner({ text }: { text: string }) {
  return (
    <div className="mb-5 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]">
      {text}
    </div>
  );
}
