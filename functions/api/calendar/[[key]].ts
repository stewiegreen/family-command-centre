/**
 * GET /api/calendar/{token}.ics
 * Read-only iCalendar subscription feed (webcal).
 * Auth: the token IS the credential. Env: FIREBASE_SERVICE_ACCOUNT, GREENHQ_FAMILY_ID.
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
  const joined = segments.map((s) => decodeURIComponent(s)).join('/');
  if (!joined.endsWith('.ics')) return notFound();
  const token = joined.slice(0, -'.ics'.length);
  if (!token || token.length < 16 || token.length > 128 || token.includes('/')) {
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
    const events = readEvents(doc);
    const members = readMembers(doc);

    let icsBody: string;
    try {
      icsBody = buildIcsFeed(events, members, familyName);
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
