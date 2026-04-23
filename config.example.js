// Copy this file to `config.js` and fill in your own values.
// `config.js` is gitignored so your credentials stay private.
//
// The app runs in local-only mode if this file is missing —
// cloud sync, login, and Strava import simply stay disabled.

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",        // e.g. "kevu-app.firebaseapp.com"
  projectId: "",         // e.g. "kevu-app"
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const stravaConfig = {
  clientId: "",          // numeric, from https://www.strava.com/settings/api
  clientSecret: "",      // same page
  // Must exactly match the "Authorization Callback Domain" registered in Strava.
  // Use the origin you deploy to, e.g. "https://<user>.github.io" or "http://localhost:8080".
  redirectUri: location.origin + location.pathname
};
