// Navigate to a user's public profile via the hash router
// (#user/<userId>). The Shell listens for hashchange.
export function goUser(userId) {
  if (!userId) return;
  window.location.hash = `user/${userId}`;
}

// ---------------------------------------------------------------
// Auth page routing
//
// The sign-in / sign-up flow lives on its own page (#auth) instead
// of an overlay. These helpers remember where the user came from
// (origin) and, when an action required auth first (e.g. posting a
// party), where to send them once they're signed in (next).
// ---------------------------------------------------------------
const AUTH_NEXT_KEY = "festivity.authNext";
const AUTH_ORIGIN_KEY = "festivity.authOrigin";

function withHash(path) {
  const value = path || "home";
  return value.startsWith("#") ? value : `#${value}`;
}

// Store the current page as the auth origin, and (optionally) the
// destination to continue to after signing in.
export function rememberAuthContext(next) {
  try {
    sessionStorage.setItem(AUTH_ORIGIN_KEY, window.location.hash || "#home");
    if (next) sessionStorage.setItem(AUTH_NEXT_KEY, next);
    else sessionStorage.removeItem(AUTH_NEXT_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

// Where to land after a successful sign-in: the pending action (if
// any), otherwise the page the user was on before auth, else home.
export function authDestination() {
  let dest = "#home";
  try {
    dest = withHash(
      sessionStorage.getItem(AUTH_NEXT_KEY) ||
        sessionStorage.getItem(AUTH_ORIGIN_KEY)
    );
    sessionStorage.removeItem(AUTH_NEXT_KEY);
    sessionStorage.removeItem(AUTH_ORIGIN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
  return dest;
}

// Where the "back" link on the auth page should go.
export function authBackTarget() {
  try {
    return withHash(sessionStorage.getItem(AUTH_ORIGIN_KEY));
  } catch {
    return "#home";
  }
}

// ---------------------------------------------------------------
// Hash query params
//
// Routes like #messages/new?to=<id>&event=<name>&offer=1 carry
// context through the URL. Returns a decoded { key: value } map.
// ---------------------------------------------------------------
export function routeQuery() {
  const raw = window.location.hash.split("?")[1] || "";
  const out = {};
  new URLSearchParams(raw).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

// Build a "Contact the host" / "Offer service" destination.
// Real hosts (with an account) get the messenger composer;
// everyone else gets the inquiry page for that event.
export function contactHostHref({ hostId, hostName, eventId, eventName, kind }) {
  const q = `event=${encodeURIComponent(eventName)}&host=${encodeURIComponent(
    hostName || "the host"
  )}`;
  if (hostId) return `#messages/new?to=${hostId}&${q}`;
  return `#contact/${eventId}?kind=${kind}&${q}`;
}
