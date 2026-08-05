export function parseMattermostDeadline(value: string) {
  const chinaLocalTime = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(value);
  return chinaLocalTime
    ? new Date(`${chinaLocalTime[1]}T${chinaLocalTime[2]}:00+08:00`)
    : new Date(value);
}

export function parseMattermostCommand(value: unknown) {
  const parts = String(value ?? "")
    .split("|")
    .map((part) => part.trim());
  return { parts, command: parts[0]?.toLowerCase() ?? "" };
}
