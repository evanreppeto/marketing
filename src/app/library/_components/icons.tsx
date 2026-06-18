// Shared line-icon set for the Media Library (1.5px stroke, currentColor).
// Paths copied from the v4 reference mockup so the glyph language stays
// consistent with the rest of the app. No emoji.

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className ?? "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 2.5 13.5 5 5.5 13H3v-2.5z" />
    </Svg>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 8h12M14 8l-3-3M14 8l-3 3M2 8l3-3M2 8l3 3" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2v8M8 10 5 7M8 10l3-3M3 13h10" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5M7 7v3.5M9 7v3.5" />
    </Svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 10V2.5M8 2.5 5 5.5M8 2.5l3 3M3 10v3h10v-3" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 4.5h4l1.2 1.5h5.8v6.5h-12z" />
    </Svg>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 4.5h4l1.2 1.5h5.8v6.5h-12z M8 8v3M6.5 9.5h3" />
    </Svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3 5 8l5 5" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3l5 5-5 5" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={props.className ?? "h-4 w-4"}
      fill="currentColor"
    >
      <path d="M5 3.5v9l8-4.5z" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2l1.4 4.1L13.5 7.5 9.4 8.9 8 13l-1.4-4.1L2.5 7.5l4.1-1.4z" />
    </Svg>
  );
}
