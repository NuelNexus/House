import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useStore } from "./StoreContext";

const SocialContext = createContext(null);

// Local (not UTC) calendar date — streak logic runs on the user's day.
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function SocialProvider({ children }) {
  const { user } = useAuth();
  const { notify } = useStore();
  const uid = user?.id ?? null;
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  // ---------- profile lookup helper ----------
  const fetchProfiles = useCallback(async (ids) => {
    const clean = [...new Set((ids || []).filter(Boolean))];
    if (!clean.length) return {};
    const { data } = await supabase
      .from("profiles")
      .select("id, name, avatar, avatar_url")
      .in("id", clean);
    const map = {};
    (data || []).forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, []);

  // ============================================================
  // FOLLOWS
  // ============================================================
  const [following, setFollowing] = useState([]);
  const [myFollowers, setMyFollowers] = useState(0);
  const [followCounts, setFollowCounts] = useState({});

  const loadFollows = useCallback(async () => {
    if (!uidRef.current) {
      setFollowing([]);
      setMyFollowers(0);
      return;
    }
    const me = uidRef.current;
    const [outgoing, incoming] = await Promise.all([
      supabase.from("follows").select("following_id").eq("follower_id", me),
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", me),
    ]);
    if (!outgoing.error) setFollowing((outgoing.data || []).map((r) => r.following_id));
    setMyFollowers(incoming.count ?? 0);
  }, []);

  useEffect(() => {
    loadFollows();
  }, [loadFollows]);

  const isFollowing = useCallback((id) => following.includes(id), [following]);

  const loadFollowCounts = useCallback(async (targetId) => {
    if (!targetId) return;
    const [incoming, outgoing] = await Promise.all([
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", targetId),
      supabase
        .from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", targetId),
    ]);
    setFollowCounts((p) => ({
      ...p,
      [targetId]: { followers: incoming.count ?? 0, following: outgoing.count ?? 0 },
    }));
  }, []);

  const toggleFollow = useCallback(
    async (targetId) => {
      if (!uidRef.current) return false;
      const has = following.includes(targetId);
      // Optimistic local update — feels instant, cloud sync follows.
      setFollowing((p) => (has ? p.filter((x) => x !== targetId) : [...p, targetId]));
      setFollowCounts((p) => ({
        ...p,
        [targetId]: {
          ...(p[targetId] || {}),
          followers: (p[targetId]?.followers ?? 0) + (has ? -1 : 1),
        },
      }));
      const { error } = has
        ? await supabase
            .from("follows")
            .delete()
            .eq("follower_id", uidRef.current)
            .eq("following_id", targetId)
        : await supabase
            .from("follows")
            .insert({ follower_id: uidRef.current, following_id: targetId });
      if (error) console.warn("follow sync:", error.message);
      notify(has ? "Unfollowed" : "Now following");
      return !has;
    },
    [following, notify]
  );

  // ============================================================
  // MESSENGER
  // ============================================================
  const [conversations, setConversations] = useState([]);
  const [threads, setThreads] = useState({});
  const [unread, setUnread] = useState({});
  const activeThreadRef = useRef(null);

  const loadThread = useCallback(
    async (other) => {
      const me = uidRef.current;
      if (!me || !other) return;
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`
        )
        .order("created_at", { ascending: true });
      if (!error) setThreads((p) => ({ ...p, [other]: data || [] }));
    },
    []
  );

  const markRead = useCallback(
    async (other) => {
      const me = uidRef.current;
      if (!me || !other) return;
      setUnread((p) => ({ ...p, [other]: 0 }));
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", me)
        .eq("sender_id", other)
        .is("read_at", null);
    },
    []
  );

  const openThread = useCallback(
    (other) => {
      activeThreadRef.current = other;
      loadThread(other);
      markRead(other);
    },
    [loadThread, markRead]
  );

  const sendMessage = useCallback(
    async (recipientId, body) => {
      const me = uidRef.current;
      if (!me || !recipientId || !body.trim()) return null;
      const optimistic = {
        id: `local-${Date.now()}`,
        sender_id: me,
        recipient_id: recipientId,
        body: body.trim(),
        created_at: new Date().toISOString(),
        read_at: null,
      };
      setThreads((p) => ({
        ...p,
        [recipientId]: [...(p[recipientId] || []), optimistic],
      }));
      const { error } = await supabase.from("messages").insert({
        sender_id: me,
        recipient_id: recipientId,
        body: optimistic.body,
      });
      if (error) console.warn("send message:", error.message);
      return optimistic;
    },
    []
  );

  const refreshSocial = useCallback(async () => {
    const me = uidRef.current;
    if (!me) {
      setConversations([]);
      setUnread({});
      return;
    }
    const [convRes, unreadRes] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("messages")
        .select("sender_id")
        .eq("recipient_id", me)
        .is("read_at", null),
    ]);
    const unreadMap = {};
    (unreadRes.data || []).forEach((m) => {
      if (m.sender_id !== me) unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
    });
    setUnread(unreadMap);

    const byOther = new Map();
    (convRes.data || []).forEach((m) => {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!byOther.has(other)) byOther.set(other, m);
    });
    const profs = await fetchProfiles([...byOther.keys()]);
    const list = [...byOther.entries()].map(([other, last]) => ({
      other,
      name: profs[other]?.name || "Festivity member",
      avatar: profs[other] || null,
      lastBody: last.body,
      lastAt: last.created_at,
      lastMine: last.sender_id === me,
    }));
    list.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    setConversations(list);

    if (activeThreadRef.current) loadThread(activeThreadRef.current);
  }, [fetchProfiles, loadThread]);

  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((n, c) => n + c, 0),
    [unread]
  );

  // ============================================================
  // PEOPLE (searchable user list for messaging / sending hype)
  // ============================================================
  const [people, setPeople] = useState([]);
  const loadPeople = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, avatar, avatar_url")
      .limit(300);
    setPeople((data || []).filter((p) => p.id !== uidRef.current));
  }, []);

  useEffect(() => {
    if (uid) loadPeople();
  }, [uid, loadPeople]);

  // ============================================================
  // HYPE (short videos + streaks)
  // ============================================================
  const [hypeFeed, setHypeFeed] = useState([]);
  const [incomingHypes, setIncomingHypes] = useState([]);
  const [streaks, setStreaks] = useState([]);
  const [hypeLoading, setHypeLoading] = useState(false);

  const loadHype = useCallback(async () => {
    const me = uidRef.current;
    setHypeLoading(true);
    const [feedRes, inboxRes] = await Promise.all([
      supabase
        .from("hypes")
        .select("*")
        .is("recipient_id", null)
        .order("created_at", { ascending: false })
        .limit(60),
      me
        ? supabase
            .from("hypes")
            .select("*")
            .eq("recipient_id", me)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] }),
    ]);
    const authorIds = [
      ...new Set(
        [...(feedRes.data || []), ...(inboxRes.data || [])]
          .map((h) => h.user_id)
          .filter(Boolean)
      ),
    ];
    const profs = await fetchProfiles(authorIds);
    setHypeFeed(
      (feedRes.data || []).map((h) => ({ ...h, author: profs[h.user_id] || null }))
    );
    setIncomingHypes(
      (inboxRes.data || []).map((h) => ({ ...h, author: profs[h.user_id] || null }))
    );
    if (me) {
      const { data: st } = await supabase
        .from("hype_streaks")
        .select("*")
        .or(`user_a.eq.${me},user_b.eq.${me}`);
      const partners = (st || []).map((s) => (s.user_a === me ? s.user_b : s.user_a));
      const pMap = await fetchProfiles(partners);
      setStreaks(
        (st || []).map((s) => {
          const partner = s.user_a === me ? s.user_b : s.user_a;
          return {
            ...s,
            partner,
            partnerName: pMap[partner]?.name || "Friend",
          };
        })
      );
    } else {
      setStreaks([]);
    }
    setHypeLoading(false);
  }, [fetchProfiles]);

  useEffect(() => {
    loadHype();
  }, [loadHype]);

  // Realtime (if the tables are in the realtime publication) plus a light
  // polling fallback so the inbox, follows and hype feed always refresh.
  // Declared after the hype section so every callback it references is
  // already initialized (avoids a temporal-dead-zone crash on render).
  useEffect(() => {
    if (!uid) return undefined;
    let active = true;
    refreshSocial();
    // Reload the follow graph too — the mount-only effect above ran
    // while signed out, so this catches the state after sign-in.
    loadFollows();
    loadHype();
    const channel = supabase
      .channel("festivity-social")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          if (active) refreshSocial();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows" },
        () => {
          if (active) loadFollows();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hypes" },
        () => {
          // New hypes (public or sent to me) appear live in the feed.
          if (active) loadHype();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hype_streaks" },
        () => {
          // Keep the sidebar flame counts fresh too.
          if (active) loadHype();
        }
      )
      .subscribe();
    const poll = window.setInterval(() => {
      if (active) {
        refreshSocial();
        loadHype();
      }
    }, 12000);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [uid, refreshSocial, loadFollows, loadHype]);

  const uploadVideo = useCallback(async (blob, name) => {
    const me = uidRef.current;
    if (!me) throw new Error("Sign in to post hype");
    const path = `hype/${me}/${Date.now()}-${(name || "clip.webm").replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const bucket = supabase.storage.from("hype");
    const upload = () =>
      bucket.upload(path, blob, { contentType: blob.type || "video/webm" });
    let { error } = await upload();
    if (error) {
      // The bucket may not have been created yet — try to create it
      // (works when the role has storage perms), then retry once.
      const { error: createErr } = await supabase.storage.createBucket("hype", {
        public: true,
      });
      if (!createErr || /exist/i.test(createErr.message || "")) {
        ({ error } = await upload());
      }
      if (error) {
        throw new Error(
          "Couldn't upload — the 'hype' storage bucket is missing. Open Supabase → SQL Editor and run supabase/schema.sql, then try again."
        );
      }
    }
    const { data } = supabase.storage.from("hype").getPublicUrl(path);
    return data.publicUrl;
  }, []);

  // Hype flame between a pair: consecutive days of hypes sent back & forth.
  const bumpStreak = useCallback(async (partnerId) => {
    const me = uidRef.current;
    if (!me || !partnerId) return;
    const a = me < partnerId ? me : partnerId;
    const b = me < partnerId ? partnerId : me;
    const today = localDate();
    const yesterday = localDate(new Date(Date.now() - 86400000));
    const { data } = await supabase
      .from("hype_streaks")
      .select("*")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    let streak = 1;
    if (data) {
      if (data.last_date === today) streak = data.streak;
      else if (data.last_date === yesterday) streak = data.streak + 1;
      else streak = 1;
    }
    await supabase
      .from("hype_streaks")
      .upsert({ user_a: a, user_b: b, streak, last_date: today });
  }, []);

  const postHype = useCallback(
    async ({ blob, name, caption, recipientId }) => {
      const me = uidRef.current;
      if (!me) throw new Error("Sign in to post hype");
      const videoUrl = await uploadVideo(blob, name);
      const { error } = await supabase.from("hypes").insert({
        user_id: me,
        recipient_id: recipientId || null,
        video_url: videoUrl,
        caption: (caption || "").trim(),
      });
      if (error) throw new Error(error.message);
      if (recipientId) await bumpStreak(recipientId);
      notify(recipientId ? "Hype sent!" : "Your hype is live!");
      loadHype();
      return true;
    },
    [uploadVideo, bumpStreak, notify, loadHype]
  );

  // ============================================================
  // CONTACT REQUESTS (hosts without Festivity accounts)
  // ============================================================
  const sendContactRequest = useCallback(
    async ({ senderName, eventName, hostName, kind, body }) => {
      const { error } = await supabase.from("contact_requests").insert({
        sender_id: uidRef.current,
        sender_name: senderName || null,
        event_name: eventName,
        host_name: hostName,
        kind,
        body,
      });
      if (error) throw new Error(error.message);
      notify("Your message is on its way to the host");
    },
    [notify]
  );

  const value = useMemo(
    () => ({
      // follows
      following,
      myFollowers,
      isFollowing,
      toggleFollow,
      followCounts,
      loadFollowCounts,
      // messenger
      conversations,
      threads,
      unread,
      unreadTotal,
      openThread,
      sendMessage,
      markRead,
      refreshSocial,
      // people
      people,
      loadPeople,
      // hype
      hypeFeed,
      incomingHypes,
      streaks,
      hypeLoading,
      loadHype,
      postHype,
      // contact
      sendContactRequest,
      fetchProfiles,
    }),
    [
      following,
      myFollowers,
      isFollowing,
      toggleFollow,
      followCounts,
      loadFollowCounts,
      conversations,
      threads,
      unread,
      unreadTotal,
      openThread,
      sendMessage,
      markRead,
      refreshSocial,
      people,
      loadPeople,
      hypeFeed,
      incomingHypes,
      streaks,
      hypeLoading,
      loadHype,
      postHype,
      sendContactRequest,
      fetchProfiles,
    ]
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used within SocialProvider");
  return ctx;
}
