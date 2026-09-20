This is 100% pure vibe-coded AI slop.  It was made purely for my family to use - that said it's gone beyond anything I expected it to be.  So feel free to use it for your family.

# Family Command Centre

**An invite-only, multi-device operating system for one family.**

Private chat, shared calendar, chores and tasks, shopping and recipes, school tools, notes and journals, Emby media + Komga comics, multiplayer games, and a daily Wordle — all in one React app, live-synced across phones and tablets.

Built for real households: parents get control and overview; kids get structure, play, and a PIN gate; a media-only role exists for shared TVs and tablets.

---

## Why this exists

Most families cobble together WhatsApp groups, Google Calendar, a chores app, a shopping list, and a media server UI. None of them talk to each other, and none are designed for “this is our house.”

Family Command Centre is a single private hub:

- **One family, invite-only** — no public join codes, no strangers
- **Live sync** via Firebase so every device stays in step
- **Roles that match reality** — Parent, Kid, Media only
- **Optional home integrations** — Emby, Komga, CalDAV, smart lights, push

---

## Features

### Home dashboard
At-a-glance overview for whoever is signed in: upcoming chores and tasks, shopping needs, weather, screen-time status, media continue-watching, lights, picture-frame style cards, and the shared daily Wordle banner.

### Calendar
Family events with recurrence, categories, and iCal import/export. Tasks with due dates can appear on the calendar as chips. Optional CalDAV proxy for external calendars (Cloudflare Worker).

### Tasks & chores
Shared to-dos plus a dedicated chores board aimed at kids (quests, rewards-style flow, parent approval). Recurrence and weekly cycles supported.

### School
School-focused tools and roster-style views for the kids’ day-to-day.

### Shopping & recipes
Shared shopping lists with categories. Recipe collection with a server-side parser worker so you can pull structured recipes from URLs.

### Notes & journal
Quick family notes with tags. A personal journal with **per-entry visibility**: private, parents only, or whole family — enforced in Firestore rules, not just the UI.

### Messages
Family room + direct messages, reactions, and image uploads (Cloudflare R2). Built for the household, not a public social network.

### Media & comics
- **Emby** integration — browse and play from your media server (proxy worker + webhook support)
- **Komga** integration — comics/manga library with an in-app reader

A **Media only** role locks the app to media/comics views — useful for a living-room tablet or TV profile.

### Play
- **Solo:** Daily Wordle (shared family seed + solves board) and random Wordle
- **Multiplayer (cloud):** Tic-Tac-Toe, infinite Tic-Tac-Toe, Connect 4, Battleship (private fleets, game chat)

Daily Wordle uses a **canonical UTC day seed** so everyone in the family gets the same word regardless of device timezone.

### Theme Studio
Custom appearance packs, tokens, and unlockable theming so the hub can match the household’s taste (and the kids’ preferences).

### Screen timer, lights, weather, push
- Per-kid style screen-time controls and push hooks
- Smart lights control (Tuya-backed worker)
- Weather cards on the dashboard
- Optional FCM / notification service worker registration

### Parent-only tools
Settings, invite management, coin-math helpers, and role administration.

---

## Roles

| Role | Access |
|------|--------|
| **Parent** | Full app, settings, invites, approvals, journal “parents” visibility |
| **Kid** | Core family features; optional PIN gate; chores/play-oriented |
| **Media only** | Forced into Media / Comics only — good for shared screens |

Join is **invite-only**: parents create one-time invite codes; redeemers self-add via `arrayUnion` without needing prior family read access.

---

## Stack

| Layer | Choice |
|-------|--------|
| UI | React 19, TypeScript, Vite 6, Tailwind CSS 4, Lucide icons |
| Auth & data | Firebase Auth (email/password), Firestore live sync |
| Hosting | Static `dist/` → Cloudflare Pages, Netlify, Vercel, or GitHub Pages |
| Edge / workers | Cloudflare Pages Functions + Workers (CalDAV, Emby, Komga, recipe parse, messages, lights, push) |
| Media images | Cloudflare R2 (`MESSAGE_IMAGES`) |
| Optional AI | Cloudflare Workers AI binding |

