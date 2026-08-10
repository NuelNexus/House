import { useRef, useState } from "react";
import Avatar, { AVATAR_PALETTES } from "../components/Avatar";
import Reveal from "../components/Reveal";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function EditProfile({ setTab }) {
  const { user, authLoading, profile, saveProfile, openAuth, hypeByDefault, setHypeByDefault } =
    useAuth();
  const [form, setForm] = useState({
    name: profile?.name ?? "",
    bio: profile?.bio ?? "",
    avatar: profile?.avatar ?? 0,
    avatarUrl: profile?.avatarUrl ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, avatarUrl: pub?.publicUrl ?? null }));
    } catch (err) {
      setError(err.message || "Upload failed — is the avatars bucket set up?");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Your name can't be empty.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await saveProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar,
        avatarUrl: form.avatarUrl,
      });
      setTab("profile");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <button className="back-link" onClick={() => setTab("profile")}>
      <i className="fa-solid fa-arrow-left" /> Back to profile
    </button>
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Your corner of the scene</div>
      <h1>
        Edit profile<span className="outline">.</span>
      </h1>
      <p className="lede">
        Name, bio and photo — how the scene sees you.
      </p>
    </header>
  );

  if (authLoading) {
    return (
      <div className="page">
        <div className="profile-loader" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        {back}
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-user-pen" />
          </div>
          <h2>Sign in to edit your profile</h2>
          <p>Your profile only exists once you've got an account.</p>
          <button className="btn" onClick={() => openAuth("profile/edit")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {back}
      {head}

      <Reveal>
        <div className="form-panel">
          <form onSubmit={submit}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>
              <Avatar name={form.name || "?"} seed={form.avatar} src={form.avatarUrl} size={88} />
              <div>
                <div className="field-label">Photo</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin icon" /> Uploading…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-camera icon" />
                        {form.avatarUrl ? "Change photo" : "Upload photo"}
                      </>
                    )}
                  </button>
                  {form.avatarUrl && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setForm((f) => ({ ...f, avatarUrl: null }))}
                    >
                      Remove photo
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={uploadPhoto}
                  />
                </div>
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--ink-soft)", letterSpacing: 1 }}>
                  Max 2 MB · stored in the avatars bucket
                </p>
              </div>
            </div>

            <div className="field">
              <div className="field-label" style={{ marginBottom: 10 }}>
                Avatar colour
              </div>
              <div className="avatar-picker" role="radiogroup" aria-label="Avatar colour">
                {AVATAR_PALETTES.map(([a, b], i) => (
                  <button
                    type="button"
                    key={i}
                    role="radio"
                    aria-checked={form.avatar === i}
                    aria-label={`Avatar colour ${i + 1}`}
                    className={`swatch ${form.avatar === i ? "on" : ""}`}
                    style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                    onClick={() => setForm((f) => ({ ...f, avatar: i }))}
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="pe-name">Name</label>
              <input
                id="pe-name"
                className="input"
                placeholder="e.g. Kwame Asante"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="pe-bio">Bio</label>
              <textarea
                id="pe-bio"
                className="input"
                rows="4"
                placeholder="Tell the scene who you are..."
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              />
            </div>

            <div className="field">
              <label className="toggle-row" htmlFor="pe-hype-default">
                <input
                  id="pe-hype-default"
                  type="checkbox"
                  checked={hypeByDefault}
                  onChange={(e) => setHypeByDefault(e.target.checked)}
                />
                <span>
                  <b>Post my videos to the Hype feed by default</b>
                  <small>
                    Turn this off to keep new clips on your profile only.
                  </small>
                </span>
              </label>
            </div>

            {error && (
              <p style={{ color: "var(--rose-deep)", marginBottom: 14, fontSize: 14 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={busy || uploading}
            >
              {busy ? (
                "Saving..."
              ) : (
                <>
                  Save changes <i className="fa-solid fa-check icon" />
                </>
              )}
            </button>
          </form>
        </div>
      </Reveal>
    </div>
  );
}
