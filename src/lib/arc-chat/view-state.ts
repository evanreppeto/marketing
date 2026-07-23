export function shouldShowDemoLauncher({
  selectedDemoId,
  turnCount,
  pending,
}: {
  selectedDemoId: string;
  turnCount: number;
  pending: boolean;
}) {
  return selectedDemoId === "new" && turnCount === 0 && !pending;
}

export function shouldUseDemoSeedWorkspace({
  live,
  selectedDemoId,
  turnCount,
}: {
  live: boolean;
  selectedDemoId: string;
  turnCount: number;
}) {
  return !live && selectedDemoId !== "new" && turnCount === 0;
}

export function getArcConversationScrollTarget({
  live,
  activeConversationId,
  selectedDemoId,
}: {
  live: boolean;
  activeConversationId: string | null;
  selectedDemoId: string;
}): "start" | "end" {
  return (live && !activeConversationId) || (!live && selectedDemoId === "new")
    ? "start"
    : "end";
}

export function getArcConversationHeader({
  live,
  activeTitle,
  selectedDemoId,
  selectedDemoTitle,
}: {
  live: boolean;
  activeTitle?: string;
  selectedDemoId: string;
  selectedDemoTitle?: string;
}) {
  if (live) {
    return {
      title: activeTitle ?? "New conversation",
      subtitle: "Private conversation",
    };
  }

  if (selectedDemoId === "new") {
    return {
      title: "New conversation",
      subtitle: "Full workspace memory is on",
    };
  }

  if (selectedDemoId === "storm") {
    return {
      title: "Storm Rapid Response",
      subtitle: "Storm-damage homeowners · 4 assets · Naperville, IL",
    };
  }

  return {
    title: selectedDemoTitle ?? "Conversation",
    subtitle: "Private conversation",
  };
}
