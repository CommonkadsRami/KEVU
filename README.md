# Calendar Bridge (Working OAuth + Sync)

This app syncs meetings from your Microsoft 365 calendar (Outlook/Teams) into your Google Calendar.

## 1) Create OAuth apps

### Microsoft Entra App
- Redirect URI: `http://localhost:3000/auth/microsoft/callback`
- API permissions (delegated):
  - `User.Read`
  - `Calendars.Read`

### Google Cloud OAuth App
- Redirect URI: `http://localhost:3000/auth/google/callback`
- Scopes:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/calendar.events`

## 2) Configure env vars

Copy `.env.example` to your environment and set real values.

## 3) Run

```bash
node server.js
```

Open: `http://localhost:3000/calendar-sync.html`

## Notes
- Sync currently imports meetings from the next 7 days from Microsoft calendar to Google primary calendar.
- Tokens are stored in memory for the current server process.


## Netlify frontend + separate backend
If frontend is on Netlify and backend is elsewhere, set `FRONTEND_ORIGIN` to your Netlify URL and use HTTPS on backend so cross-site cookies work (`SameSite=None; Secure`).
