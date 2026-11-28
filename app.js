"use strict";

const githubPagesHosting = document.documentElement.dataset.hosting === "github-pages" || location.hostname.toLowerCase().endsWith(".github.io");
document.querySelector("#pi-sync-controls").hidden = false;
document.querySelector("#github-hosting-note").hidden = !githubPagesHosting;

// Appearance is a browser preference, separate from tracker documents and tasks.
const colorThemeNames = { blue: "Blau", green: "Grün", purple: "Violett", sand: "Sand", dark: "Dunkel", system: "Systemeinstellung" };
const colorThemeKey = "tasktracker-v2-color-theme";
let faviconUpdate = 0;
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
function applyColorTheme(value, persist = false) {
  const theme = Object.hasOwn(colorThemeNames, value) ? value : "blue";
  const effective = theme === "system" ? (systemColorScheme.matches ? "dark" : "blue") : theme;
  document.documentElement.dataset.colorPreference = theme;
  document.documentElement.dataset.colorTheme = effective;
  updateThemeLogo();
  document.querySelectorAll('input[name="color-theme"]').forEach(input => { input.checked = input.value === theme; });
  let message = "Aktives Theme: " + colorThemeNames[theme] + (theme === "system" ? " (" + (effective === "dark" ? "Dunkel" : "Hell") + ")" : "");
  if (persist) {
    try { localStorage.setItem(colorThemeKey, theme); }
    catch { message += " · Die Auswahl konnte nicht dauerhaft gespeichert werden."; }
  }
  const output = document.querySelector("#theme-status");
  if (output) output.textContent = message;
}
function updateThemeLogo() {
  const logo = document.querySelector(".brand-logo"), favicon = document.querySelector('link[rel="icon"]');
  if (!logo || !favicon) return;
  const colors = getComputedStyle(document.documentElement);
  const background = colors.getPropertyValue("--accent").trim();
  const foreground = colors.getPropertyValue("--on-accent").trim();
  logo.querySelector("rect").setAttribute("fill", background);
  for (const element of logo.querySelectorAll("[stroke]")) element.setAttribute("stroke", foreground);
  const icon = logo.cloneNode(true);
  icon.removeAttribute("class");
  const update = ++faviconUpdate;
  const image = new Image();
  image.onload = () => {
    if (update !== faviconUpdate) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    favicon.href = canvas.toDataURL("image/png");
  };
  image.src = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(icon));
}
systemColorScheme.addEventListener("change", () => {
  if (document.documentElement.dataset.colorPreference === "system") applyColorTheme("system");
});
let savedColorTheme = "blue";
try { savedColorTheme = localStorage.getItem(colorThemeKey) || "blue"; } catch {}
applyColorTheme(savedColorTheme);
document.querySelectorAll('input[name="color-theme"]').forEach(input => {
  input.addEventListener("change", () => { if (input.checked) applyColorTheme(input.value, true); });
});


const menu = document.querySelector("#side-menu");
const menuToggle = document.querySelector(".menu-toggle");
const menuClose = document.querySelector(".menu-close");
const mobileLayout = window.matchMedia("(width < 1000px)");

function closeMobileMenu() {
  if (!mobileLayout.matches || !menu.open) return;
  menu.close();
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.focus({ preventScroll: true });
}

menuToggle.addEventListener("click", () => {
  if (!mobileLayout.matches || menu.open) return;
  menu.showModal();
  menuToggle.setAttribute("aria-expanded", "true");
  menuClose.focus({ preventScroll: true });
});

menuClose.addEventListener("click", closeMobileMenu);
menu.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMobileMenu();
});

// Only a click that both begins and ends outside the panel closes it.
function isOutsideMenu(event) {
  const bounds = menu.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom;
}
let pointerStartedOutside = false;
menu.addEventListener("pointerdown", (event) => {
  pointerStartedOutside = event.target === menu && isOutsideMenu(event);
});
menu.addEventListener("pointercancel", () => { pointerStartedOutside = false; });
menu.addEventListener("click", (event) => {
  if (pointerStartedOutside && event.target === menu && isOutsideMenu(event)) closeMobileMenu();
  pointerStartedOutside = false;
});

function updateMenuLayout() {
  const focusWasInMenu = menu.contains(document.activeElement);
  const focusWasOnToggle = document.activeElement === menuToggle;
  if (menu.open) menu.close();
  menuToggle.setAttribute("aria-expanded", "false");
  pointerStartedOutside = false;
  if (!mobileLayout.matches) {
    // The desktop sidebar is part of the layout, not a newly opened dialog.
    // Setting open directly avoids show() moving focus on initial page load.
    menu.setAttribute("open", "");
    if (focusWasInMenu || focusWasOnToggle) menu.querySelector("a").focus({ preventScroll: true });
  } else if (focusWasInMenu) {
    menuToggle.focus({ preventScroll: true });
  }
}

mobileLayout.addEventListener("change", updateMenuLayout);
updateMenuLayout();

let tasks = [];
let browserFreeTime;
let browserProjectOrder = [];
let browserProjectStyles = [];
let tasksLoaded = false;
let fileDocument = null;
let fileHandle = null;
let fileBaseline = null;
let fileAutoSaveTimer = null;
let fileAutoSaveBlocked = false;
let resumeApprovedDraft = false;
let fileName = "";
let fileDirty = false;
let fileBusy = true;
let trackerFolder = null;
let recentTracker = null;
let piRevision = null;
let piConnection = null;
let piConnectionMessage = "";
let driveLink = null, driveReady = false, driveBusy = false, driveSyncBusy = false;
let driveConflict = false, driveMessage = '', driveNextSync = 0;
let piBaseDocument = null;
let piSaveTimer = null;
let piSaveBlockedRevision = null;
let piSaveRetryAt = 0;
let pendingFileDraft = null;
let fileMessage = "";
let completionUndo = null;
let selectedProjectKey = "";
let activeView = location.hash === "#papierkorb" ? "trash" : location.hash === "#einstellungen" ? "settings" : location.hash === "#zeiterfassung" ? "time" : location.hash === "#woche" ? "week" : "home";
let selectedWeek = startOfWeek(new Date());
const touchWeekLayout = window.matchMedia("(hover: none) and (pointer: coarse)");
let selectedWeekCount = touchWeekLayout.matches ? 1 : 4;
let mobileWeekDetails = false;
const weekProjectExpansion = new Map();
const weekDensity = document.querySelector("#week-density");
try { mobileWeekDetails = localStorage.getItem("tasktracker-v2-mobile-week-details") === "1"; } catch {}
weekDensity.setAttribute("aria-pressed", String(mobileWeekDetails));
weekDensity.addEventListener("click", () => {
  mobileWeekDetails = !mobileWeekDetails;
  weekDensity.setAttribute("aria-pressed", String(mobileWeekDetails));
  document.querySelector("#week-board").classList.toggle("is-compact", !mobileWeekDetails);
  try { localStorage.setItem("tasktracker-v2-mobile-week-details", mobileWeekDetails ? "1" : "0"); } catch {}
});
let semesterMode = true;
const semesterKey = "tasktracker-v2-semester";
let localSemester = null;
try {
  const saved = JSON.parse(localStorage.getItem(semesterKey));
  if (validSemester(saved)) localSemester = saved;
} catch {}
const filterForm = document.querySelector("#task-filters");
const filterSearch = document.querySelector("#filter-search");
const filterStatus = document.querySelector("#filter-status");
const viewStatusFilters = { home: "open", week: "all" };
filterStatus.value = viewStatusFilters[activeView] || "open";
const filterDue = document.querySelector("#filter-due");
const filterPlanned = document.querySelector("#filter-planned");
const filterToggle = document.querySelector("#filter-toggle");
filterToggle.addEventListener("click", () => {
  const expanded = filterForm.classList.toggle("filters-expanded");
  filterToggle.setAttribute("aria-expanded", String(expanded));
});
touchWeekLayout.addEventListener("change", () => {
  if (activeView === "week") {
    updateWeekRange();
    if (tasksLoaded) renderWeekTasks();
  }
});

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function groupHomeTasks(items, now = new Date()) {
  const today = localDateKey(now);
  const groups = { today: [], overdue: [], upcoming: [], undated: [] };
  for (const task of items) {
    if (!task || task.deletedAt || task.completed || typeof task.title !== "string" || !task.title.trim()) continue;
    const effectiveDate = task.dueDate || task.plannedDate;
    if (!effectiveDate) { groups.undated.push(task); continue; }
    if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) continue;
    const date = new Date(`${effectiveDate}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || localDateKey(date) !== effectiveDate) continue;
    // Show each task once; today's planned work takes precedence.
    const group = task.plannedDate === today || task.dueDate === today
      ? "today" : effectiveDate < today ? "overdue" : "upcoming";
    groups[group].push(task);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (a.dueDate || a.plannedDate || "").localeCompare(b.dueDate || b.plannedDate || "") || a.title.localeCompare(b.title, "de"));
  }
  return groups;
}

function filterHomeTasks(items, filters, now = new Date()) {
  const today = localDateKey(now);
  const lastDay = new Date(now);
  lastDay.setDate(lastDay.getDate() + 6);
  const weekEnd = localDateKey(lastDay);
  const query = filters.search.trim().toLocaleLowerCase("de");
  function matchesDate(value, selection) {
    if (selection === "all") return true;
    if (selection === "none") return !value;
    if (!value) return false;
    if (selection === "past") return value < today;
    if (selection === "today") return value === today;
    if (selection === "week") return value >= today && value <= weekEnd;
    return false;
  }
  return items.filter(task =>
    (!filters.project || projectKey(task) === filters.project) &&
    task.title.toLocaleLowerCase("de").includes(query) &&
    matchesDate(task.dueDate, filters.due) &&
    matchesDate(task.plannedDate, filters.planned));
}

function createCompletionCheckbox(task) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox"; checkbox.className = "task-complete";
  checkbox.checked = !!task.completed; checkbox.dataset.taskId = task.id;
  checkbox.disabled = savingTask || fileBusy || trackerDraftPending();
  checkbox.setAttribute("aria-label", `„${task.title}“ ${task.completed ? "wieder öffnen" : "als erledigt markieren"}`);
  checkbox.addEventListener("change", () => completeTaskFromCard(task.id, checkbox));
  return checkbox;
}
function completionTimestamp(task) {
  return typeof task.completedAt === "string" && Number.isFinite(Date.parse(task.completedAt)) ? Date.parse(task.completedAt) : null;
}
function renderCompletedTasks(now) {
  const query = filterSearch.value.trim().toLocaleLowerCase("de");
  const all = tasks.filter(task => task.completed && !task.deletedAt);
  const dated = filterHomeTasks(all, { search: "", project: selectedProjectKey, due: filterDue.value, planned: filterPlanned.value }, now);
  const visible = dated.filter(task =>
    [task.title, task.description || "", ...(task.checklist || []).map(item => item?.text || "")].some(text =>
      typeof text === "string" && text.toLocaleLowerCase("de").includes(query)));
  visible.sort((a, b) => (completionTimestamp(b) ?? -Infinity) - (completionTimestamp(a) ?? -Infinity) || a.title.localeCompare(b.title, "de"));
  document.querySelector("#completed-list").replaceChildren(...visible.map(task => {
    const row = document.createElement("li"); row.className = "task-row";
    const summary = document.createElement("div"); summary.className = "task-summary";
    const heading = document.createElement("div"); heading.className = "task-completion-heading";
    const title = createTaskOptionsButton(task); title.classList.add("task-title");
    heading.append(createCompletionCheckbox(task), title);
    const project = document.createElement("span"); project.className = "task-date"; project.textContent = task.project || "Ohne Projekt";
    summary.append(heading, project);
    const details = document.createElement("div"); details.className = "task-dates";
    const completed = document.createElement("span"); completed.className = "task-date";
    const timestamp = completionTimestamp(task);
    completed.textContent = timestamp === null ? "Abschlussdatum unbekannt" : "Erledigt: " + new Date(timestamp).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    const total = document.createElement("span"); total.className = "task-date";
    total.textContent = "Arbeitszeit: " + timeClock(task.timeTracking?.totalMs || 0);
    details.append(completed, total);
    const time = document.createElement("button"); time.type = "button"; time.className = "button task-time-button"; time.textContent = "Zeiten ansehen";
    time.addEventListener("click", () => { selectedTimeTask = task.id; openTimeControls(); document.querySelector(".time-details").open = true; });
    row.append(summary, details, time); bindTaskOptionsRow(row, task); return row;
  }));
  document.querySelector("#completed-count").textContent = String(visible.length);
  document.querySelector("#completed-empty").hidden = visible.length > 0;
  document.querySelector("#completed-empty p").textContent = !tasksLoaded ? "Aufgaben konnten noch nicht geladen werden." : all.length ? "Keine erledigten Aufgaben passen zu diesen Filtern." : "Noch keine erledigten Aufgaben.";
  return { visible: visible.length, total: all.length };
}

function renderTrashTasks() {
  const query = filterSearch.value.trim().toLocaleLowerCase("de");
  const all = tasks.filter(task => task.deletedAt);
  const visible = all.filter(task => (!selectedProjectKey || projectKey(task) === selectedProjectKey) &&
    [task.title, task.description, ...(task.checklist || []).map(item => item?.text)].some(value => typeof value === "string" && value.toLocaleLowerCase("de").includes(query)));
  visible.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || a.title.localeCompare(b.title, "de"));
  document.querySelector("#trash-list").replaceChildren(...visible.map(task => {
    const original = fileDocument ? fileDocument.tasks.find(item => item.id === task.id) : task;
    const expected = JSON.stringify(original);
    const row = document.createElement("li"); row.className = "trash-row";
    const title = document.createElement("h3"); title.textContent = task.title;
    const metadata = document.createElement("p"); metadata.className = "task-date";
    metadata.textContent = (task.project || "Ohne Projekt") + " · " + (task.completed ? "Erledigt" : "Offen") + " · Gelöscht: " + new Date(task.deletedAt).toLocaleString("de-DE");
    const details = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = "Inhalt und Zeiten ansehen";
    const notes = document.createElement("p"); notes.className = "trash-notes";
    notes.textContent = typeof task.description === "string" && task.description ? task.description : "Keine Anmerkungen.";
    const checklist = document.createElement("ul");
    for (const item of task.checklist || []) {
      const li = document.createElement("li"); li.textContent = (item?.done ? "✓ " : "○ ") + (typeof item?.text === "string" ? item.text : "Unteraufgabe ohne Text"); checklist.append(li);
    }
    const dates = document.createElement("p");
    dates.textContent = "Bearbeitungsdatum: " + (task.plannedDate || "Ohne Datum") + " · Frist: " + (task.dueDate || "Ohne Frist");
    const time = document.createElement("p"); time.textContent = "Erfasste Arbeitszeit: " + timeClock(task.timeTracking?.totalMs || 0);
    const history = document.createElement("ul"); history.className = "trash-history";
    for (const entry of task.timeTracking?.entries || []) {
      const li = document.createElement("li"); li.textContent = new Date(entry.at).toLocaleString("de-DE") + " · " + timeClock(entry.durationMs); history.append(li);
    }
    details.append(summary, notes, checklist, dates, time, history);
    const actions = document.createElement("div"); actions.className = "trash-actions";
    for (const [action, label] of [["restore", "Wiederherstellen"], ["purge", "Endgültig löschen"]]) {
      const button = document.createElement("button"); button.type = "button";
      button.className = "button trash-action" + (action === "purge" ? " trash-purge" : "");
      button.textContent = label; button.disabled = !canChangeFile() || trackerDraftPending();
      button.addEventListener("click", () => changeTrashTask(task.id, expected, action)); actions.append(button);
    }
    row.append(title, metadata, details, actions); return row;
  }));
  document.querySelector("#trash-count").textContent = String(visible.length);
  document.querySelector("#trash-empty").hidden = visible.length > 0;
  document.querySelector("#trash-empty p").textContent = all.length ? "Keine gelöschten Aufgaben passen zu diesen Filtern." : "Der Papierkorb ist leer.";
  document.querySelector("#filter-summary").textContent = `${visible.length} von ${all.length} gelöschten Aufgaben angezeigt`;
}

async function changeTrashTask(id, expected, action) {
  if (!canChangeFile() || trackerDraftPending() || !tasksLoaded) return;
  const task = tasks.find(item => item.id === id);
  if (!task?.deletedAt) return;
  if (action === "purge" && !window.confirm(`„${task.title}“ endgültig löschen? Anmerkungen, Unteraufgaben und erfasste Zeiten werden ebenfalls entfernt. Diese Aktion kann im Tracker nicht rückgängig gemacht werden.`)) return;
  savingTask = true; updateFileStatus();
  try {
    if (fileDocument) {
      const next = trackerFiles.deleteTask(fileDocument, id, expected, action);
      await saveWorkingDraft(next);
      fileDocument = next; tasks = trackerFiles.toTasks(next); fileDirty = true; fileMessage = "";
    } else {
      const saved = await taskStorage.deleteTask(id, expected, action);
      tasks = saved ? tasks.map(item => item.id === id ? saved : item) : tasks.filter(item => item.id !== id);
    }
    completionUndo = null; document.querySelector("#completion-feedback").hidden = true;
    document.querySelector("#trash-feedback").textContent = `„${task.title}“ ${action === "restore" ? "wiederhergestellt" : "endgültig gelöscht"}.`;
    updateProjectOptions(); refreshHomeTasks();
    document.querySelector("#welcome-title").focus({ preventScroll: true });
  } catch (error) { showFileError(error); }
  finally { savingTask = false; updateFileStatus(); }
}

function renderHomeTasks(items, now = new Date()) {
  const allGroups = groupHomeTasks(items, now);
  const filters = { search: filterSearch.value, due: filterDue.value, planned: filterPlanned.value, project: selectedProjectKey };
  const active = !!filters.search.trim() || filters.due !== "all" || filters.planned !== "all" || !!filters.project;
  const groups = Object.fromEntries(Object.entries(allGroups).map(([name, list]) => [name, filterHomeTasks(list, filters, now)]));
  const total = Object.values(allGroups).reduce((sum, list) => sum + list.length, 0);
  const visible = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  for (const [name, list] of Object.entries(groups)) {
    const container = document.querySelector(`#${name}-list`);
    const rows = list.map(task => {
      const row = document.createElement("li");
      row.className = "task-row";
      const title = createTaskOptionsButton(task);
      title.classList.add("task-title");
      const dates = document.createElement("div");
      dates.className = "task-dates";
      const appendDate = (label, value, className) => {
        const date = document.createElement("time");
        date.className = className;
        date.dateTime = value;
        const formatted = value === localDateKey(now) ? "Heute" : dateFormat.format(new Date(`${value}T12:00:00`));
        date.textContent = `${label}: ${formatted}`;
        dates.append(date);
      };
      if (task.plannedDate) appendDate("Geplant", task.plannedDate, "task-date task-planned-date");
      const overdue = task.dueDate < localDateKey(now);
      if (task.dueDate) appendDate(overdue ? "Frist überschritten" : "Frist", task.dueDate,
        `task-date task-due-date${overdue ? " task-date-overdue" : ""}`);
      const summary = document.createElement("div"); summary.className = "task-summary";
      const heading = document.createElement("div"); heading.className = "task-completion-heading";
      heading.append(createCompletionCheckbox(task), title);
      summary.append(heading, dates, createTaskProgress(task));
      row.classList.add('task-card');
      row.append(summary, createTimeButton(task));
      bindTaskOptionsRow(row, task);
      return row;
    });
    container.replaceChildren(...rows);
    container.hidden = list.length === 0;
    document.querySelector(`#${name}-empty`).hidden = list.length > 0;
    document.querySelector(`#${name}-empty p`).textContent = active && allGroups[name].length > 0
      ? "Keine Aufgaben passen zu diesen Filtern."
      : name === "today" ? "Keine Aufgaben für heute."
      : name === "overdue" ? "Keine überfälligen Aufgaben."
      : name === "undated" ? "Keine Aufgaben ohne Termin." : "Keine kommenden Aufgaben.";
    document.querySelector(`#${name}-count`).textContent = active ? `${list.length} / ${allGroups[name].length}` : String(list.length);
    container.closest(".task-section").hidden = activeView !== "home" || filterStatus.value === "done" ||
      (name === "undated" && allGroups.undated.length === 0);
  }
  return { visible, total, active };
}

