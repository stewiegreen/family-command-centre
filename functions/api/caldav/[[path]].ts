/**
 * Minimal CalDAV for GreenHQ — tuned for iOS Calendar + DAVx5.
 *
 * Account URL: https://greenhq.io/api/caldav/
 * Username:    member id | family
 * Password:    settings.calendarFeedToken
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

const NS =
  'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"';

const PRIVILEGES = `
  <d:current-user-privilege-set>
    <d:privilege><d:read/></d:privilege>
    <d:privilege><d:read-acl/></d:privilege>
    <d:privilege><d:read-current-user-privilege-set/></d:privilege>
    <d:privilege><d:write/></d:privilege>
    <d:privilege><d:write-properties/></d:privilege>
    <d:privilege><d:write-content/></d:privilege>
    <d:privilege><d:bind/></d:privilege>
    <d:privilege><d:unbind/></d:privilege>
  </d:current-user-privilege-set>`;

const REPORT_SET = `
  <d:supported-report-set>
    <d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report>
    <d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report>
    <d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>
  </d:supported-report-set>`;

function davHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    DAV: '1, 3, calendar-access, calendar-schedule, calendar-auto-schedule, addressbook',
    Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT, MKCALENDAR',
    'MS-Author-Via': 'DAV',
    ...extra,
  };
}

function davXml(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      ...davHeaders(extra),
    },
  });
}

function unauthorized(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="GreenHQ CalDAV"',
      ...davHeaders(),
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
  if (!user || user === 'family' || user === 'all') {
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

function propstat(hrefPath: string, propsXml: string, status = 'HTTP/1.1 200 OK'): string {
  return `<d:response>
  <d:href>${xmlEscape(hrefPath)}</d:href>
  <d:propstat>
    <d:prop>
${propsXml}
    </d:prop>
    <d:status>${status}</d:status>
  </d:propstat>
</d:response>`;
}

function collectionCtag(events: GhEvent[]): string {
  let h = events.length;
  for (const e of events) {
    h = (Math.imul(31, h) + eventEtag(e).length + e.id.length) | 0;
  }
  return `greenhq-${(h >>> 0).toString(16)}-${events.length}`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const req = context.request;
  const method = req.method.toUpperCase();
  const env = context.env;
  const parts = pathParts(context);
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const root = `${origin}/api/caldav`;

  console.log('[caldav]', method, url.pathname, 'parts=', parts.join('/'));

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...davHeaders(),
        'Access-Control-Allow-Methods': 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT, MKCALENDAR',
        'Access-Control-Allow-Headers':
          'Authorization, Content-Type, Depth, Prefer, If-Match, If-None-Match, Brief',
      },
    });
  }

  // MKCALENDAR — calendar already exists; accept so iOS is happy
  if (method === 'MKCALENDAR') {
    const authEarly = await authorize(req, env);
    if (authEarly instanceof Response) return authEarly;
    return new Response(null, { status: 201, headers: davHeaders() });
  }

  let auth: AuthOk;
  try {
    const a = await authorize(req, env);
    if (a instanceof Response) {
      console.log('[caldav] auth failed');
      return a;
    }
    auth = a;
  } catch (e) {
    console.error('[caldav] auth error', e);
    return new Response('Server error', { status: 500 });
  }

  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getGoogleAccessToken(sa);
  const familyId = env.GREENHQ_FAMILY_ID;

  const load = async () => {
    const doc = await getFamilyDoc(sa.project_id, familyId, accessToken);
    return {
      events: readEvents(doc),
      members: readMembers(doc),
      familyName: readSettingsField(doc, 'familyName') || 'GreenHQ',
    };
  };

  try {
    // ── /api/caldav/ ──
    if (parts.length === 0) {
      if (method === 'PROPFIND') {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus ${NS}>
${propstat(`${root}/`, `
  <d:resourcetype><d:collection/></d:resourcetype>
  <d:displayname>GreenHQ CalDAV</d:displayname>
  <d:current-user-principal><d:href>${root}/principals/${xmlEscape(auth.user)}/</d:href></d:current-user-principal>
  <c:calendar-home-set><d:href>${root}/calendars/${xmlEscape(auth.user)}/</d:href></c:calendar-home-set>
  <d:principal-URL><d:href>${root}/principals/${xmlEscape(auth.user)}/</d:href></d:principal-URL>
  ${PRIVILEGES}
`)}
</d:multistatus>`;
        return davXml(207, xml);
      }
      return davXml(200, `<?xml version="1.0"?><d:multistatus ${NS}/>`);
    }

    // ── principals/{user} ──
    if (parts[0] === 'principals') {
      const user = parts[1] || auth.user;
      if (method === 'PROPFIND') {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus ${NS}>
${propstat(`${root}/principals/${xmlEscape(user)}/`, `
  <d:resourcetype><d:principal/><d:collection/></d:resourcetype>
  <d:displayname>${xmlEscape(user)}</d:displayname>
  <c:calendar-home-set><d:href>${root}/calendars/${xmlEscape(user)}/</d:href></c:calendar-home-set>
  <d:current-user-principal><d:href>${root}/principals/${xmlEscape(user)}/</d:href></d:current-user-principal>
  <d:principal-URL><d:href>${root}/principals/${xmlEscape(user)}/</d:href></d:principal-URL>
  ${PRIVILEGES}
`)}
</d:multistatus>`;
        return davXml(207, xml);
      }
    }

    // ── calendars/{user} ──
    if (parts[0] === 'calendars' && parts.length === 2) {
      const user = parts[1]!;
      if (method === 'PROPFIND') {
        const depth = req.headers.get('Depth') ?? '1';
        let responses = propstat(`${root}/calendars/${xmlEscape(user)}/`, `
  <d:resourcetype><d:collection/></d:resourcetype>
  <d:displayname>Calendar home</d:displayname>
  ${PRIVILEGES}
`);
        if (depth !== '0') {
          responses += propstat(`${root}/calendars/${xmlEscape(user)}/default/`, `
  <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
  <d:displayname>GreenHQ</d:displayname>
  <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  <cs:getctag>bootstrap</cs:getctag>
  <a:calendar-color>#34C759</a:calendar-color>
  ${REPORT_SET}
  ${PRIVILEGES}
`);
        }
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus ${NS}>
${responses}
</d:multistatus>`;
        return davXml(207, xml);
      }
    }

    // ── calendars/{user}/default[/event] ──
    if (parts[0] === 'calendars' && parts.length >= 3 && parts[2] === 'default') {
      const user = parts[1]!;
      const calHref = `${root}/calendars/${encodeURIComponent(user)}/default`;
      const { events: allEvents, members: mems } = await load();

      let filter: string[] | null = auth.memberIdsFilter;
      if (user !== 'family' && user !== 'all') {
        filter = [user];
      }
      const events = filterEvents(allEvents, filter);
      const ctag = collectionCtag(events);

      // Collection root
      if (parts.length === 3) {
        if (method === 'PROPFIND') {
          const depth = req.headers.get('Depth') ?? '1';
          let responses = propstat(`${calHref}/`, `
  <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
  <d:displayname>GreenHQ</d:displayname>
  <d:getetag>"${xmlEscape(ctag)}"</d:getetag>
  <cs:getctag>${xmlEscape(ctag)}</cs:getctag>
  <d:sync-token>https://greenhq.io/sync/${xmlEscape(ctag)}</d:sync-token>
  <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  <a:calendar-color>#34C759</a:calendar-color>
  ${REPORT_SET}
  ${PRIVILEGES}
`);
          if (depth !== '0') {
            for (const ev of events) {
              const eh = `${calHref}/${encodeURIComponent(ev.id)}.ics`;
              responses += propstat(eh, `
  <d:getetag>${eventEtag(ev)}</d:getetag>
  <d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype>
  <d:resourcetype/>
  ${PRIVILEGES}
`);
            }
          }
          return davXml(
            207,
            `<?xml version="1.0" encoding="utf-8"?><d:multistatus ${NS}>${responses}</d:multistatus>`,
          );
        }

        if (method === 'REPORT') {
          // calendar-query / calendar-multiget / sync-collection
          let responses = '';
          for (const ev of events) {
            const eh = `${calHref}/${encodeURIComponent(ev.id)}.ics`;
            const data = serializeVEvent(ev);
            responses += propstat(eh, `
  <d:getetag>${eventEtag(ev)}</d:getetag>
  <c:calendar-data><![CDATA[${data}]]></c:calendar-data>
`);
          }
          return davXml(
            207,
            `<?xml version="1.0" encoding="utf-8"?><d:multistatus ${NS}>${responses}</d:multistatus>`,
          );
        }
      }

      // Event object
      if (parts.length === 4) {
        const rawName = parts[3]!;
        const uid = rawName.endsWith('.ics') ? rawName.slice(0, -4) : rawName;
        const decodedUid = decodeURIComponent(uid);

        if (method === 'GET' || method === 'HEAD') {
          const ev = events.find((e) => e.id === decodedUid);
          if (!ev) {
            console.log('[caldav] GET miss', decodedUid);
            return new Response('Not found', { status: 404, headers: davHeaders() });
          }
          const body = serializeVEvent(ev);
          return new Response(method === 'HEAD' ? null : body, {
            status: 200,
            headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              ETag: eventEtag(ev),
              ...davHeaders(),
            },
          });
        }

        if (method === 'PUT') {
          try {
            const text = await req.text();
            console.log('[caldav] PUT', decodedUid, 'bytes=', text.length);
            const defaultMembers =
              (filter && filter.length ? filter : null) ||
              auth.memberIdsFilter ||
              (mems[0]?.id ? [mems[0].id] : []);
            const parsed = parseVEvent(text, defaultMembers);
            if (!parsed) {
              console.error('[caldav] PUT parse fail', text.slice(0, 500));
              return new Response('Invalid VEVENT', { status: 400, headers: davHeaders() });
            }
            if (decodedUid) parsed.id = decodedUid;
            if (filter?.length) {
              parsed.memberIds = filter;
              parsed.memberId = filter[0];
            } else if (!parsed.memberIds.length) {
              parsed.memberIds = defaultMembers;
              parsed.memberId = defaultMembers[0];
            }

            const asGh = allEvents.map(feedToGh);
            const idx = asGh.findIndex((e) => e.id === parsed.id);
            const created = idx < 0;
            if (idx >= 0) {
              asGh[idx] = {
                ...asGh[idx],
                ...parsed,
                memberIds: parsed.memberIds.length ? parsed.memberIds : asGh[idx]!.memberIds,
              };
            } else {
              asGh.push(parsed);
            }

            await patchFamilyEvents(sa.project_id, familyId, accessToken, asGh);
            const location = `${calHref}/${encodeURIComponent(parsed.id)}.ics`;
            console.log('[caldav] PUT ok', created ? 'created' : 'updated', parsed.id);
            return new Response(null, {
              status: created ? 201 : 204,
              headers: {
                ETag: eventEtag(parsed),
                Location: location,
                'Content-Location': location,
                ...davHeaders(),
              },
            });
          } catch (putErr) {
            console.error('[caldav] PUT error', putErr);
            return new Response('Write failed', { status: 500, headers: davHeaders() });
          }
        }

        if (method === 'DELETE') {
          const asGh = allEvents.map(feedToGh).filter((e) => e.id !== decodedUid);
          if (asGh.length === allEvents.length) {
            return new Response('Not found', { status: 404, headers: davHeaders() });
          }
          await patchFamilyEvents(sa.project_id, familyId, accessToken, asGh);
          console.log('[caldav] DELETE', decodedUid);
          return new Response(null, { status: 204, headers: davHeaders() });
        }

        if (method === 'PROPFIND') {
          const ev = events.find((e) => e.id === decodedUid);
          if (!ev) return new Response('Not found', { status: 404, headers: davHeaders() });
          const eh = `${calHref}/${encodeURIComponent(ev.id)}.ics`;
          const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus ${NS}>
${propstat(eh, `<d:getetag>${eventEtag(ev)}</d:getetag><d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype>${PRIVILEGES}`)}
</d:multistatus>`;
          return davXml(207, xml);
        }
      }
    }

    console.log('[caldav] 404 unhandled', method, parts);
    return new Response('Not found', { status: 404, headers: davHeaders() });
  } catch (e) {
    console.error('[caldav] error', e);
    return new Response('Server error', { status: 500 });
  }
};
