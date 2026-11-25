"use strict";

function validSemester(config) {
  const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return config && ["summer", "winter"].includes(config.type) && date(config.start) &&
    config.start >= "1900-01-01" && config.start <= "9997-12-31" &&
    Number.isInteger(config.length) && config.length >= 1 && config.length <= 52 &&
    Array.isArray(config.pauses) && config.pauses.every(pause => pause && date(pause.from) && date(pause.to) &&
      pause.from >= config.start && pause.to >= pause.from && Date.parse(pause.to) - Date.parse(config.start) <= 366 * 86400000);
}

// Three-way merge. Unknown fields are retained; timers and unkeyed arrays are atomic.
const trackerMerge = (() => {
  const equal = (a, b) => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  };
  function plan(base, local, remote, choices = {}) {
    const conflicts = [];
    const clone = value => value === undefined ? undefined : structuredClone(value);
    function conflict(b, l, r, path) {
      const key = JSON.stringify(path);
      conflicts.push({ key, path, base: clone(b), local: clone(l), remote: clone(r) });
      return clone(choices[key] === "remote" ? r : l);
    }
    function merge(b, l, r, path = []) {
      if (equal(l, r)) return clone(l);
      if (equal(l, b)) return clone(r);
      if (equal(r, b)) return clone(l);
      // Moving to/from trash conflicts with concurrent edits of the same task.
      // Keep the task and its timer together rather than hiding the other edit.
      if (path.length === 2 && path[0] === "tasks" && b && l && r &&
          !!l.deletedAt !== !!r.deletedAt && (!!l.deletedAt !== !!b.deletedAt || !!r.deletedAt !== !!b.deletedAt)) return conflict(b, l, r, path);
      const field = path.at(-1);
      if (path.length === 1 && field === "updatedAt") return clone(r);
      if (["timeTracking", "freeTimeTracking", "semester", "repeatRule"].includes(field)) return conflict(b, l, r, path);
      const keyed = list => Array.isArray(list) && list.every(x => x && typeof x.id === "string") && new Set(list.map(x => x.id)).size === list.length;
      if (["tasks", "projects", "checklist"].includes(field) && [b, l, r].every(keyed)) {
        const maps = [b, l, r].map(list => new Map(list.map(x => [x.id, x])));
        return [...new Set([...l, ...r].map(x => x.id))].flatMap(id => {
          const value = merge(...maps.map(map => map.get(id)), [...path, id]);
          return value === undefined ? [] : [value];
        });
      }
      const record = value => value && typeof value === "object" && !Array.isArray(value);
      if ([b, l, r].every(record)) {
        const result = {};
        for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
          const value = merge(b[key], l[key], r[key], [...path, key]);
          if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
        }
        return result;
      }
      return conflict(b, l, r, path);
    }
    // Old recovery drafts have no trustworthy base: require an explicit whole-document choice.
    const document = base ? merge(base, local, remote) : conflict(base, local, remote, []);
    return { document, conflicts };
  }
  function validate(document) {
    trackerFiles.validate(document);
    const running = [document.freeTimeTracking, ...document.tasks.map(t => t.timeTracking)].filter(t => t?.startedAt != null);
    if (running.length > 1 || document.tasks.some(t => t.status === "done" && t.timeTracking?.startedAt != null)) {
      throw new Error("Die Auswahl würde widersprüchliche laufende Timer erzeugen.");
    }
    return document;
  }
  return { plan, validate, equal };
})();