// Refresh date groups after midnight, including when returning from standby.
let homeRefreshTimer;
function refreshHomeTasks() {
  clearTimeout(homeRefreshTimer);
  const now = new Date();
  const activeFilters = activeView === "trash" ? 0 : Number(filterStatus.value !== (activeView === "week" ? "all" : "open")) +
    Number(filterDue.value !== "all") + Number(filterPlanned.value !== "all");
  filterToggle.textContent = activeFilters ? "Filter (" + activeFilters + ")" : "Filter";
  if (tasksLoaded) {
    if (activeView === "home") {
      const open = renderHomeTasks(tasks, now);
      const status = filterStatus.value;
      const done = status === "open" ? { visible: 0, total: 0 } : renderCompletedTasks(now);
      const visible = (status === "done" ? 0 : open.visible) + done.visible;
      const total = (status === "done" ? 0 : open.total) + done.total;
      document.querySelector("#filter-summary").textContent = open.active || status !== "open"
        ? `${visible} von ${total} Aufgaben angezeigt` : "";
    }
    if (activeView === "trash") renderTrashTasks();
    renderTimePanel();
    if (activeView === "week") { updateWeekRange(); renderWeekTasks(now); }
  }
  document.querySelector("#completed-section").hidden = activeView !== "home" || filterStatus.value === "open";
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  homeRefreshTimer = setTimeout(refreshHomeTasks, midnight.getTime() - now.getTime() + 100);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshHomeTasks();
});
refreshHomeTasks();

filterForm.addEventListener("submit", event => event.preventDefault());
filterStatus.addEventListener("change", () => {
  if (activeView === "home" || activeView === "week") viewStatusFilters[activeView] = filterStatus.value;
});
filterForm.addEventListener("input", refreshHomeTasks);
filterForm.addEventListener("change", refreshHomeTasks);
document.querySelector("#reset-filters").addEventListener("click", () => {
  filterForm.reset();
  filterStatus.value = activeView === "week" ? "all" : "open";
  if (activeView === "home" || activeView === "week") viewStatusFilters[activeView] = filterStatus.value;
  selectedProjectKey = "";
  updateProjectSelection();
  refreshHomeTasks();
});

const taskDialog = document.querySelector("#task-dialog");
const taskForm = document.querySelector("#task-form");
const taskTitle = document.querySelector("#task-title");
const taskDue = document.querySelector("#task-due");
const taskPlanned = document.querySelector("#task-planned");
const taskProject = document.querySelector("#task-project");
const taskNewProject = document.querySelector("#task-new-project");
function updateTaskNewProject() {
  const creating = taskProject.value === "new";
  document.querySelector("#task-new-project-row").hidden = !creating;
  taskNewProject.disabled = !creating;
  taskNewProject.required = creating;
  taskNewProject.setCustomValidity("");
}
taskProject.addEventListener("change", updateTaskNewProject);
taskNewProject.addEventListener("input", () => taskNewProject.setCustomValidity(""));
const taskError = document.querySelector("#task-error");
const saveTask = document.querySelector("#save-task");
let savingTask = false;

function setupRepeatControls(prefix) {
  document.querySelector(`#${prefix}-repeat-controls`).innerHTML = `
    <label for="${prefix}-repeat">Wiederholung</label>
    <select id="${prefix}-repeat"><option value="none">Keine</option><option value="weekly">Wöchentlich</option><option value="daily">Täglich</option></select>
    <div id="${prefix}-repeat-fields" hidden>
      <div class="options-dates"><div><label for="${prefix}-repeat-interval">Abstand (Wochen / Tage)</label><input id="${prefix}-repeat-interval" type="number" min="1" max="52" value="1" required disabled></div>
      <div><label for="${prefix}-repeat-total">Anzahl insgesamt</label><input id="${prefix}-repeat-total" type="number" min="1" max="1000" placeholder="Unbegrenzt" disabled></div></div>
      <label for="${prefix}-repeat-pauses">Soll die Aufgabe Semesterpausen berücksichtigen?</label>
      <select id="${prefix}-repeat-pauses" required disabled><option value="">Bitte auswählen</option><option value="yes">Ja, Pausenwochen überspringen</option><option value="no">Nein, auch während der Pausen</option></select>
      <p class="storage-note">Mit Gesamtanzahl werden alle Termine sofort erstellt. Die Anzahl zählt diese Aufgabe mit. Leer bedeutet unbegrenzt; dann entsteht der nächste Termin beim Erledigen. Bereits erstellte Termine bleiben erhalten.</p>
    </div>`;
  document.querySelector(`#${prefix}-repeat`).addEventListener("change", () => updateRepeatControls(prefix));
}
function updateRepeatControls(prefix) {
  const enabled = document.querySelector(`#${prefix}-repeat`).value !== "none";
  const fields = document.querySelector(`#${prefix}-repeat-fields`);
  fields.hidden = !enabled;
  fields.querySelectorAll("input, select").forEach(input => { input.disabled = !enabled; });
}
function fillRepeatControls(prefix, rule) {
  document.querySelector(`#${prefix}-repeat`).value = rule?.frequency || "none";
  document.querySelector(`#${prefix}-repeat-interval`).value = rule?.interval || 1;
  document.querySelector(`#${prefix}-repeat-total`).value = rule?.total == null ? "" : rule.total - rule.index;
  document.querySelector(`#${prefix}-repeat-pauses`).value = rule ? rule.skipPauses ? "yes" : "no" : "";
  updateRepeatControls(prefix);
}
function readRepeatControls(prefix, previous) {
  const frequency = document.querySelector(`#${prefix}-repeat`).value;
  if (frequency === "none") return null;
  const planned = document.querySelector(`#${prefix}-planned`).value, due = document.querySelector(`#${prefix}-due`).value;
  if (!planned && !due) throw new Error("Bitte für die Wiederholung ein Bearbeitungsdatum oder eine Frist angeben.");
  const skipPauses = document.querySelector(`#${prefix}-repeat-pauses`).value === "yes";
  if (skipPauses && !(fileDocument ? fileDocument.semester : currentSemester())) throw new Error("Bitte zuerst in der Wochenansicht das Semester und seine Pausen einstellen.");
  const interval = Number(document.querySelector(`#${prefix}-repeat-interval`).value);
  const value = document.querySelector(`#${prefix}-repeat-total`).value;
  const total = value === "" ? null : Number(value);
  if (previous && previous.frequency === frequency && previous.interval === interval && previous.skipPauses === skipPauses &&
      (previous.total === null ? null : previous.total - previous.index) === total) return structuredClone(previous);
  const rule = { version: 1, seriesId: crypto.randomUUID(), index: 0, frequency, interval, total, skipPauses };
  if (!taskRepeat.valid(rule)) throw new Error("Bitte gültige Angaben zur Wiederholung machen.");
  return rule;
}
setupRepeatControls("task");
setupRepeatControls("options");

document.querySelector("#new-task").addEventListener("click", () => {
  if (!canChangeFile() || trackerDraftPending()) return;
  taskForm.reset();
  taskProject.value = [...taskProject.options].some(option => option.value === selectedProjectKey) ? selectedProjectKey : "";
  taskNewProject.value = "";
  updateTaskNewProject();
  fillRepeatControls("task", null);
  taskTitle.setCustomValidity("");
  taskError.hidden = true;
  document.querySelector("#task-storage-note").textContent = editingStorageMessage();
  taskDialog.showModal();
  beginEditor("task");
});

function closeTaskDialog() { if (!savingTask) requestEditorClose("task"); }
document.querySelector("#close-task").addEventListener("click", closeTaskDialog);
document.querySelector("#cancel-task").addEventListener("click", closeTaskDialog);
taskDialog.addEventListener("cancel", event => { event.preventDefault(); closeTaskDialog(); });
taskTitle.addEventListener("input", () => taskTitle.setCustomValidity(""));

taskForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (editorSessions.get("task")?.pending) return;
  if (!canChangeFile() || trackerDraftPending()) return;
  taskTitle.setCustomValidity(taskTitle.value.trim() ? "" : "Bitte einen Titel eingeben.");
  taskNewProject.setCustomValidity(taskProject.value === "new" && !taskNewProject.value.trim() ? "Bitte einen Projektnamen eingeben." : "");
  if (!taskForm.reportValidity()) return;
  savingTask = true;
  saveTask.disabled = true;
  taskError.hidden = true;
  try {
    const projectChoice = taskProject.value;
    const projectName = projectChoice === "new" ? taskNewProject.value.trim() : projectChoice.startsWith("id:")
      ? trackerFiles.projectLabels(fileDocument).get(projectChoice.slice(3)) || "" : projectChoice.startsWith("name:") ? projectChoice.slice(5) : projectChoice;
    const task = {
      id: crypto.randomUUID(), title: taskTitle.value.trim(), dueDate: taskDue.value,
      plannedDate: taskPlanned.value,
      project: projectName,
      ...(fileDocument && projectChoice.startsWith("id:") ? { projectId: projectChoice.slice(3) } : {}),
      taskType: document.querySelector("#task-type").value, repeatRule: readRepeatControls("task"),
      completed: false, createdAt: new Date().toISOString(),
    };
    if (fileDocument) {
      const next = trackerFiles.append(fileDocument, task);
      await saveWorkingDraft(next);
      if (completionUndo?.document === fileDocument) completionUndo.document = next;
      fileDocument = next;
      tasks = trackerFiles.toTasks(next);
      fileDirty = true;
      fileMessage = "";
      updateFileStatus();
    } else {
      await taskStorage.add(task, currentSemester());
      tasks = await taskStorage.load();
    }
    updateProjectOptions();
    refreshHomeTasks();
    finishEditor("task"); taskDialog.close();
  } catch (error) {
    taskError.textContent = error.message || "Die Aufgabe konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.";
    taskError.hidden = false;
  } finally {
    savingTask = false;
    saveTask.disabled = false;
    updateFileStatus();
  }
});

async function loadTasks() {
  try {
    await restoreTrackerSession();
    browserProjectOrder = await taskStorage.loadProjectOrder();
    browserProjectStyles = await taskStorage.loadProjectStyles();
    if (!fileDocument) [tasks, browserFreeTime] = await Promise.all([taskStorage.load(), taskStorage.loadFreeTime()]);
    tasksLoaded = true;
    updateProjectOptions();
    refreshHomeTasks();
  } catch (error) {
    document.querySelector("#week-empty").textContent = "Aufgaben konnten nicht geladen werden. Bitte die Seite erneut öffnen.";
    // Do not report an empty collection when stored data could not be read.
    for (const name of ["today", "overdue", "upcoming", "undated"]) {
      document.querySelector(`#${name}-empty`).hidden = false;
      document.querySelector(`#${name}-empty p`).textContent = "Aufgaben konnten nicht geladen werden. Bitte die Seite erneut öffnen.";
      document.querySelector(`#${name}-count`).textContent = "–";
    }
  } finally {
    setFileBusy(false);
    if (driveLink && trackerDrive.session) { driveNextSync = 0; syncDriveTracker(); }
  }
}

function startOfWeek(value) {
  const start = new Date(value);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}

function isWeekTaskOverdue(task, today) {
  const deadline = task.dueDate || task.plannedDate;
  return !task.completed && !!deadline && deadline < today;
}

function weekTaskDate(task) {
  // Keep the calendar position stable when tasks become overdue or are completed.
  return task.plannedDate || task.dueDate;
}

function groupWeekTasks(items, week, weekCount = 1, knownProjects = [], now = new Date()) {
  const start = startOfWeek(week);
  const end = new Date(start);
  end.setDate(end.getDate() + weekCount * 7 - 1);
  const firstDay = localDateKey(start);
  const lastDay = localDateKey(end);
  const projects = new Map();
  for (const project of knownProjects) {
    projects.set(`id:${project.id}`, { project: project.name, tasks: [] });
  }
  for (const task of items) {
    if (task.deletedAt) continue;
    const project = (task.project || "").trim();
    const key = task.projectId ? `id:${task.projectId}` : `name:${project}`;
    if (!projects.has(key)) projects.set(key, { project, tasks: [] });
    const date = weekTaskDate(task);
    if (!date || date < firstDay || date > lastDay) continue;
    projects.get(key).tasks.push(task);
  }
  if (!projects.size) projects.set("name:", { project: "", tasks: [] });
  const order = projectSortOrder();
  return [...projects].sort(([aKey, a], [bKey, b]) =>
    compareProjectEntries([aKey, a.project], [bKey, b.project], order)
  ).map(([key, { project, tasks: items }]) => ({ key, project, tasks: items.sort((a, b) =>
    (a.plannedDate || a.dueDate).localeCompare(b.plannedDate || b.dueDate) || a.title.localeCompare(b.title, "de")) }));
}

function buildWeekRows(columns, start, count, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const first = startOfWeek(start);
    first.setDate(first.getDate() + index * 7);
    const last = new Date(first);
    last.setDate(last.getDate() + 6);
    const firstKey = localDateKey(first), lastKey = localDateKey(last);
    return { start: first, end: last, cells: columns.map(column => column.tasks.filter(task => {
      const date = weekTaskDate(task);
      return date >= firstKey && date <= lastKey;
    })) };
  });
}

function isoWeekNumber(date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
}

function createWeekTaskCard(task, now, dateFormat) {
      const row = document.createElement("li");
      row.className = `week-task${task.completed ? " is-completed" : ""}`;
      const title = document.createElement("div");
      title.className = "week-task-title";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-complete";
      checkbox.checked = !!task.completed;
      checkbox.dataset.taskId = task.id;
      checkbox.disabled = savingTask || fileBusy || trackerDraftPending();
      checkbox.setAttribute("aria-label", `„${task.title}“ ${task.completed ? "wieder öffnen" : "als erledigt markieren"}`);
      checkbox.addEventListener("change", () => completeTaskFromCard(task.id, checkbox));
      const titleText = createTaskOptionsButton(task);
      title.append(checkbox, titleText);
      row.append(title);
      const footer = document.createElement("div"); footer.className = "week-task-footer";
      const dates = document.createElement("div"); dates.className = "week-task-dates";
      for (const [label, date] of [["Geplant", task.plannedDate], ["Frist", task.dueDate]]) {
        if (!date) continue;
        const time = document.createElement("time");
        time.dateTime = date;
        const overdue = (label === "Frist" || !task.dueDate) && isWeekTaskOverdue(task, localDateKey(now));
        if (overdue) time.className = "task-date-overdue";
        const dateLabel = document.createElement("span");
        dateLabel.className = "week-date-label";
        dateLabel.textContent = (overdue ? "Überfällig" : label) + ":";
        const dateValue = document.createElement("span");
        dateValue.className = "week-date-value";
        dateValue.textContent = dateFormat.format(new Date(`${date}T12:00:00`));
        time.append(dateLabel, dateValue);
        dates.append(time);
      }
  footer.append(dates);
  if (!task.completed) footer.append(createTimeButton(task));
      row.append(footer, createTaskProgress(task));
  bindTaskOptionsRow(row, task);
  return row;
}

function renderWeekTasks(now = new Date()) {
  const filters = { search: filterSearch.value, due: filterDue.value, planned: filterPlanned.value, project: selectedProjectKey };
  const knownProjects = fileDocument
    ? [...trackerFiles.projectLabels(fileDocument)].map(([id, name]) => ({ id, name })) : [];
  const { start, count, weeks } = weekPeriod();
  const allColumns = groupWeekTasks(tasks, start, count, knownProjects, now);
  const weekTasks = allColumns.flatMap(column => column.tasks);
  const columns = allColumns.map(column => ({ ...column, total: column.tasks.length,
    tasks: filterHomeTasks(column.tasks, filters, now).filter(task =>
      filterStatus.value === "all" || !!task.completed === (filterStatus.value === "done")) }));
  const filtered = columns.flatMap(column => column.tasks);
  const board = document.querySelector("#week-board");
  const dateFormat = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const rows = buildWeekRows(columns, start, count, now);
  const mobile = touchWeekLayout.matches;
  board.setAttribute("aria-label", mobile ? "Wochen und Projekte" : "Projektspalten – seitlich scrollbar");
  board.tabIndex = mobile ? -1 : 0;
  board.classList.toggle("is-stacked", mobile);
  board.classList.toggle("is-compact", mobile && !mobileWeekDetails);
  board.replaceChildren(mobile ? createMobileWeeks(rows, columns, now, dateFormat, weeks)
    : createWeekTable(rows, columns, now, dateFormat, weeks));
  board.hidden = columns.length === 0;
  const empty = document.querySelector("#week-empty");
  empty.hidden = columns.length > 0;
  empty.textContent = weekTasks.length ? "Keine Aufgaben passen zu diesen Filtern." : "Keine Aufgaben für diesen Zeitraum.";
  const active = filterStatus.value !== "all" || filters.search.trim() || filters.due !== "all" || filters.planned !== "all" || !!filters.project;
  document.querySelector("#filter-summary").textContent = active ? `${filtered.length} von ${weekTasks.length} Aufgaben dieses Zeitraums angezeigt` : "";
}

const weekShortDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
function appendWeekLabel(label, week, isCurrentWeek, weeks) {
  const number = document.createElement("strong");
  number.textContent = "KW " + isoWeekNumber(week.start);
  const range = document.createElement("span");
  range.className = "week-row-range";
  range.textContent = weekShortDate.format(week.start) + " – " + weekShortDate.format(week.end);
  label.append(number, range);
  if (weeks) {
    const semesterLabel = document.createElement("span");
    semesterLabel.className = "semester-week-label";
    const weekNumber = weeks.get(localDateKey(week.start));
    semesterLabel.textContent = weekNumber === 0 ? "Semesterpause" : "Semesterwoche " + weekNumber;
    label.append(semesterLabel);
  }
  if (isCurrentWeek) {
    const current = document.createElement("span");
    current.className = "current-week-label";
    current.textContent = "Diese Woche";
    label.append(current);
  }
}
function createWeekTaskList(items, now, dateFormat) {
  const list = document.createElement("ul");
  list.className = "week-task-list";
  for (const task of items) list.append(createWeekTaskCard(task, now, dateFormat));
  return list;
}
function createMobileWeeks(rows, columns, now, dateFormat, weeks) {
  const result = document.createDocumentFragment();
  const currentWeek = localDateKey(startOfWeek(now));
  for (const week of rows) {
    const section = document.createElement("section");
    const isCurrentWeek = localDateKey(week.start) === currentWeek;
    section.className = `mobile-week${isCurrentWeek ? " is-current-week" : ""}`;
    if (isCurrentWeek) section.setAttribute("aria-current", "date");
    const heading = document.createElement("h3");
    heading.className = "mobile-week-heading";
    appendWeekLabel(heading, week, isCurrentWeek, weeks);
    section.append(heading);
    week.cells.forEach((items, index) => {
      if (!items.length) return;
      const project = document.createElement("details");
      project.className = "mobile-week-project";
      const key = JSON.stringify([localDateKey(week.start), projectKey(items[0])]);
      project.open = weekProjectExpansion.get(key) ?? false;
      project.addEventListener("toggle", () => {
        if (project.isConnected) weekProjectExpansion.set(key, project.open);
      });
      const summary = document.createElement("summary");
      const name = document.createElement("span");
      name.textContent = columns[index].project || "Ohne Projekt";
      const count = document.createElement("span");
      count.className = "mobile-week-project-count";
      const open = items.filter(task => !task.completed).length;
      const done = items.length - open;
      count.textContent = [open ? open + " offen" : "", done ? done + " erledigt" : ""].filter(Boolean).join(" · ");
      summary.append(name, count);
      project.append(summary, createWeekTaskList(items, now, dateFormat));
      section.append(project);
    });
    if (!week.cells.some(items => items.length)) {
      const empty = document.createElement("p");
      empty.className = "mobile-week-empty";
      empty.textContent = "Keine Aufgaben für diese Woche.";
      section.append(empty);
    }
    result.append(section);
  }
  return result;
}
function createWeekTable(rows, columns, now, dateFormat, weeks) {
  const table = document.createElement("table");
  table.className = "week-table";
  table.setAttribute("aria-label", "Wochen und Projekte");
  table.style.minWidth = (112 + columns.length * 300) + "px";
  const colgroup = document.createElement("colgroup");
  const weekColumn = document.createElement("col");
  weekColumn.className = "week-label-column";
  colgroup.append(weekColumn);
  for (const column of columns) colgroup.append(document.createElement("col"));
  const thead = document.createElement("thead");
  const headings = document.createElement("tr");
  const corner = document.createElement("th");
  corner.scope = "col";
  corner.textContent = "Woche";
  headings.append(corner);
  for (const column of columns) {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = column.project || "Ohne Projekt";
    headings.append(heading);
  }
  thead.append(headings);
  const tbody = document.createElement("tbody");
  for (const week of rows) {
    const tr = document.createElement("tr");
    const isCurrentWeek = localDateKey(week.start) === localDateKey(startOfWeek(now));
    if (isCurrentWeek) tr.className = "current-week-row";
    const label = document.createElement("th");
    label.scope = "row";
    appendWeekLabel(label, week, isCurrentWeek, weeks);
    tr.append(label);
    for (const cellTasks of week.cells) {
      const cell = document.createElement("td");
      if (cellTasks.length) {
        cell.append(createWeekTaskList(cellTasks, now, dateFormat));
      } else {
        const emptyCell = document.createElement("span");
        emptyCell.className = "week-cell-empty";
        emptyCell.textContent = "–";
        emptyCell.setAttribute("aria-label", "Keine Aufgaben in dieser Woche für die gewählten Filter");
        cell.append(emptyCell);
      }
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(colgroup, thead, tbody);
  return table;
}

function updateWeekRange() {
  const semester = currentSemester();
  const showSemester = semesterMode && !!semester;
  const { start, count } = weekPeriod();
  document.querySelector("#week-count").value = showSemester ? "semester" : String(selectedWeekCount);
  const end = new Date(start);
  end.setDate(end.getDate() + count * 7 - 1);
  for (const id of ["previous-week", "next-week", "current-week"]) document.getElementById(id).hidden = showSemester;
  const note = document.querySelector("#semester-note");
  note.hidden = !showSemester;
  if (showSemester) {
    const year = semester.start.slice(0, 4);
    note.textContent = semester.type === "summer" ? "Sommersemester " + year : "Wintersemester " + year + "/" + (Number(year) + 1);
  }
  const format = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const range = document.querySelector("#week-range");
  const fullRange = `${format.format(start)} – ${format.format(end)}`;
  range.textContent = touchWeekLayout.matches ? `${weekShortDate.format(start)} – ${weekShortDate.format(end)}` : fullRange;
  range.setAttribute("aria-label", fullRange);
}

function updateProjectOptions() {
  const selected = taskProject.value;
  taskProject.replaceChildren(new Option("Ohne Projekt", ""),
    ...projectMenuEntries(tasks, fileDocument).filter(([key]) => key !== "name:").map(([key, name]) => new Option(name, key)),
    new Option("Neues Projekt …", "new"));
  taskProject.value = [...taskProject.options].some(option => option.value === selected) ? selected : "";
  renderProjectMenu();
}

function projectKey(task) {
  return task.projectId ? `id:${task.projectId}` : `name:${(task.project || "").trim()}`;
}

function projectSortOrder(doc = fileDocument) {
  return new Map((doc ? doc.projectOrder || [] : browserProjectOrder).map((key, index) => [key, index]));
}

function compareProjectEntries([aKey, a], [bKey, b], order) {
  if (aKey === bKey) return 0;
  if (aKey === "name:") return 1;
  if (bKey === "name:") return -1;
  const difference = (order.get(aKey) ?? Infinity) - (order.get(bKey) ?? Infinity);
  return difference && !Number.isNaN(difference) ? difference : a.localeCompare(b, "de");
}

function projectMenuEntries(items, doc) {
  const order = projectSortOrder(doc);
  const projects = doc ? new Map([...trackerFiles.projectLabels(doc)].map(([id, name]) => [`id:${id}`, name])) : new Map();
  for (const task of items) {
    const key = projectKey(task);
    if (!projects.has(key)) projects.set(key, (task.project || "").trim() || "Ohne Projekt");
  }
  return [...projects].sort((a, b) => compareProjectEntries(a, b, order));
}

function renderProjectMenu() {
  const entries = [["", "Alle Projekte"], ...projectMenuEntries(tasks, fileDocument)];
  if (!entries.some(([key]) => key === selectedProjectKey)) selectedProjectKey = "";
  document.querySelector("#project-menu").replaceChildren(...entries.map(([key, name]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-menu-button";
    button.dataset.projectKey = key;
    button.textContent = name;
    button.addEventListener("click", () => {
      selectedProjectKey = key;
      updateProjectSelection();
      if (["time", "settings"].includes(activeView)) location.hash = "#start";
      refreshHomeTasks();
      closeMobileMenu();
    });
    if (!key || key === "name:") return button;
    const row = document.createElement("div"); row.className = "project-menu-row"; row.dataset.projectKey = key;
    const grip = document.createElement("button"); grip.type = "button"; grip.className = "project-drag-handle";
    grip.textContent = "⠿";
    grip.setAttribute("aria-label", name + " verschieben");
    grip.title = "Ziehen oder mit den Pfeiltasten verschieben";
    grip.disabled = !canChangeFile() || trackerDraftPending();
    bindProjectDrag(grip, row, key);
    row.append(grip, button);
    return row;
  }));
  updateProjectSelection();
}

async function reorderProject(source, target, after = false) {
  if (!canChangeFile() || trackerDraftPending() || source === target) return;
  const keys = projectMenuEntries(tasks, fileDocument).map(([key]) => key).filter(key => key !== "name:");
  if (!keys.includes(source) || !keys.includes(target)) return;
  const nextOrder = keys.filter(key => key !== source);
  nextOrder.splice(nextOrder.indexOf(target) + Number(after), 0, source);
  if (JSON.stringify(keys) === JSON.stringify(nextOrder)) return;
  savingTask = true; updateFileStatus();
  try {
    if (fileDocument) {
      const next = structuredClone(fileDocument); next.projectOrder = nextOrder; next.updatedAt = new Date().toISOString();
      trackerFiles.validate(next);
      await saveWorkingDraft(next);
      if (completionUndo?.document === fileDocument) completionUndo.document = next;
      fileDocument = next; fileDirty = true;
    } else {
      await taskStorage.saveProjectOrder(browserProjectOrder, nextOrder);
      browserProjectOrder = nextOrder;
    }
  } catch (error) { showFileError(error); }
  finally {
    savingTask = false;
    renderProjectMenu(); refreshHomeTasks(); updateFileStatus();
    [...document.querySelectorAll(".project-menu-row")].find(row => row.dataset.projectKey === source)?.querySelector(".project-drag-handle").focus({ preventScroll: true });
  }
}

function bindProjectDrag(grip, row, key) {
  let drag = null;
  const clear = () => {
    row.classList.remove("is-dragging");
    document.querySelectorAll(".project-drop-before, .project-drop-after").forEach(el => el.classList.remove("project-drop-before", "project-drop-after"));
  };
  grip.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !canChangeFile() || trackerDraftPending()) return;
    drag = { x: event.clientX, y: event.clientY, target: null, after: false };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener("pointermove", event => {
    if (!drag || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    clear(); row.classList.add("is-dragging");
    const content = row.closest(".menu-content"), bounds = content.getBoundingClientRect();
    if (event.clientY < bounds.top + 36) content.scrollTop -= 12;
    if (event.clientY > bounds.bottom - 36) content.scrollTop += 12;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".project-menu-row");
    drag.target = target && target !== row ? target.dataset.projectKey : null;
    if (drag.target) {
      const rect = target.getBoundingClientRect(); drag.after = event.clientY > rect.top + rect.height / 2;
      target.classList.add(drag.after ? "project-drop-after" : "project-drop-before");
    }
  });
  grip.addEventListener("pointerup", event => {
    const completed = drag; drag = null; clear();
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    if (completed?.target) reorderProject(key, completed.target, completed.after);
  });
  grip.addEventListener("pointercancel", () => { drag = null; clear(); });
  grip.addEventListener("keydown", event => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const keys = projectMenuEntries(tasks, fileDocument).map(([key]) => key).filter(key => key !== "name:");
    const target = keys[keys.indexOf(key) + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) reorderProject(key, target, event.key === "ArrowDown");
  });
}

function updateProjectSelection() {
  let selectedName = "";
  document.querySelectorAll(".project-menu-button").forEach(button => {
    const selected = button.dataset.projectKey === selectedProjectKey;
    button.setAttribute("aria-pressed", String(selected));
    if (selected) selectedName = button.textContent;
  });
  const status = document.querySelector("#project-filter-status");
  status.hidden = !selectedProjectKey;
  status.textContent = selectedProjectKey ? `Projekt: ${selectedName}` : "";
}

