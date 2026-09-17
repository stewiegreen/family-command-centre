/**
 * Minimal CalDAV (two-way) for GreenHQ family calendars.
 *
 * Base:  /api/caldav/
 * Auth:  HTTP Basic — username = member id (or "family"), password = calendarFeedToken
 *
 * Paths:
 *   /api/caldav/                               principal-ish root
 *   /api/caldav/principals/{user}/             current-user-principal
 *   /api/caldav/calendars/{user}/              calendar-home
 *   /api/caldav/calendars/{user}/default/      calendar collection
 *   /api/caldav/calendars/{user}/default/{uid}.ics  event resource
 *
 * Works with DAVx5; iOS "CalDAV account" advanced setup can use the same base URL.
 */

import { getGoogleAccessToken, parseServiceAccount } from '../../lib/googleSa';
import {
  getFamilyDoc,
  patchFamilyEvents,
  readEvents,
  readMembers,
  readSettingsField,
  type FeedEvent,
} from '../../lib/functions-firestoreFamily';
import { eventEtag, parseVEvent, serializeVEvent, type GhEvent } from '../../lib/vevent';

type Env = {
  FIREBASE_SERVICE_ACCOUNT: string;
  GREENHQ_FAMILY_ID: string;
};

type AuthOk = { user: string; memberIdsFilter: string[] | null };

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function davResponse(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      DAV: '1, 3, calendar-access',
      Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT',
      ...extra,
    },
  });
}

function unauthorized(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="GreenHQ CalDAV"',
      DAV: '1, 3, calendar-access',
    },
  });
}

