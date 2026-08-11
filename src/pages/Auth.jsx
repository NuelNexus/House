import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { authBackTarget, authDestination } from "../lib/nav";
import Reveal from "../components/Reveal";

// The password-reset email lands on the app with a recovery session in
// the hash (#access_token=...&type=recovery). Detect that and show the
// "set a new password" form instead of the regular auth page.
export default function Auth({ authMode = "signin" }) {
  const {
    user,
    name,
    authLoading,
    signIn,
    signUp,
    signInWithGoogle,
    resetPassword,
    updatePassword,
    signOut,
  } = useAuth();
  const [mode, setMode] = useState(authMode); // signin | signup | forgot
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(() =>
    window.location.hash.includes("type=recovery")
  );
  const justAuthed = useRef(false);

  // Stay in recovery mode if the hash changes while on this page.
  useEffect(() => {
    const onHash = () =>
      setRecoveryMode(window.location.hash.includes("type=recovery"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Keep the tab in sync when the URL hash changes (#auth/signup, ...).
  useEffect(() => {
    setMode(authMode);
  }, [authMode]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setNotice("");
    const target = m === "signin" ? "#auth" : `#auth/${m}`;
    if (window.location.hash !== target) window.location.hash = target;
  };

  const handleGoogle = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      // Redirect flow — the browser leaves to Google, then supabase-js
      // recovers the session from the return URL automatically.
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || "Couldn't start Google sign-in. Try again.");
      setBusy(false);
    }
  };

  const goBack = () => {
    window.location.hash = authBackTarget();
  };

  const done = () => {
    window.location.hash = authDestination();
  };

  const submitRecovery = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (newPw.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(newPw);
      justAuthed.current = true;
      // Drop the recovery tokens from the URL, then land on the profile.
      window.location.hash = "#profile";
    } catch (err) {
      setError(err.message || "Couldn't update the password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn({ email: form.email, password: form.password });
        justAuthed.current = true;
        done();
      } else if (mode === "signup") {
        if (!form.name.trim()) {
          throw new Error("Please add your name.");
        }
        const data = await signUp({
          name: form.name.trim(),
          email: form.email,
          password: form.password,
          phone: form.phone.trim(),
        });
        if (!data.session) {
          switchMode("signin");
          setNotice("Account created — sign in to continue.");
        } else {
          justAuthed.current = true;
          done();
        }
      } else {
        if (!form.email.trim()) throw new Error("Enter your email address.");
        await resetPassword(form.email);
        setNotice("Password reset link sent — check your inbox.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Password reset in progress — show the "choose a new password" form.
  if (recoveryMode) {
    return (
      <div className="page">
        <header className="page-head reveal in">
          <div className="kicker">Reset your password</div>
          <h1>
            New password<span className="outline">.</span>
          </h1>
          <p className="lede">
            Choose a new password for your FesGH account.
          </p>
        </header>
        <Reveal>
          <div className="form-panel">
            <form onSubmit={submitRecovery}>
              <div className="field">
                <label htmlFor="new-pw">New password</label>
                <div className="pw-wrap">
                  <input
                    id="new-pw"
                    type={showPw ? "text" : "password"}
                    className="input"
                    placeholder="••••••••"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => !s)}
                  >
                    <i className={`fa-solid ${showPw ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="confirm-pw">Confirm new password</label>
                <input
                  id="confirm-pw"
                  type={showPw ? "text" : "password"}
                  className="input"
                  placeholder="••••••••"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              {error && (
                <p className="auth-msg error" role="alert">
                  <i className="fa-solid fa-circle-exclamation" /> {error}
                </p>
              )}
              {notice && (
                <p className="auth-msg notice">
                  <i className="fa-solid fa-envelope" /> {notice}
                </p>
              )}
              <button
                type="submit"
                className="btn"
                style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                disabled={busy || authLoading}
              >
                {authLoading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin icon" /> Checking session…
                  </>
                ) : busy ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin icon" /> Updating…
                  </>
                ) : (
                  <>
                    Set new password <i className="fa-solid fa-arrow-right icon" />
                  </>
                )}
              </button>
            </form>
          </div>
        </Reveal>
      </div>
    );
  }

  // Already signed in (e.g. visiting #auth directly) — offer a way out.
  // `justAuthed` suppresses this panel for the frame between a successful
  // sign-in and the hashchange that routes the user away.
  if (user && !justAuthed.current) {
    return (
      <div className="page">
        <header className="page-head reveal in">
          <div className="kicker">Your ticket to the scene</div>
          <h1>
            Signed in<span className="outline">.</span>
          </h1>
          <p className="lede">
            You're on the list, {name}. Your parties, reviews and passes are
            synced and ready.
          </p>
        </header>
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-circle-check" />
          </div>
          <h2>Welcome back</h2>
          <p>
            Head to your profile to manage your parties, reviews and tickets.
          </p>
          <div className="gate-actions">
            <button
              className="btn"
              onClick={() => {
                window.location.hash = "#profile";
              }}
            >
              Go to profile <i className="fa-solid fa-arrow-right icon" />
            </button>
            <button className="btn btn-outline" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <button className="back-link" onClick={goBack}>
        <i className="fa-solid fa-arrow-left" /> Back
      </button>

      <header className="page-head reveal in">
        <div className="kicker">Your ticket to the scene</div>
        <h1>
          {mode === "signup" ? "Join" : mode === "forgot" ? "Reset" : "Sign in"}
          <span className="outline">.</span>
        </h1>
        <p className="lede">
          {mode === "forgot"
            ? "Enter your email and we'll send you a link to reset your password."
            : "One account for posting parties, writing reviews and keeping your passes across devices."}
        </p>
      </header>

      <Reveal>
        <div className="form-panel">
          {mode !== "forgot" && (
            <>
              <button
                type="button"
                className="btn btn-outline btn-google"
                onClick={handleGoogle}
                disabled={busy}
              >
                <i className="fa-brands fa-google" />
                {busy ? "One moment…" : "Continue with Google"}
              </button>
              <div className="auth-divider">or</div>
            </>
          )}

          {mode !== "forgot" && (
            <div className="auth-tabs">
              <button
                className={`auth-tab ${mode === "signin" ? "active" : ""}`}
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
              <button
                className={`auth-tab ${mode === "signup" ? "active" : ""}`}
                onClick={() => switchMode("signup")}
              >
                Create account
              </button>
            </div>
          )}

          <form onSubmit={submit}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="auth-name">Your name</label>
                <input
                  id="auth-name"
                  className="input"
                  placeholder="e.g. Kwame Asante"
                  value={form.name}
                  onChange={set("name")}
                  autoComplete="name"
                />
              </div>
            )}

            {mode === "signup" && (
              <div className="field">
                <label htmlFor="auth-phone">
                  Phone number (MTN / Vodafone / AirtelTigo / Telecel)
                </label>
                <input
                  id="auth-phone"
                  className="input"
                  type="tel"
                  placeholder="+233 20 000 0000"
                  value={form.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                />
                <small
                  style={{
                    display: "block",
                    marginTop: 6,
                    fontSize: 12,
                    color: "var(--ink-soft)",
                    lineHeight: 1.5,
                  }}
                >
                  Where your ticket-share payouts land when you host or
                  repost a party.
                </small>
              </div>
            )}

            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                className="input"
                placeholder="you@email.com"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                required
              />
            </div>

            {mode !== "forgot" && (
              <div className="field">
                <label htmlFor="auth-password">Password</label>
                <div className="pw-wrap">
                  <input
                    id="auth-password"
                    type={showPw ? "text" : "password"}
                    className="input"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={set("password")}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => !s)}
                  >
                    <i className={`fa-solid ${showPw ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
              </div>
            )}

            {mode === "signin" && (
              <button
                type="button"
                className="forgot-link"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            )}

            {error && (
              <p className="auth-msg error" role="alert">
                <i className="fa-solid fa-circle-exclamation" /> {error}
              </p>
            )}
            {notice && (
              <p className="auth-msg notice">
                <i className="fa-solid fa-envelope" /> {notice}
              </p>
            )}

            <button
              type="submit"
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              disabled={busy}
            >
              {busy ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin icon" /> One moment…
                </>
              ) : mode === "signup" ? (
                <>
                  Create account <i className="fa-solid fa-arrow-right icon" />
                </>
              ) : mode === "forgot" ? (
                "Send reset link"
              ) : (
                <>
                  Sign in <i className="fa-solid fa-arrow-right icon" />
                </>
              )}
            </button>
          </form>

          <p className="auth-foot">
            Powered by Supabase — secure email and Google sign-in.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