function updateView() {
  if (location.hash === "#erledigt") {
    viewStatusFilters.home = "done";
    history.replaceState(null, "", "#start");
  }
  activeView = location.hash === "#papierkorb" ? "trash" : location.hash === "#einstellungen" ? "settings" : location.hash === "#zeiterfassung" ? "time" : location.hash === "#woche" ? "week" : "home";
  filterStatus.value = viewStatusFilters[activeView] || "open";
  document.querySelectorAll(".task-section").forEach(section => { section.hidden = activeView !== "home"; });
  document.querySelector("#trash-view").hidden = activeView !== "trash";
  for (const input of [filterStatus, filterDue, filterPlanned]) input.closest("label").hidden = activeView === "trash";
  document.querySelector("#week-view").hidden = activeView !== "week";
  document.querySelector("#time-view").hidden = activeView !== "time";
  document.querySelector("#settings-view").hidden = activeView !== "settings";
  document.querySelector(".filters").hidden = ["time", "settings"].includes(activeView);
  document.querySelector("#new-task").hidden = ["time", "settings", "trash"].includes(activeView);
  const title = activeView === "trash" ? "Papierkorb" : activeView === "settings" ? "Einstellungen" : activeView === "time" ? "Zeiterfassung" : activeView === "week" ? "Wochenansicht" : "Aufgabenübersicht";
  document.querySelector("#welcome-title").textContent = title;
  document.title = `${activeView === "home" ? "Startseite" : title} · tasktracker`;
  document.querySelectorAll("[data-view]").forEach(link => {
    if (link.dataset.view === activeView) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  updateWeekRange();
  refreshHomeTasks();
}

document.querySelectorAll("[data-view]").forEach(link => link.addEventListener("click", closeMobileMenu));
window.addEventListener("hashchange", updateView);
document.querySelector("#previous-week").addEventListener("click", () => {
  selectedWeek.setDate(selectedWeek.getDate() - selectedWeekCount * 7);
  updateWeekRange();
  refreshHomeTasks();
});
document.querySelector("#next-week").addEventListener("click", () => {
  selectedWeek.setDate(selectedWeek.getDate() + selectedWeekCount * 7);
  updateWeekRange();
  refreshHomeTasks();
});
document.querySelector("#current-week").addEventListener("click", () => {
  selectedWeek = startOfWeek(new Date());
  updateWeekRange();
  refreshHomeTasks();
});
document.querySelector("#week-count").addEventListener("change", event => {
  if (event.target.value === "semester") {
    if (!currentSemester()) {
      event.target.value = String(selectedWeekCount);
      openSemesterDialog();
      return;
    }
    semesterMode = true;
    updateWeekRange();
    refreshHomeTasks();
    return;
  }
  const count = Number(event.target.value);
  if (![1, 4, 6, 8].includes(count)) return;
  semesterMode = false;
  selectedWeekCount = count;
  updateWeekRange();
  refreshHomeTasks();
});
const semesterDialog = document.querySelector("#semester-dialog");
const semesterPauses = document.querySelector("#semester-pauses");
function currentSemester() {
  return fileDocument?.semester || localSemester;
}
function weekPeriod() {
  const semester = currentSemester();
  if (!semester || !semesterMode) return { start: selectedWeek, count: selectedWeekCount };
  const start = startOfWeek(new Date(semester.start + "T12:00:00"));
  const week = new Date(start), weeks = new Map();
  let number = 0;
  while (number < semester.length) {
    const first = localDateKey(week);
    const last = new Date(week);
    last.setDate(last.getDate() + 6);
    const lastKey = localDateKey(last);
    const paused = semester.pauses.some(pause => pause.from <= lastKey && pause.to >= first);
    weeks.set(first, paused ? 0 : ++number);
    week.setDate(week.getDate() + 7);
  }
  return { start, count: weeks.size, weeks };
}
function addSemesterPause(pause = {}) {
  const row = document.createElement("div");
  row.className = "semester-pause";
  for (const [field, labelText] of [["from", "Pause von"], ["to", "Pause bis"]]) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "date";
    input.required = true;
    input.value = pause[field] || "";
    label.append(input);
    row.append(label);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button";
  remove.textContent = "Entfernen";
  remove.addEventListener("click", () => {
    row.remove();
    document.querySelector("#add-semester-pause").focus();
  });
  row.append(remove);
  semesterPauses.append(row);
  return row;
}
function openSemesterDialog() {
  if (!canChangeFile() || trackerDraftPending()) return;
  const semester = currentSemester();
  document.querySelector("#semester-type").value = semester?.type || "winter";
  document.querySelector("#semester-start").value = semester?.start || localDateKey(selectedWeek);
  document.querySelector("#semester-length").value = semester?.length || 15;
  document.querySelector("#semester-error").hidden = true;
  semesterPauses.replaceChildren();
  semester?.pauses.forEach(addSemesterPause);
  semesterDialog.showModal();
}
document.querySelector("#edit-semester").addEventListener("click", openSemesterDialog);
document.querySelector("#cancel-semester").addEventListener("click", () => { if (!savingTask) semesterDialog.close(); });
semesterDialog.addEventListener("cancel", event => { if (savingTask) event.preventDefault(); });
document.querySelector("#add-semester-pause").addEventListener("click", () => addSemesterPause().querySelector("input").focus());
document.querySelector("#semester-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!canChangeFile() || trackerDraftPending()) return;
  const config = {
    type: document.querySelector("#semester-type").value,
    start: document.querySelector("#semester-start").value,
    length: Number(document.querySelector("#semester-length").value),
    pauses: [...semesterPauses.children].map(row => {
      const [from, to] = row.querySelectorAll("input");
      return { from: from.value, to: to.value };
    })
  };
  const error = document.querySelector("#semester-error");
  if (!validSemester(config)) {
    error.textContent = "Pausen müssen ab Semesterstart liegen und innerhalb eines Jahres enden. Prüfe auch die Reihenfolge der Daten.";
    error.hidden = false;
    return;
  }
  const controls = [...document.querySelectorAll("#semester-form input, #semester-form select, #semester-form button")];
  savingTask = true;
  controls.forEach(control => { control.disabled = true; });
  updateFileStatus();
  try {
    if (fileDocument) {
      const next = structuredClone(fileDocument);
      next.semester = config;
      next.updatedAt = new Date().toISOString();
      trackerFiles.validate(next);
      await saveWorkingDraft(next);
      if (completionUndo?.document === fileDocument) completionUndo.document = next;
      fileDocument = next;
      fileDirty = true;
      fileMessage = "";
    } else {
      localStorage.setItem(semesterKey, JSON.stringify(config));
      localSemester = config;
    }
    semesterMode = true;
    semesterDialog.close();
    updateWeekRange();
    refreshHomeTasks();
  } catch {
    error.textContent = "Die Semestereinstellungen konnten nicht gespeichert werden. Deine Eingaben bleiben erhalten.";
    error.hidden = false;
  } finally {
    savingTask = false;
    controls.forEach(control => { control.disabled = false; });
    updateFileStatus();
  }
  if (!semesterDialog.open) document.querySelector("#edit-semester").focus();
});
updateView();

function saveWorkingDraft(document) {
  if (driveLink) return persistDriveCache(document);
  return taskStorage.saveDraft({ name: fileName, document, piRevision, piBaseDocument,
    resumeApproved: resumeApprovedDraft, savedBaseline: fileBaseline });
}

// Export every part of the active tracker, including browser-only semester settings.
// Imported documents retain their original identifiers and unknown legacy fields.
function currentTrackerDocument() {
  if (fileDocument) return trackerFiles.validate(structuredClone(fileDocument));
  const document = trackerFiles.fromTasks(tasks, browserFreeTime, browserProjectOrder, browserProjectStyles);
  if (localSemester) document.semester = structuredClone(localSemester);
  return trackerFiles.validate(document);
}

function editingStorageMessage() {
  if (driveLink) return 'Wird auf diesem Gerät gesichert und automatisch mit Google Drive abgeglichen.';
  if (piRevision) return "Wird automatisch mit dem Pi synchronisiert.";
  if (!fileDocument) return "Wird automatisch auf diesem Gerät gespeichert.";
  if (fileHandle && !fileAutoSaveBlocked) return "Wird automatisch auf diesem Gerät und in der Trackerdatei gespeichert.";
  return "Wird automatisch auf diesem Gerät gespeichert. Eine aktuelle Trackerdatei kannst du in den Einstellungen exportieren.";
}

function updateStorageGuidance() {
  const directFiles = typeof window.showSaveFilePicker === "function";
  document.querySelector("#tracker-folder-controls").hidden = !trackerFolder && typeof window.showDirectoryPicker !== "function";
  document.querySelector("#storage-explanation").textContent = driveLink
    ? 'Du bearbeitest „' + driveLink.title + '“ in Google Drive. Ein JSON-Export erstellt eine zusätzliche lokale Sicherung.' : githubPagesHosting
    ? "Deine Änderungen werden automatisch in diesem Browser gespeichert und beim nächsten Öffnen wieder geladen. Über „Trackerdatei importieren“ übernimmst du deinen bisherigen Tracker."
    : "Öffne eine Trackerdatei, speichere deine Änderungen oder erstelle eine Kopie.";
  document.querySelector("#storage-capabilities").textContent = driveLink
    ? 'Dein Arbeitsstand bleibt auch bei Verbindungsproblemen auf diesem Gerät gesichert.' : githubPagesHosting
    ? "Aufgaben bleiben auf diesem Gerät. Erstelle regelmäßig einen JSON-Export; das Löschen der Website-Daten entfernt auch den gespeicherten Arbeitsstand."
    : "";
  document.querySelector("#file-save-hint").textContent = driveLink
    ? 'Ein JSON-Export verändert die Drive-Verbindung nicht. Auf anderen Geräten dieselbe Drive-Datei auswählen.' : directFiles
    ? "Eine verbundene Datei kann zusätzlich automatisch gespeichert werden. Browseraufgaben und importierte Tracker bleiben getrennt."
    : "Dieser Browser unterstützt Import und Download. Eine Datei in „Dateien“ wird dadurch nicht automatisch überschrieben; exportiere deinen aktuellen Stand zur Sicherung oder Übertragung.";
  document.querySelector("#semester-storage-note").textContent = driveLink
    ? 'Semesterstart, Dauer und Pausen werden mit der Drive-Datei auf deine Geräte übertragen.' : piRevision
    ? "Semesterstart, Dauer und Pausen werden automatisch mit dem Pi synchronisiert."
    : "Semesterstart, Dauer und Pausen werden auf diesem Gerät gespeichert und beim JSON-Export mitgesichert.";
}

const persistStorageButton = document.querySelector("#persist-storage");
async function updatePersistentStorage(request = false) {
  if (!navigator.storage?.persisted || !navigator.storage?.persist) return;
  persistStorageButton.disabled = true;
  try {
    const persistent = request ? await navigator.storage.persist() : await navigator.storage.persisted();
    persistStorageButton.hidden = persistent || !githubPagesHosting;
    document.querySelector("#persistent-storage-status").textContent = persistent
      ? "Dauerhafter Gerätespeicher ist aktiv. JSON-Exporte bleiben als zusätzliche Sicherung sinnvoll."
      : request ? "Der Browser hat dauerhaften Speicher nicht zugesagt. Deine Änderungen werden weiterhin auf diesem Gerät gespeichert; sichere sie zusätzlich per JSON-Export." : "";
  } catch {
    document.querySelector("#persistent-storage-status").textContent = "Die Speichereinstellung konnte nicht geprüft werden. JSON-Export bleibt verfügbar.";
  } finally { persistStorageButton.disabled = false; }
}
persistStorageButton.addEventListener("click", () => updatePersistentStorage(true));
updatePersistentStorage();

function trackerDraftPending() {
  return !!(fileDocument && pendingFileDraft);
}

function updateFileStatus() {
  document.querySelector("#settings-storage-status").textContent = driveLink
    ? driveLink.title + (fileDirty ? ' · Änderungen lokal gesichert, Übertragung ausstehend' : ' · Google Drive') : fileDocument
    ? `${fileName} · ${fileDirty ? (piRevision ? "Änderungen noch nicht auf Pi gespeichert" : "Änderungen noch nicht in Datei gespeichert") : fileMessage || "Datei geöffnet"}`
    : fileMessage || "Browseraufgaben · lokal gespeichert";
  document.querySelector("#browser-tasks").hidden = !fileDocument;
  document.querySelector("#restore-file-draft").hidden = !pendingFileDraft;
  const reopen = document.querySelector("#reopen-tracker");
  const draftPending = trackerDraftPending();
  document.querySelector("#tracker-draft-notice").hidden = !draftPending;
  document.querySelector("#notice-restore-draft").disabled = fileBusy || savingTask;
  const enableAutoSave = document.querySelector("#enable-file-autosave");
  enableAutoSave.hidden = !!driveLink || !fileDocument || !!piRevision || (!fileHandle && typeof window.showSaveFilePicker !== "function") || (!!fileHandle && !fileAutoSaveBlocked);
  enableAutoSave.disabled = fileBusy || savingTask || draftPending;
  document.querySelectorAll(".project-drag-handle").forEach(button => { button.disabled = fileBusy || savingTask || draftPending; });
  reopen.hidden = !!driveLink || !recentTracker || !!piRevision || (!!fileDocument && !draftPending);
  reopen.textContent = draftPending ? "Gespeicherte Datei weiterverwenden" :
    recentTracker ? "Zuletzt geöffnet: " + recentTracker.name : "Letzte Trackerdatei öffnen";
  document.querySelector("#sync-status-text").textContent = driveLink ? (driveConflict ? 'Drive-Konflikt · Einstellungen' : !trackerDrive.session ? 'Google-Verbindung erneuern' : fileDirty ? 'Drive-Übertragung ausstehend' : 'Google Drive') : !piRevision ? (githubPagesHosting ? "Auf diesem Gerät" : "Lokaler Tracker") :
    piSaveBlockedRevision === piRevision ? "Pi-Synchronisierung angehalten" : piConnectionMessage ? "Pi-Verbindung unterbrochen" : "Pi-Tracker geöffnet";
  document.querySelector("#save-tracker").textContent = driveLink ? 'JSON-Sicherung exportieren' : piRevision ? "Auf Pi speichern" : githubPagesHosting && !fileHandle ? "Trackerdatei exportieren" : "Datei speichern";
  document.querySelector("#open-tracker").textContent = githubPagesHosting ? "Trackerdatei importieren" : "Trackerdatei öffnen";
  document.querySelector("#copy-tracker").hidden = !!driveLink || (githubPagesHosting && !fileDocument);
  updateStorageGuidance();
  document.querySelector("#pi-open").disabled = !canChangeFile() || location.protocol !== "https:";
  document.querySelector("#pi-initialize").disabled = !canChangeFile() || !tasksLoaded || !!pendingFileDraft || !!piRevision || location.protocol !== "https:";
  document.querySelector("#pi-initialize").hidden = !!piRevision;
  document.querySelector("#pi-connection-status").textContent = piConnectionMessage || (piRevision && piConnection ? "Verbunden: " + new URL(piConnection.endpoint).origin : "Noch kein gemeinsamer Pi-Tracker geöffnet.");
  const piSave = document.querySelector("#pi-save");
  piSave.hidden = !piRevision;
  piSave.disabled = !canChangeFile() || draftPending;
  const refreshFolder = document.querySelector("#refresh-tracker-folder");
  refreshFolder.hidden = !trackerFolder;
  refreshFolder.disabled = !canChangeFile();
  document.querySelector("#tracker-folder-files").hidden = !trackerFolder;
  for (const button of document.querySelectorAll("#tracker-file-list button")) button.disabled = !canChangeFile();
  document.querySelector("#edit-semester").disabled = !canChangeFile() || draftPending;
  const chooseFolder = document.querySelector("#choose-tracker-folder");
  chooseFolder.disabled = fileBusy || savingTask || typeof window.showDirectoryPicker !== "function";
  document.querySelector("#tracker-folder-status").textContent = trackerFolder ? "Ordner: " + trackerFolder.name :
    typeof window.showDirectoryPicker === "function" ? "Kein Ordner für Trackerdateien ausgewählt." : "Dieser Browser unterstützt keine gespeicherte Ordnerauswahl.";
  for (const id of ["open-tracker", "save-tracker", "copy-tracker", "browser-tasks", "restore-file-draft", "reopen-tracker"]) {
    document.querySelector(`#${id}`).disabled = fileBusy || savingTask || (!tasksLoaded && id !== "open-tracker" && id !== "restore-file-draft");
  }
  if (draftPending) {
    document.querySelector("#save-tracker").disabled = true;
    document.querySelector("#copy-tracker").disabled = true;
  }
  document.querySelector("#new-task").disabled = fileBusy || savingTask || !tasksLoaded || draftPending;
  renderTimePanel();
  document.querySelectorAll(".task-complete").forEach(input => {
    input.disabled = fileBusy || savingTask || !tasksLoaded || draftPending;
  });
  document.querySelectorAll(".task-open").forEach(button => {
    button.disabled = fileBusy || savingTask || draftPending;
  });
  document.querySelectorAll(".trash-action").forEach(button => { button.disabled = !canChangeFile() || trackerDraftPending(); });
  schedulePiSave();
  scheduleFileSave();
  updateDriveUI();
}

function scheduleFileSave() {
  if (fileAutoSaveTimer !== null || !fileDocument || piRevision || !fileHandle || fileAutoSaveBlocked ||
      !fileDirty || fileBusy || savingTask || (timeControlsReady && timeBusy) || trackerDraftPending()) return;
  fileAutoSaveTimer = setTimeout(() => {
    fileAutoSaveTimer = null;
    if (fileDocument && !piRevision && fileHandle && !fileAutoSaveBlocked && fileDirty) saveTracker(false, true);
  }, 250);
}

async function completeTaskFromCard(id, checkbox, undo = false) {
  const task = tasks.find(task => task.id === id);
  if (savingTask || fileBusy || trackerDraftPending()) { if (checkbox) checkbox.checked = !!task?.completed; return; }
  if (!task || task.deletedAt || (undo && (!completionUndo || completionUndo.id !== id || completionUndo.document !== fileDocument))) return;
  const completed = undo ? completionUndo.completed : checkbox.checked;
  const original = fileDocument?.tasks.find(task => task.id === id);
  const previous = original ? { status: original.status, progress: original.progress, completedAt: original.completedAt } : { completedAt: task.completedAt };
  const restoreState = undo ? completionUndo.previous : completed ? null
    : completionUndo?.id === id && completionUndo.document === fileDocument && !completionUndo.completed
      ? completionUndo.previous : { status: "open", progress: 0 };
  let succeeded = false;
  savingTask = true;
  updateFileStatus();
  document.querySelectorAll(".task-complete").forEach(input => { input.disabled = true; });
  document.querySelector("#undo-completion").disabled = true;
  document.querySelector("#file-error").hidden = true;
  try {
    if (fileDocument) {
      const next = trackerFiles.completeTask(fileDocument, id, restoreState);
      await saveWorkingDraft(next);
      fileDocument = next;
      tasks = trackerFiles.toTasks(next);
      fileDirty = true;
      fileMessage = "";
    } else {
      await taskStorage.setCompleted(id, completed, task.completed, undo ? completionUndo.previous : null, currentSemester());
      tasks = await taskStorage.load();
    }
    completionUndo = undo ? null : { id, previous, completed: task.completed, document: fileDocument };
    succeeded = true;
    document.querySelector("#completion-feedback").hidden = false;
    document.querySelector("#completion-message").textContent = undo
      ? `Statusänderung von „${task.title}“ zurückgenommen.` : `„${task.title}“ ${completed ? "erledigt" : "wieder geöffnet"}.`;
    document.querySelector("#undo-completion").hidden = undo;
  } catch (error) {
    if (checkbox) checkbox.checked = !!task.completed;
    showFileError(new Error(error.message || "Der Erledigungsstatus konnte nicht gespeichert werden. Die Aufgabe bleibt unverändert."));
  } finally {
    savingTask = false;
    document.querySelector("#undo-completion").disabled = false;
    updateFileStatus();
    refreshHomeTasks();
    if (succeeded) {
      const current = [...document.querySelectorAll(".task-complete")].find(input => input.dataset.taskId === id);
      (current && current.getClientRects().length ? current : document.querySelector("#undo-completion").hidden ? document.querySelector("#welcome-title") : document.querySelector("#undo-completion")).focus({ preventScroll: true });
    }
  }
}

document.querySelector("#undo-completion").addEventListener("click", () => {
  if (completionUndo) completeTaskFromCard(completionUndo.id, null, true);
});

function showFileError(error) {
  if (error?.name === "AbortError") return;
  closeMobileMenu();
  const output = document.querySelector("#file-error");
  output.textContent = error.message || "Die Dateiaktion konnte nicht abgeschlossen werden.";
  output.hidden = false;
}

function setFileBusy(value) {
  fileBusy = value;
  if (value) {
    closeMobileMenu();
    document.querySelector("#file-error").hidden = true;
  }
  updateFileStatus();
}

function canChangeFile() {
  return !fileBusy && !savingTask;
}

async function confirmDataSwitch() {
  if (!fileDirty && !pendingFileDraft) return true;
  const dialog = document.querySelector("#switch-data-dialog");
  dialog.returnValue = "cancel";
  const accepted = await new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "discard"), { once: true });
    dialog.showModal();
  });
  if (!accepted) return false;
  // Called only after the replacement data has been read and validated.
  // If clearing recovery fails, retain the current in-memory document.
  await taskStorage.clearDraft();
  pendingFileDraft = null;
  fileDirty = false;
  return true;
}

async function readTrackerFile(file, handle = null, { startup = false, cached = false, piVersion = null, live = false } = {}) {
  if (file.size > 200 * 1024 * 1024) throw new Error("Die Datei ist größer als 200 MB und kann hier nicht geöffnet werden.");
  const text = await file.text();
  const savedDoc = trackerFiles.parse(text);
  let doc = savedDoc;
  let resume = false;
  const writable = handle && typeof handle.queryPermission === "function" &&
    await handle.queryPermission({ mode: "readwrite" }) === "granted";
  // A recovery copy of the already-saved document contains no unsaved changes.
  // Compare every field, including unknown legacy metadata, before removing the lock.
  if (startup && pendingFileDraft?.name === file.name && trackerMerge.equal(pendingFileDraft.document, doc)) {
    pendingFileDraft = null;
    try { await taskStorage.clearDraft(); }
    catch { /* A redundant recovery copy must not lock the loaded document. */ }
  }
  const cachedSession = cached && !piVersion && !pendingFileDraft?.piRevision &&
    (!savedDoc.id || !pendingFileDraft?.document?.id || savedDoc.id === pendingFileDraft.document.id);
  const approvedSession = pendingFileDraft?.resumeApproved === true && pendingFileDraft.savedBaseline === text;
  if (startup && pendingFileDraft?.name === file.name && (cachedSession || approvedSession)) {
    // A cached snapshot is not a newly opened file. Resume the latest local session
    // directly, including drafts from versions before continuation was recorded.
    // A real file or Pi response still requires an explicitly approved unchanged baseline.
    try {
      doc = trackerFiles.validate(structuredClone(pendingFileDraft.document));
      resume = true;
    } catch (error) { showFileError(error); }
  }
  const nextTasks = trackerFiles.toTasks(doc);
  if (!startup && !await confirmDataSwitch()) return;
  if (driveLink) await leaveDriveTracker();
  completionUndo = null;
  document.querySelector("#completion-feedback").hidden = true;
  // All validation finishes before replacing the visible document.
  fileDocument = doc;
  resumeApprovedDraft = resume;
  if (resume) pendingFileDraft = null;
  piRevision = piVersion;
  piBaseDocument = piVersion ? structuredClone(savedDoc) : null;
  piSaveBlockedRevision = null;
  piSaveRetryAt = 0;
  fileHandle = handle;
  fileAutoSaveBlocked = !writable;
  fileBaseline = text;
  fileName = file.name;
  fileDirty = resume;
  fileMessage = resume ? "Letzter Arbeitsstand wieder geöffnet" : piVersion ? "Vom Pi geladen" : cached ? "Letzter geladener Dateistand aus dem Browser" : "Datei geöffnet";
  if (!startup && !piVersion) rememberPi(false);
  if (!piVersion && !cached && (!startup || recentTracker?.text !== text)) await rememberTracker(handle, file.name, text);
  tasks = nextTasks;
  tasksLoaded = true;
  if (!live) {
    filterForm.reset();
    selectedProjectKey = "";
  }
  updateProjectOptions();
  refreshHomeTasks();
  updateFileStatus();
  if (!live) closeMobileMenu();
  return true;
}

const jsonPickerOptions = { types: [{ description: "Trackerdatei (JSON)", accept: { "application/json": [".json"] } }] };
document.querySelector("#open-tracker").addEventListener("click", async () => {
  if (!canChangeFile()) return;
  if (!window.showOpenFilePicker) {
    document.querySelector("#tracker-file-input").click();
    return;
  }
  setFileBusy(true);
  try {
    const [handle] = await window.showOpenFilePicker({ ...trackerPickerOptions(), multiple: false });
    await readTrackerFile(await handle.getFile(), handle);
  } catch (error) { showFileError(error); }
  finally { setFileBusy(false); }
});
document.querySelector("#tracker-file-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !canChangeFile()) return;
  setFileBusy(true);
  try { await readTrackerFile(file); }
  catch (error) { showFileError(error); }
  finally { setFileBusy(false); }
});

