# Phase 2 — Tasks on calendar + iCal import/export

## New dependency
```bash
npm install ics ical.js
```

## Files to copy (paths relative to repo root)

| Source in this folder | Destination |
|----------------------|-------------|
| `types.index.ts` | `src/types/index.ts` |
| `defaults.ts` | `src/lib/defaults.ts` |
| `recurrence.ts` | `src/lib/recurrence.ts` |
| `ical.ts` | `src/lib/ical.ts` **(new)** |
| `CalendarPage.tsx` | `src/pages/CalendarPage.tsx` |
| `AppContext.tsx` | `src/context/AppContext.tsx` |
| `package.json` | merge deps only if needed: `ics`, `ical.js` |

Phase 2 includes Phase 1 changes (copy all of the above).

## What you get
- **Tasks on calendar**: open Todos with `dueAt` appear as dashed/warn chips (checkbox icon). Tap to mark complete.
- **Tasks toggle**: "Tasks on/off" in the calendar header; persisted as `fcc-calendar-show-tasks`.
- **Export**: downloads a `.ics` of family events (simple daily/weekly/monthly RRULE).
- **Import**: upload `.ics`; simple RRULEs map in; complex ones skipped with a summary modal.