// Independent, versioned time records; legacy timer fields remain untouched.
const taskTime = (() => {
  function fresh(mode = "standard") {
    return { version: 1, mode, phase: "focus", rounds: 0, elapsedMs: 0, startedAt: null, totalMs: 0, entries: [] };
  }
  function valid(s) {
    return !!s && s.version === 1 && ["standard", "pomodoro"].includes(s.mode) &&
      ["focus", "short", "long"].includes(s.phase) && Number.isSafeInteger(s.rounds) && s.rounds >= 0 &&
      [s.elapsedMs, s.totalMs].every(n => Number.isFinite(n) && n >= 0) &&
      (s.startedAt === null || (typeof s.startedAt === "number" && Number.isFinite(s.startedAt) && s.startedAt >= 0)) &&
      Array.isArray(s.entries) && s.entries.every(e => e && typeof e.id === "string" &&
        Number.isFinite(e.at) && Number.isFinite(e.durationMs) && e.durationMs >= 0 && ["standard", "pomodoro"].includes(e.mode)) &&
      (s.mode !== "pomodoro" || s.elapsedMs <= limit(s));
  }
  function limit(s) { return (s.phase === "focus" ? 25 : s.phase === "short" ? 5 : 15) * 60000; }
  function elapsed(s, now = Date.now()) {
    const ms = s.elapsedMs + (s.startedAt === null ? 0 : Math.max(0, now - s.startedAt));
    return s.mode === "pomodoro" ? Math.min(limit(s), ms) : ms;
  }
  function transition(value, action, now = Date.now(), mode) {
    if (value != null && !valid(value)) throw new Error("Ungültige Zeiterfassung. Die Daten bleiben erhalten.");
    const s = structuredClone(value || fresh(mode));
    const current = elapsed(s, now);
    const finished = s.mode === "pomodoro" && current >= limit(s);
    if (s.startedAt !== null) {
      const segment = Math.max(0, current - s.elapsedMs);
      if (segment > 0 && (s.mode === "standard" || s.phase === "focus")) {
        s.totalMs += segment;
        // Devices settling the same expired phase must generate the same entry.
        const id = action === "finish" && finished
          ? "pomodoro-" + s.startedAt + "-" + s.entries.length : crypto.randomUUID();
        s.entries.push({ id, at: s.startedAt, durationMs: segment, mode: s.mode });
      }
      s.elapsedMs = current;
      s.startedAt = null;
    }
    if (finished) {
      if (s.phase === "focus") { s.rounds++; s.phase = s.rounds % 4 === 0 ? "long" : "short"; }
      else s.phase = "focus";
      s.elapsedMs = 0;
    }
    if (action === "stop" || action === "mode") {
      return { ...fresh(action === "mode" ? mode : s.mode), totalMs: s.totalMs, entries: s.entries };
    }
    // Reaching a phase boundary always waits for a separate, conscious start.
    if (action === "start" && !finished) s.startedAt = now;
    return s;
  }
  return { fresh, valid, limit, elapsed, transition };
})();

const taskProgress = {
  mode(t) { return t.progressMode || (t.progress === undefined ? "checklist" : "manual"); },
  value(t) {
    if (t.completed || t.status === "done") return 100;
    if (this.mode(t) === "checklist") {
      const list = Array.isArray(t.checklist) ? t.checklist : [];
      return list.length ? Math.round(list.filter(item => item?.done === true).length / list.length * 100) : 0;
    }
    return Number.isFinite(t.progress) ? Math.max(0, Math.min(100, t.progress)) : 0;
  },
  valid(t) { return (t.progress === undefined || (Number.isFinite(t.progress) && t.progress >= 0 && t.progress <= 100)) &&
    (t.progressMode === undefined || ["manual", "checklist"].includes(t.progressMode)); }
};

const taskTrash = {
  valid(task) {
    return task.deletedAt === undefined || (typeof task.deletedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(task.deletedAt) && Number.isFinite(Date.parse(task.deletedAt)) &&
      new Date(task.deletedAt).toISOString() === task.deletedAt && task.timeTracking?.startedAt == null);
  },
  apply(task, action) {
    if (!["trash", "restore", "purge"].includes(action) || (action === "trash" ? !!task.deletedAt : !task.deletedAt)) throw new Error("Der Papierkorbstatus wurde bereits geändert. Bitte lade die Ansicht neu.");
    if (action === "trash") {
      if (task.timeTracking?.startedAt != null) task.timeTracking = taskTime.transition(task.timeTracking, "pause");
      task.deletedAt = new Date().toISOString();
    } else if (action === "restore") delete task.deletedAt;
  }
};

const taskCompletion = {
  isDone(task) { return task.completed === true || task.status === "done"; },
  apply(task, completed) {
    if (this.isDone(task) === completed) return;
    if (completed) {
      if (task.timeTracking?.startedAt != null) task.timeTracking = taskTime.transition(task.timeTracking, "pause");
      task.completedAt = new Date().toISOString();
    } else delete task.completedAt;
    if (Object.hasOwn(task, "status")) { task.status = completed ? "done" : "open"; }
    else task.completed = completed;
  }
};

function validProjectOrder(order) {
  return Array.isArray(order) && order.length <= 10000 && order.every(key => typeof key === "string" && key.length <= 205) && new Set(order).size === order.length;
}