async function saveTracker(copy = false, automatic = false) {
  if (driveLink) copy = true;
  if (piRevision && !copy) return savePiTracker();
  if (fileBusy || savingTask || (timeControlsReady && timeBusy) || !tasksLoaded || trackerDraftPending()) return;
  setFileBusy(true);
  try {
    const documentToSave = currentTrackerDocument();
    const snapshot = JSON.stringify(documentToSave, null, 2);
    let handle = copy ? null : fileHandle;
    if (automatic && (!handle || await handle.queryPermission({ mode: "readwrite" }) !== "granted")) {
      throw new Error("Bitte einmal „Automatisches Speichern aktivieren“ wählen, um die Trackerdatei zum Schreiben freizugeben. Deine Änderungen sind als Entwurf gesichert.");
    }
    if (!handle && window.showSaveFilePicker) {
      handle = await window.showSaveFilePicker({ ...trackerPickerOptions(),
        suggestedName: copy ? "Trackerdatei-Kopie.json" : fileName || "Meine Trackerdatei.json" });
    }
    if (handle) {
      if (!automatic && handle === fileHandle && await handle.requestPermission({ mode: "readwrite" }) !== "granted") {
        throw new Error("Zum Speichern ist Schreibzugriff auf die Trackerdatei erforderlich.");
      }
      const sameFile = fileHandle && await handle.isSameEntry(fileHandle);
      if (sameFile && await (await handle.getFile()).text() !== fileBaseline) {
        throw new Error("Die Datei wurde außerhalb dieser Anwendung geändert. Sie wurde nicht überschrieben. Sichere deinen Stand über „Kopie speichern“.");
      }
      const writer = await handle.createWritable();
      try { await writer.write(snapshot); await writer.close(); }
      catch (error) { try { await writer.abort(); } catch {} throw error; }
      if (driveLink) {
        fileMessage = 'Drive-Tracker als lokale Kopie gespeichert';
      } else if (piRevision) {
        fileMessage = "Lokale Kopie gespeichert";
      } else if (fileDocument) {
        // A saved copy becomes the connected file, so future writes stay on that copy.
        fileHandle = handle;
        fileAutoSaveBlocked = false;
        await rememberTracker(handle, handle.name, snapshot);
        fileName = handle.name;
        fileBaseline = snapshot;
        fileDirty = false;
        resumeApprovedDraft = false;
        fileMessage = automatic ? "Automatisch in Datei gespeichert" : "In Datei gespeichert · automatisches Speichern aktiv";
        try { await taskStorage.clearDraft(); }
        catch { fileMessage += " · ältere Entwurfssicherung bleibt im Browser"; }
      } else {
        fileMessage = "Browseraufgaben als Trackerdatei gespeichert";
      }
      await refreshTrackerFolder();
    } else {
      const url = URL.createObjectURL(new Blob([snapshot], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = copy ? "Trackerdatei-Kopie.json" : fileName || "Meine Trackerdatei.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (driveLink) {
        fileMessage = 'Drive-Tracker zum Download bereitgestellt';
      } else if (piRevision) {
        fileMessage = "Lokale Kopie zum Download bereitgestellt";
      } else if (fileDocument) {
        fileDirty = false;
        fileMessage = "Download bereitgestellt · Datei gegebenenfalls manuell ersetzen";
        // Retain recovery: the browser cannot confirm that the download was saved.
      } else {
        fileMessage = "Download der Trackerdatei bereitgestellt";
      }
    }
  } catch (error) {
    if (automatic) fileAutoSaveBlocked = true;
    showFileError(error);
  }
  finally { setFileBusy(false); }
}

document.querySelector("#save-tracker").addEventListener("click", () => saveTracker());
document.querySelector("#enable-file-autosave").addEventListener("click", () => saveTracker());
document.querySelector("#copy-tracker").addEventListener("click", () => saveTracker(true));
document.querySelector("#browser-tasks").addEventListener("click", async () => {
  if (!canChangeFile()) return;
  setFileBusy(true);
  try {
    const [browserTasks, freeTime] = await Promise.all([taskStorage.load(), taskStorage.loadFreeTime()]);
    if (!await confirmDataSwitch()) return;
    if (driveLink) await leaveDriveTracker();
    completionUndo = null;
    document.querySelector("#completion-feedback").hidden = true;
    fileDocument = null; piBaseDocument = null; piRevision = null; fileHandle = null; fileBaseline = null; fileName = ""; fileMessage = "";
    browserProjectOrder = await taskStorage.loadProjectOrder();
    browserProjectStyles = await taskStorage.loadProjectStyles();
    tasks = browserTasks;
    browserFreeTime = freeTime;
    filterForm.reset();
    selectedProjectKey = "";
    updateProjectOptions();
    refreshHomeTasks();
    closeMobileMenu();
  } catch (error) { showFileError(error); }
  finally { setFileBusy(false); }
});
document.querySelector("#restore-file-draft").addEventListener("click", async () => {
  if (!pendingFileDraft || fileBusy || fileDirty) return;
  savingTask = true;
  updateFileStatus();
  try {
    const doc = trackerFiles.validate(pendingFileDraft.document);
    const restoredRevision = /^"[0-9a-f]{64}"$/.test(pendingFileDraft.piRevision) ? pendingFileDraft.piRevision : null;
    const restoredBase = restoredRevision && pendingFileDraft.piBaseDocument ? trackerFiles.validate(structuredClone(pendingFileDraft.piBaseDocument)) : null;
    const savedBaseline = fileName === pendingFileDraft.name ? fileBaseline :
      recentTracker?.name === pendingFileDraft.name ? recentTracker.text : null;
    await taskStorage.saveDraft({ ...pendingFileDraft, resumeApproved: true, savedBaseline });
    completionUndo = null;
    document.querySelector("#completion-feedback").hidden = true;
    fileDocument = doc;
    piRevision = restoredRevision;
    piBaseDocument = restoredBase;
    const connectedHandle = !restoredRevision && fileName === pendingFileDraft.name ? fileHandle : null;
    fileHandle = connectedHandle;
    fileBaseline = savedBaseline;
    resumeApprovedDraft = true;
    if (!connectedHandle) fileAutoSaveBlocked = true;
    fileName = pendingFileDraft.name || "Trackerdatei.json";
    tasks = trackerFiles.toTasks(doc);
    tasksLoaded = true;
    fileDirty = true;
    pendingFileDraft = null;
    filterForm.reset();
    selectedProjectKey = "";
    updateProjectOptions();
    refreshHomeTasks();
    updateFileStatus();
    closeMobileMenu();
  } catch (error) { showFileError(error); }
  finally { savingTask = false; updateFileStatus(); }
});
document.querySelector("#notice-restore-draft").addEventListener("click", () => {
  document.querySelector("#restore-file-draft").click();
});
window.addEventListener("beforeunload", event => {
  // Completed edits already have a durable recovery copy. Reading/syncing a file
  // must not cause the browser to warn on every reload.
  if (editorDirty("task") || editorDirty("options") || savingTask || (timeControlsReady && timeBusy)) { event.preventDefault(); event.returnValue = ""; }
});
async function rememberTracker(handle, name, text) {
  recentTracker = { handle, name, text };
  try { await taskStorage.saveRecentTracker(recentTracker); }
  catch { showFileError(new Error("Die letzte Dateiauswahl konnte nicht dauerhaft gespeichert werden.")); }
}

function trackerPickerOptions() {
  return trackerFolder ? { ...jsonPickerOptions, startIn: trackerFolder } : jsonPickerOptions;
}

document.querySelector("#choose-tracker-folder").addEventListener("click", async () => {
  if (!canChangeFile() || typeof window.showDirectoryPicker !== "function") return;
  setFileBusy(true);
  try {
    const handle = await window.showDirectoryPicker({ id: "trackerdateien", mode: "read" });
    await taskStorage.saveTrackerFolder(handle);
    trackerFolder = handle;
    await refreshTrackerFolder();
  } catch (error) { showFileError(error); }
  finally { setFileBusy(false); }
});

document.querySelector("#reopen-tracker").addEventListener("click", async () => {
  if (!canChangeFile() || !recentTracker) return;
  const { handle, name, text } = recentTracker;
  setFileBusy(true);
  try {
    if (!handle) {
      await readTrackerFile(new File([text], name), null, { cached: true });
    } else if (await handle.requestPermission({ mode: "read" }) === "granted") {
      await readTrackerFile(await handle.getFile(), handle);
    } else {
      showFileError(new Error("Der Zugriff auf die Trackerdatei wurde nicht erteilt."));
    }
  } catch (error) { showFileError(error); }
  finally { setFileBusy(false); }
});

async function refreshTrackerFolder(requestAccess = false) {
  if (!trackerFolder) return;
  const list = document.querySelector("#tracker-file-list");
  const status = document.querySelector("#tracker-files-status");
  list.replaceChildren();
  try {
    const mode = { mode: "read" };
    let permission = await trackerFolder.queryPermission(mode);
    if (permission !== "granted" && requestAccess) permission = await trackerFolder.requestPermission(mode);
    if (permission !== "granted") {
      status.textContent = "Wähle „Ordner aktualisieren“, um den Zugriff erneut zu erlauben.";
      return;
    }
    const files = [];
    for await (const handle of trackerFolder.values()) {
      if (handle.kind === "file" && /\.json$/i.test(handle.name)) files.push(handle);
    }
    files.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
    for (const handle of files) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = handle.name;
      button.addEventListener("click", async () => {
        if (!canChangeFile()) return;
        setFileBusy(true);
        try { await readTrackerFile(await handle.getFile(), handle); }
        catch (error) { showFileError(error); }
        finally { setFileBusy(false); }
      });
      item.append(button);
      list.append(item);
    }
    status.textContent = files.length ? "" : "Keine JSON-Dateien in diesem Ordner.";
  } catch {
    status.textContent = "Der Ordner konnte nicht gelesen werden. Aktualisiere ihn oder wähle ihn erneut aus.";
  }
}
document.querySelector("#refresh-tracker-folder").addEventListener("click", async () => {
  if (!canChangeFile() || !trackerFolder) return;
  setFileBusy(true);
  try { await refreshTrackerFolder(true); }
  finally { setFileBusy(false); }
});

async function restoreTrackerSession() {
  if (await restoreDriveTracker()) return;
  const [draft, folder, recent] = await Promise.allSettled([
    taskStorage.loadDraft(), taskStorage.loadTrackerFolder(), taskStorage.loadRecentTracker()
  ]);
  if (folder.status === "fulfilled" && folder.value?.kind === "directory") trackerFolder = folder.value;
  if (recent.status === "fulfilled") {
    const saved = recent.value;
    if (saved?.kind === "file") {
      recentTracker = { handle: saved, name: saved.name };
    } else if (typeof saved?.name === "string" && typeof saved.text === "string") {
      recentTracker = { handle: saved.handle?.kind === "file" ? saved.handle : null, name: saved.name, text: saved.text };
    }
  }
  await refreshTrackerFolder();
  if (draft.status === "rejected") {
    showFileError(new Error("Die Entwurfssicherung konnte nicht gelesen werden."));
    return;
  }
  pendingFileDraft = draft.value || null;
  if (pendingFileDraft) fileMessage = "Ungespeicherter Dateientwurf verfügbar · Einstellungen";
  if (await restorePiTracker()) return;
  if (!recentTracker) return;
  const { handle, name, text } = recentTracker;
  try {
    if (handle && await handle.queryPermission({ mode: "read" }) === "granted") {
      await readTrackerFile(await handle.getFile(), handle, { startup: true });
      return;
    }
  } catch (error) { showFileError(error); }
  if (typeof text === "string") {
    try {
      await readTrackerFile(new File([text], name), handle, { startup: true, cached: true });
      return;
    } catch (error) { showFileError(error); }
  }
  fileMessage = "Letzte Trackerdatei erneut verbinden · Einstellungen";
}

var timeControlsReady = false;
let selectedTimeTask = null;
let timeBusy = false;
let timerMiniVisible = false;
let timeOptionSignature = "";
const timeTaskOrder = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
const timeTaskDueFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeTaskSelect = document.querySelector("#time-task");
const timeModeSelect = document.querySelector("#time-mode");
function timeClock(ms) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(n => String(n).padStart(2, "0")).join(":");
}
function createTimeButton(task) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "button task-time-button";
  button.textContent = "Zeit erfassen";
  button.setAttribute("aria-label", "Zeit für „" + task.title + "“ erfassen");
  button.addEventListener("click", () => {
    if (timeBusy || savingTask || fileBusy) return;
    selectedTimeTask = task.id; renderTimePanel();
    openTimeControls();
  });
  return button;
}
function openTimeControls() {
  closeMobileMenu();
  location.hash = "#zeiterfassung";
  updateView();
  document.querySelector("#time-task").focus({ preventScroll: true });
}
function timeTargets() {
  return [{ id: "", title: "Ohne Aufgabe", timeTracking: fileDocument ? fileDocument.freeTimeTracking : browserFreeTime }, ...tasks.filter(t => !t.deletedAt)];
}
function renderTimeMini(selectedTask) {
  // The running task stays visible even while another task is selected in the menu.
  const candidates = timeTargets().filter(t => !t.completed);
  const task = candidates.find(t => t.timeTracking?.startedAt != null) ||
    (selectedTask?.timeTracking ? selectedTask : candidates.find(t => t.timeTracking &&
      (t.timeTracking.elapsedMs > 0 || t.timeTracking.rounds > 0)));
  const mini = document.querySelector("#timer-mini");
  mini.hidden = !timerMiniVisible;
  const visibility = document.querySelector("#timer-visibility");
  visibility.textContent = timerMiniVisible ? "Timer ausblenden" : "Timer einblenden";
  visibility.setAttribute("aria-expanded", String(timerMiniVisible));
  if (!task) {
    delete mini.dataset.taskId;
    mini.classList.remove("is-running");
    document.querySelector("#timer-mini-task").textContent = "Kein Timer gestartet";
    document.querySelector("#timer-mini-clock").textContent = "00:00:00";
    mini.title = "Zeiterfassung öffnen";
    mini.setAttribute("aria-label", mini.title);
    return;
  }
  const state = task.timeTracking, elapsed = taskTime.elapsed(state);
  const clock = timeClock(state.mode === "pomodoro" ? Math.max(0, taskTime.limit(state) - elapsed) : elapsed);
  const running = state.startedAt !== null;
  const phase = state.mode === "standard" ? "Standard-Timer" : "Pomodoro · " +
    ({ focus: "Fokus", short: "Kurze Pause", long: "Lange Pause" }[state.phase]);
  mini.dataset.taskId = task.id;
  mini.classList.toggle("is-running", running);
  document.querySelector("#timer-mini-task").textContent = task.title;
  document.querySelector("#timer-mini-clock").textContent = clock;
  mini.title = task.title + " · " + phase + " · " + (running ? "Läuft" : "Bereit / unterbrochen");
  mini.setAttribute("aria-label", mini.title + " · " + clock + ". Zeiterfassung öffnen");
}
function renderTimePanel() {
  if (typeof timeControlsReady === "undefined" || !timeControlsReady) return;
  const available = timeTargets().sort((a, b) => {
    if (a.id === b.id) return 0;
    if (a.id === "") return -1;
    if (b.id === "") return 1;
    const aProject = (a.project || "").trim(), bProject = (b.project || "").trim();
    return Number(!aProject) - Number(!bProject) || timeTaskOrder.compare(aProject, bProject) ||
      projectKey(a).localeCompare(projectKey(b)) || Number(!a.dueDate) - Number(!b.dueDate) ||
      (a.dueDate || "").localeCompare(b.dueDate || "") || timeTaskOrder.compare(a.title, b.title) || a.id.localeCompare(b.id);
  });
  if (!available.some(t => t.id === selectedTimeTask)) selectedTimeTask = null;
  if (selectedTimeTask === null) selectedTimeTask = available.find(t => t.timeTracking?.startedAt != null)?.id || "";
  const signature = JSON.stringify(available.map(t => [t.id, t.title, projectKey(t), t.project, t.dueDate, t.completed, t.timeTracking?.startedAt != null]));
  if (signature !== timeOptionSignature) {
    timeOptionSignature = signature;
    const groups = new Map(), children = [new Option("Ohne Aufgabe", "")];
    for (const t of available) {
      if (t.id === "") continue;
      const key = projectKey(t);
      if (!groups.has(key)) {
        const group = document.createElement("optgroup");
        group.label = (t.project || "").trim() || "Ohne Projekt";
        groups.set(key, group); children.push(group);
      }
      const due = t.dueDate ? "Frist: " + timeTaskDueFormat.format(new Date(t.dueDate + "T12:00:00")) : "Keine Frist";
      groups.get(key).append(new Option(t.title + (t.completed ? " · Erledigt" : "") + " · " + due + (t.timeTracking?.startedAt != null ? " · läuft" : ""), t.id));
    }
    timeTaskSelect.replaceChildren(...children);
  }
  timeTaskSelect.value = selectedTimeTask;
  const task = timeTargets().find(t => t.id === selectedTimeTask), state = task?.timeTracking;
  renderTimeMini(task);
  const current = state || taskTime.fresh(timeModeSelect.value);
  const running = current.startedAt !== null;
  const elapsed = taskTime.elapsed(current);
  if (state) timeModeSelect.value = state.mode;
  const locked = timeBusy || savingTask || fileBusy || !tasksLoaded || trackerDraftPending();
  timeTaskSelect.disabled = locked;
  timeModeSelect.disabled = locked || !task || task.completed;
  document.querySelector("#time-toggle").disabled = locked || !task || task.completed;
  document.querySelector("#time-stop").disabled = locked || !task || task.completed || !state || (!running && !state.elapsedMs && !state.rounds && state.phase === "focus");
  document.querySelector("#time-toggle").textContent = running ? "Unterbrechen" : current.elapsedMs ? "Fortsetzen" : "Starten";
  const phase = current.mode === "standard" ? "Standard-Timer" :
    "Pomodoro · " + ({ focus: "Fokus", short: "Kurze Pause", long: "Lange Pause" }[current.phase]) + " · " + current.rounds + " Fokusphasen abgeschlossen";
  document.querySelector("#time-phase").textContent = phase;
  document.querySelector("#time-clock").textContent = timeClock(current.mode === "pomodoro" ? Math.max(0, taskTime.limit(current) - elapsed) : elapsed);
  const statusText = !task ? "Wähle eine Aufgabe aus." : task.completed ? "Erledigt · Erfasste Zeiten bleiben erhalten · " + task.title :
    (running ? "Läuft" : current.mode === "pomodoro" && current.rounds && !current.elapsedMs ? "Phase abgeschlossen · Nächste Phase bereit" : "Bereit / unterbrochen") + " · " + task.title;
  const statusOutput = document.querySelector("#time-status");
  if (statusOutput.textContent !== statusText) statusOutput.textContent = statusText;
  const unrecorded = running && (current.mode === "standard" || current.phase === "focus") ? Math.max(0, elapsed - current.elapsedMs) : 0;
  document.querySelector("#time-total").textContent = "Erfasste Arbeitszeit: " + timeClock(current.totalMs + unrecorded);
  const history = document.querySelector("#time-history");
  const historyKey = task?.id + ":" + JSON.stringify(current.entries);
  if (history.dataset.key !== historyKey) {
    history.dataset.key = historyKey;
    history.replaceChildren(...current.entries.slice().reverse().map(entry => {
      const row = document.createElement("li");
      row.textContent = new Date(entry.at).toLocaleString("de-DE") + " · " + timeClock(entry.durationMs) + " · " + (entry.mode === "pomodoro" ? "Pomodoro" : "Standard-Timer");
      return row;
    }));
  }
}
async function changeTime(action, id = selectedTimeTask, mode) {
  if (timeBusy || savingTask || fileBusy || !tasksLoaded || trackerDraftPending()) return;
  const task = timeTargets().find(t => t.id === id);
  if (!task || task.completed) return;
  const errorOutput = document.querySelector("#time-error");
  errorOutput.hidden = true;
  timeBusy = true; savingTask = true;
  updateFileStatus();
  try {
    if (action === "start") {
      if (task.completed) throw new Error("Erledigte Aufgaben können keine neue Zeit erfassen.");
      if (timeTargets().some(t => !t.completed && t.id !== id && t.timeTracking?.startedAt != null)) throw new Error("Bitte den laufenden Timer zuerst unterbrechen oder beenden.");
    }
    const state = task.timeTracking;
    const timestamp = action === "finish" && piRevision
      ? state.startedAt + taskTime.limit(state) - state.elapsedMs : Date.now();
    const nextState = taskTime.transition(state, action, timestamp, mode || timeModeSelect.value);
    if (fileDocument) {
      const next = structuredClone(fileDocument);
      if (id === "") next.freeTimeTracking = nextState;
      else next.tasks.find(t => t.id === id).timeTracking = nextState;
      next.updatedAt = new Date(timestamp).toISOString();
      trackerFiles.validate(next);
      await saveWorkingDraft(next);
      fileDocument = next; tasks = trackerFiles.toTasks(next); fileDirty = true; fileMessage = "";
    } else if (id === "") {
      browserFreeTime = await taskStorage.updateFreeTime(browserFreeTime, nextState);
    } else {
      const saved = await taskStorage.updateTime(id, task.timeTracking, nextState);
      tasks = tasks.map(t => t.id === id ? saved : t);
    }
  } catch (error) {
    errorOutput.textContent = error.message || "Zeit konnte nicht gespeichert werden.";
    errorOutput.hidden = false;
  } finally {
    timeBusy = false; savingTask = false;
    updateFileStatus(); renderTimePanel();
  }
}
document.querySelector("#timer-visibility").addEventListener("click", () => {
  timerMiniVisible = !timerMiniVisible;
  renderTimePanel();
});
document.querySelector("#timer-mini").addEventListener("click", () => {
  selectedTimeTask = document.querySelector("#timer-mini").dataset.taskId ?? selectedTimeTask;
  renderTimePanel();
  openTimeControls();
});
timeTaskSelect.addEventListener("change", () => { selectedTimeTask = timeTaskSelect.value; renderTimePanel(); });
timeModeSelect.addEventListener("change", () => changeTime("mode", selectedTimeTask, timeModeSelect.value));
document.querySelector("#time-toggle").addEventListener("click", () => {
  const task = timeTargets().find(t => t.id === selectedTimeTask);
  changeTime(task?.timeTracking?.startedAt != null ? "pause" : "start");
});
document.querySelector("#time-stop").addEventListener("click", () => changeTime("stop"));
timeControlsReady = true;
setInterval(() => {
  renderTimePanel();
  const finished = timeTargets().find(t => !t.completed && t.timeTracking?.startedAt != null && t.timeTracking.mode === "pomodoro" &&
    taskTime.elapsed(t.timeTracking) >= taskTime.limit(t.timeTracking));
  if (finished && document.querySelector("#time-error").hidden) changeTime("finish", finished.id);
}, 500);
renderTimePanel();


