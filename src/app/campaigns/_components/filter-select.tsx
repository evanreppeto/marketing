"use client";

type FilterSelectProps = {
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  value: string;
};

export function FilterSelect({ label, name, options, value }: FilterSelectProps) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className="relative block">
        <select
          className="h-11 w-full appearance-none rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-3 pr-9 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          defaultValue={value}
          name={name}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {options.map((option) => (
            <option key={`${name}-${option.value || "all"}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}
