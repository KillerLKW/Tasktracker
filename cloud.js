"use strict";

// No third-party runtime. Supabase Auth/REST and the documented Realtime v1 protocol.
// Only a public project URL/key may be supplied here. Never add a secret/service_role key.
const trackerCloud = (() => {
  const defaults = { url: "", key: "" };
  let config = null, session = null, refreshing = null, stopRealtime = () => {};
  const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  function validateConfig(value) {
    const url = String(value.url || "").trim().replace(/\/$/, "");
    const key = String(value.key || "").trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error("Bitte die HTTPS-Projekt-URL aus Supabase eingeben (https://…supabase.co).");
    let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!publicKey && key.startsWith("eyJ")) {
      try { publicKey = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; } catch {}
    }
    if (!publicKey) throw new Error("Nur den öffentlichen Publishable- oder anon-Key verwenden. Secret- und service_role-Keys sind hier nicht erlaubt.");
    return { url, key };
  }
  function validSession(value) {
    return value && value.project === config?.url && uuid(value.user?.id) &&
      typeof value.access_token === "string" && typeof value.refresh_token === "string" && Number.isFinite(value.expires_at);
  }
  async function init() {
    const saved = await taskStorage.loadCloudConfig();
    if (saved || defaults.url) config = validateConfig(saved || defaults);
    const stored = await taskStorage.loadCloudSession();
    if (validSession(stored)) session = stored;
  }
  async function configure(value) {
    const next = validateConfig(value);
    stopRealtime();
    if (next.url !== config?.url || next.key !== config?.key) {
      await taskStorage.saveCloudSession(null);
      session = null;
    }
    await taskStorage.saveCloudConfig(next);
    config = next;
  }
  async function request(path, { method = "GET", body, token } = {}) {
    if (!config) throw new Error("Bitte zuerst dein Supabase-Projekt einrichten.");
    const response = await fetch(config.url + path, { method, credentials: "omit", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(12000), headers: { apikey: config.key, ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const message = detail.code === "40001" ? "Der Cloud-Stand wurde inzwischen geändert." :
        response.status === 401 || response.status === 403 ? "Anmeldung oder Berechtigung fehlt. Bitte erneut anmelden und die Supabase-Einrichtung prüfen." :
        response.status === 400 && path.includes("/auth/") ? "Anmeldung nicht möglich. E-Mail, Passwort und E-Mail-Bestätigung prüfen." :
        response.status === 404 ? "Supabase-Einrichtung fehlt. Bitte das SQL-Skript im Projekt ausführen." :
        response.status === 429 ? "Supabase begrenzt gerade die Anfragen. Bitte kurz warten." : "Supabase ist momentan nicht erreichbar (HTTP " + response.status + ").";
      throw Object.assign(new Error(message), { status: response.status, conflict: detail.code === "40001" });
    }
    return response.status === 204 ? null : response.json();
  }
  async function remember(value) {
    const next = { ...value, project: config.url, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in };
    if (!validSession(next)) throw new Error("Supabase hat keine gültige Sitzung geliefert.");
    await taskStorage.saveCloudSession(next);
    session = next;
    return session;
  }
  async function signIn(email, password) {
    return remember(await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }));
  }
  async function signUp(email, password) {
    const value = await request("/auth/v1/signup", { method: "POST", body: { email, password } });
    if (value.access_token) await remember(value);
    return !!session;
  }
  async function access(force = false) {
    if (!session) throw new Error("Bitte bei Supabase anmelden.");
    if (!force && session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
    if (!refreshing) {
      const refresh = async () => {
        const stored = await taskStorage.loadCloudSession();
        if (!validSession(stored) || stored.user.id !== session.user.id) throw new Error("Die Sitzung wurde in einem anderen Fenster beendet. Bitte erneut anmelden.");
        session = stored;
        if (session.expires_at * 1000 <= Date.now() + 60000 || force) {
          await remember(await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } }));
        }
        return session.access_token;
      };
      refreshing = (navigator.locks ? navigator.locks.request("tasktracker-cloud-auth", refresh) : refresh()).finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function authenticated(path, options = {}) {
    try { return await request(path, { ...options, token: await access() }); }
    catch (error) {
      if (error.status !== 401) throw error;
      return request(path, { ...options, token: await access(true) });
    }
  }
  function row(value) {
    if (!value || value.owner_id !== session?.user.id || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("Ungültige Cloud-Version. Der lokale Stand bleibt erhalten.");
    trackerMerge.validate(value.document);
    return value;
  }
  async function get() {
    const result = await authenticated("/rest/v1/tasktracker_documents?select=owner_id,document,revision,updated_at&owner_id=eq." + session.user.id);
    if (!Array.isArray(result) || result.length > 1) throw new Error("Ungültige Cloud-Antwort.");
    return result.length ? row(result[0]) : null;
  }
  async function put(document, revision) {
    trackerMerge.validate(document);
    if (new Blob([JSON.stringify(document)]).size > 16 * 1024 * 1024) throw new Error("Der Tracker ist größer als 16 MiB. Bitte große eingebettete Anhänge vor der Cloud-Übertragung auslagern. Die lokale Datei bleibt erhalten.");
    return row(await authenticated("/rest/v1/rpc/save_tasktracker", { method: "POST", body: { expected_revision: revision, tracker_document: document } }));
  }
  async function signOut() {
    stopRealtime();
    try { if (session) await authenticated("/auth/v1/logout?scope=local", { method: "POST" }); }
    finally { await taskStorage.saveCloudSession(null); session = null; }
  }
  function subscribe(onChange) {
    stopRealtime();
    let stopped = false, socket, heartbeat, retry, serial = 1, lastReply = Date.now();
    const close = () => { clearInterval(heartbeat); if (socket) { socket.onclose = null; socket.close(); socket = null; } };
    const connect = async () => {
      try {
        const token = await access();
        if (stopped) return;
        const topic = "realtime:tasktracker-" + session.user.id;
        socket = new WebSocket(config.url.replace("https:", "wss:") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(config.key) + "&vsn=1.0.0");
        const send = (event, payload, channel = topic) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ topic: channel, event, payload, ref: String(serial++), join_ref: channel === topic ? "1" : null }));
        socket.onopen = () => {
          lastReply = Date.now();
          send("phx_join", { access_token: token, config: { private: false, broadcast: { ack: false, self: false }, presence: { enabled: false },
            postgres_changes: [{ event: "*", schema: "public", table: "tasktracker_documents", filter: "owner_id=eq." + session.user.id }] } });
          heartbeat = setInterval(async () => {
            if (Date.now() - lastReply > 55000) { socket?.close(); return; }
            try { send("access_token", { access_token: await access() }); send("heartbeat", {}, "phoenix"); } catch { socket?.close(); }
          }, 25000);
        };
        socket.onmessage = event => {
          try {
            const message = JSON.parse(event.data);
            if (message.event === "phx_reply") lastReply = Date.now();
            if (message.event === "postgres_changes" || (message.event === "phx_reply" && message.payload?.status === "ok")) onChange();
            if (message.event === "phx_error" || message.event === "phx_close" || (message.event === "phx_reply" && message.payload?.status === "error")) socket?.close();
          } catch { /* Malformed notifications never become tracker data. */ }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => { clearInterval(heartbeat); if (!stopped) retry = setTimeout(connect, 5000); };
      } catch { if (!stopped) retry = setTimeout(connect, 10000); }
    };
    stopRealtime = () => { stopped = true; clearTimeout(retry); close(); };
    connect();
    return stopRealtime;
  }
  return { init, configure, validateConfig, signIn, signUp, signOut, get, put, subscribe, stop: () => stopRealtime(),
    get config() { return config; }, get session() { return session; } };
})();
