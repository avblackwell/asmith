/** Saved media properties must not cause a viewer to call Appsmith's APIs. */
export function safeMediaSource(candidate: unknown, kind: "document" | "audio" | "video"): string | undefined {
  if (typeof candidate !== "string") return undefined;
  const source = candidate.trim();
  if (!source || /\{\{[\s\S]*?\}\}/.test(source) || /[\u0000-\u001f]/.test(source)) return undefined;

  if (kind === "document" && /^data:(application\/pdf|text\/plain);base64,[a-z\d+/=]+$/i.test(source)) {
    return source;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^https?:\/\//i.test(source)) return undefined;
  if (/^[\\/]{2}/.test(source)) return undefined;

  try {
    const base = new URL(typeof window === "undefined"
      ? "https://read-only-media.invalid/base/"
      : window.location.href);
    const parsed = new URL(source, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (!/^https?:\/\//i.test(source) && parsed.origin !== base.origin) return undefined;
    if (parsed.origin === base.origin && /^\/(?:api|v1|rts)(?:\/|$)/.test(parsed.pathname)) return undefined;
    return source;
  } catch {
    return undefined;
  }
}
