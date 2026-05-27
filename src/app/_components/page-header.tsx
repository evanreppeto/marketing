type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className="module-rise mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 max-w-full">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#d5342b]">{eyebrow}</p>
        <h1 className="mt-3 max-w-[340px] text-[clamp(2.25rem,3.7vw,3.85rem)] font-semibold leading-[0.98] tracking-[-0.06em] sm:max-w-[1000px]">
          {title}
        </h1>
        <p className="mt-5 max-w-[330px] text-[16px] leading-7 text-[#6e6962] sm:max-w-[720px]">{description}</p>
      </div>
      {aside}
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
    <section className={`min-w-0 rounded-md border border-[#ddd6cd] bg-white p-5 shadow-[0_18px_45px_-34px_rgba(52,43,34,0.42)] ${className}`}>
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
    amber: "bg-[#fff3d9] text-[#875a07]",
    green: "bg-[#e4f5eb] text-[#117343]",
    red: "bg-[#fff0ee] text-[#c5261f]",
    gray: "bg-[#efeeeb] text-[#595551]",
    blue: "bg-[#edf4ff] text-[#21558a]",
    dark: "bg-[#151515] text-white",
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
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {children}
    </span>
  );
}
