type AppShellProps = {
  /** Retained for call-site compatibility; the active nav item is now derived
   *  from the pathname by the persistent ConsoleFrame in the root layout. */
  active?: string;
  children: React.ReactNode;
};

/**
 * Pass-through. The application chrome (sidebar, nav, skeleton) now lives in
 * ConsoleFrame, rendered once by the root layout so it persists across
 * navigations. Pages keep wrapping their content in <AppShell> — it simply
 * renders the content into the layout's content slot.
 */
export function AppShell({ children }: AppShellProps) {
  return <>{children}</>;
}
