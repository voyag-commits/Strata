const SECRET_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/=\-]{8,}/gi,
  /sk-[A-Za-z0-9_\-]{8,}/g,
];

const SECRET_KEY_PATTERN = /(authorization|api[_-]?key|token|secret|password)/i;

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(nested);
    }
    return output;
  }
  return value;
}

export function safeLog(event: string, details: Record<string, unknown> = {}): void {
  const payload = redact({ event, ...details });
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}