const optionsDialog = document.querySelector("#task-options");
const optionsForm = document.querySelector("#task-options-form");
optionsForm.addEventListener('invalid', event => {
  const details = event.target.closest('details');
  if (details) details.open = true;
}, true);
let optionsTaskId = null, optionsExpected = null, optionsChecklist = [];
let optionsTaskSnapshot = null;
let optionsCompleted = false;
const optionsProject = document.querySelector("#options-project");
const optionsNewProject = document.querySelector("#options-new-project");
function updateOptionsNewProject() {
  const creating = optionsProject.value === "new";
  optionsNewProject.setCustomValidity("");
  document.querySelector("#options-new-project-row").hidden = !creating;
  optionsNewProject.disabled = !creating;
  optionsNewProject.required = creating;
}
optionsProject.addEventListener("change", updateOptionsNewProject);
optionsNewProject.addEventListener("input", () => optionsNewProject.setCustomValidity(""));
function createTaskOptionsButton(task) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "task-open";
  button.textContent = task.title; button.dataset.taskId = task.id;
  const type = { lecture: "Vorlesung", tutorial: "Tutorium" }[task.taskType];
  if (type) {
    const badge = document.createElement("small"); badge.className = "task-type"; badge.textContent = type;
    button.prepend(badge, " ");
  }
  if (task.repeatRule) button.title = "Wiederkehrend · " + (task.repeatRule.total === null ? "unbegrenzt" : `${task.repeatRule.index + 1} von ${task.repeatRule.total}`);
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", () => openTaskOptions(task.id));
  return button;
}
function bindTaskOptionsRow(row, task) {
  row.addEventListener("click", event => {
    if (!event.target.closest("button, input, label, a, select, textarea")) openTaskOptions(task.id);
  });
}
function openTaskOptions(id) {
  if (!tasksLoaded || savingTask || fileBusy || trackerDraftPending()) return;
  const task = fileDocument ? fileDocument.tasks.find(t => t.id === id) : tasks.find(t => t.id === id);
  if (!task || task.deletedAt) return;
  if (!taskDetails.valid(task)) {
    showFileError(new Error("Diese Aufgabe enthält noch nicht unterstützte Anmerkungen oder Unteraufgaben. Die Daten bleiben erhalten.")); return;
  }
  optionsTaskId = id; optionsExpected = taskDetails.values(task);
  document.querySelector('#options-more').open = false;
  document.querySelector("#options-type").value = optionsExpected.taskType;
  fillRepeatControls("options", optionsExpected.repeatRule);
  optionsExpected.completed = taskCompletion.isDone(task);
  document.querySelector("#options-status").value = optionsExpected.completed ? "done" : "open";
  if (fileDocument) optionsExpected.projectId = task.projectId || "";
  else optionsExpected.project = task.project || "";
  const projects = projectMenuEntries(tasks, fileDocument).filter(([key]) => key !== "name:");
  optionsProject.replaceChildren(new Option("Ohne Projekt", ""),
    ...projects.map(([key, name]) => new Option(name, key)), new Option("Neues Projekt …", "new"));
  optionsProject.value = task.projectId || task.project ? projectKey(task) : "";
  optionsNewProject.value = "";
  updateOptionsNewProject();
  optionsTaskSnapshot = JSON.stringify(task);
  optionsChecklist = structuredClone(optionsExpected.checklist);
  optionsCompleted = task.completed || task.status === "done";
  document.querySelector("#options-progress-mode").value = optionsExpected.progressMode;
  document.querySelector("#options-progress").value = optionsExpected.progress;
  const title = document.querySelector("#options-title");
  title.maxLength = fileDocument ? 1000 : 300;
  title.value = optionsExpected.title; title.setCustomValidity("");
  document.querySelector("#options-planned").value = optionsExpected.plannedDate;
  document.querySelector("#options-due").value = optionsExpected.dueDate;
  document.querySelector("#options-notes").value = optionsExpected.description;
  document.querySelector("#options-error").hidden = true;
  document.querySelector("#options-storage-note").textContent = editingStorageMessage();
  document.querySelector("#options-timer").textContent = optionsCompleted ? "Speichern & Zeiten ansehen" : "Speichern & Zeit erfassen";
  renderOptionsChecklist();
  if (!optionsDialog.open) optionsDialog.showModal();
  beginEditor("options");
  title.focus();
  optionsDialog.querySelector('.editor-content').scrollTop = 0;
}
function renderOptionsChecklist() {
  const rows = optionsChecklist.map((item, index) => {
    const row = document.createElement("li"); row.className = "options-subtask";
    row.classList.toggle("is-done", item.done);
    const done = document.createElement("input"); done.type = "checkbox"; done.checked = item.done;
    done.setAttribute("aria-label", "Unteraufgabe " + (index + 1) + " erledigt");
    done.addEventListener("change", () => { item.done = done.checked; row.classList.toggle("is-done", item.done); updateOptionsProgress(); });
    const text = document.createElement("input"); text.type = "text"; text.value = item.text;
    text.required = true; text.maxLength = 2000; text.placeholder = "Was ist zu tun?";
    text.setAttribute("aria-label", "Unteraufgabe " + (index + 1));
    text.addEventListener("input", () => { item.text = text.value; text.setCustomValidity(""); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "icon-button"; remove.textContent = "×";
    remove.setAttribute("aria-label", "Unteraufgabe " + (index + 1) + " entfernen");
    remove.addEventListener("click", () => {
      optionsChecklist.splice(index, 1); renderOptionsChecklist();
      const next = document.querySelectorAll("#options-subtasks input[type=text]")[Math.min(index, optionsChecklist.length - 1)];
      (next || document.querySelector("#options-add-subtask")).focus();
    });
    row.append(done, text, remove); return row;
  });
  document.querySelector("#options-subtasks").replaceChildren(...rows);
  updateOptionsProgress();
  document.querySelector("#options-add-subtask").disabled = optionsChecklist.length >= 1000;
}
function closeTaskOptions() { if (!savingTask) requestEditorClose("options"); }
document.querySelector("#options-close").addEventListener("click", closeTaskOptions);
document.querySelector("#options-cancel").addEventListener("click", closeTaskOptions);
optionsDialog.addEventListener("cancel", e => { e.preventDefault(); closeTaskOptions(); });
document.querySelector("#options-title").addEventListener("input", e => e.target.setCustomValidity(""));
document.querySelector("#options-status").addEventListener("change", event => {
  optionsCompleted = event.target.value === "done";
  document.querySelector("#options-timer").textContent = optionsCompleted ? "Speichern & Zeiten ansehen" : "Speichern & Zeit erfassen";
  updateOptionsProgress();
});
document.querySelector("#options-add-subtask").addEventListener("click", () => {
  if (optionsChecklist.length >= 1000) return;
  optionsChecklist.push({ id: crypto.randomUUID(), text: "", done: false }); renderOptionsChecklist();
  document.querySelectorAll("#options-subtasks input[type=text]").item(optionsChecklist.length - 1).focus();
});
async function saveTaskOptions(openTimer = false) {
  if (editorSessions.get("options")?.pending) return;
  if (savingTask || fileBusy || trackerDraftPending()) return;
  const title = document.querySelector("#options-title");
  title.setCustomValidity(title.value.trim() ? "" : "Bitte einen Titel eingeben.");
  optionsNewProject.setCustomValidity(optionsProject.value === "new" && !optionsNewProject.value.trim()
    ? "Bitte einen Projektnamen eingeben." : "");
  document.querySelectorAll("#options-subtasks input[type=text]").forEach(input => input.setCustomValidity(input.value.trim() ? "" : "Bitte eine Unteraufgabe eingeben oder die leere Zeile entfernen."));
  if (!optionsForm.reportValidity()) return;
  const details = { completed: document.querySelector("#options-status").value === "done", title: title.value.trim(), dueDate: document.querySelector("#options-due").value,
    plannedDate: document.querySelector("#options-planned").value, description: document.querySelector("#options-notes").value,
    checklist: optionsChecklist.map(item => ({ ...item, text: item.text.trim() })),
    progress: Number(document.querySelector("#options-progress").value), progressMode: document.querySelector("#options-progress-mode").value };
  const project = optionsProject.value;
  if (project === "new") details.project = optionsNewProject.value.trim();
  else if (fileDocument) details.projectId = project.slice(3);
  else details.project = project.slice(5);
  const errorOutput = document.querySelector("#options-error"); errorOutput.hidden = true;
  try {
    details.taskType = document.querySelector("#options-type").value;
    details.repeatRule = readRepeatControls("options", optionsExpected.repeatRule);
  } catch (error) { errorOutput.textContent = error.message; errorOutput.hidden = false; return; }
  savingTask = true; updateFileStatus();
  const controls = [...optionsForm.querySelectorAll("button, input, textarea, select")];
  controls.forEach(control => { control.disabled = true; });
  let saved = false;
  try {
    if (fileDocument) {
      const next = trackerFiles.updateDetails(fileDocument, optionsTaskId, optionsExpected, details);
      await saveWorkingDraft(next);
      if (completionUndo?.document === fileDocument) completionUndo.document = next;
      fileDocument = next; tasks = trackerFiles.toTasks(next); fileDirty = true; fileMessage = "";
    } else {
      await taskStorage.updateDetails(optionsTaskId, optionsExpected, details, currentSemester());
      tasks = await taskStorage.load();
    }
    updateProjectOptions();
    refreshHomeTasks(); finishEditor("options"); optionsDialog.close(); saved = true;
  } catch (error) {
    errorOutput.textContent = error.message || "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten."; errorOutput.hidden = false;
  } finally {
    savingTask = false; controls.forEach(control => { control.disabled = false; });
    updateOptionsNewProject();
    updateOptionsProgress();
    updateRepeatControls("options");
    document.querySelector("#options-add-subtask").disabled = optionsChecklist.length >= 1000;
    updateFileStatus();
  }
  if (saved && openTimer) { selectedTimeTask = optionsTaskId; renderTimePanel(); openTimeControls(); }
  else if (saved) [...document.querySelectorAll(".task-open")].find(button => button.dataset.taskId === optionsTaskId && button.getClientRects().length)?.focus({ preventScroll: true });
}
optionsForm.addEventListener("submit", event => { event.preventDefault(); saveTaskOptions(); });
document.querySelector("#options-timer").addEventListener("click", () => saveTaskOptions(true));

document.querySelector("#options-delete").addEventListener("click", async () => {
  if (!optionsDialog.open || !canChangeFile() || trackerDraftPending()) return;
  const id = optionsTaskId;
  const discardWarning = editorDirty("options") ? " Ungespeicherte Eingaben in diesem Formular werden dabei verworfen. Bereits gespeicherte Inhalte bleiben erhalten." : " Anmerkungen, Unteraufgaben und erfasste Zeiten bleiben erhalten.";
  if (!window.confirm(`„${optionsExpected.title}“ in den Papierkorb verschieben?` + discardWarning)) return;
  const errorOutput = document.querySelector("#options-error");
  errorOutput.hidden = true;
  const controls = [...optionsForm.querySelectorAll("button, input, textarea, select")];
  const previousDisabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  savingTask = true;
  updateFileStatus();
  try {
    if (fileDocument) {
      const next = trackerFiles.deleteTask(fileDocument, id, optionsTaskSnapshot);
      await saveWorkingDraft(next);
      if (completionUndo?.document === fileDocument) completionUndo.document = next;
      fileDocument = next;
      tasks = trackerFiles.toTasks(next);
      fileDirty = true;
      fileMessage = "";
    } else {
      const saved = await taskStorage.deleteTask(id, optionsTaskSnapshot);
      tasks = tasks.map(task => task.id === id ? saved : task);
    }
    if (completionUndo?.id === id) {
      completionUndo = null;
      document.querySelector("#completion-feedback").hidden = true;
    }
    updateProjectOptions();
    refreshHomeTasks();
    finishEditor("options"); optionsDialog.close();
  } catch (error) {
    errorOutput.textContent = error.message || "Die Aufgabe konnte nicht gelöscht werden.";
    errorOutput.hidden = false;
  } finally {
    savingTask = false;
    controls.forEach((control, index) => { control.disabled = previousDisabled[index]; });
    updateFileStatus();
  }
});


function createTaskProgress(task, { detailed = false } = {}) {
  const value = taskProgress.value(task), mode = taskProgress.mode(task);
  const group = document.createElement("div"); group.className = "task-progress";
  const label = document.createElement("span"); label.className = "task-progress-label";
  const list = Array.isArray(task.checklist) ? task.checklist : [];
  const steps = mode === 'checklist' && list.length > 0;
  if (!detailed && (task.completed || task.status === 'done' || (!steps && value === 0))) return document.createDocumentFragment();
  label.textContent = steps ? list.filter(item => item?.done === true).length + '/' + list.length + ' Schritte' : value + ' %';
  if (!detailed && (steps || value === 100)) { group.classList.add('is-text-only'); group.append(label); return group; }
  const bar = document.createElement("progress"); bar.max = 100; bar.value = value;
  bar.setAttribute("aria-label", "Fortschritt von „" + task.title + "“");
  group.append(label, bar); return group;
}
function updateOptionsProgress() {
  const mode = document.querySelector("#options-progress-mode").value;
  const input = document.querySelector("#options-progress");
  input.disabled = mode === "checklist";
  const task = { title: document.querySelector("#options-title").value || "Aufgabe", completed: optionsCompleted,
    progressMode: mode, progress: Number(input.value), checklist: optionsChecklist };
  document.querySelector("#options-progress-preview").replaceChildren(createTaskProgress(task, { detailed: true }));
}
document.querySelector("#options-progress-mode").addEventListener("change", updateOptionsProgress);
document.querySelector("#options-progress").addEventListener("input", updateOptionsProgress);

const piKeyInput = document.querySelector("#pi-key");
const piAddressInput = document.querySelector("#pi-address");
try { piKeyInput.value = localStorage.getItem("tasktracker2-pi-key") || ""; } catch {}
try {
  const savedEndpoint = localStorage.getItem("tasktracker2-pi-endpoint");
  piAddressInput.value = savedEndpoint ? new URL(savedEndpoint).origin : (githubPagesHosting ? "https://homeserver.fritz.box" : location.protocol === "https:" ? location.origin : "https://homeserver.fritz.box");
} catch {}

function piEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Bitte die vollständige HTTPS-Adresse deines Pi eingeben."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !["", "/", "/tasktracker2", "/tasktracker2/", "/tasktracker2-api/tracker"].includes(url.pathname)) {
    throw new Error("Bitte nur die HTTPS-Adresse des Pi ohne Zugangsdaten eingeben, zum Beispiel https://homeserver.fritz.box.");
  }
  return url.origin + "/tasktracker2-api/tracker";
}

function piConnectionFromInputs() {
  const endpoint = piEndpoint(piAddressInput.value.trim());
  const key = piKeyInput.value.trim();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Bitte den Freigabeschlüssel aus der Pi-Einrichtung eingeben.");
  return { endpoint, key };
}

function setPiConnectionMessage(message) {
  piConnectionMessage = message;
  document.querySelector("#pi-connection-status").textContent = message || (piRevision && piConnection ? "Verbunden: " + new URL(piConnection.endpoint).origin : "Noch kein gemeinsamer Pi-Tracker geöffnet.");
  if (piRevision) document.querySelector("#sync-status-text").textContent = piSaveBlockedRevision === piRevision ? "Pi-Synchronisierung angehalten" : message ? "Pi-Verbindung unterbrochen" : "Pi-Tracker geöffnet";
}