const taskRepeat = {
  valid(rule) {
    return rule == null || (rule.version === 1 && typeof rule.seriesId === "string" && /^[\w-]{1,100}$/.test(rule.seriesId) &&
      ["daily", "weekly"].includes(rule.frequency) && Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 52 &&
      Number.isInteger(rule.index) && rule.index >= 0 && (rule.total === null || (Number.isInteger(rule.total) && rule.total >= 1 && rule.total <= 1000 && rule.index < rule.total)) &&
      typeof rule.skipPauses === "boolean");
  },
  next(task, semester, eager = false) {
    const rule = task.repeatRule;
    if ((!eager && !taskCompletion.isDone(task)) || !rule || task.repeatNextId || (rule.total !== null && rule.index + 1 >= rule.total)) return null;
    if (rule.skipPauses && !validSemester(semester)) throw new Error("Bitte zuerst das Semester mit seinen Pausen einstellen.");
    const planned = task.plannedDate ?? task.planned ?? "", due = task.dueDate ?? task.due ?? "";
    const anchor = planned || due;
    if (!anchor) throw new Error("Für eine Wiederholung ist ein Bearbeitungsdatum oder eine Frist erforderlich.");
    const start = new Date(anchor + "T12:00:00"), next = new Date(start);
    const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const paused = date => {
      if (!rule.skipPauses || !semester) return false;
      const monday = new Date(date); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      return semester.pauses.some(p => p.from <= key(sunday) && p.to >= key(monday));
    };
    do { next.setDate(next.getDate() + rule.interval * (rule.frequency === "weekly" ? 7 : 1)); } while (paused(next));
    const shift = value => {
      if (!value) return "";
      const date = new Date(value + "T12:00:00");
      // Calendar-day arithmetic keeps dates stable across daylight-saving changes.
      const days = Math.round((Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
      date.setDate(date.getDate() + days);
      if (date.getFullYear() > 9999) throw new Error("Der nächste Termin liegt außerhalb des unterstützten Datumsbereichs.");
      return key(date);
    };
    return { id: `${rule.seriesId}:${rule.index + 1}`, title: task.title, taskType: task.taskType || "task",
      project: task.project || "", projectId: task.projectId || "", plannedDate: shift(planned), dueDate: shift(due),
      description: task.description || "", checklist: (task.checklist || []).map(item => ({ ...structuredClone(item), done: false })),
      progress: 0, progressMode: taskProgress.mode(task), completed: false, createdAt: task.completedAt || task.createdAt || new Date().toISOString(),
      repeatRule: { ...structuredClone(rule), index: rule.index + 1 } };
  },
  expand(task, semester) {
    const finite = task.repeatRule?.total != null;
    const pending = [];
    let current = task, next;
    while ((next = this.next(current, semester, finite))) {
      current.repeatNextId = next.id;
      pending.push(next);
      if (!finite) break;
      current = next;
    }
    return pending;
  },
  addToStore(store, task, semester) {
    for (const next of this.expand(task, semester)) {
      const request = store.get(next.id);
      request.onsuccess = () => { if (!request.result) store.add(next); };
    }
  }
};

const taskDetails = {
  values(t) { return { title: t.title, taskType: t.taskType ?? "task", repeatRule: structuredClone(t.repeatRule ?? null), dueDate: t.dueDate ?? t.due ?? "", plannedDate: t.plannedDate ?? t.planned ?? "", description: t.description ?? "", checklist: structuredClone(t.checklist ?? []), progress: t.progress ?? 0, progressMode: taskProgress.mode(t) }; },
  valid(t) {
    return (t.taskType === undefined || ["task", "lecture", "tutorial"].includes(t.taskType)) && taskRepeat.valid(t.repeatRule) &&
      taskProgress.valid(t) && (t.description === undefined || (typeof t.description === "string" && t.description.length <= 100000)) &&
      (t.checklist === undefined || (Array.isArray(t.checklist) && t.checklist.length <= 1000 &&
        t.checklist.every(c => c && typeof c.id === "string" && !!c.id && typeof c.text === "string" && c.text.length <= 2000 && typeof c.done === "boolean") &&
        new Set(t.checklist.map(c => c.id)).size === t.checklist.length));
  },
  same(a, b) { return (b.completed === undefined || taskCompletion.isDone(a) === b.completed) && JSON.stringify(this.values(a)) === JSON.stringify(this.values(b)); }
};

// Browser tasks and file recovery drafts remain separate.
const taskStorage = (() => {
  let connection;

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) &&
      date.getFullYear() === Number(value.slice(0, 4)) &&
      date.getMonth() + 1 === Number(value.slice(5, 7)) &&
      date.getDate() === Number(value.slice(8, 10));
  }

  function validTask(task) {
    return !!task && taskTrash.valid(task) && typeof task.id === "string" && !!task.id &&
      typeof task.title === "string" && !!task.title.trim() && task.title.length <= 300 &&
      typeof task.completed === "boolean" &&
      (task.dueDate === undefined || task.dueDate === "" || validDate(task.dueDate)) &&
      (task.timeTracking === undefined || taskTime.valid(task.timeTracking)) && taskDetails.valid(task) &&
      // Existing records without a planned date remain valid without migration.
      (task.plannedDate === undefined || task.plannedDate === "" || validDate(task.plannedDate)) &&
      (task.project === undefined || (typeof task.project === "string" && task.project.length <= 100));
  }

  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open("tasktracker-v2", 2);
        let blocked = false;
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("tasks")) request.result.createObjectStore("tasks", { keyPath: "id" });
          if (!request.result.objectStoreNames.contains("recovery")) request.result.createObjectStore("recovery");
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => { blocked = true; reject(new Error("Speicher wird in einem anderen Fenster verwendet.")); };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => { db.close(); connection = undefined; };
          resolve(db);
        };
      }).catch(error => { connection = undefined; throw error; });
    }
    return connection;
  }

  async function load() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("tasks", "readonly");
      const request = transaction.objectStore("tasks").getAll();
      transaction.oncomplete = () => {
        if (!request.result.every(validTask)) {
          reject(new Error("Gespeicherte Aufgaben konnten nicht gelesen werden. Die Daten bleiben erhalten."));
        } else resolve(request.result);
      };
      transaction.onabort = () => reject(transaction.error || new Error("Lesen fehlgeschlagen."));
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function add(task, semester) {
    if (!validTask(task)) throw new Error("Bitte einen Titel und gültige Datumsangaben eingeben.");
    const source = structuredClone(task);
    const pending = taskRepeat.expand(source, semester);
    if (!pending.every(validTask)) throw new Error("Die Wiederholung enthält ungültige Termine.");
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("tasks", "readwrite");
      // A finite series is committed in one transaction, including its first occurrence.
      const store = transaction.objectStore("tasks");
      for (const item of [source, ...pending]) store.add(item);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("Speichern fehlgeschlagen."));
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function setCompleted(id, completed, expected, restore, semester) {
    if (typeof completed !== "boolean") throw new Error("Ungültiger Erledigungsstatus.");
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite");
      const store = tx.objectStore("tasks");
      const request = store.get(id);
      let saved, failure;
      request.onsuccess = () => {
        if (!validTask(request.result) || request.result.deletedAt || (expected !== undefined && request.result.completed !== expected)) {
          failure = new Error("Die Aufgabe konnte nicht aktualisiert werden.");
          tx.abort();
          return;
        }
        saved = { ...request.result };
        taskCompletion.apply(saved, completed);
        if (restore) {
          if (restore.completedAt === undefined) delete saved.completedAt;
          else saved.completedAt = restore.completedAt;
        }
        try { taskRepeat.addToStore(store, saved, semester); }
        catch (error) { failure = error; tx.abort(); return; }
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Speichern fehlgeschlagen."));
    });
  }

  async function updateTime(id, expected, next) {
    if (!taskTime.valid(next)) throw new Error("Ungültige Zeiterfassung.");
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite"), store = tx.objectStore("tasks"), request = store.get(id);
      let saved, failure;
      request.onsuccess = () => {
        const task = request.result;
        if (!validTask(task) || task.deletedAt || JSON.stringify(task.timeTracking) !== JSON.stringify(expected)) {
          failure = new Error("Die Zeiterfassung wurde in einem anderen Fenster geändert. Bitte die Seite neu laden.");
          tx.abort(); return;
        }
        saved = { ...task, timeTracking: structuredClone(next) }; store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Zeit konnte nicht gespeichert werden."));
    });
  }

  async function updateDetails(id, expected, details, semester) {
    if (!taskDetails.valid(details)) throw new Error("Ungültige Aufgabenoptionen.");
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite"), store = tx.objectStore("tasks"), request = store.get(id);
      let saved, failure;
      request.onsuccess = () => {
        if (!validTask(request.result) || request.result.deletedAt || !taskDetails.same(request.result, expected) ||
            (expected.project !== undefined && (request.result.project || "") !== expected.project)) {
          failure = new Error("Die Aufgabe wurde zwischenzeitlich geändert. Bitte schließe das Menü und lade die Seite neu. Deine Eingaben bleiben hier erhalten.");
          tx.abort(); return;
        }
        saved = { ...request.result, ...taskDetails.values(details) };
        if (saved.repeatRule?.seriesId !== request.result.repeatRule?.seriesId) delete saved.repeatNextId;
        if (typeof details.completed === "boolean") taskCompletion.apply(saved, details.completed);
        if (details.project !== undefined) saved.project = details.project;
        if (!validTask(saved)) { failure = new Error("Bitte gültige Aufgabenangaben eingeben."); tx.abort(); return; }
        try { taskRepeat.addToStore(store, saved, semester); }
        catch (error) { failure = error; tx.abort(); return; }
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Aufgabenoptionen konnten nicht gespeichert werden."));
    });
  }

  async function deleteTask(id, expected, action = "trash") {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite"), store = tx.objectStore("tasks");
      const request = store.get(id);
      let failure, saved;
      request.onsuccess = () => {
        if (!request.result || JSON.stringify(request.result) !== expected) {
          failure = new Error("Die Aufgabe wurde zwischenzeitlich geändert. Bitte lade die Ansicht neu.");
          tx.abort();
          return;
        }
        try {
          saved = structuredClone(request.result);
          taskTrash.apply(saved, action);
          if (action === "purge") { store.delete(id); saved = null; }
          else store.put(saved);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Löschen fehlgeschlagen."));
    });
  }

  async function loadFreeTime() {
    const state = await draftOperation("get", undefined, "free-time");
    if (state !== undefined && !taskTime.valid(state)) throw new Error("Die freie Zeiterfassung konnte nicht gelesen werden. Die Daten bleiben erhalten.");
    return state;
  }
  async function updateFreeTime(expected, next) {
    if (!taskTime.valid(next)) throw new Error("Ungültige Zeiterfassung.");
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recovery", "readwrite"), store = tx.objectStore("recovery"), request = store.get("free-time");
      let failure;
      request.onsuccess = () => {
        if (JSON.stringify(request.result) !== JSON.stringify(expected)) {
          failure = new Error("Die freie Zeiterfassung wurde in einem anderen Fenster geändert. Bitte die Seite neu laden.");
          tx.abort(); return;
        }
        store.put(structuredClone(next), "free-time");
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Zeit konnte nicht gespeichert werden."));
    });
  }

  async function draftOperation(action, value, key = "file") {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recovery", action === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore("recovery");
      const request = action === "put" ? store.put(value, key) : store[action](key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Dateientwurf konnte nicht gesichert werden."));
    });
  }

  async function saveProjectOrder(expected, next) {
    if (!validProjectOrder(next)) throw new Error("Ungültige Projektreihenfolge.");
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recovery", "readwrite"), store = tx.objectStore("recovery"), request = store.get("project-order");
      let failure;
      request.onsuccess = () => {
        if (JSON.stringify(request.result || []) !== JSON.stringify(expected)) {
          failure = new Error("Die Reihenfolge wurde in einem anderen Fenster geändert. Bitte neu laden."); tx.abort(); return;
        }
        store.put(next, "project-order");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Reihenfolge konnte nicht gespeichert werden."));
    });
  }

  async function saveCloudCache(value, expectedVersion) {
    const db = await open(), key = "cloud-cache:" + value.scope;
    const next = { ...structuredClone(value), cacheVersion: crypto.randomUUID() };
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recovery", "readwrite"), store = tx.objectStore("recovery"), request = store.get(key);
      let failure;
      request.onsuccess = () => {
        if (expectedVersion !== undefined && (request.result?.cacheVersion || null) !== expectedVersion) {
          failure = new Error("Der Cloud-Arbeitsstand wurde in einem anderen Fenster geändert. Bitte neu laden; die andere Fassung bleibt gesichert."); tx.abort(); return;
        }
        store.put(next, key);
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Der Cloud-Arbeitsstand konnte nicht gesichert werden."));
    });
  }

  return { load, add, setCompleted, updateTime, updateDetails, deleteTask, loadFreeTime, updateFreeTime,
    loadProjectOrder: async () => (await draftOperation("get", undefined, "project-order")) || [], saveProjectOrder,
    loadProjectStyles: async () => (await draftOperation("get", undefined, "project-styles")) || [],
    loadDraft: () => draftOperation("get"),
    saveDraft: draft => draftOperation("put", draft), clearDraft: () => draftOperation("delete"),
    loadTrackerFolder: () => draftOperation("get", undefined, "tracker-folder"),
    saveTrackerFolder: handle => draftOperation("put", handle, "tracker-folder"),
    loadRecentTracker: () => draftOperation("get", undefined, "recent-tracker"),
    saveRecentTracker: record => draftOperation("put", record, "recent-tracker"),
    loadCloudConfig: () => draftOperation("get", undefined, "cloud-config"),
    saveCloudConfig: value => draftOperation("put", value, "cloud-config"),
    loadCloudSession: () => draftOperation("get", undefined, "cloud-session"),
    saveCloudSession: value => draftOperation("put", value, "cloud-session"),
    loadCloudCache: scope => draftOperation("get", undefined, "cloud-cache:" + scope),
    saveCloudCache };
})();