Firebase is **lazy-loaded**: local-only mode does not pull Auth/Firestore until cloud is configured.

---

## Security model

Rules live in [`firestore.rules`](./firestore.rules). Design goals:

- **No open reads** — no `allow read, write: if true`
- **Family data** readable only by members (`uid in memberUids`)
- **Invites** are one-time; unused codes can be fetched by exact code for signup; used codes are restricted
- **Join flow** allows a non-member to `arrayUnion` themselves once via a valid invite, then subscribe as a member
- **Journal** privacy is per document (`private` / `parents` / `family`)
- **Game fleets** (Battleship) are scoped to the owning auth uid
- **Messages** support family channel + DMs with tight create/update rules

| Collection | Read | Write |
|------------|------|--------|
| `users/{uid}` | That user | That user |
| `invites/{code}` | Exact get (unused) or signed-in member list | Parents create; redeem once; parents revoke |
| `families/{id}` | Members only | Members (protected keys locked for non-parents); invite self-add once |
| `families/{id}/messages` | Participants / family channel | Members create; limited updates (read, reactions) |
| `families/{id}/journal` | Author, or visibility rules | Author |
| `families/{id}/games` | Members | Host / guest / join empty seat |

---

## Quick start

```bash
git clone https://github.com/stewiegreen/family-command-centre.git
cd family-command-centre
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

### Build

```bash
npm run build
```

Deploy the `dist/` folder to Cloudflare Pages, Netlify, Vercel, or GitHub Pages.

For Cloudflare Pages with Functions + R2, this repo includes a [`wrangler.toml`](./wrangler.toml) (Pages output dir, AI binding, `MESSAGE_IMAGES` → R2 bucket).

---

## Firebase setup (multi-device)

Required if you want live sync across devices:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (Spark / free is fine).
2. **Authentication → Sign-in method → Email/Password → Enable**.
3. **Firestore → Create database**.
4. **Firestore → Rules** → paste the contents of [`firestore.rules`](./firestore.rules) → **Publish**.
5. Register a web app → paste the config into the app (sign-in screen or Settings), **or** hard-code env vars (below).

### Optional env config

For a private family deploy, set:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Config is not secret once Auth and rules are correct; the rules are the real boundary.

---

## Optional integrations

These are powered by Cloudflare Pages Functions under `functions/`:

| Integration | Purpose |
|-------------|---------|
| **CalDAV / calendar** | External calendar proxy and ICS helpers |
| **Emby** | Media library proxy + webhook |
| **Komga** | Comics library proxy |
| **Messages + R2** | Image upload and serve for chat |
| **Recipe parse** | Turn a recipe URL into structured data |
| **Lights (Tuya)** | Smart light control from the dashboard |
| **Push** | Screen-timer and notification hooks |

Wire secrets and bindings in the Cloudflare dashboard / `wrangler.toml` as needed. The app still works for core family data with only Firebase configured.

---

## Project layout

```
src/
  components/     # Layout, auth, media players, weather, lights, PIN gate, …
  context/        # App state, cloud sync, family document
  lib/            # Wordle, games, Emby/Komga clients, iCal, themes, …
  pages/          # Dashboard, Calendar, Chores, Play, Settings, …
  types/          # Shared TypeScript types
functions/        # Cloudflare Pages Functions (API proxies & workers)
firestore.rules   # Production security rules
wrangler.toml     # Cloudflare Pages + R2 + AI bindings
public/           # Icons, avatar packs, redirects
```

---

## Design principles

1. **Private by default** — invite-only, tight rules, no public discovery.
2. **One source of truth** — family document + subcollections; devices subscribe live.
3. **Roles match the household** — parents administer; kids participate; media-only for shared screens.
4. **Works offline-ish** — local progress for things like Wordle; cloud when connected.
5. **Integrations are optional** — core hub does not require Emby, Komga, or lights.

---

## Licence & status

Personal / private family project. Expect ongoing iteration (themes, games, school tools, media). Star or fork if you are adapting it for your own household — and always review `firestore.rules` before exposing any Firebase project.

---

**Family Command Centre** — the house OS, not another group chat.
