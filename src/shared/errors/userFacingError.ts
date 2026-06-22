export function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = getRawErrorMessage(error);
  if (!rawMessage || isInternalErrorMessage(rawMessage)) {
    return fallback;
  }

  return rawMessage;
}

function getRawErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === "string" ? message : String(message);
  }

  return null;
}

function isInternalErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("__tauri_internals__") ||
    normalized.includes("cannot read properties of undefined") ||
    normalized.includes("reading 'invoke'") ||
    normalized.includes('reading "invoke"') ||
    normalized.includes("plugin:dialog") ||
    normalized.includes("window.__tauri") ||
    normalized.includes("invoke is not a function")
  );
}
