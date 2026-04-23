# KEVU — Fitness & Habit Tracker

A minimalist, Apple-Fitness-inspired dark-themed web app that works **with or
without a smartwatch**. Log workouts by hand, sync from Strava, track habits,
and install it on your iPhone home screen like a native app.

- Activity rings (Move / Exercise / Stand), steps, sleep, heart rate
- Manual workout logging + habit tracking
- Strava OAuth import (runs, rides, swims, etc.)
- Firebase Auth: Apple, Google, email + password, with password recovery
- Cross-device cloud sync via Firestore
- Offline-first (service worker) and installable (PWA)
- Pure static files — no server required

---

## 1. See it on your phone in ~2 minutes (GitHub Pages)

1. Push this branch (already done if you're reading this) — files live at
   `https://github.com/commonkadsrami/kevu/tree/claude/fitness-habit-tracker-rCzke`.
2. Open <https://github.com/commonkadsrami/kevu/settings/pages>.
3. **Source**: "Deploy from a branch".
4. **Branch**: `claude/fitness-habit-tracker-rCzke`, folder `/ (root)`.
5. Save. Wait ~60 seconds. Your URL appears at the top, e.g.
   `https://commonkadsrami.github.io/kevu/`.
6. On your iPhone, open that URL in **Safari** → tap **Share** → **Add to
   Home Screen**. Launch from the icon — it runs full-screen with the dark
   status bar.

> Without any extra setup, the app works locally on your device (workouts,
> habits, goals) and persists in Safari storage. To enable sign-in and
> Strava sync, follow the next sections.

## 2. Run it locally

```bash
# Any static server works
python3 -m http.server 8080
# open http://localhost:8080
```

For LAN testing from your phone: find your laptop IP, open
`http://<laptop-ip>:8080` on the phone. (Google sign-in requires HTTPS — use
GitHub Pages for that.)

---

## 3. Enable login + cross-device sync (Firebase, ~5 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** → name it
   "kevu" → skip Analytics.
2. On the project overview, click the **Web** icon (`</>`) → register app →
   copy the `firebaseConfig` object. It looks like:
   ```js
   { apiKey: "AIza...", authDomain: "kevu-xyz.firebaseapp.com",
     projectId: "kevu-xyz", storageBucket: "…", messagingSenderId: "…",
     appId: "…" }
   ```
3. **Build → Authentication → Get started → Sign-in method**
   - Enable **Email/Password**.
   - Enable **Google** (provide a project support email).
   - Enable **Apple** *only* if you have an Apple Developer account — it
     needs a Services ID, private key, and Team ID.
4. **Build → Firestore Database → Create database**. Pick a region close to
   you, start in **production mode**.
5. Firestore → **Rules** tab → replace with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   Publish.
6. Authentication → **Settings → Authorized domains** → add the host where
   you'll run KEVU (e.g. `commonkadsrami.github.io` for Pages,
   `localhost` for local).
7. In this repo:
   ```bash
   cp config.example.js config.js
   ```
   Open `config.js` and paste the `firebaseConfig` you copied. `config.js`
   is gitignored, so your keys stay local.
8. Reload the app → Settings tab → **Continue with Google / Apple /
   Email**. Workouts, habits, goals, and Strava tokens now sync to
   Firestore under `users/{uid}`.

### Password recovery

On the email sign-in sheet, tap **Forgot password?**. Firebase sends a
reset link to the email address. Click the link, set a new password — done.

---

## 4. Connect Strava (~3 minutes)

1. Go to <https://www.strava.com/settings/api> → **Create App** (if you
   don't have one yet). You'll get a **Client ID** and **Client Secret**.
2. In the "Authorization Callback Domain" field, enter the host where you
   serve KEVU — no `https://`, just the hostname:
   - GitHub Pages: `commonkadsrami.github.io`
   - Local: `localhost`
3. In KEVU → **Settings → Strava**, paste Client ID and Client Secret →
   **Save** → **Connect Strava**. You'll be redirected to Strava to
   authorize; on return, KEVU captures the token automatically.
4. Back in KEVU, tap **Sync now** (or the ⟳ on the Activity tab). Your
   recent Strava activities appear in the workout list.

Token refresh happens automatically — you don't have to reconnect.

---

## 5. File layout

```
index.html              App shell + tab bar + sheet dialog
styles.css              Dark theme, rings, cards, tab bar
app.js                  Bootstrap: config, cloud, Strava redirect, router
manifest.webmanifest    PWA metadata
sw.js                   Service worker (offline cache)
icons/icon.svg          App icon (rings + flame)
config.example.js       Template for your Firebase + Strava credentials
config.js               (gitignored) your actual credentials
src/
  util.js               DOM helpers, dates, toast, sheet
  store.js              State + localStorage + event emitter
  cloud.js              Firebase Auth + Firestore sync (lazy-loaded)
  strava.js             OAuth flow, token refresh, activity fetch
  views/
    dashboard.js        Today's rings, steps, sleep, heart rate
    activity.js         Workout list + manual-log sheet
    habits.js           Habit tracker with 7-day grid
    trends.js           14-day charts (steps, minutes, sleep)
    settings.js         Account, Strava, goals, data export/import
```

---

## 6. How features actually work

- **Logging**: every write goes through `store.patch()` in `src/store.js`,
  which persists to `localStorage` under `kevu.v1` and re-renders the
  active view.
- **Recovery**: if Firebase is configured and you're signed in, every
  mutation debounces a push to `users/{uid}` in Firestore (1.5 s). On
  sign-in on a new device, a real-time subscription pulls your data back
  — workouts, habits, goals, Strava tokens.
- **Last-write-wins**: each state snapshot has an `updatedAt` timestamp;
  if remote is newer, it overwrites local; otherwise local wins and pushes.
- **Strava tokens** are stored in the synced state, so connecting once
  works from any signed-in device.
- **Offline**: the service worker caches the app shell. Reopening with no
  network still loads and lets you log workouts; they sync when online.

---

## 7. Troubleshooting

- **"Sign-in unavailable" in Settings** → `config.js` missing or empty.
- **Google popup blocked** → the app automatically falls back to a full-page
  redirect.
- **Strava says "invalid redirect_uri"** → the "Authorization Callback
  Domain" on strava.com must match the host (no path, no scheme).
- **CORS error on Strava token exchange** → Strava allows browser CORS on
  `/oauth/token`; make sure you're on HTTPS or `localhost`.
- **Data vanished after clearing Safari** → sign in before clearing; your
  data restores from Firestore. (Local-only usage is not recoverable if
  you clear site data.)

---

## 8. Privacy

- With `config.js` blank: data lives only in your browser's `localStorage`.
- With `config.js` set: data lives in your own Firebase project under
  `users/{your-uid}`. No one else has access.
- Strava credentials (Client ID/Secret, tokens) are stored with the rest
  of your state — Firestore rules above make the document private per
  user.
