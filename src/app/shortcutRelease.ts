export type ShortcutReleaseAction = "cancel-session" | "confirm-selection" | "ignore";

interface ShortcutReleaseState {
  directionalQuickLaunch: boolean;
  hasTriggered: boolean;
  isMouseSessionActive: boolean;
  isShortcutSessionActive: boolean;
}

export function getShortcutReleaseAction({
  directionalQuickLaunch,
  hasTriggered,
  isMouseSessionActive,
  isShortcutSessionActive,
}: ShortcutReleaseState): ShortcutReleaseAction {
  if (isMouseSessionActive || !isShortcutSessionActive || hasTriggered) {
    return "ignore";
  }

  return directionalQuickLaunch ? "cancel-session" : "confirm-selection";
}
