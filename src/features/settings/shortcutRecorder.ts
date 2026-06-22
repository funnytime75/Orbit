const MODIFIER_LABELS = ["Ctrl", "Alt", "Shift", "Win"] as const;

const MAIN_KEY_LABELS: Record<string, string> = {
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Backquote: "`",
  Backslash: "\\",
  Backspace: "Backspace",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Equal: "=",
  Escape: "Esc",
  Home: "Home",
  Insert: "Insert",
  Minus: "-",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "Space",
  Tab: "Tab",
};

const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_LABELS)[number]> = {
  alt: "Alt",
  control: "Ctrl",
  ctrl: "Ctrl",
  command: "Win",
  cmd: "Win",
  meta: "Win",
  shift: "Shift",
  super: "Win",
  win: "Win",
  windows: "Win",
};

const MAIN_KEY_ALIASES: Record<string, string> = {
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  backspace: "Backspace",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  esc: "Escape",
  escape: "Escape",
  home: "Home",
  insert: "Insert",
  pagedown: "PageDown",
  pageup: "PageUp",
  space: "Space",
  tab: "Tab",
};

export function shortcutFromKeyboardEvent(event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey">): string | null {
  const mainKey = normalizeMainKey(event.code, event.key);
  if (!mainKey) {
    return null;
  }

  const parts = getModifierParts(event);
  parts.push(mainKey);
  return normalizeShortcut(parts.join("+"));
}

export function normalizeShortcut(value: string): string | null {
  const rawParts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<(typeof MODIFIER_LABELS)[number]>();
  let mainKey: string | null = null;

  for (const part of rawParts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    const normalizedMainKey = normalizeMainKey(part, part);
    if (!normalizedMainKey || mainKey) {
      return null;
    }
    mainKey = normalizedMainKey;
  }

  if (modifiers.size === 0 || !mainKey) {
    return null;
  }

  return [...MODIFIER_LABELS.filter((modifier) => modifiers.has(modifier)), mainKey].join("+");
}

export function formatShortcut(value: string): string {
  return value
    .split("+")
    .map((part) => MAIN_KEY_LABELS[part] ?? part)
    .join(" + ");
}

export function isValidShortcut(value: string): boolean {
  return normalizeShortcut(value) !== null;
}

function getModifierParts(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): string[] {
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Win");
  }
  return parts;
}

function normalizeMainKey(code: string, key: string): string | null {
  const aliasedKey = MAIN_KEY_ALIASES[code.toLowerCase()] ?? MAIN_KEY_ALIASES[key.toLowerCase()];
  if (aliasedKey) {
    return aliasedKey;
  }

  if (isModifierKey(code, key)) {
    return null;
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code;
  }

  if (code in MAIN_KEY_LABELS) {
    return code;
  }

  const upperKey = key.length === 1 ? key.toUpperCase() : key;
  if (/^[A-Z0-9]$/.test(upperKey)) {
    return upperKey;
  }

  return null;
}

function isModifierKey(code: string, key: string): boolean {
  return (
    code === "AltLeft" ||
    code === "AltRight" ||
    code === "ControlLeft" ||
    code === "ControlRight" ||
    code === "MetaLeft" ||
    code === "MetaRight" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    key === "Alt" ||
    key === "Control" ||
    key === "Meta" ||
    key === "Shift"
  );
}
