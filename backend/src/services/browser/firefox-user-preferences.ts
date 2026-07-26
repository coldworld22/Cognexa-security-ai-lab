export type FirefoxPreferenceValue = boolean | number | string;

const USER_PREF_PATTERN =
  /^user_pref\("(?<key>[^"]+)",\s*(?<value>.+)\);\s*$/;

export function mergeFirefoxUserPreferences(
  existingContent: string | null,
  preferences: Record<string, FirefoxPreferenceValue>
): string {
  const existingLines = (existingContent ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const nextLines = new Map<string, string>();
  const passthroughLines: string[] = [];

  for (const line of existingLines) {
    const match = line.match(USER_PREF_PATTERN);
    if (!match?.groups?.key) {
      passthroughLines.push(line);
      continue;
    }

    nextLines.set(match.groups.key, line);
  }

  for (const [key, value] of Object.entries(preferences)) {
    nextLines.set(key, buildFirefoxPreferenceLine(key, value));
  }

  return [...passthroughLines, ...nextLines.values()].join("\n") + "\n";
}

export function buildFirefoxPreferenceLine(
  key: string,
  value: FirefoxPreferenceValue
): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return `user_pref("${key}", ${String(value)});`;
  }

  return `user_pref("${key}", "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}");`;
}