function rememberPi(enabled) {
  try {
    if (enabled) {
      if (!piConnection) return;
      localStorage.setItem("tasktracker2-pi-key", piConnection.key);
      localStorage.setItem("tasktracker2-pi-endpoint", piConnection.endpoint);
      localStorage.setItem('tasktracker-v2-sync-provider', 'pi');
      localStorage.setItem("tasktracker2-pi-enabled", "1");
    } else {
      localStorage.removeItem("tasktracker2-pi-enabled");
    }
  } catch {}
}

async function piRequest(options = {}) {
  if (location.protocol !== "https:") throw new Error("Der Pi-Tracker ist über die HTTPS-Adresse erreichbar.");
  if (!piConnection) throw new Error("Bitte unter Einstellungen die Pi-Adresse und den Freigabeschlüssel eingeben und „Pi-Tracker laden“ wählen.");
  const { endpoint, key } = piConnection;
  let response;
  try { response = await fetch(endpoint, {
    ...options, credentials: "omit", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + key, ...options.headers }
  });
  } catch (error) {
    throw new Error("Der Pi ist nicht erreichbar. Prüfe Heimnetz/VPN, HTTPS-Zertifikat und lokalen Netzwerkzugriff im Browser. Für GitHub den Pi-Dienst mit „Pi-Sync-updaten.cmd“ aktualisieren. Dein Arbeitsstand bleibt gesichert.", { cause: error });
  }
  if (response.status === 304 && options.headers?.["If-None-Match"]) { setPiConnectionMessage(""); return { response }; }
  if (response.status === 401) throw piResponseError(response, "Der Freigabeschlüssel wurde vom Pi abgelehnt.");
  if (response.status === 404) throw piResponseError(response, "Der Pi-Tracker ist noch nicht eingerichtet oder enthält noch keine Erstkopie.");
  if (response.status === 412) throw piResponseError(response, "Auf dem Pi liegt bereits ein anderer Stand. Deine Änderungen sind noch hier. Sichere bei Bedarf eine Kopie, bevor du den Pi-Stand neu lädst.");
  if (!response.ok) throw piResponseError(response, "Der Pi konnte den Tracker nicht verarbeiten (HTTP " + response.status + ").");
  const version = response.headers.get("ETag");
  if (!/^"[0-9a-f]{64}"$/.test(version)) throw new Error("Der Pi hat keine gültige Dateiversion geliefert.");
  setPiConnectionMessage("");
  return { response, version };
}

function piResponseError(response, message) {
  return Object.assign(new Error(message), { status: response.status });
}

function schedulePiSave() {
  if (piSaveTimer !== null || !piRevision || !fileDirty || pendingFileDraft ||
      !canChangeFile() || piSaveBlockedRevision === piRevision) return;
  piSaveTimer = setTimeout(() => {
    piSaveTimer = null;
    if (piRevision && fileDirty && !pendingFileDraft && piSaveBlockedRevision !== piRevision) {
      savePiTracker();
    }
  }, Math.max(250, piSaveRetryAt - Date.now()));
}

let piPollBusy = false;
let piPollRetryAt = 0;
function canApplyPiUpdate() {
  return piRevision && !fileDirty && !pendingFileDraft && canChangeFile() &&
    !taskDialog.open && !optionsDialog.open && !semesterDialog.open && !document.querySelector(".project-menu-row.is-dragging") && !document.hidden;
}

async function pollPiChanges() {
  if (piPollBusy || Date.now() < piPollRetryAt || !canApplyPiUpdate()) return;
  piPollBusy = true;
  const known = piRevision;
  try {
    const { response, version } = await piRequest({
      headers: { "If-None-Match": known, "X-Tracker-Wait": "1" }
    });
    if (response.status === 304 || known === version) return;
    const file = new File([await response.blob()], "Pi-Tracker.json");
    if (piRevision !== known || !canApplyPiUpdate()) return;
    fileBusy = true;
    updateFileStatus();
    try { await readTrackerFile(file, null, { startup: true, piVersion: version, live: true }); }
    finally { setFileBusy(false); }
  } catch (error) {
    piPollRetryAt = Date.now() + 5000;
    setPiConnectionMessage(error.message || "Verbindung zum Pi unterbrochen · bitte Heimnetz oder VPN prüfen.");
  } finally {
    piPollBusy = false;
  }
}

async function openPiTracker(startup = false) {
  const { response, version } = await piRequest();
  const file = new File([await response.blob()], "Pi-Tracker.json");
  const opened = await readTrackerFile(file, null, { startup, piVersion: version });
  if (opened && !startup) rememberPi(true);
  return opened;
}

async function restorePiTracker() {
  try {
    if (location.protocol === "https:" && localStorage.getItem("tasktracker2-pi-enabled") === "1") {
      if (githubPagesHosting && localStorage.getItem('tasktracker-v2-sync-provider') !== 'pi') return false;
      if (githubPagesHosting && !localStorage.getItem("tasktracker2-pi-endpoint")) return false;
      piConnection = piConnectionFromInputs();
      return await openPiTracker(true);
    }
  } catch {
    showFileError(new Error("Der Pi-Tracker konnte nicht geladen werden. Du kannst die Verbindung unter Einstellungen erneut versuchen."));
  }
  return false;
}

const syncConflictDialog = document.querySelector("#sync-conflicts");
const syncConflictForm = document.querySelector("#sync-conflicts-form");
const syncFieldNames = { projectOrder: "Projektreihenfolge", semester: "Semestereinstellungen", deletedAt: "Im Papierkorb seit", title: "Titel", description: "Anmerkungen", due: "Frist", planned: "Bearbeitungsdatum", status: "Status", progress: "Fortschritt", progressMode: "Fortschrittsberechnung", projectId: "Projekt", checklist: "Unteraufgaben", text: "Text", done: "Erledigt", timeTracking: "Zeiterfassung", freeTimeTracking: "Freie Zeiterfassung", name: "Name", parentId: "Übergeordnetes Projekt" };
function syncConflictLabel(conflict, local, remote) {
  const path = conflict.path;
  if (!path.length) return "Vollständiger Tracker";
  const collection = path[0];
  if (["tasks", "projects"].includes(collection) && path.length > 1) {
    const record = local[collection].find(t => t.id === path[1]) || remote[collection].find(t => t.id === path[1]);
    const subtask = path[2] === "checklist" && path.length > 3
      ? [local, remote].flatMap(doc => doc.tasks.find(t => t.id === path[1])?.checklist || []).find(item => item.id === path[3]) : null;
    return (record?.title || record?.name || path[1]) + " · " + (path.length === 2 ? "Gelöscht oder geändert" : path.slice(2).map((k, i) => i === 1 && subtask ? subtask.text : syncFieldNames[k] || k).join(" / "));
  }
  return path.map(k => syncFieldNames[k] || k).join(" / ");
}
function syncConflictValue(value, path, document) {
  if (value === undefined) return "Gelöscht / nicht vorhanden";
  if (path.at(-1) === "projectId") return trackerFiles.projectLabels(document).get(value) || "Ohne Projekt";
  if (path.at(-1) === "status") return { open: "Offen", doing: "In Bearbeitung", done: "Erledigt" }[value] || String(value);
  if (["timeTracking", "freeTimeTracking"].includes(path.at(-1)) && taskTime.valid(value)) {
    const phase = value.mode === "standard" ? "Standard-Timer" : "Pomodoro · " + ({ focus: "Fokus", short: "Kurze Pause", long: "Lange Pause" }[value.phase]);
    return phase + "\n" + (value.startedAt === null ? "Angehalten" : "Läuft seit " + new Date(value.startedAt).toLocaleString("de-DE")) +
      "\nGespeicherte Arbeitszeit: " + timeClock(value.totalMs) + "\nBisherige Zeit dieser Phase: " + timeClock(value.elapsedMs) +
      "\nZeiteinträge: " + value.entries.length + "\nAbgeschlossene Fokusphasen: " + value.rounds;
  }
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (value === "") return "Leer";
  if (typeof value !== "object" || value === null) return String(value);
  return JSON.stringify(value, (key, item) => item, 2);
}
function choosePiConflicts(base, local, remote, wholeDocument = false) {
  const initial = trackerMerge.plan(base, local, remote);
  document.querySelector("#sync-conflicts-description").textContent = wholeDocument || !base
    ? "Eine sichere Zusammenführung ist nicht möglich: Der gemeinsame Ausgangsstand fehlt oder die Kombination verletzt Aufgaben-, Projekt- oder Timerregeln. Wähle eine vollständige Fassung. Dabei werden Änderungen der anderen Fassung nicht übernommen. Du kannst abbrechen und vorher eine Kopie speichern."
    : "Diese Angaben wurden auf beiden Geräten geändert. Wähle für jeden Konflikt die gewünschte Fassung. Alle unabhängigen Änderungen bleiben erhalten.";
  const list = document.querySelector("#sync-conflicts-list");
  list.replaceChildren();
  const error = document.querySelector("#sync-conflicts-error");
  error.hidden = true;
  const wholeButton = document.createElement("button");
  wholeButton.type = "button"; wholeButton.className = "button";
  wholeButton.textContent = "Vollständige Fassungen vergleichen";
  wholeButton.hidden = !base;
  initial.conflicts.forEach((conflict, index) => {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = syncConflictLabel(conflict, local, remote);
    const choices = document.createElement("div"); choices.className = "sync-conflict-choices";
    for (const side of ["local", "remote"]) {
      const label = document.createElement("label"); label.className = "sync-conflict-choice";
      const input = document.createElement("input");
      input.type = "radio"; input.name = "conflict-" + index; input.value = side; input.required = true;
      const title = document.createElement("strong"); title.textContent = side === "local" ? "Dieses Gerät" : driveLink ? 'Google Drive / anderes Gerät' : "Pi / anderes Gerät";
      const content = document.createElement("pre");
      content.textContent = syncConflictValue(conflict[side], conflict.path, side === "local" ? local : remote);
      label.append(input, title, content); choices.append(label);
    }
    fieldset.append(legend, choices); list.append(fieldset);
  });
  list.append(wholeButton);
  return new Promise(resolve => {
    let result = null;
    wholeButton.addEventListener("click", () => { result = "whole"; syncConflictDialog.close(); });
    const submit = event => {
      event.preventDefault();
      const values = new FormData(syncConflictForm);
      const choices = Object.fromEntries(initial.conflicts.map((c, i) => [c.key, values.get("conflict-" + i)]));
      try {
        result = trackerMerge.validate(trackerMerge.plan(base, local, remote, choices).document);
        syncConflictDialog.close();
      } catch (failure) {
        result = null; error.textContent = failure.message + " Bitte passe die Auswahl an oder brich ab und sichere eine Kopie."; error.hidden = false;
      }
    };
    syncConflictForm.addEventListener("submit", submit);
    syncConflictDialog.addEventListener("close", () => {
      syncConflictForm.removeEventListener("submit", submit);
      resolve(result);
    }, { once: true });
    syncConflictDialog.showModal();
  }).then(result => result === "whole" ? choosePiConflicts(null, local, remote, true) : result);
}
document.querySelector("#sync-conflicts-cancel").addEventListener("click", () => syncConflictDialog.close());

async function reconcilePiTracker() {
  const { response, version } = await piRequest();
  const remote = trackerFiles.parse(await response.text());
  const local = structuredClone(fileDocument);
  let base = piBaseDocument;
  // A different tracker identity must never be merged by coincidentally matching IDs.
  if (local.id !== remote.id || (base && base.id !== local.id)) base = null;
  const plan = trackerMerge.plan(base, local, remote);
  let merged;
  if (plan.conflicts.length) merged = await choosePiConflicts(base, local, remote);
  else {
    try { merged = trackerMerge.validate(plan.document); }
    catch { merged = await choosePiConflicts(null, local, remote, true); }
  }
  if (!merged) return false;
  // Persist the resolved draft and its new base together BEFORE adopting it or retrying PUT.
  await taskStorage.saveDraft({ name: fileName, document: merged, piRevision: version, piBaseDocument: remote });
  fileDocument = merged;
  piBaseDocument = structuredClone(remote);
  piRevision = version;
  tasks = trackerFiles.toTasks(merged);
  fileDirty = true;
  completionUndo = null;
  document.querySelector("#completion-feedback").hidden = true;
  fileMessage = "Änderungen zusammengeführt · Übertragung läuft";
  updateProjectOptions();
  refreshHomeTasks();
  return true;
}

async function savePiTracker(initialize = false) {
  if (!canChangeFile() || !tasksLoaded || pendingFileDraft || (initialize ? !!piRevision : !piRevision)) return;
  setFileBusy(true);
  try {
    const document = currentTrackerDocument();
    trackerFiles.validate(document);
    const body = JSON.stringify(document, null, 2);
    const condition = initialize ? { "If-None-Match": "*" } : { "If-Match": piRevision };
    const { version } = await piRequest({
      method: "PUT", body, headers: { "Content-Type": "application/json", ...condition }
    });
    if (initialize) {
      await readTrackerFile(new File([body], "Pi-Tracker.json"), null, { startup: true, piVersion: version });
    } else {
      piRevision = version;
      piBaseDocument = structuredClone(document);
    }
    fileDirty = false;
    piSaveBlockedRevision = null;
    piSaveRetryAt = 0;
    fileMessage = "Auf Pi gespeichert";
    rememberPi(true);
    try { await taskStorage.clearDraft(); }
    catch { fileMessage += " · ältere Entwurfssicherung bleibt im Browser"; }
  } catch (error) {
    if (!initialize && error.status === 412) {
      try {
        if (await reconcilePiTracker()) {
          piSaveBlockedRevision = null;
          piSaveRetryAt = 0;
          return;
        }
      } catch (mergeError) { error = mergeError; }
      piSaveBlockedRevision = piRevision;
    }
    if (!initialize && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
      piSaveBlockedRevision = piRevision;
    }
    piSaveRetryAt = Date.now() + 5000;
    showFileError(error);
  } finally { setFileBusy(false); }
}

async function connectPi(initialize = false) {
  if (!canChangeFile()) return;
  const previous = piConnection;
  try {
    if (initialize && driveLink) throw new Error('Bitte zuerst zu Browseraufgaben oder einer lokalen Trackerdatei wechseln, bevor du eine Erstkopie auf dem Pi anlegst.');
    const next = piConnectionFromInputs();
    if (piRevision && previous && (previous.endpoint !== next.endpoint || previous.key !== next.key)) {
      throw new Error("Bitte zuerst zu den Browseraufgaben oder einer lokalen Trackerdatei wechseln, bevor du einen anderen Pi verbindest. Der aktuelle Tracker bleibt unverändert.");
    }
    piConnection = next;
    if (initialize) { await savePiTracker(true); return; }
    setFileBusy(true);
    if (!await openPiTracker()) piConnection = previous;
    piConnectionMessage = "";
  }
  catch (error) { piConnection = previous; showFileError(error); }
  finally { setFileBusy(false); }
}
document.querySelector("#pi-open").addEventListener("click", () => connectPi());
document.querySelector("#pi-initialize").addEventListener("click", () => connectPi(true));
document.querySelector("#pi-save").addEventListener("click", () => savePiTracker());
setInterval(pollPiChanges, 500);
document.addEventListener("visibilitychange", pollPiChanges);
// Editor drafts are local input snapshots, never replacements for tracker documents.
const editorSessions = new Map();
let closingEditor = null;
function editorElements(prefix) {
  return { form: document.querySelector(prefix === "options" ? "#task-options-form" : "#task-form"), dialog: document.querySelector(prefix === "options" ? "#task-options" : "#task-dialog"), notice: document.querySelector(`#${prefix}-editor-draft`) };
}
function editorInput(prefix) {
  const { form } = editorElements(prefix);
  return { controls: [...form.querySelectorAll("input[id], select[id], textarea[id]")].map(input => ({ id: input.id, value: input.value, checked: input.checked, label: input.tagName === "SELECT" ? input.selectedOptions[0]?.textContent : undefined })),
    ...(prefix === "options" ? { checklist: structuredClone(optionsChecklist) } : {}) };
}
function editorDirty(prefix) {
  const session = editorSessions.get(prefix);
  return !!session && editorElements(prefix).dialog.open && !trackerMerge.equal(editorInput(prefix), session.initial);
}
function persistEditor(prefix) {
  const session = editorSessions.get(prefix);
  if (!session || session.pending || !editorElements(prefix).dialog.open) return true;
  try {
    if (localStorage.getItem(session.key) !== session.stored) throw new Error("Concurrent draft");
    if (!editorDirty(prefix)) { localStorage.removeItem(session.key); session.stored = null; return true; }
    const text = JSON.stringify({ version: 1, input: editorInput(prefix), expected: session.expected });
    localStorage.setItem(session.key, text); session.stored = text;
    return true;
  } catch {
    const notice = editorElements(prefix).notice; notice.hidden = false;
    notice.textContent = "Der Entwurf konnte nicht gesichert werden oder wurde in einem anderen Fenster geändert. Deine Eingaben bleiben hier. Bitte speichere die Aufgabe, bevor du diese Seite verlässt.";
    return false;
  }
}
function finishEditor(prefix) {
  const session = editorSessions.get(prefix);
  if (session) { try { if (localStorage.getItem(session.key) === session.stored) localStorage.removeItem(session.key); } catch {} }
  editorSessions.delete(prefix);
}
function lockEditorDraft(prefix, locked) {
  const session = editorSessions.get(prefix), { form, notice } = editorElements(prefix);
  if (locked) {
    session.locked = [...form.querySelectorAll("input, select, textarea, button")].filter(c => !notice.contains(c) && !["options-close", "options-cancel", "close-task", "cancel-task"].includes(c.id)).map(c => [c, c.disabled]);
    session.locked.forEach(([c]) => { c.disabled = true; });
  } else { session.locked?.forEach(([c, disabled]) => { c.disabled = disabled; }); session.locked = null; }
}
function beginEditor(prefix) {
  const { notice } = editorElements(prefix);
  const source = fileDocument ? ["file", fileDocument.id || fileName] : ["browser"];
  const key = "tasktracker-editor-v1:" + JSON.stringify([...source, prefix, prefix === "options" ? optionsTaskId : "new"]);
  const session = { key, initial: editorInput(prefix), expected: prefix === "options" ? structuredClone(optionsExpected) : null, pending: false, stored: null };
  editorSessions.set(prefix, session); notice.hidden = true; notice.replaceChildren();
  let saved;
  try { session.stored = localStorage.getItem(key); saved = JSON.parse(session.stored); } catch { return; }
  if (!saved || saved.version !== 1 || !Array.isArray(saved.input?.controls) || prefix === "options" && (!Array.isArray(saved.input.checklist) || !taskDetails.valid({ checklist: saved.input.checklist }))) return;
  session.pending = true;
  notice.hidden = false;
  const message = document.createElement("p"); message.textContent = "Für diese Aufgabe liegt ein Bearbeitungsentwurf vor. Er wurde noch nicht in die Aufgabe übernommen.";
  const restore = document.createElement("button"); restore.type = "button"; restore.className = "button"; restore.textContent = "Entwurf laden";
  const discard = document.createElement("button"); discard.type = "button"; discard.className = "button"; discard.textContent = "Entwurf verwerfen";
  restore.addEventListener("click", () => {
    if (!trackerMerge.equal(session.expected, saved.expected) && !window.confirm("Die Aufgabe wurde seit diesem Entwurf geändert. Beim Laden werden die Felder im Formular durch deine früheren Eingaben ersetzt. Prüfe insbesondere Projekt, Termine und Notizen vor dem Speichern. Entwurf trotzdem laden?")) return;
    lockEditorDraft(prefix, false);
    for (const value of saved.input.controls) {
      if (!value || typeof value.id !== "string") continue;
      const input = document.getElementById(value.id);
      if (!input || !editorElements(prefix).form.contains(input) || typeof value.value !== "string") continue;
      if (input.tagName === "SELECT" && ![...input.options].some(o => o.value === value.value)) input.add(new Option(value.label || value.value, value.value));
      input.value = value.value; if (typeof value.checked === "boolean") input.checked = value.checked;
    }
    if (prefix === "options") {
      optionsChecklist = structuredClone(saved.input.checklist); optionsCompleted = document.querySelector("#options-status").value === "done";
      renderOptionsChecklist(); updateOptionsNewProject();
    }
    if (prefix === "task") updateTaskNewProject();
    updateRepeatControls(prefix); session.pending = false; notice.hidden = true; persistEditor(prefix);
  });
  discard.addEventListener("click", () => { try { if (localStorage.getItem(key) !== session.stored) throw new Error(); localStorage.removeItem(key); session.stored = null; session.pending = false; lockEditorDraft(prefix, false); notice.hidden = true; } catch { message.textContent = "Entwurf wurde in einem anderen Fenster geändert oder konnte nicht entfernt werden. Bitte erneut öffnen."; } });
  notice.append(message, restore, discard);
  lockEditorDraft(prefix, true);
}
function requestEditorClose(prefix) {
  if (!editorDirty(prefix)) { lockEditorDraft(prefix, false); editorElements(prefix).dialog.close(); editorSessions.delete(prefix); return; }
  persistEditor(prefix); closingEditor = prefix; document.querySelector("#editor-close-dialog").showModal();
}
for (const prefix of ["task", "options"]) {
  const { form } = editorElements(prefix);
  for (const type of ["input", "change", "click"]) form.addEventListener(type, () => { setTimeout(() => persistEditor(prefix), 0); });
}
document.querySelector("#editor-continue").addEventListener("click", () => document.querySelector("#editor-close-dialog").close());
document.querySelector("#editor-discard").addEventListener("click", () => {
  if (!closingEditor) return;
  finishEditor(closingEditor); editorElements(closingEditor).dialog.close(); document.querySelector("#editor-close-dialog").close();
});
document.querySelector("#editor-keep").addEventListener("click", () => {
  if (!closingEditor || !persistEditor(closingEditor)) return;
  editorElements(closingEditor).dialog.close(); editorSessions.delete(closingEditor); document.querySelector("#editor-close-dialog").close();
});
window.addEventListener("beforeunload", () => { persistEditor("task"); persistEditor("options"); });

