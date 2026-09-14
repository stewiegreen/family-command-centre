/** Cap how many saved photo avatars we keep per member (R2 URLs). */
export const AVATAR_PHOTO_LIBRARY_MAX = 12;

/** Newest-first unique list; always promotes `active` to front when provided. */
export function mergeAvatarPhotoLibrary(
  existing: string[] | undefined | null,
  active: string | null | undefined,
  extra?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string | null) => {
    const s = (u || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  push(active);
  push(extra);
  for (const u of existing || []) push(u);
  return out.slice(0, AVATAR_PHOTO_LIBRARY_MAX);
}
