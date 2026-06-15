"use client";

import { createContext, useContext } from "react";

/** Falls back to "Agent" so isolated component previews/tests don't crash. */
const AgentNameContext = createContext<string>("Agent");

export function AgentNameProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <AgentNameContext.Provider value={value}>{children}</AgentNameContext.Provider>;
}

/** The operator-configured agent display name (default "Agent"). */
export function useAgentName(): string {
  return useContext(AgentNameContext);
}