function driveScope(fileId, accountId = trackerDrive.session?.accountId) {
  if (!trackerDrive.config || !accountId) throw new Error('Bitte zuerst mit Google verbinden.');
  return trackerDrive.config.clientId + '|' + accountId + '|' + fileId;
}
function driveCache(document, link = driveLink) { return { ...structuredClone(link), working: structuredClone(document), enabled: true }; }
async function persistDriveCache(document) {
  trackerMerge.validate(document);
  const saved = await taskStorage.saveDriveCache(driveCache(document), driveLink.cacheVersion);
  driveLink.cacheVersion = saved.cacheVersion; driveNextSync = 0;
}
function driveError(error) {
  const output = document.querySelector('#drive-error');
  output.textContent = error?.message || 'Die Drive-Verbindung konnte nicht hergestellt werden. Dein Arbeitsstand bleibt auf diesem Gerät.';
  output.hidden = false;
}
function updateDriveUI() {
  const configured = !!trackerDrive.config, signedIn = !!trackerDrive.session;
  const busy = driveBusy || fileBusy || savingTask || (timeControlsReady && timeBusy);
  document.querySelector('#drive-login').hidden = !configured;
  document.querySelector('#drive-login').textContent = !trackerDrive.ready ? 'Google-Anmeldung laden' : signedIn ? 'Google-Verbindung erneuern' : 'Mit Google verbinden';
  document.querySelector('#drive-disconnect').hidden = !signedIn && !driveLink;
  document.querySelector('#drive-files').hidden = !signedIn;
  document.querySelector('#drive-sync').hidden = !driveLink;
  document.querySelector('#drive-sync').textContent = driveConflict ? 'Konflikte klären' : 'Jetzt synchronisieren';
  for (const control of document.querySelectorAll('#drive-config-form input, #drive-config-form button, #drive-login, #drive-disconnect, #drive-files button, #drive-file-list, #drive-new-name')) control.disabled = busy || driveSyncBusy;
  document.querySelector('#drive-status').textContent = !driveReady ? 'Drive-Verbindung wird vorbereitet …' : !configured
    ? 'Noch nicht eingerichtet. Der Tracker bleibt auf diesem Gerät nutzbar.'
    : driveMessage || (driveLink ? !signedIn ? 'Arbeitsstand wieder geöffnet · bitte Google-Verbindung erneuern.' : fileDirty ? 'Änderungen lokal gesichert · Übertragung ausstehend' : '„' + driveLink.title + '“ · automatisch mit Google Drive verbunden'
      : signedIn ? 'Mit ' + trackerDrive.session.displayName + ' verbunden. Eine Trackerdatei auswählen oder eine neue Kopie erstellen.' : 'Projekt eingerichtet. Über den Anmeldeknopf mit Google verbinden.');
}
async function applyDriveRecord(record, working = record.document, expectedVersion = driveLink?.cacheVersion, accountId = trackerDrive.session?.accountId) {
  trackerMerge.validate(working); trackerMerge.validate(record.document);
  if (!/^"[^"\r\n]+"$/.test(record.etag) || !/^[A-Za-z0-9_-]{6,200}$/.test(record.id)) throw new Error('Ungültiger gespeicherter Drive-Stand.');
  const link = { scope: driveScope(record.id, accountId), clientId: trackerDrive.config.clientId, accountId,
    fileId: record.id, title: record.title, etag: record.etag, base: structuredClone(record.document), enabled: true };
  const persisted = await taskStorage.saveDriveCache(driveCache(working, link), expectedVersion);
  link.cacheVersion = persisted.cacheVersion;
  await taskStorage.driveSave('active', { scope: link.scope, clientId: link.clientId, accountId, fileId: link.fileId, enabled: true });
  driveLink = link; fileDocument = structuredClone(working); tasks = trackerFiles.toTasks(fileDocument);
  fileHandle = null; fileBaseline = null; fileName = record.title || 'Drive-Tracker.json';
  piRevision = null; piBaseDocument = null; pendingFileDraft = null;
  fileDirty = !trackerMerge.equal(working, record.document); fileAutoSaveBlocked = true; tasksLoaded = true;
  completionUndo = null; driveConflict = false; driveMessage = '';
  document.querySelector('#completion-feedback').hidden = true;
  rememberPi(false);
  try { localStorage.setItem('tasktracker-v2-sync-provider', 'drive'); } catch {}
  updateProjectOptions(); refreshHomeTasks(); updateFileStatus();
}
async function leaveDriveTracker() {
  if (!driveLink) return;
  const cache = driveCache(fileDocument); cache.enabled = false;
  await taskStorage.saveDriveCache(cache, driveLink.cacheVersion);
  await taskStorage.driveSave('active', { scope: driveLink.scope, clientId: driveLink.clientId, accountId: driveLink.accountId, fileId: driveLink.fileId, enabled: false });
  driveLink = null; driveConflict = false; driveMessage = '';
}
async function restoreDriveTracker() {
  try {
    await trackerDrive.init(); driveReady = true;
    if (trackerDrive.config) {
      document.querySelector('#drive-client-id').value = trackerDrive.config.clientId;
      document.querySelector('#drive-api-key').value = trackerDrive.config.apiKey;
    } else document.querySelector('#drive-setup').open = true;
    updateDriveUI();
    const active = await taskStorage.driveLoad('active');
    if (!active?.enabled || active.clientId !== trackerDrive.config?.clientId || (trackerDrive.session && active.accountId !== trackerDrive.session.accountId)) return false;
    const saved = await taskStorage.loadDriveCache(active.scope);
    if (!saved || saved.scope !== driveScope(active.fileId, active.accountId) || saved.accountId !== active.accountId || saved.clientId !== active.clientId) throw new Error('Der gespeicherte Drive-Arbeitsstand gehört zu einem anderen Konto oder Projekt und wurde nicht geladen.');
    await applyDriveRecord({ id: saved.fileId, title: saved.title, etag: saved.etag, document: saved.base }, saved.working, saved.cacheVersion, active.accountId);
    prepareRememberedDriveLogin();
    return true;
  } catch (error) { driveReady = true; driveError(error); return false; }
}
function canApplyDrive() {
  return !!driveLink && trackerDrive.session?.accountId === driveLink.accountId && trackerDrive.config?.clientId === driveLink.clientId &&
    canChangeFile() && !taskDialog.open && !optionsDialog.open && !semesterDialog.open && !syncConflictDialog.open && !document.querySelector('.project-menu-row.is-dragging');
}
async function syncDriveTracker(resolveConflicts = false) {
  if (driveSyncBusy || driveBusy || !canApplyDrive() || (driveConflict && !resolveConflicts)) return;
  driveSyncBusy = true; driveNextSync = Date.now() + 3000; updateDriveUI();
  const scope = driveLink.scope;
  try {
    if (!navigator.onLine) throw new Error('Offline · Änderungen bleiben auf diesem Gerät und werden nach der Wiederverbindung abgeglichen.');
    let remote = await trackerDrive.get(driveLink.fileId, driveLink.etag);
    if (!canApplyDrive() || driveLink.scope !== scope) return;
    if (remote.unchanged && !fileDirty) { driveMessage = ''; document.querySelector('#drive-error').hidden = true; return; }
    if (remote.unchanged) remote = await trackerDrive.get(driveLink.fileId);
    if (!canApplyDrive() || driveLink.scope !== scope) return;
    const cache = await taskStorage.loadDriveCache(scope);
    if (cache?.cacheVersion !== driveLink.cacheVersion) throw new Error('Der Drive-Arbeitsstand wurde in einem anderen Fenster geändert. Bitte neu laden.');
    if (!canApplyDrive() || driveLink.scope !== scope) return;
    const snapshot = structuredClone(fileDocument);
    let base = driveLink.base;
    if (snapshot.id !== remote.document.id || base.id !== snapshot.id) base = null;
    const plan = trackerMerge.plan(base, snapshot, remote.document);
    let merged;
    try { if (!plan.conflicts.length) merged = trackerMerge.validate(plan.document); } catch { /* Ask for a complete valid version. */ }
    if (!merged) {
      driveConflict = true; driveMessage = 'Gleichzeitige Änderungen benötigen deine Auswahl. Öffne „Konflikte klären“.';
      if (!resolveConflicts) return;
      setFileBusy(true);
      try { merged = await choosePiConflicts(base, snapshot, remote.document, !plan.conflicts.length); } finally { setFileBusy(false); }
      if (!merged) return;
    }
    let saved = remote;
    if (!trackerMerge.equal(merged, remote.document)) saved = await trackerDrive.put(driveLink.fileId, merged, remote.etag);
    if (!canApplyDrive() || driveLink.scope !== scope || !trackerMerge.equal(fileDocument, snapshot)) return;
    setFileBusy(true);
    try { await applyDriveRecord(saved); } finally { setFileBusy(false); }
    document.querySelector('#drive-error').hidden = true;
  } catch (error) {
    if (error.conflict) driveNextSync = Date.now() + 500;
    else { driveMessage = error.auth ? 'Google-Verbindung bitte erneuern · Änderungen bleiben lokal gesichert.' : 'Abgleich unterbrochen · Arbeitsstand auf diesem Gerät gesichert'; driveError(error); driveNextSync = error.auth ? Infinity : Date.now() + Math.max(10000, (error.retryAfter || 0) * 1000); }
  } finally { driveSyncBusy = false; updateFileStatus(); }
}
async function driveAction(action, { allowSync = false } = {}) {
  if (driveBusy || (driveSyncBusy && !allowSync) || !canChangeFile()) return;
  driveBusy = true; setFileBusy(true); document.querySelector('#drive-error').hidden = true;
  try { await action(); } catch (error) { driveError(error); }
  finally { driveBusy = false; setFileBusy(false); }
}
async function refreshDriveFiles() {
  const files = await trackerDrive.files(), select = document.querySelector('#drive-file-list');
  const selected = select.value; select.replaceChildren(new Option('Bitte auswählen', ''));
  for (const file of files) select.append(new Option(file.title, file.id));
  if (files.some(file => file.id === selected)) select.value = selected;
}
async function openDriveFile(fileId) {
  if (!fileId) throw new Error('Bitte eine Trackerdatei auswählen.');
  const remote = await trackerDrive.get(fileId);
  const saved = await taskStorage.loadDriveCache(driveScope(fileId));
  if (!await confirmDataSwitch()) return;
  if (driveLink && driveLink.fileId !== fileId) await leaveDriveTracker();
  if (saved?.working && !trackerMerge.equal(saved.working, saved.base)) {
    await applyDriveRecord({ id: saved.fileId, title: saved.title, etag: saved.etag, document: saved.base }, saved.working, saved.cacheVersion);
  } else await applyDriveRecord(remote, remote.document, saved?.cacheVersion || null);
  driveNextSync = 0;
}
document.querySelector('#drive-config-form').addEventListener('submit', event => {
  event.preventDefault(); driveAction(async () => {
    if (driveLink) throw new Error('Bitte zuerst zu Browseraufgaben oder einer lokalen Datei wechseln, bevor du die Google-Projektangaben änderst.');
    await trackerDrive.configure({ clientId: document.querySelector('#drive-client-id').value, apiKey: document.querySelector('#drive-api-key').value });
    await trackerDrive.prepare(); driveMessage = 'Anmeldung vorbereitet. Jetzt „Mit Google verbinden“ wählen.';
    document.querySelector('#drive-setup').open = false;
  });
});
async function renewDriveLogin() {
  try { await trackerDrive.authorize(); }
  finally {
    if (driveLink && trackerDrive.session && driveLink.accountId !== trackerDrive.session.accountId) await showBrowserAfterDrive();
  }
  driveMessage = ''; driveNextSync = 0; await refreshDriveFiles();
}
document.querySelector('#drive-login').addEventListener('click', () => driveAction(async () => {
  if (!trackerDrive.ready) { await trackerDrive.prepare(); driveMessage = 'Google-Anmeldung geladen. Jetzt „Mit Google verbinden“ wählen.'; return; }
  await renewDriveLogin();
}));

function prepareRememberedDriveLogin() {
  // A previously chosen Drive tracker may load the SDK, but never open sign-in
  // without a click. Prepare early so the brand click retains its popup gesture.
  if (driveLink && navigator.onLine && location.protocol === 'https:') trackerDrive.prepare().catch(() => {});
}
document.querySelector('.brand').addEventListener('click', event => {
  // Keep native new-tab/window gestures and the original local/Pi home link.
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
      location.protocol !== 'https:' || !trackerDrive.config || (!driveLink && !trackerDrive.session)) return;
  if (driveBusy) { event.preventDefault(); return; }
  if (!canChangeFile()) return;
  event.preventDefault();
  const destination = event.currentTarget.href;
  driveAction(async () => {
    if (!trackerDrive.ready) await trackerDrive.prepare();
    await renewDriveLogin();
  }, { allowSync: true }).finally(() => {
    // Retain the full home navigation/reload, including native beforeunload
    // protection, even if Google is cancelled or unavailable. Working data is cached.
    location.assign(destination);
  });
});
document.querySelector('#drive-refresh').addEventListener('click', () => driveAction(refreshDriveFiles));
document.querySelector('#drive-open').addEventListener('click', () => driveAction(() => openDriveFile(document.querySelector('#drive-file-list').value)));
document.querySelector('#drive-pick').addEventListener('click', () => driveAction(async () => {
  if (!trackerDrive.ready) { await trackerDrive.prepare(); driveMessage = 'Dateiauswahl geladen. Bitte „Andere Drive-Datei auswählen“ erneut wählen.'; return; }
  const fileId = await trackerDrive.pick(); if (fileId) { await openDriveFile(fileId); await refreshDriveFiles(); }
}));
document.querySelector('#drive-create').addEventListener('click', () => driveAction(async () => {
  if (!tasksLoaded || pendingFileDraft || driveLink) throw new Error('Bitte zuerst die gewünschte lokale Trackerdatei oder die Browseraufgaben öffnen.');
  const source = currentTrackerDocument();
  let record = await trackerDrive.create(document.querySelector('#drive-new-name').value.trim(), source);
  if (!trackerMerge.equal(source, record.document)) {
    const chosen = await choosePiConflicts(null, source, record.document, true);
    if (!chosen) return;
    if (!trackerMerge.equal(chosen, record.document)) record = await trackerDrive.put(record.id, chosen, record.etag);
  }
  await applyDriveRecord(record); await refreshDriveFiles();
}));
document.querySelector('#drive-sync').addEventListener('click', () => { driveNextSync = 0; syncDriveTracker(true); });
async function showBrowserAfterDrive() {
  await leaveDriveTracker();
  const [localTasks, freeTime, order, styles] = await Promise.all([taskStorage.load(), taskStorage.loadFreeTime(), taskStorage.loadProjectOrder(), taskStorage.loadProjectStyles()]);
  fileDocument = null; fileHandle = null; fileBaseline = null; fileName = ''; fileDirty = false;
  tasks = localTasks; browserFreeTime = freeTime; browserProjectOrder = order; browserProjectStyles = styles;
  selectedProjectKey = ''; updateProjectOptions(); refreshHomeTasks();
}
document.querySelector('#drive-disconnect').addEventListener('click', () => driveAction(async () => {
  if (driveLink) await showBrowserAfterDrive();
  trackerDrive.disconnect(); driveMessage = 'Auf diesem Gerät getrennt. Deine Datei bleibt in Google Drive erhalten.';
}));
setInterval(() => { if (driveLink && !document.hidden && Date.now() >= driveNextSync) syncDriveTracker(); }, 500);
window.addEventListener('online', () => { prepareRememberedDriveLogin(); driveNextSync = 0; syncDriveTracker(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { driveNextSync = 0; syncDriveTracker(); } });

loadTasks();
