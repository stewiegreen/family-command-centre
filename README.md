# Family Command Centre

Vite + React + TypeScript + Tailwind. **Invite-only** multi-device family hub.

## Features

- Dashboard, Calendar, To-Dos, Notes, Messages, Media (Emby/Komga)
- Roles: **Parent** / **Kid** / **Media only**
- Firebase Auth (email/password) + Firestore live sync
- One-time invite codes (no open family-code join)
- Firebase SDK is **lazy-loaded** — local-only mode does not download Auth/Firestore

## Develop

```bash
cd family-command-centre
npm install
npm run dev
```

## Build & deploy

```bash
npm run build
```

Upload the `dist/` folder to Netlify, Cloudflare Pages, Vercel, or GitHub Pages.

## Firebase setup (required for multi-device)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (Spark / free is fine).
2. **Authentication → Sign-in method → Email/Password → Enable**.
3. **Firestore → Create database**.
4. **Firestore → Rules** → paste the contents of **`firestore.rules`** in this repo → **Publish**.
5. Register a web app → copy the config JSON into the app (sign-in screen or Settings).

### Security model (no open reads)

| Collection | Who can read | Who can write |
|------------|--------------|---------------|
| `users/{uid}` | That user only | That user only |
| `invites/{code}` | Signed-in (get by code) | Members create; redeem once; members revoke |
| `families/{id}` | **Members only** (`uid in memberUids`) | Members update; non-members may only **self-add** once via invite (`arrayUnion`) |

There is **no** `allow read, write: if true` and **no** `|| true` on family reads.

Join flow: redeem invite → `arrayUnion` own uid onto the family (no prior family read required) → then subscribe as a member.

## Optional: hard-code config

For a private family deploy, set env vars and skip pasting JSON:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

(Config is not secret once Auth + rules are correct.)
