/**
 * GET /api/calendar/{token}.ics              → whole family
 * GET /api/calendar/{token}/{memberId}.ics   → one person only
 *
 * Phone calendars assign one color per subscription. Per-member feeds let you
 * subscribe to each kid/parent separately and color them differently.
 */

import { getGoogleAccessToken, parseServiceAccount } from '../../lib/googleSa';
import {
  getFamilyDoc,
  readEvents,
  readMembers,
  readSettingsField,
} from '../../lib/functions-firestoreFamily';
import { buildIcsFeed } from '../../lib/ics';

type Env = {
  FIREBASE_SERVICE_ACCOUNT: string;
  GREENHQ_FAMILY_ID: string;
};

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.FIREBASE_SERVICE_ACCOUNT || !env.GREENHQ_FAMILY_ID) {
    return new Response('Calendar feed not configured', { status: 503 });
  }

  const raw = context.params.key;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const parts = segments.map((s) => decodeURIComponent(s)).filter(Boolean);
  if (parts.length === 0) return notFound();

  // Last segment must end with .ics
  const last = parts[parts.length - 1]!;
  if (!last.endsWith('.ics')) return notFound();
  parts[parts.length - 1] = last.slice(0, -'.ics'.length);

  // Shapes: [token] or [token, memberId]
  const token = parts[0] || '';
  const memberId = parts.length >= 2 ? parts[1] : undefined;

  if (!token || token.length < 16 || token.length > 128 || token.includes('/')) {
    return notFound();
  }
  if (memberId !== undefined && (memberId.length < 1 || memberId.length > 128 || memberId.includes('/'))) {
    return notFound();
  }

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getGoogleAccessToken(sa);
    const doc = await getFamilyDoc(sa.project_id, env.GREENHQ_FAMILY_ID, accessToken);

    const configuredToken = readSettingsField(doc, 'calendarFeedToken');
    if (!configuredToken || configuredToken !== token) {
      return notFound();
    }

    const familyName = readSettingsField(doc, 'familyName') || 'GreenHQ';
    const members = readMembers(doc);
    let events = readEvents(doc);

    let calName = familyName;
    if (memberId) {
      const m = members.find((x) => x.id === memberId);
      if (!m) return notFound();
      // Events tagged with this member (or legacy single memberId field already folded into memberIds)
      events = events.filter((ev) => (ev.memberIds || []).includes(memberId));
      calName = `${m.name || 'Member'} · ${familyName}`;
    }

    let icsBody: string;
    try {
      icsBody = buildIcsFeed(events, members, calName, {
        // On a personal feed, names in the title are redundant
        omitMemberNamesInTitle: !!memberId,
      });
    } catch (buildErr) {
      console.error('[calendar feed] build failed', buildErr);
      return new Response('Feed temporarily unavailable', { status: 500 });
    }

    return new Response(icsBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error('[calendar feed] error', e);
    return new Response('Feed temporarily unavailable', { status: 500 });
  }
};
