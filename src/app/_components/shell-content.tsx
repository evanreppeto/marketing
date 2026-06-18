import { PageMotion } from "./motion-primitives";

type ShellContentProps = {
  children: React.ReactNode;
};

export function ShellContent({ children }: ShellContentProps) {
  return <PageMotion>{children}</PageMotion>;
}
