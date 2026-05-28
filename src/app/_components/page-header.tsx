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

export function StatusPill({
  children,
  tone = "amber",
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
