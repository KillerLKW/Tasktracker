"use strict";

// Public Google Cloud identifiers only. No client secret or service-account key.
const trackerDrive = (() => {
  const defaults = {
    clientId: '368601553759-9s51ks2idnt64ron9sfofibk4js2qu51.apps.googleusercontent.com',
    apiKey: 'AIzaSyDNLtOrf6UFvntJBy70BsxxT-tC4PYP1CI'
  };
  const scope = 'https://www.googleapis.com/auth/drive.file';
  const fields = 'id,title,mimeType,etag,version,labels(trashed)';
  let config = null, session = null, ready = false, preparing = null;
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{6,200}$/.test(value);
  const strong = value => typeof value === 'string' && /^"[^"\r\n]+"$/.test(value);
  function validateConfig(value) {
    const clientId = String(value.clientId || '').trim(), apiKey = String(value.apiKey || '').trim();
    if (!/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Bitte die OAuth-Client-ID für eine Webanwendung eingeben.');
    if (!/^AIza[A-Za-z0-9_-]{20,100}$/.test(apiKey)) throw new Error('Bitte den öffentlichen, auf die Website beschränkten Google-API-Key für die Dateiauswahl eingeben.');
    return { clientId, apiKey, projectNumber: clientId.split('-')[0] };
  }
  function storeSession() {
    try { if (session) sessionStorage.setItem('tasktracker-drive-session', JSON.stringify(session)); else sessionStorage.removeItem('tasktracker-drive-session'); }
    catch { /* The in-memory session remains usable; tokens never enter tracker exports. */ }
  }
  async function init() {
    const saved = await taskStorage.driveLoad('config');
    if (saved || defaults.clientId) config = validateConfig(saved || defaults);
    try {
      const stored = JSON.parse(sessionStorage.getItem('tasktracker-drive-session'));
      if (stored?.clientId === config?.clientId && typeof stored.token === 'string' && typeof stored.accountId === 'string' && stored.expiresAt > Date.now() + 30000) session = stored;
    } catch {}
  }
  async function configure(value) {
    const next = validateConfig(value);
    if (next.clientId !== config?.clientId || next.apiKey !== config?.apiKey) { session = null; storeSession(); ready = false; preparing = null; }
    await taskStorage.driveSave('config', next); config = next;
  }
  function script(src) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = src; element.async = true;
      const timer = setTimeout(() => { element.remove(); reject(new Error('Die Google-Anmeldung konnte nicht geladen werden. Bitte Verbindung oder Inhaltsblocker prüfen.')); }, 20000);
      element.onload = () => { clearTimeout(timer); resolve(); };
      element.onerror = () => { clearTimeout(timer); element.remove(); reject(new Error('Google konnte nicht geladen werden.')); };
      document.head.append(element);
    });
  }
  async function prepare() {
    if (!config) throw new Error('Bitte zuerst die Google-Projektangaben hinterlegen.');
    if (location.protocol !== 'https:') throw new Error('Die Google-Anmeldung ist über die HTTPS-Adresse der Website verfügbar.');
    if (ready) return;
    if (!preparing) preparing = (async () => {
      const results = await Promise.allSettled([
        window.google?.accounts?.oauth2 ? Promise.resolve() : script('https://accounts.google.com/gsi/client'),
        window.gapi ? Promise.resolve() : script('https://apis.google.com/js/api.js')
      ]);
      const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
      await new Promise((resolve, reject) => gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Die Drive-Dateiauswahl konnte nicht geladen werden.')), timeout: 20000, ontimeout: () => reject(new Error('Die Dateiauswahl benötigt zu lange. Bitte erneut versuchen.')) }));
      ready = true;
    })().catch(error => { preparing = null; throw error; });
    return preparing;
  }
  function requireSession() {
    if (!session || session.expiresAt <= Date.now() + 15000) {
      session = null; storeSession();
      throw Object.assign(new Error('Bitte die Google-Verbindung erneuern. Dein Arbeitsstand bleibt auf diesem Gerät gesichert.'), { auth: true });
    }
    return session;
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000), ...options,
      headers: { ...options.headers, Authorization: 'Bearer ' + requireSession().token } });
    if (response.ok) return response;
    const detail = await response.json().catch(() => ({}));
    if (response.status === 401) { session = null; storeSession(); }
    const message = response.status === 412 ? 'Die Drive-Datei wurde inzwischen geändert.' : response.status === 401 ? 'Bitte erneut mit Google verbinden.' :
      response.status === 404 ? 'Die Datei wurde nicht gefunden oder ist für diese App noch nicht freigegeben. Bitte über „Datei auswählen“ öffnen.' :
      response.status === 403 ? 'Google verweigert den Zugriff. Bitte Drive-/Picker-API, Projektangaben und Dateifreigabe prüfen.' :
      response.status === 429 ? 'Google begrenzt gerade die Anfragen. Deine Änderungen bleiben auf diesem Gerät.' : 'Google Drive ist momentan nicht verfügbar (HTTP ' + response.status + ').';
    throw Object.assign(new Error(message), { status: response.status, auth: response.status === 401, conflict: response.status === 412, missing: response.status === 404,
      retryAfter: Math.max(3, Number(response.headers.get('Retry-After')) || 10), reason: detail.error?.errors?.[0]?.reason });
  }
  function metadata(value) {
    if (!id(value?.id) || !strong(value.etag) || value.labels?.trashed || value.mimeType?.startsWith('application/vnd.google-apps.')) throw new Error('Diese Datei ist kein beschreibbarer JSON-Tracker mit gültiger Dateiversion.');
    return value;
  }
  async function info(fileId) {
    if (!id(fileId)) throw new Error('Ungültige Drive-Datei-ID.');
    return metadata(await (await request('https://www.googleapis.com/drive/v2/files/' + fileId + '?fields=' + encodeURIComponent(fields))).json());
  }
  async function get(fileId, etag = null) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await info(fileId);
      if (etag === before.etag) return { ...before, unchanged: true };
      const response = await request('https://www.googleapis.com/drive/v2/files/' + fileId + '?alt=media');
      if (Number(response.headers.get('Content-Length')) > 64 * 1024 * 1024) throw new Error('Die Trackerdatei ist größer als 64 MiB.');
      const text = await response.text();
      if (new Blob([text]).size > 64 * 1024 * 1024) throw new Error('Die Trackerdatei ist größer als 64 MiB.');
      const after = await info(fileId);
      if (before.etag !== after.etag) continue;
      const document = trackerFiles.parse(text); trackerMerge.validate(document);
      return { ...after, document };
    }
    throw new Error('Die Drive-Datei ändert sich gerade mehrfach. Bitte kurz warten; dein Stand bleibt erhalten.');
  }
  function multipart(properties, document) {
    const text = JSON.stringify(document, null, 2);
    if (new Blob([text]).size > 64 * 1024 * 1024) throw new Error('Die Trackerdatei ist größer als 64 MiB.');
    const boundary = 'tasktracker_' + crypto.randomUUID().replaceAll('-', '');
    return { headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(properties) + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + boundary + '--' };
  }
  async function replace(fileId, document, etag) {
    if (!id(fileId) || !strong(etag)) throw new Error('Ohne gültige Ausgangsversion wird keine Drive-Datei überschrieben.');
    const upload = multipart({ mimeType: 'application/json' }, document);
    return metadata(await (await request('https://www.googleapis.com/upload/drive/v2/files/' + fileId + '?uploadType=multipart&fields=' + encodeURIComponent(fields),
      { method: 'PUT', headers: { ...upload.headers, 'If-Match': etag }, body: upload.body })).json());
  }
  async function insert(fileId, name, document) {
    const upload = multipart({ id: fileId, title: name, mimeType: 'application/json' }, document);
    return metadata(await (await request('https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&fields=' + encodeURIComponent(fields), { method: 'POST', ...upload })).json());
  }
  async function reserveId() {
    const result = await (await request('https://www.googleapis.com/drive/v2/files/generateIds?maxResults=1&space=drive')).json();
    if (!id(result.ids?.[0])) throw new Error('Google hat keine neue Datei-ID geliefert.');
    return result.ids[0];
  }
  async function verifyWrites() {
    const fileId = await reserveId();
    const test = { version: 1, id: crypto.randomUUID(), name: 'Verbindungsprüfung', projects: [], tasks: [] };
    let created = false;
    try {
      const initial = await insert(fileId, '.tasktracker-verbindungspruefung-' + test.id + '.json', test); created = true;
      const first = await replace(fileId, { ...test, name: 'Prüfung 1' }, initial.etag);
      let staleRejected = false;
      try { await replace(fileId, { ...test, name: 'Veraltete Prüfung' }, initial.etag); } catch (error) { if (error.conflict) staleRejected = true; else throw error; }
      if (!staleRejected) throw new Error('Drive hat den Schutz vor veralteten Schreibvorgängen nicht bestätigt. Bestehende Tracker werden nicht überschrieben.');
      const parallel = await Promise.allSettled([replace(fileId, { ...test, name: 'Parallel 1' }, first.etag), replace(fileId, { ...test, name: 'Parallel 2' }, first.etag)]);
      if (parallel.filter(x => x.status === 'fulfilled').length !== 1 || parallel.filter(x => x.status === 'rejected' && x.reason.conflict).length !== 1) throw new Error('Der Schutz vor parallelen Änderungen konnte nicht bestätigt werden. Deine Trackerdateien bleiben unverändert.');
      requireSession().verified = true; storeSession();
    } finally {
      if (created) try { await request('https://www.googleapis.com/drive/v2/files/' + fileId + '/trash', { method: 'POST' }); } catch { /* Only a temporary test file may remain; never delete user files. */ }
    }
  }
  async function authorize() {
    if (!ready) throw new Error('Bitte zuerst die Google-Anmeldung laden.');
    const token = await new Promise((resolve, reject) => {
      google.accounts.oauth2.initTokenClient({ client_id: config.clientId, scope,
        callback: value => value.error ? reject(new Error('Die Google-Freigabe wurde nicht erteilt.')) : resolve(value),
        error_callback: () => reject(new Error('Die Google-Anmeldung wurde geschlossen oder blockiert. Bitte den Anmeldeknopf erneut betätigen.')) }).requestAccessToken({ prompt: '' });
    });
    if (!token.access_token || !Number.isFinite(Number(token.expires_in))) throw new Error('Google hat keine gültige Anmeldung geliefert.');
    session = { clientId: config.clientId, token: token.access_token, expiresAt: Date.now() + Number(token.expires_in) * 1000, verified: false };
    try {
      const user = (await (await request('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName)')).json()).user;
      if (typeof user?.permissionId !== 'string') throw new Error('Das Google-Konto konnte nicht zugeordnet werden.');
      session.accountId = user.permissionId; session.displayName = user.displayName || 'Google-Konto'; storeSession();
      await verifyWrites();
    } catch (error) { if (!session?.accountId) { session = null; storeSession(); } throw error; }
  }
  async function put(fileId, document, etag) {
    if (!requireSession().verified) throw new Error('Bitte die Drive-Verbindung zuerst erneut prüfen. Ohne bestätigten Versionsschutz wird keine Datei überschrieben.');
    trackerMerge.validate(document);
    const result = await replace(fileId, document, etag);
    // Read back the provider's actual content; do not adopt a stale local snapshot.
    const saved = await get(result.id);
    if (!trackerMerge.equal(saved.document, document)) throw Object.assign(new Error('Die Drive-Datei wurde direkt nach dem Speichern erneut geändert. Dein Stand bleibt für die Zusammenführung erhalten.'), { conflict: true });
    return saved;
  }
  async function create(name, document) {
    if (!requireSession().verified) throw new Error('Bitte zuerst mit Google verbinden und den Schreibzugriff prüfen.');
    if (!name?.trim() || !/\.json$/i.test(name) || /[\x00-\x1f/\\]/.test(name) || name.length > 200) throw new Error('Bitte einen Dateinamen mit .json angeben.');
    trackerMerge.validate(document);
    const key = 'create:' + config.clientId + ':' + session.accountId;
    let pending = await taskStorage.driveLoad(key);
    if (!pending) { pending = { id: await reserveId(), title: name.trim(), document: structuredClone(document) }; await taskStorage.driveSave(key, pending); }
    try {
      const existing = await get(pending.id);
      await taskStorage.driveSave(key, null); return existing;
    } catch (error) { if (!error.missing) throw error; }
    const saved = await insert(pending.id, pending.title, pending.document);
    await taskStorage.driveSave(key, null);
    return { ...saved, document: structuredClone(pending.document) };
  }
  async function files() {
    let page = '', results = [];
    do {
      const query = new URLSearchParams({ q: "trashed=false and mimeType != 'application/vnd.google-apps.folder'", fields: 'items(id,title,mimeType),nextPageToken', maxResults: '100' });
      if (page) query.set('pageToken', page);
      const result = await (await request('https://www.googleapis.com/drive/v2/files?' + query)).json();
      results.push(...result.items.filter(x => /\.json$/i.test(x.title))); page = result.nextPageToken || '';
    } while (page);
    return results.sort((a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }));
  }
  function pick() {
    if (!ready) throw new Error('Bitte zuerst die Google-Anmeldung laden.');
    return new Promise((resolve, reject) => {
      try {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(false).setSelectFolderEnabled(false);
        const picker = new google.picker.PickerBuilder().addView(view).setOAuthToken(requireSession().token).setDeveloperKey(config.apiKey)
          .setAppId(config.projectNumber).setOrigin(location.origin).setTitle('JSON-Trackerdatei auswählen').setCallback(data => {
            if (data.action === google.picker.Action.PICKED) { picker.setVisible(false); resolve(data.docs?.[0]?.id || null); }
            if (data.action === google.picker.Action.CANCEL) resolve(null);
          }).build();
        picker.setVisible(true);
      } catch (error) { reject(error); }
    });
  }
  function disconnect() { session = null; storeSession(); }
  return { init, configure, prepare, authorize, get, put, create, files, pick, disconnect, requireSession,
    get config() { return config; }, get session() { return session; }, get ready() { return ready; } };
})();
