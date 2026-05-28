type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className="module-rise mb-6 flex flex-col gap-4 border-b border-[#e7e0d8] pb-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 max-w-full">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a07423]">{eyebrow}</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#151515] sm:text-[30px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[65ch] text-sm leading-6 text-[#6e6962]">{description}</p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-md border border-[#ddd6cd] bg-white p-5 shadow-[0_18px_45px_-34px_rgba(52,43,34,0.42)] ${className}`}
    >
      {children}
    </section>
  );
}

export function OperatorBar({
  task,
  detail,
  status = "Scaffold mode",
  primary,
  secondary,
}: {
  task: string;
  detail: string;
  status?: string;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="module-rise mb-4 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] px-4 py-3 shadow-[0_18px_45px_-38px_rgba(52,43,34,0.36)] [animation-delay:40ms]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a07423]">Operator task</span>
            <StatusPill tone="gray">{status}</StatusPill>
          </div>
          <div className="mt-1 font-semibold text-[#151515]">{task}</div>
          <p className="mt-1 max-w-[74ch] text-sm leading-6 text-[#6e6962]">{detail}</p>
        </div>
        {primary || secondary ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {secondary}
            {primary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ActionFeedback({
  action,
  messages,
}: {
  action?: string;
  messages: Record<string, string>;
}) {
  if (!action) return null;

  return (
    <div className="module-rise mb-4 rounded-md border border-[#cdddee] bg-[#f0f5fc] px-4 py-3 text-sm text-[#21558a] [animation-delay:60ms]">
      <span className="font-semibold">Preview: </span>
      {messages[action] ?? "Scaffold action previewed. No data was changed."}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-[#d8d0c7] bg-[#fbfaf8] p-5">
      <div className="text-sm font-semibold text-[#151515]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[#6e6962]">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "amber" | "green" | "red" | "gray" | "blue" | "dark";
}) {
  const toneClass = {
    amber: "text-[#875a07] border-[#f0d99a]/70 bg-[#fdf7e7]",
    green: "text-[#117343] border-[#bfe3cc] bg-[#eef7f1]",
    red: "text-[#c5261f] border-[#f3c8c4] bg-[#fdf1ef]",
    gray: "text-[#595551] border-[#dcd5cc] bg-[#f3f1ec]",
    blue: "text-[#21558a] border-[#cdddee] bg-[#f0f5fc]",
    dark: "text-white border-[#151515] bg-[#151515]",
  }[tone];

  const dotClass = {
    amber: "bg-[#c98a16]",
    green: "bg-[#23a455]",
    red: "bg-[#d52f28]",
    gray: "bg-[#8a8581]",
    blue: "bg-[#3877c1]",
    dark: "bg-white",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {children}
    </span>
  );
}
