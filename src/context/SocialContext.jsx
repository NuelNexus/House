import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Query } from "appwrite";
import { appwrite, databases, storage, DB_ID, COLLECTIONS, MEDIA_BUCKET, ID } from "../lib/appwrite";
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
    const map = {};
    try {
      for (let i = 0; i < clean.length; i += 50) {
        const batch = clean.slice(i, i + 50);
        const res = await databases.listDocuments(DB_ID, COLLECTIONS.profiles, [
          Query.equal("$id", batch),
        ]);
        (res.documents || []).forEach((p) => {
          map[p.$id] = { ...p, id: p.$id };
        });
      }
    } catch {
      /* collection missing — graceful */
    }
    return map;
  }, []);

  // ============================================================
  // FOLLOWS
  // ============================================================
  const [following, setFollowing] = useState([]);
  const [myFollowers, setMyFollowers] = useState(0);
  const [followCounts, setFollowCounts] = useState({});

  const loadFollows = useCallback(async () => {
    const me = uidRef.current;
    if (!me) {
      setFollowing([]);
      setMyFollowers(0);
      return;
    }
    try {
      const [outgoing, incoming] = await Promise.all([
        databases.listDocuments(DB_ID, COLLECTIONS.follows, [
          Query.equal("follower_id", me),
          Query.limit(1000),
        ]),
        databases.listDocuments(DB_ID, COLLECTIONS.follows, [
          Query.equal("following_id", me),
          Query.limit(1000),
        ]),
      ]);
      setFollowing((outgoing.documents || []).map((r) => r.following_id));
      setMyFollowers(incoming.total ?? 0);
    } catch {
      /* not signed in — ignore */
    }
  }, []);

  useEffect(() => {
    loadFollows();
  }, [loadFollows]);

  const isFollowing = useCallback((id) => following.includes(id), [following]);

  const loadFollowCounts = useCallback(async (targetId) => {
    if (!targetId) return;
    try {
      const [incoming, outgoing] = await Promise.all([
        databases.listDocuments(DB_ID, COLLECTIONS.follows, [
          Query.equal("following_id", targetId),
          Query.limit(1000),
        ]),
        databases.listDocuments(DB_ID, COLLECTIONS.follows, [
          Query.equal("follower_id", targetId),
          Query.limit(1000),
        ]),
      ]);
      setFollowCounts((p) => ({
        ...p,
        [targetId]: {
          followers: incoming.total ?? 0,
          following: outgoing.total ?? 0,
        },
      }));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleFollow = useCallback(
    async (targetId) => {
      const me = uidRef.current;
      if (!me) return false;
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
      try {
        const res = await databases.listDocuments(DB_ID, COLLECTIONS.follows, [
          Query.equal("follower_id", me),
          Query.equal("following_id", targetId),
        ]);
        if (res.documents.length) {
          await databases.deleteDocument(
            DB_ID,
            COLLECTIONS.follows,
            res.documents[0].$id
          );
        } else {
          await databases.createDocument(
            DB_ID,
            COLLECTIONS.follows,
            ID.unique(),
            { follower_id: me, following_id: targetId },
            [`read("any")`, `write("user:${me}")`]
          );
        }
      } catch (e) {
        console.warn("follow sync:", e.message);
      }
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

  const loadThread = useCallback(async (other) => {
    const me = uidRef.current;
    if (!me || !other) return;
    try {
      const res = await databases.listDocuments(DB_ID, COLLECTIONS.messages, [
        Query.or([
          Query.and([Query.equal("sender_id", me), Query.equal("recipient_id", other)]),
          Query.and([Query.equal("sender_id", other), Query.equal("recipient_id", me)]),
        ]),
        Query.limit(1000),
      ]);
      const msgs = (res.documents || []).sort((a, b) =>
        a.$createdAt.localeCompare(b.$createdAt)
      );
      setThreads((p) => ({ ...p, [other]: msgs }));
    } catch {
      /* ignore */
    }
  }, []);

  const markRead = useCallback(async (other) => {
    const me = uidRef.current;
    if (!me || !other) return;
    setUnread((p) => ({ ...p, [other]: 0 }));
    try {
      const res = await databases.listDocuments(DB_ID, COLLECTIONS.messages, [
        Query.equal("recipient_id", me),
        Query.equal("sender_id", other),
        Query.isNull("read_at"),
        Query.limit(100),
      ]);
      await Promise.all(
        (res.documents || []).map((m) =>
          databases.updateDocument(DB_ID, COLLECTIONS.messages, m.$id, {
            read_at: new Date().toISOString(),
          })
        )
      );
    } catch {
      /* ignore */
    }
  }, []);

  const openThread = useCallback(
    (other) => {
      activeThreadRef.current = other;
      loadThread(other);
      markRead(other);
    },
    [loadThread, markRead]
  );

  const sendMessage = useCallback(async (recipientId, body) => {
    const me = uidRef.current;
    if (!me || !recipientId || !body.trim()) return null;
    const now = new Date().toISOString();
    const optimistic = {
      $id: `local-${Date.now()}`,
      sender_id: me,
      recipient_id: recipientId,
      body: body.trim(),
      created_at: now,
      read_at: null,
    };
    setThreads((p) => ({
      ...p,
      [recipientId]: [...(p[recipientId] || []), optimistic],
    }));
    try {
      await databases.createDocument(
        DB_ID,
        COLLECTIONS.messages,
        ID.unique(),
        {
          sender_id: me,
          recipient_id: recipientId,
          body: optimistic.body,
          created_at: now,
        },
        [
          `read("user:${me}")`,
          `read("user:${recipientId}")`,
          `write("user:${me}")`,
          `write("user:${recipientId}")`,
        ]
      );
    } catch (e) {
      console.warn("send message:", e.message);
    }
    return optimistic;
  }, []);

  const refreshSocial = useCallback(async () => {
    const me = uidRef.current;
    if (!me) {
      setConversations([]);
      setUnread({});
      return;
    }
    let convRes, unreadRes;
    try {
      [convRes, unreadRes] = await Promise.all([
        databases.listDocuments(DB_ID, COLLECTIONS.messages, [
          Query.or([Query.equal("sender_id", me), Query.equal("recipient_id", me)]),
          Query.limit(300),
        ]),
        databases.listDocuments(DB_ID, COLLECTIONS.messages, [
          Query.equal("recipient_id", me),
          Query.isNull("read_at"),
          Query.limit(500),
        ]),
      ]);
    } catch {
      return;
    }
    const unreadMap = {};
    (unreadRes.documents || []).forEach((m) => {
      if (m.sender_id !== me) unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
    });
    setUnread(unreadMap);

    // Newest-first (Appwrite's list order isn't guaranteed) — the first
    // message per partner below is the latest one.
    const convDocs = (convRes.documents || []).sort((a, b) =>
      (b.created_at || b.$createdAt).localeCompare(a.created_at || a.$createdAt)
    );
    const byOther = new Map();
    convDocs.forEach((m) => {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!byOther.has(other)) byOther.set(other, m);
    });
    const profs = await fetchProfiles([...byOther.keys()]);
    const list = [...byOther.entries()].map(([other, last]) => ({
      other,
      name: profs[other]?.name || "Festivity member",
      avatar: profs[other] || null,
      lastBody: last.body,
      lastAt: last.created_at || last.$createdAt,
      lastMine: last.sender_id === me,
    }));
    list.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    setConversations(list);

    if (activeThreadRef.current) loadThread(activeThreadRef.current);
  }, [fetchProfiles, loadThread]);

  // Realtime (Appwrite pushes events for docs this user can read) plus
  // a light polling fallback so the inbox always refreshes.
  useEffect(() => {
    if (!uid) return undefined;
    let active = true;
    refreshSocial();
    // Reload the follow graph + feed too — the mount-only effects above
    // ran while signed out, so this catches the state after sign-in.
    loadFollows();
    loadHype();
    let unsub = () => {};
    try {
      unsub = appwrite.subscribe(
        [
          `databases.${DB_ID}.collections.${COLLECTIONS.messages}.documents`,
          `databases.${DB_ID}.collections.${COLLECTIONS.follows}.documents`,
          `databases.${DB_ID}.collections.${COLLECTIONS.hypes}.documents`,
        ],
        () => {
          if (!active) return;
          refreshSocial();
          loadFollows();
          loadHype();
        }
      );
    } catch {
      /* realtime unavailable — poll handles it */
    }
    const poll = window.setInterval(() => {
      if (active) {
        refreshSocial();
        loadFollows();
        loadHype();
      }
    }, 12000);
    return () => {
      active = false;
      unsub();
      window.clearInterval(poll);
    };
  }, [uid, refreshSocial, loadFollows, loadHype]);

  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((n, c) => n + c, 0),
    [unread]
  );

  // ============================================================
  // PEOPLE (searchable user list for messaging / sending hype)
  // ============================================================
  const [people, setPeople] = useState([]);
  const loadPeople = useCallback(async () => {
    try {
      const res = await databases.listDocuments(DB_ID, COLLECTIONS.profiles, [
        Query.limit(300),
      ]);
      setPeople(
        (res.documents || [])
          .filter((p) => p.$id !== uidRef.current)
          .map((p) => ({ ...p, id: p.$id }))
      );
    } catch {
      /* collection missing — graceful */
    }
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
    try {
      const [feedRes, inboxRes] = await Promise.all([
        databases.listDocuments(DB_ID, COLLECTIONS.hypes, [
          Query.isNull("recipient_id"),
          Query.limit(60),
        ]),
        me
          ? databases.listDocuments(DB_ID, COLLECTIONS.hypes, [
              Query.equal("recipient_id", me),
              Query.limit(40),
            ])
          : Promise.resolve({ documents: [] }),
      ]);
      // Newest-first — Appwrite's list order isn't guaranteed.
      const feedDocs = (feedRes.documents || []).sort((a, b) =>
        (b.created_at || b.$createdAt).localeCompare(a.created_at || a.$createdAt)
      );
      const inboxDocs = (inboxRes.documents || []).sort((a, b) =>
        (b.created_at || b.$createdAt).localeCompare(a.created_at || a.$createdAt)
      );
      const authorIds = [
        ...new Set([...feedDocs, ...inboxDocs].map((h) => h.user_id).filter(Boolean)),
      ];
      const profs = await fetchProfiles(authorIds);
      setHypeFeed(
        feedDocs.map((h) => ({
          ...h,
          id: h.$id,
          author: profs[h.user_id] || null,
        }))
      );
      setIncomingHypes(
        inboxDocs.map((h) => ({
          ...h,
          id: h.$id,
          author: profs[h.user_id] || null,
        }))
      );
      if (me) {
        const st = await databases.listDocuments(DB_ID, COLLECTIONS.streaks, [
          Query.or([Query.equal("user_a", me), Query.equal("user_b", me)]),
        ]);
        const partners = (st.documents || []).map((s) =>
          s.user_a === me ? s.user_b : s.user_a
        );
        const pMap = await fetchProfiles(partners);
        setStreaks(
          (st.documents || []).map((s) => {
            const partner = s.user_a === me ? s.user_b : s.user_a;
            return {
              ...s,
              id: s.$id,
              partner,
              partnerName: pMap[partner]?.name || "Friend",
            };
          })
        );
      } else {
        setStreaks([]);
      }
    } catch {
      /* collection missing — graceful */
    }
    setHypeLoading(false);
  }, [fetchProfiles]);

  useEffect(() => {
    loadHype();
  }, [loadHype]);

  const uploadVideo = useCallback(async (blob, name) => {
    const me = uidRef.current;
    if (!me) throw new Error("Sign in to post hype");
    const created = await storage.createFile(MEDIA_BUCKET, ID.unique(), blob);
    return storage.getFileView(MEDIA_BUCKET, created.$id).href;
  }, []);

  // Snapchat-style streak: consecutive days of hypes between a pair.
  const bumpStreak = useCallback(async (partnerId) => {
    const me = uidRef.current;
    if (!me || !partnerId) return;
    const a = me < partnerId ? me : partnerId;
    const b = me < partnerId ? partnerId : me;
    const today = localDate();
    const yesterday = localDate(new Date(Date.now() - 86400000));
    let streak = 1;
    try {
      const res = await databases.listDocuments(DB_ID, COLLECTIONS.streaks, [
        Query.equal("user_a", a),
        Query.equal("user_b", b),
      ]);
      if (res.documents.length) {
        const doc = res.documents[0];
        if (doc.last_date === today) streak = doc.streak ?? 1;
        else if (doc.last_date === yesterday) streak = (doc.streak ?? 1) + 1;
        else streak = 1;
        await databases.updateDocument(DB_ID, COLLECTIONS.streaks, doc.$id, {
          streak,
          last_date: today,
        });
      } else {
        await databases.createDocument(
          DB_ID,
          COLLECTIONS.streaks,
          ID.unique(),
          { user_a: a, user_b: b, streak, last_date: today },
          [
            `read("user:${a}")`,
            `read("user:${b}")`,
            `write("user:${a}")`,
            `write("user:${b}")`,
          ]
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const postHype = useCallback(
    async ({ blob, name, caption, recipientId }) => {
      const me = uidRef.current;
      if (!me) throw new Error("Sign in to post hype");
      const videoUrl = await uploadVideo(blob, name);
      const data = {
        user_id: me,
        video_url: videoUrl,
        caption: (caption || "").trim(),
        created_at: new Date().toISOString(),
      };
      if (recipientId) data.recipient_id = recipientId;
      const perms = recipientId
        ? [
            `read("user:${me}")`,
            `read("user:${recipientId}")`,
            `write("user:${me}")`,
          ]
        : [`read("any")`, `write("user:${me}")`];
      await databases.createDocument(DB_ID, COLLECTIONS.hypes, ID.unique(), data, perms);
      if (recipientId) await bumpStreak(recipientId);
      notify(
        recipientId ? "Hype sent — keep the streak alive 🔥" : "Your hype is live!"
      );
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
      const senderId = uidRef.current;
      const data = {
        sender_name: senderName || "",
        event_name: eventName || "",
        host_name: hostName || "",
        kind: kind || "contact",
        body,
        created_at: new Date().toISOString(),
      };
      const perms = senderId
        ? [`read("user:${senderId}")`, `write("user:${senderId}")`]
        : [`write("any")`];
      try {
        if (senderId) data.sender_id = senderId;
        await databases.createDocument(
          DB_ID,
          COLLECTIONS.contactRequests,
          ID.unique(),
          data,
          perms
        );
      } catch (e) {
        throw new Error(e.message);
      }
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
