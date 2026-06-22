"use client";

import { createContext, useContext } from "react";

/** Falls back to "Workspace" so isolated component previews/tests don't crash. */
const WorkspaceNameContext = createContext<string>("Workspace");

export function WorkspaceNameProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <WorkspaceNameContext.Provider value={value}>{children}</WorkspaceNameContext.Provider>;
}

/** The active workspace display name shown in the app chrome. */
export function useWorkspaceName(): string {
  return useContext(WorkspaceNameContext);
}
