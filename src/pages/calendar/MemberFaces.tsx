/**
 * Small assignee faces for calendar event chips.
 */
import { portraitSrc } from '../../lib/portraitPath';

export function MemberFaces({
  ids,
  getMember,
}: {
  ids: string[];
  getMember: (id: string) => { emoji?: string; avatarPortraitId?: string | null } | undefined;
}) {
  if (!ids.length) return null;
  return (
    <span className="shrink-0 inline-flex items-center gap-0.5">
      {ids.map((id) => {
        const m = getMember(id);
        const src = portraitSrc(m?.avatarPortraitId);
        if (src) {
          return (
            <img
              key={id}
              src={src}
              alt=""
              className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
              draggable={false}
            />
          );
        }
        if (m?.emoji) {
          return (
            <span key={id} className="text-xs leading-none">
              {m.emoji}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
}