// Compatibility adapter: keep the original document; never rebuild it from its view.
const trackerFiles = (() => {
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const string = (value, max) => typeof value === "string" && value.length <= max;
  function date(value) {
    if (value === undefined || value === null || value === "") return true;
    if (!string(value, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isFinite(parsed.getTime()) && parsed.getFullYear() === +value.slice(0, 4) &&
      parsed.getMonth() + 1 === +value.slice(5, 7) && parsed.getDate() === +value.slice(8, 10);
  }

  function validate(doc) {
    if (!record(doc) || doc.version !== 1 || !Array.isArray(doc.projects) || !Array.isArray(doc.tasks) || !string(doc.name, 300)) {
      throw new Error("Keine unterstützte Trackerdatei: Version 1 mit Name, Projekten und Aufgaben erforderlich.");
    }
    if (doc.semester !== undefined && !validSemester(doc.semester)) throw new Error("Ungültige Semestereinstellungen.");
    if (doc.projectOrder !== undefined && !validProjectOrder(doc.projectOrder)) throw new Error("Ungültige Projektreihenfolge.");
    if (doc.freeTimeTracking !== undefined && !taskTime.valid(doc.freeTimeTracking)) throw new Error("Ungültige freie Zeiterfassung in der Trackerdatei.");
    const ids = new Set();
    function checkId(item) {
      if (!record(item) || !string(item.id, 200) || !item.id || ids.has(item.id)) throw new Error("Fehlende oder doppelte Kennung in der Trackerdatei.");
      ids.add(item.id);
    }
    const projects = new Map();
    for (const project of doc.projects) {
      checkId(project);
      if (!string(project.name, 300) || (project.parentId && !string(project.parentId, 200))) throw new Error("Ungültiges Projekt.");
      if (project.labelColor !== undefined && project.labelColor !== "" && (typeof project.labelColor !== "string" || !/^#[0-9a-f]{6}$/i.test(project.labelColor))) throw new Error("Ungültige Projektfarbe.");
      projects.set(project.id, project);
    }
    const checked = new Set();
    for (const project of doc.projects) {
      const chain = new Set();
      let current = project;
      while (current && !checked.has(current.id)) {
        if (chain.has(current.id)) throw new Error("Zyklische Projektstruktur.");
        chain.add(current.id);
        if (current.parentId && !projects.has(current.parentId)) throw new Error("Übergeordnetes Projekt fehlt.");
        current = projects.get(current.parentId);
      }
      for (const id of chain) checked.add(id);
    }
    for (const task of doc.tasks) {
      checkId(task);
      if (!taskTrash.valid(task)) throw new Error("Ungültiger Papierkorbeintrag oder laufender Timer im Papierkorb.");
      if (!taskProgress.valid(task)) throw new Error("Ungültiger Aufgabenfortschritt.");
      if (!taskRepeat.valid(task.repeatRule) || (task.taskType !== undefined && !["task", "lecture", "tutorial"].includes(task.taskType))) throw new Error("Ungültiger Aufgabentyp oder Wiederholungsplan.");
      if (task.timeTracking !== undefined && !taskTime.valid(task.timeTracking)) throw new Error("Ungültige Zeiterfassung in der Trackerdatei.");
      if (!string(task.title, 1000) || !task.title.trim() || !["open", "doing", "done"].includes(task.status)) throw new Error("Ungültiger Aufgabentitel oder Status.");
      if (!date(task.planned) || !date(task.due)) throw new Error("Ungültiges Aufgabendatum.");
      if (task.projectId && !projects.has(task.projectId)) throw new Error("Aufgabenprojekt fehlt.");
      for (const key of ["tags", "checklist", "attachments", "timeEntries"]) {
        if (task[key] != null && !Array.isArray(task[key])) throw new Error(`Ungültige Aufgabenliste: ${key}.`);
      }
    }
    for (const key of ["tags", "filters", "templates", "themes"]) {
      if (doc[key] != null && !Array.isArray(doc[key])) throw new Error(`Ungültige Dateieinstellung: ${key}.`);
    }
    return doc;
  }

  function parse(text) {
    let doc;
    try { doc = JSON.parse(text.replace(/^\uFEFF/, "")); }
    catch { throw new Error("Die Datei enthält kein gültiges JSON."); }
    return validate(doc);
  }

  function projectLabels(doc) {
    const projects = new Map(doc.projects.map(project => [project.id, project]));
    return new Map(doc.projects.map(project => {
      const names = [project.name];
      let parent = projects.get(project.parentId);
      while (parent) { names.unshift(parent.name); parent = projects.get(parent.parentId); }
      return [project.id, names.join(" / ")];
    }));
  }

  function toTasks(doc) {
    const labels = projectLabels(doc);
    return doc.tasks.map(task => ({ id: task.id, title: task.title, taskType: task.taskType || "task", repeatRule: structuredClone(task.repeatRule ?? null),
      ...(task.repeatNextId === undefined ? {} : { repeatNextId: task.repeatNextId }), dueDate: task.due || "",
      plannedDate: task.planned || "", completed: task.status === "done",
      ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
      ...(task.deletedAt === undefined ? {} : { deletedAt: task.deletedAt }),
      description: task.description ?? "", checklist: structuredClone(task.checklist ?? []),
      ...(task.progress === undefined ? {} : { progress: task.progress }), ...(task.progressMode === undefined ? {} : { progressMode: task.progressMode }),
      project: labels.get(task.projectId) || "", projectId: task.projectId || "", ...(task.timeTracking === undefined ? {} : { timeTracking: structuredClone(task.timeTracking) }) }));
  }

  function resolveProjectId(doc, name) {
    if (!name) return "";
    const matches = [...projectLabels(doc)].filter(([, label]) => label === name);
    if (matches.length > 1) throw new Error("Der Projektname ist nicht eindeutig. Bitte einen anderen Namen wählen.");
    if (matches.length) return matches[0][0];
    if (!string(name, 100) || !name.trim()) throw new Error("Bitte einen gültigen Projektnamen eingeben.");
    const id = crypto.randomUUID();
    doc.projects.push({ id, name, parentId: "", collapsed: false });
    return id;
  }

  function appendToDocument(next, task) {
    const projectId = task.projectId && next.projects.some(project => project.id === task.projectId) ? task.projectId : resolveProjectId(next, task.project);
    const extra = structuredClone(task);
    for (const key of ["completed", "project", "dueDate", "plannedDate"]) delete extra[key];
    next.tasks.push({ ...extra, id: task.id, title: task.title, description: task.description ?? "", projectId,
      status: task.completed ? "done" : "open", progress: task.completed ? 100 : task.progress ?? 0, progressMode: taskProgress.mode(task),
      ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
      urgency: task.urgency ?? 2, planned: task.plannedDate || "", due: task.dueDate || "",
      tags: structuredClone(task.tags ?? []), checklist: structuredClone(task.checklist ?? []), attachments: structuredClone(task.attachments ?? []), estimate: task.estimate ?? 0, timeEntries: structuredClone(task.timeEntries ?? []), recurrence: structuredClone(task.recurrence ?? null),
      timerStarted: task.timerStarted ?? null, ...(task.timeTracking === undefined ? {} : { timeTracking: structuredClone(task.timeTracking) }), createdAt: task.createdAt });
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function append(doc, task) {
    const next = appendToDocument(structuredClone(doc), task);
    appendNext(next, next.tasks[next.tasks.length - 1]);
    return validate(next);
  }

  function fromTasks(tasks, freeTimeTracking, projectOrder, projectStyles = []) {
    let doc = { version: 1, id: crypto.randomUUID(), name: "Meine Trackerdatei", projects: [], tasks: [],
      tags: [], filters: [], templates: [], themes: [], theme: { mode: "system" } };
    if (freeTimeTracking !== undefined) doc.freeTimeTracking = structuredClone(freeTimeTracking);
    if (projectOrder !== undefined) doc.projectOrder = structuredClone(projectOrder);
    for (const task of tasks) appendToDocument(doc, task);
    for (const project of doc.projects) {
      const style = projectStyles.find(item => item.name === project.name);
      if (style) project.labelColor = style.color;
    }
    if (projectOrder) doc.projectOrder = projectOrder.map(key => key.startsWith("name:") ? "id:" + (doc.projects.find(p => p.name === key.slice(5))?.id || key.slice(5)) : key);
    return validate(doc);
  }

  function completeTask(doc, id, previous = null) {
    const next = structuredClone(doc);
    const task = next.tasks.find(task => task.id === id);
    if (!task || task.deletedAt) throw new Error("Die Aufgabe wurde nicht gefunden oder liegt im Papierkorb.");
    if (previous) {
      task.status = previous.status;
      if (previous.completedAt === undefined) delete task.completedAt;
      else task.completedAt = previous.completedAt;
      if (previous.progress === undefined) delete task.progress;
      else task.progress = previous.progress;
    } else {
      taskCompletion.apply(task, true);
      task.progress = 100;
    }
    appendNext(next, task);
    next.updatedAt = new Date().toISOString();
    return validate(next);
  }

  function updateDetails(doc, id, expected, details) {
    const next = structuredClone(doc), task = next.tasks.find(t => t.id === id);
    if (!task || task.deletedAt || !taskDetails.same(task, expected) ||
        (expected.projectId !== undefined && (task.projectId || "") !== expected.projectId)) {
      throw new Error("Die Aufgabe wurde zwischenzeitlich geändert. Bitte öffne die Aufgabenoptionen erneut.");
    }
    if (!taskDetails.valid(details) || !string(details.title, 1000) || !details.title.trim() || !date(details.dueDate) || !date(details.plannedDate)) throw new Error("Ungültige Aufgabenoptionen.");
    if (task.repeatRule?.seriesId !== details.repeatRule?.seriesId) delete task.repeatNextId;
    Object.assign(task, { title: details.title, taskType: details.taskType ?? "task", repeatRule: structuredClone(details.repeatRule ?? null), due: details.dueDate, planned: details.plannedDate, description: details.description, checklist: structuredClone(details.checklist), progress: details.progress, progressMode: details.progressMode });
    if (typeof details.completed === "boolean") taskCompletion.apply(task, details.completed);
    if (details.projectId !== undefined) task.projectId = details.projectId;
    else if (details.project !== undefined) task.projectId = resolveProjectId(next, details.project);
    appendNext(next, task);
    next.updatedAt = new Date().toISOString();
    return validate(next);
  }

  function appendNext(doc, task) {
    const project = projectLabels(doc).get(task.projectId) || "";
    const ids = new Set(doc.tasks.map(item => item.id));
    for (const next of taskRepeat.expand(task, doc.semester)) {
      if (ids.has(next.id)) continue;
      next.project = project;
      appendToDocument(doc, next);
      ids.add(next.id);
    }
  }

  function deleteTask(doc, id, expected, action = "trash") {
    const task = doc.tasks.find(item => item.id === id);
    if (!task || JSON.stringify(task) !== expected) {
      throw new Error("Die Aufgabe wurde zwischenzeitlich geändert. Bitte öffne die Aufgabenoptionen erneut.");
    }
    const next = structuredClone(doc);
    taskTrash.apply(next.tasks.find(item => item.id === id), action);
    if (action === "purge") next.tasks = next.tasks.filter(item => item.id !== id);
    next.updatedAt = new Date().toISOString();
    return validate(next);
  }

  return { parse, validate, toTasks, append, fromTasks, projectLabels, completeTask, updateDetails, deleteTask };
})();