function parseBasic(req: Request): { user: string; pass: string } | null {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return null;
  try {
    const decoded = atob(h.slice(6));
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

async function authorize(req: Request, env: Env): Promise<AuthOk | Response> {
  if (!env.FIREBASE_SERVICE_ACCOUNT || !env.GREENHQ_FAMILY_ID) {
    return new Response('CalDAV not configured', { status: 503 });
  }
  const basic = parseBasic(req);
  if (!basic) return unauthorized();

  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getGoogleAccessToken(sa);
  const doc = await getFamilyDoc(sa.project_id, env.GREENHQ_FAMILY_ID, accessToken);
  const token = readSettingsField(doc, 'calendarFeedToken');
  if (!token || basic.pass !== token) return unauthorized();

  const members = readMembers(doc);
  const user = basic.user.trim();
  if (user === 'family' || user === 'all' || user === '') {
    return { user: 'family', memberIdsFilter: null };
  }
  const m = members.find((x) => x.id === user || x.name === user);
  if (!m) return unauthorized();
  return { user: m.id, memberIdsFilter: [m.id] };
}

function pathParts(context: { params: { path?: string | string[] } }): string[] {
  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return segments.map((s) => decodeURIComponent(s)).filter((s) => s && s !== '/');
}

function feedToGh(ev: FeedEvent): GhEvent {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    memberIds: ev.memberIds || [],
    memberId: ev.memberIds?.[0],
    recurrence: ev.recurrence,
    recurrenceUntil: ev.recurrenceUntil,
    exceptionDates: ev.exceptionDates,
    location: ev.location,
    notes: ev.notes,
  };
}

function filterEvents(events: FeedEvent[], filter: string[] | null): GhEvent[] {
  const list = events.map(feedToGh);
  if (!filter) return list;
  return list.filter((e) => (e.memberIds || []).some((id) => filter.includes(id)));
}


/** PROPFIND multistatus helpers */
function propstat(hrefPath: string, propsXml: string, status = 'HTTP/1.1 200 OK'): string {
  return `<d:response>
  <d:href>${xmlEscape(hrefPath)}</d:href>
  <d:propstat>
    <d:prop>${propsXml}</d:prop>
    <d:status>${status}</d:status>
  </d:propstat>
</d:response>`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const req = context.request;
  const method = req.method.toUpperCase();
  const env = context.env;

  // CORS preflight for some clients
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        DAV: '1, 3, calendar-access',
        Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT',
        'Access-Control-Allow-Methods': 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, Prefer, If-Match, If-None-Match',
      },
    });
  }

  let auth: AuthOk;
  try {
    const a = await authorize(req, env);
    if (a instanceof Response) return a;
    auth = a;
  } catch (e) {
    console.error('[caldav] auth', e);
    return new Response('Server error', { status: 500 });
  }

  const parts = pathParts(context);
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const root = `${origin}/api/caldav`;

  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getGoogleAccessToken(sa);
  const familyId = env.GREENHQ_FAMILY_ID;

  const load = async () => {
    const doc = await getFamilyDoc(sa.project_id, familyId, accessToken);
    return {
      doc,
      events: readEvents(doc),
      members: readMembers(doc),
      familyName: readSettingsField(doc, 'familyName') || 'GreenHQ',
    };
  };

  try {
    // ── Root / ──
    if (parts.length === 0) {
      if (method === 'PROPFIND') {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
${propstat(`${root}/`, `
  <d:resourcetype><d:collection/></d:resourcetype>
  <d:displayname>GreenHQ CalDAV</d:displayname>
  <d:current-user-principal><d:href>${root}/principals/${xmlEscape(auth.user)}/</d:href></d:current-user-principal>
  <c:calendar-home-set><d:href>${root}/calendars/${xmlEscape(auth.user)}/</d:href></c:calendar-home-set>
`)}
</d:multistatus>`;
        return davResponse(207, xml);
      }
      return davResponse(200, `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>`);
    }

    // ── principals/{user} ──
    if (parts[0] === 'principals' && parts.length >= 2) {
      const user = parts[1]!;
      if (method === 'PROPFIND') {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
${propstat(`${root}/principals/${xmlEscape(user)}/`, `
  <d:resourcetype><d:principal/><d:collection/></d:resourcetype>
  <d:displayname>${xmlEscape(user)}</d:displayname>
  <c:calendar-home-set><d:href>${root}/calendars/${xmlEscape(user)}/</d:href></c:calendar-home-set>
  <d:current-user-principal><d:href>${root}/principals/${xmlEscape(user)}/</d:href></d:current-user-principal>
`)}
</d:multistatus>`;
        return davResponse(207, xml);
      }
    }

    // ── calendars/{user} ──
    if (parts[0] === 'calendars' && parts.length === 2) {
      const user = parts[1]!;
      if (method === 'PROPFIND') {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
${propstat(`${root}/calendars/${xmlEscape(user)}/`, `
  <d:resourcetype><d:collection/></d:resourcetype>
  <d:displayname>Calendar home</d:displayname>
`)}
${propstat(`${root}/calendars/${xmlEscape(user)}/default/`, `
  <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
  <d:displayname>GreenHQ</d:displayname>
  <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  <cs:getctag>greenhq</cs:getctag>
  <d:current-user-privilege-set>
    <d:privilege><d:read/></d:privilege>
    <d:privilege><d:write/></d:privilege>
    <d:privilege><d:write-content/></d:privilege>
    <d:privilege><d:bind/></d:privilege>
    <d:privilege><d:unbind/></d:privilege>
  </d:current-user-privilege-set>
`)}
</d:multistatus>`;
        return davResponse(207, xml);
      }
    }

    // ── calendars/{user}/default  or  default/{uid}.ics ──
    if (parts[0] === 'calendars' && parts.length >= 3 && parts[2] === 'default') {
      const user = parts[1]!;
      const calHref = `${root}/calendars/${user}/default`;
      const { events: allEvents } = await load();
      // Scope: path user if member, else auth filter
      let filter: string[] | null = auth.memberIdsFilter;
      if (user !== 'family' && user !== 'all') {
        filter = [user];
      }
      const events = filterEvents(allEvents, filter);

      // Collection
      if (parts.length === 3) {
        if (method === 'PROPFIND') {
          const depth = req.headers.get('Depth') || '1';
          let responses = propstat(`${calHref}/`, `
  <d:resourcetype><d:collection/><c:calendar xmlns:c="urn:ietf:params:xml:ns:caldav"/></d:resourcetype>
  <d:displayname>GreenHQ</d:displayname>
  <d:getetag>"collection"</d:getetag>
  <cs:getctag xmlns:cs="http://calendarserver.org/ns/">${Date.now()}</cs:getctag>
  <c:supported-calendar-component-set xmlns:c="urn:ietf:params:xml:ns:caldav"><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  <d:current-user-privilege-set>
    <d:privilege><d:read/></d:privilege>
    <d:privilege><d:write/></d:privilege>
    <d:privilege><d:write-properties/></d:privilege>
    <d:privilege><d:write-content/></d:privilege>
    <d:privilege><d:bind/></d:privilege>
    <d:privilege><d:unbind/></d:privilege>
  </d:current-user-privilege-set>
`);
          if (depth !== '0') {
            for (const ev of events) {
              const eh = `${calHref}/${encodeURIComponent(ev.id)}.ics`;
              responses += propstat(eh, `
  <d:getetag>${eventEtag(ev)}</d:getetag>
  <d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype>
  <d:resourcetype/>
`);
            }
          }
          const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
${responses}
</d:multistatus>`;
          return davResponse(207, xml);
        }

        if (method === 'REPORT') {
          // calendar-query / calendar-multiget — return all matching events as calendar-data
          let responses = '';
          for (const ev of events) {
            const eh = `${calHref}/${encodeURIComponent(ev.id)}.ics`;
            const data = serializeVEvent(ev);
            responses += propstat(eh, `
  <d:getetag>${eventEtag(ev)}</d:getetag>
  <c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav">${xmlEscape(data)}</c:calendar-data>
`);
          }
          const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">${responses}</d:multistatus>`;
          return davResponse(207, xml);
        }
      }

      // Event resource: default/{uid}.ics  (Apple may omit .ics rarely)
      if (parts.length === 4) {
        const rawName = parts[3]!;
        const uid = rawName.endsWith('.ics') ? rawName.slice(0, -'.ics'.length) : rawName;
        const decodedUid = decodeURIComponent(uid);

        if (method === 'GET' || method === 'HEAD') {
          const ev = events.find((e) => e.id === decodedUid);
          if (!ev) return new Response('Not found', { status: 404 });
          const body = serializeVEvent(ev);
          return new Response(method === 'HEAD' ? null : body, {
            status: 200,
            headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              ETag: eventEtag(ev),
              DAV: '1, 3, calendar-access',
            },
          });
        }

        if (method === 'PUT') {
          try {
            const text = await req.text();
            const { events: full, members: mems } = await load();
            const defaultMembers =
              (filter && filter.length ? filter : null) ||
              auth.memberIdsFilter ||
              (mems[0]?.id ? [mems[0].id] : []);
            const parsed = parseVEvent(text, defaultMembers);
            if (!parsed) {
              console.error('[caldav] PUT parse failed', text.slice(0, 400));
              return new Response('Invalid VEVENT', { status: 400 });
            }
            // Prefer URL uid for stability (Apple path often differs slightly)
            if (decodedUid) parsed.id = decodedUid;
            if (filter && filter.length) {
              parsed.memberIds = filter;
              parsed.memberId = filter[0];
            } else if (!parsed.memberIds.length) {
              parsed.memberIds = defaultMembers;
              parsed.memberId = defaultMembers[0];
            }

            const asGh = full.map(feedToGh);
            const idx = asGh.findIndex((e) => e.id === parsed.id);
            const created = idx < 0;
            if (idx >= 0) {
              asGh[idx] = {
                ...asGh[idx],
                ...parsed,
                memberIds: parsed.memberIds.length
                  ? parsed.memberIds
                  : asGh[idx]!.memberIds,
              };
            } else {
              asGh.push(parsed);
            }

            await patchFamilyEvents(sa.project_id, familyId, accessToken, asGh);
            const location = `${calHref}/${encodeURIComponent(parsed.id)}.ics`;
            return new Response(null, {
              status: created ? 201 : 204,
              headers: {
                ETag: eventEtag(parsed),
                DAV: '1, 3, calendar-access',
                Location: location,
                'Content-Location': location,
              },
            });
          } catch (putErr) {
            console.error('[caldav] PUT failed', putErr);
            return new Response('Write failed', { status: 500 });
          }
        }

        if (method === 'DELETE') {
          const { events: full } = await load();
          const asGh = full.map(feedToGh).filter((e) => e.id !== decodedUid);
          if (asGh.length === full.length) return new Response('Not found', { status: 404 });
          await patchFamilyEvents(sa.project_id, familyId, accessToken, asGh);
          return new Response(null, { status: 204, headers: { DAV: '1, 3, calendar-access' } });
        }

        if (method === 'PROPFIND') {
          const ev = events.find((e) => e.id === decodedUid);
          if (!ev) return new Response('Not found', { status: 404 });
          const eh = `${calHref}/${encodeURIComponent(ev.id)}.ics`;
          const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
${propstat(eh, `<d:getetag>${eventEtag(ev)}</d:getetag><d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype>`)}
</d:multistatus>`;
          return davResponse(207, xml);
        }
      }
    }

    return new Response('Not found', { status: 404 });
  } catch (e) {
    console.error('[caldav]', e);
    return new Response('Server error', { status: 500 });
  }
};
