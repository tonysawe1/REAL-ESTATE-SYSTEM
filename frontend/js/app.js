const API_ROOT = "/api/v1";
const TOKEN_STORAGE_KEY = "mkuyu_token";

function getToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch (_) { return null; }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (_) { /* storage unavailable (e.g. private mode) */ }
}

function clearToken() { setToken(null); }

const state = {
  view: "dashboard",
  projects: [],
  properties: [],
  clients: [],
  contracts: [],
  debts: [],
  appointments: [],
  documents: [],
  reminders: [],
  payments: [],
  summary: null,
  projectReports: [],
  reportTypes: [],
  reportPaymentMethods: [],
  reportHistory: [],
  reportPreview: null,
  reportFilters: { source: "", reportType: "", projectId: "", search: "", from: "", to: "" },
  filters: { project: "", type: "", status: "", debtStatus: "", propertyStatus: "", clientStatus: "", appointmentStatus: "", documentStatus: "", documentSearch: "", sort: "" },
  loading: true,
  toastTimer: null,
  reportSearchTimer: null,
};

const content = document.getElementById("content");
const modalBackdrop = document.getElementById("modal-backdrop");
const modal = document.getElementById("modal");
const pageTitle = document.getElementById("page-title");
const pageSub = document.getElementById("page-sub");
const topbarActions = document.getElementById("topbar-actions");

const authScreen = document.getElementById("auth-screen");
const workspace = document.getElementById("workspace");
const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");
const authSubmit = document.getElementById("auth-submit");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const displayNameField = document.getElementById("display-name-field");
const authSwitchLabel = document.getElementById("auth-switch-label");
const authToggle = document.getElementById("auth-toggle");

let authMode = "login";
let currentUser = null;

function showAuthMessage(message) {
  authMessage.textContent = message;
  authMessage.hidden = false;
}

function hideAuthMessage() {
  authMessage.hidden = true;
}

function setAuthMode(mode) {
  authMode = mode === "setup" ? "setup" : "login";
  const isSetup = authMode === "setup";
  displayNameField.hidden = !isSetup;
  document.getElementById("auth-name").required = isSetup;
  authTitle.textContent = isSetup ? "Create workspace" : "Sign in";
  authSubtitle.textContent = isSetup ? "Set up the first private office account." : "Use your private workspace credentials.";
  authSubmit.innerHTML = isSetup ? 'Create workspace <span>↗</span>' : 'Enter workspace <span>↗</span>';
  authSwitchLabel.textContent = isSetup ? "Already have access?" : "New private workspace?";
  authToggle.textContent = isSetup ? "Sign in" : "Create an account";
  hideAuthMessage();
}

function endSession(message = "") {
  clearToken();
  currentUser = null;
  closeModal();
  workspace.hidden = true;
  authScreen.hidden = false;
  if (message) showAuthMessage(message);
}

function enterWorkspace(user) {
  currentUser = user;
  authScreen.hidden = true;
  workspace.hidden = false;
  hideAuthMessage();
  const name = user.display_name || user.email || "Office";
  document.getElementById("user-name").textContent = name;
  document.getElementById("user-email").textContent = user.email || "Private workspace";
  document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();
  refresh();
}

const viewMeta = {
  dashboard: ["Dashboard", "Overview of contracts, debts, and reminders"],
  projects: ["Projects", "Organize contracts and client records by development"],
  properties: ["Properties", "List, track, and classify estate inventory"],
  clients: ["Clients", "Contacts, roles, and relationship status across projects"],
  contracts: ["Contracts", "Track new and terminal contracts across every project"],
  debts: ["Debts", "Monitor client balances, due dates, and payment progress"],
  appointments: ["Appointments", "Viewings, calls, meetings, and inspections"],
  documents: ["Documents", "Agreements, titles, invoices, reports, and permits"],
  reports: ["Reports", "Turn project activity into clear management records"],
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  try {
    return new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(numberValue(value));
  } catch (_) {
    return `TZS ${numberValue(value).toLocaleString()}`;
  }
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("en-GB", withTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function debtState(debt) {
  if (debt.status === "paid") return "paid";
  if (debt.status === "overdue" || (debt.due_date && debt.due_date < today())) return "overdue";
  if (debt.due_date && debt.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)) return "upcoming";
  return "pending";
}

function badge(value, variant) {
  const normalized = String(value || "").toLowerCase();
  const key = variant ? String(variant).toLowerCase() : normalized;
  return `<span class="badge badge-${escapeHtml(key)}">${escapeHtml(value)}</span>`;
}

function badgeVariant(value, variant) {
  const safe = String(value ?? "").trim() || "unknown";
  const key = String(variant || safe).toLowerCase();
  return `<span class="badge badge-${escapeHtml(key)}">${escapeHtml(safe)}</span>`;
}

function documentIcon(category) {
  const map = {
    agreement: "⌥",
    title: "⌖",
    invoice: "$",
    receipt: "✓",
    report: "✦",
    permit: "⌘",
    other: "▱",
  };
  return `<span class="doc-icon-mark">${map[category] || map.other}</span>`;
}

function formatDateTime(value, includeDate = true) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
  return includeDate ? `${datePart} · ${timePart}` : timePart;
}

function reportTypeLabel(id) {
  const type = (state.reportTypes || []).find((entry) => entry.id === id);
  return type ? type.label : id;
}

function reportFormatLabel(format) {
  const map = { xlsx: "XLSX", pdf: "PDF", docx: "DOCX", pptx: "PPTX" };
  return map[String(format || "").toLowerCase()] || String(format || "—").toUpperCase();
}

function formatBytes(bytes) {
  const value = numberValue(bytes, 0);
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1048576).toFixed(1)} MB`;
}

function fileKindIcon(mimeType, filename) {
  const name = String(filename || "").toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return " ¬";
  if (name.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return " ¬";
  if (name.endsWith(".xlsx") || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return " ▦";
  if (name.endsWith(".pptx") || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return " ▦";
  if (mimeType && mimeType.startsWith("image/")) return " ◎";
  return " ▱";
}

function reportKindBadge(format) {
  const key = `report-${String(format || "other").toLowerCase()}`;
  return `<span class="badge badge-${escapeHtml(key)}">${escapeHtml(reportFormatLabel(format))}</span>`;
}

function sourceBadge(source) {
  return source === "generated" ? badge("Generated", "active") : badge("Uploaded", "neutral");
}

function parseReportFilters(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function reportTypeDef(id) {
  return (state.reportTypes || []).find((entry) => entry.id === id) || null;
}

// Renders only the filters the selected report type declares.
function reportFilterFieldsHtml(typeId, values = {}) {
  const def = reportTypeDef(typeId);
  const allowed = new Set(def?.filters || []);
  const fields = [];
  if (allowed.has("project")) {
    fields.push(`<div class="field"><label for="field-filter-project">Project</label><select id="field-filter-project" name="project"><option value="">All projects</option>${projectOptions(values.project)}</select></div>`);
  }
  if (allowed.has("date_from")) {
    fields.push(`<div class="field"><label for="field-filter-from">From · ${escapeHtml(def?.date_field || "date")}</label><input id="field-filter-from" name="date_from" type="date" value="${escapeHtml(values.date_from || "")}"></div>`);
  }
  if (allowed.has("date_to")) {
    fields.push(`<div class="field"><label for="field-filter-to">To · ${escapeHtml(def?.date_field || "date")}</label><input id="field-filter-to" name="date_to" type="date" value="${escapeHtml(values.date_to || "")}"></div>`);
  }
  if (allowed.has("status") && Array.isArray(def?.status_values)) {
    const options = def.status_values.map((entry) => `<option value="${escapeHtml(entry.value)}" ${values.status === entry.value ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("");
    fields.push(`<div class="field"><label for="field-filter-status">${escapeHtml(def.status_label || "Status")}</label><select id="field-filter-status" name="status"><option value="">All</option>${options}</select></div>`);
  }
  if (allowed.has("method")) {
    const options = (state.reportPaymentMethods || []).map((entry) => `<option value="${escapeHtml(entry.value)}" ${values.method === entry.value ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("");
    fields.push(`<div class="field"><label for="field-filter-method">Payment method</label><select id="field-filter-method" name="method"><option value="">All methods</option>${options}</select></div>`);
  }
  if (allowed.has("client")) {
    fields.push(`<div class="field"><label for="field-filter-client">Client name contains</label><input id="field-filter-client" name="client" maxlength="80" value="${escapeHtml(values.client || "")}" placeholder="e.g. Amina"></div>`);
  }
  if (!fields.length) fields.push(`<div class="field full"><span class="muted">This report does not accept filters.</span></div>`);
  return `<div class="form-grid" id="report-filter-fields" style="grid-column:1/-1">${fields.join("")}</div>`;
}

function renderReportGenerateForm(report = null) {
  const types = state.reportTypes || [];
  if (!types.length) {
    return `<div class="card glass empty"><strong>Report catalogue unavailable</strong>Reload the workspace and try again.</div>`;
  }
  const saved = { ...parseReportFilters(report?.filters_json) };
  if (report?.project_id) saved.project = report.project_id;
  const selected = report?.report_type && types.some((entry) => entry.id === report.report_type) ? report.report_type : types[0].id;
  const typeOptions = types.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === selected ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("");
  const formatOptions = ["xlsx", "pdf", "docx", "pptx"].map((format) => `<option value="${format}" ${(report?.file_format || "xlsx") === format ? "selected" : ""}>${reportFormatLabel(format)}</option>`).join("");
  return `<div class="form-grid">
    <div class="field full"><label for="field-report-type">Report type</label><select id="field-report-type" name="report_type">${typeOptions}</select>${report ? `<div class="field-help">Re-exporting “${escapeHtml(report.title)}” with its saved filters.</div>` : ""}</div>
    <div class="field full"><label for="field-report-title">Title <span class="muted">(optional)</span></label><input id="field-report-title" name="title" maxlength="160" value="${escapeHtml(report?.title || "")}" placeholder="Defaults to the report name"></div>
    ${reportFilterFieldsHtml(selected, saved)}
    <div class="field"><label for="field-report-format">File format</label><select id="field-report-format" name="format">${formatOptions}</select></div>
    <div class="field"><span class="muted" style="align-self:end;font-size:11px">Preview shows the first rows before exporting.</span></div>
  </div>`;
}

function renderReportUploadForm() {
  const types = state.reportTypes || [];
  if (!types.length) {
    return `<div class="card glass empty"><strong>Report catalogue unavailable</strong>Reload the workspace and try again.</div>`;
  }
  const typeOptions = types.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`).join("");
  return `<div class="form-grid">
    <div class="field full"><label for="field-report-type">Report type</label><select id="field-report-type" name="report_type">${typeOptions}</select></div>
    <div class="field full"><label for="field-report-title">Title</label><input id="field-report-title" name="title" required maxlength="160" placeholder="e.g. Q3 income summary"></div>
    <div class="field full"><label for="field-report-file">Report file</label><input id="field-report-file" name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"><div class="field-help">PDF, Word, Excel or PowerPoint · up to 15 MB.</div></div>
    <div class="field"><label for="field-report-project">Project <span class="muted">(optional)</span></label><select id="field-report-project" name="project_id"><option value="">No project</option>${projectOptions()}</select></div>
    <div class="field full"><label for="field-report-description">Description <span class="muted">(optional)</span></label><textarea id="field-report-description" name="description" maxlength="2000" placeholder="Where this report came from or what it covers"></textarea></div>
  </div>`;
}

function previewCell(value, kind) {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") return money(value);
  if (kind === "int") return String(numberValue(value));
  if (kind === "date") {
    const raw = String(value);
    const datePart = formatDate(raw.slice(0, 10));
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? `${datePart} ${raw.slice(11, 16)}` : datePart;
  }
  return escapeHtml(value);
}

function renderReportPreview() {
  const preview = state.reportPreview;
  if (!preview) {
    return `<div class="card glass empty"><strong>No preview yet</strong>Open “Generate report” and choose Preview.</div>`;
  }
  const columns = preview.columns || [];
  const allRows = preview.rows || [];
  const rows = allRows.slice(0, 100);
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td class="${column.kind === "money" || column.kind === "int" ? "amount" : ""}">${previewCell(row[column.key], column.kind)}</td>`).join("")}</tr>`).join("");
  const totals = (preview.totals || []).map((total) => `${escapeHtml(total.label)}: ${total.kind === "money" ? money(total.value) : escapeHtml(String(total.value))}`).join(" · ");
  const rowNote = allRows.length > rows.length ? ` · showing first ${rows.length}` : "";
  return `<div class="section-note">${escapeHtml(preview.filters_text || "No filters applied")} · ${numberValue(preview.row_count)} row${numberValue(preview.row_count) === 1 ? "" : "s"}${rowNote}</div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(columns.length, 1)}">No rows matched the filters.</td></tr>`}</tbody></table></div>
    ${totals ? `<div class="section-note" style="margin-top:12px">${totals}</div>` : ""}`;
}

// Only sends the filter keys the API accepts; empty values are omitted.
function reportRequestPayload(data) {
  const body = { report_type: data.report_type, format: data.format || "xlsx" };
  if (data.title) body.title = data.title;
  ["project", "date_from", "date_to", "status", "method", "client"].forEach((key) => {
    if (data[key] !== undefined && data[key] !== "") body[key] = data[key];
  });
  return body;
}

async function downloadFile(path, filename) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_ROOT}${path}`, { headers });
  if (response.status === 401) { endSession("Your session has expired. Please sign in again."); throw new Error("session expired"); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Download failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function openFileInTab(path) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_ROOT}${path}`, { headers });
  if (response.status === 401) { endSession("Your session has expired. Please sign in again."); throw new Error("session expired"); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to open file");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
}

async function api(path, options = {}) {
  // `form: true` sends a FormData body untouched (browser sets the multipart boundary).
  const { form, headers: extraHeaders, ...rest } = options;
  const headers = { ...(extraHeaders || {}) };
  if (!form) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_ROOT}${path}`, { ...rest, headers });
  const payload = await response.json().catch(() => ({}));
  const isCredentialRequest = path.startsWith("/auth/login") || path.startsWith("/auth/setup");
  if (response.status === 401 && !isCredentialRequest) {
    const error = new Error(payload.error || "session expired");
    error.sessionExpired = true;
    endSession("Your session has expired. Please sign in again.");
    throw error;
  }
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function refresh() {
  state.loading = true;
  render();
  // `pick` unwraps nested API envelopes; `after` lets one response update
  // derived state (report types also carry payment methods).
  const calls = [
    ["/projects", "projects", { fallback: [], pick: (payload) => payload }],
    ["/contracts", "contracts", { fallback: [], pick: (payload) => payload }],
    ["/debts", "debts", { fallback: [], pick: (payload) => payload }],
    ["/reminders", "reminders", { fallback: [], pick: (payload) => payload }],
    ["/payments", "payments", { fallback: [], pick: (payload) => payload }],
    ["/reports/summary", "summary", { fallback: null, pick: (payload) => payload }],
    ["/reports/by-project", "projectReports", { fallback: [], pick: (payload) => payload }],
    ["/properties", "properties", { fallback: [], pick: (payload) => payload }],
    ["/clients", "clients", { fallback: [], pick: (payload) => payload }],
    ["/appointments", "appointments", { fallback: [], pick: (payload) => payload }],
    ["/documents", "documents", { fallback: [], pick: (payload) => payload }],
    ["/reports/types", "reportTypes", {
      fallback: [],
      pick: (payload) => (Array.isArray(payload) ? payload : payload?.types ?? []),
      after: (raw) => {
        state.reportPaymentMethods = Array.isArray(raw?.payment_methods) ? raw.payment_methods : [];
      },
    }],
    ["/reports/history", "reportHistory", { fallback: [], pick: (payload) => payload }],
  ];
  try {
    const results = await Promise.allSettled(calls.map(([path]) => api(path)));
    const failed = [];
    let sessionExpired = false;
    results.forEach((result, index) => {
      const [, key, options] = calls[index];
      if (result.status === "fulfilled") {
        const raw = result.value;
        const picked = options?.pick ? options.pick(raw) : raw;
        state[key] = Array.isArray(options?.fallback)
          ? (Array.isArray(picked) ? picked : options.fallback)
          : (picked ?? options?.fallback ?? null);
        if (options?.after) options.after(raw, state[key]);
      } else {
        failed.push(calls[index][0]);
        if (result.reason?.sessionExpired) sessionExpired = true;
      }
    });
    if (failed.length && !sessionExpired) showToast(`Some workspace data failed to load: ${failed.join(", ")}`);
  } finally {
    state.loading = false;
    render();
  }
}

// Reloads report history from the server using the history filter bar.
async function loadReportHistory() {
  const filters = state.reportFilters;
  const query = new URLSearchParams();
  if (filters.source) query.set("source", filters.source);
  if (filters.reportType) query.set("report_type", filters.reportType);
  if (filters.projectId) query.set("project_id", filters.projectId);
  if (filters.search) query.set("search", filters.search);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const activeFilter = document.activeElement?.dataset?.filter || null;
  try {
    state.reportHistory = await api(`/reports/history${query.toString() ? `?${query}` : ""}`);
  } catch (error) {
    showToast(error.message || "Unable to load report history.");
  }
  render();
  if (activeFilter) {
    const next = content.querySelector(`[data-filter="${activeFilter}"]`);
    if (next) {
      next.focus();
      if (typeof next.setSelectionRange === "function" && next.value) next.setSelectionRange(next.value.length, next.value.length);
    }
  }
}

function projectOptions(selected = "") {
  return state.projects.map((project) => `<option value="${project.id}" ${String(project.id) === String(selected) ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("");
}

function contractOptions(selected = "") {
  return state.contracts.map((contract) => `<option value="${contract.id}" ${String(contract.id) === String(selected) ? "selected" : ""}>${escapeHtml(contract.client_name)} · ${escapeHtml(contract.project_name)}</option>`).join("");
}

function clientOptions(selected = "") {
  if (!state.clients?.length) return `<option value="">No clients available</option>`;
  return `<option value="">Select client</option>${state.clients.map((c) => `<option value="${c.id}" ${String(c.id) === String(selected) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}`;
}

// Contract modal: picking a registered client fills the client name field;
// leaving it on the first option keeps manual name entry.
function linkedClientOptions(selected = "") {
  const manual = `<option value="">Type client name manually</option>`;
  if (!state.clients?.length) return manual;
  return `${manual}${state.clients.map((c) => `<option value="${c.id}" ${String(c.id) === String(selected) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}`;
}

// Photos are loaded per property on demand (kept in state.propertyPhotos).
function renderPhotoStrip(property) {
  const photos = (state.propertyPhotos && state.propertyPhotos[property.id]) || null;
  if (photos === null) return `<span class="muted">Loading photos…</span>`;
  if (!photos.length) return `<span class="muted">No photos yet.</span>`;
  return photos.map((photo, index) => `<span class="photo-chip"><img data-src="${photo.file_url}" alt="${escapeHtml(photo.original_filename || "Photo")}" loading="lazy">${index === 0 ? `<span class="photo-cover-tag">Cover</span>` : ""}<button type="button" class="photo-remove" data-action="remove-photo" data-property="${property.id}" data-image="${photo.id}" title="Remove photo">×</button></span>`).join("");
}

// File endpoints require the Bearer token, which <img src> cannot send —
// fetch each pending image as a blob and swap it in.
async function hydrateImages(root = document) {
  const images = Array.from(root.querySelectorAll("img[data-src]"));
  await Promise.all(images.map(async (img) => {
    const src = img.getAttribute("data-src");
    img.removeAttribute("data-src");
    try {
      const token = getToken();
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(src, { headers });
      if (!response.ok) throw new Error(`image load failed (${response.status})`);
      img.src = URL.createObjectURL(await response.blob());
    } catch (_) {
      // Pictures are optional: a missing image never breaks the view.
      if (img.closest(".photo-chip")) img.closest(".photo-chip").remove();
      else img.remove();
    }
  }));
}

async function loadPropertyPhotos(propertyId) {
  try {
    const photos = await api(`/properties/${propertyId}/images`);
    if (!state.propertyPhotos) state.propertyPhotos = {};
    state.propertyPhotos[propertyId] = photos;
    const strip = document.getElementById("photo-strip");
    if (strip && String(strip.dataset.propertyId) === String(propertyId)) {
      strip.innerHTML = renderPhotoStrip(state.properties.find((p) => String(p.id) === String(propertyId)) || { id: propertyId });
      hydrateImages(strip);
    }
  } catch (_) {
    // Photos are optional — a failed load never blocks the property form.
    if (!state.propertyPhotos) state.propertyPhotos = {};
    state.propertyPhotos[propertyId] = [];
  }
}

function propertyOptions(selected = "") {
  if (!state.properties?.length) return `<option value="">No properties available</option>`;
  return `<option value="">Select property</option>${state.properties.map((p) => `<option value="${p.id}" ${String(p.id) === String(selected) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}`;
}

function projectSelect(selected = "") {
  return `<select class="filter-input" data-filter="project" aria-label="Filter by project"><option value="">All projects</option>${projectOptions(selected)}</select>`;
}

function card(label, value, foot, icon = "◆", tone = "") {
  return `<article class="card glass card-accent"><div><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${value}</div><div class="card-foot">${foot}</div></div><div class="card-icon ${tone}">${icon}</div></article>`;
}

function renderLoading() {
  content.innerHTML = `<div class="loading glass"><div><div class="spinner"></div>Loading workspace…</div></div>`;
}

function renderDashboard() {
  const summary = state.summary || {};
  const pending = summary.debts_pending || { count: 0, total: 0 };
  const overdue = summary.debts_overdue || { count: 0, total: 0 };
  const newContracts = summary.contracts_new || { count: 0, total: 0 };
  const terminal = summary.contracts_terminal || { count: 0, total: 0 };
  const upcomingDebts = state.debts.filter((debt) => debtState(debt) === "upcoming").slice(0, 5);
  const upcoming = state.reminders.length ? state.reminders : upcomingDebts;
  const recent = [...state.contracts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
  const income30 = summary.income_30d || { count: 0, total: 0 };
  const maxProjectValue = Math.max(1, ...state.projectReports.map((project) => numberValue(project.contract_value)));
  const chart = state.projectReports.length ? state.projectReports.map((project) => {
    const height = Math.max(5, Math.round(numberValue(project.contract_value) / maxProjectValue * 110));
    return `<div class="chart-col" title="${escapeHtml(project.name)}: ${money(project.contract_value)}"><div class="chart-value">${money(project.contract_value)}</div><div class="chart-bar" style="height:${height}px"></div><div class="chart-label">${escapeHtml(project.name)}</div></div>`;
  }).join("") : `<div class="empty">Add a project to begin building your portfolio.</div>`;
  content.innerHTML = `
    <div class="grid grid-5">
      ${card("Active projects", summary.active_projects || 0, "Developments in progress", "▥", "teal")}
      ${card("New contracts", newContracts.count || 0, `${money(newContracts.total || 0)} active value`, "↗", "teal")}
      ${card("Open debts", pending.count || 0, `${money(pending.total || 0)} awaiting payment`, "◷", "amber")}
      ${card("Overdue", overdue.count || 0, `${money(overdue.total || 0)} needs follow-up`, "!", "red")}
      ${card("Collected · 30 days", money(income30.total || 0), `${income30.count || 0} payment${income30.count === 1 ? "" : "s"} recorded`, "$", "teal")}
    </div>
    <div class="section grid grid-2">
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Portfolio value</h2><div class="section-note">Contract value by project</div></div><span class="badge badge-active">Live records</span></div><div class="chart">${chart}</div></article>
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Contract mix</h2><div class="section-note">New versus terminal records</div></div></div><div class="grid grid-2"><div><div class="card-label">New contracts</div><div class="card-value positive">${newContracts.count || 0}</div><div class="card-foot">${money(newContracts.total || 0)}</div></div><div><div class="card-label">Terminal contracts</div><div class="card-value warning-text">${terminal.count || 0}</div><div class="card-foot">${money(terminal.total || 0)}</div></div></div><div class="trend">Use Reports for a detailed breakdown.</div></article>
    </div>
    <div class="section grid grid-2">
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Recent contracts</h2><div class="section-note">Latest additions to the register</div></div><button class="btn btn-soft btn-small" data-action="new-contract">+ New contract</button></div>${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Project</th><th>Type</th><th>Value</th></tr></thead><tbody>${recent.map((contract) => `<tr><td><span class="cell-main">${escapeHtml(contract.client_name)}</span></td><td><span class="cell-sub">${escapeHtml(contract.project_name)}</span></td><td>${badge(contract.contract_type)}</td><td class="amount">${money(contract.value)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No contracts yet</strong>Create the first contract to start the register.</div>`}</article>
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Payment reminders</h2><div class="section-note">Due now or within the next 7 days</div></div><button class="btn btn-soft btn-small" data-action="view-debts">View debts</button></div><div class="reminder-list">${upcoming.length ? upcoming.map((debt) => `<div class="reminder"><div class="reminder-icon">◷</div><div class="reminder-copy"><div class="reminder-title">${escapeHtml(debt.client_name)}</div><div class="reminder-meta">${escapeHtml(debt.project_name)} · ${money(debt.amount)} · due ${formatDate(debt.due_date)}</div></div>${debt.remind_at ? `<button class="btn btn-small" data-action="dismiss-reminder" data-id="${debt.id}" title="Mark reminder as handled">Dismiss</button>` : ""}<button class="btn btn-small" data-action="edit-debt" data-id="${debt.debt_id || debt.id}">Review</button></div>`).join("") : `<div class="empty"><strong>All clear</strong>No payments are due in the next 7 days.</div>`}</div></article>
    </div>`;
}

function renderProjects() {
  const rows = state.projects.map((project) => {
    const contracts = state.contracts.filter((contract) => contract.project_id === project.id);
    const value = contracts.reduce((sum, contract) => sum + numberValue(contract.value), 0);
    return `<tr><td><span class="cell-main">${escapeHtml(project.name)}</span><span class="cell-sub">${formatDate(project.created_at)}</span></td><td>${badge(project.status)}</td><td class="amount">${contracts.length}</td><td class="amount">${money(value)}</td><td><div class="row-actions"><button class="btn btn-small" data-action="edit-project" data-id="${project.id}">Edit</button><button class="btn btn-danger btn-small icon-btn" data-action="delete-project" data-id="${project.id}" title="Delete project">×</button></div></td></tr>`;
  }).join("");
  content.innerHTML = `<div class="section-head"><div><h2 class="section-title">Project register</h2><div class="section-note">${state.projects.length} projects in the workspace</div></div></div>${state.projects.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Contracts</th><th>Value</th><th class="align-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card glass empty"><strong>No projects yet</strong>Create a project before adding contracts.</div>`}`;
}

function renderContracts() {
  const filters = state.filters;
  const rows = state.contracts.filter((contract) => (!filters.project || String(contract.project_id) === filters.project) && (!filters.type || contract.contract_type === filters.type) && (!filters.status || contract.status === filters.status)).map((contract) => `<tr><td><span class="cell-main">${escapeHtml(contract.client_name)}</span><span class="cell-sub">${escapeHtml(contract.project_name)}</span></td><td>${badge(contract.contract_type)}</td><td>${badge(contract.status)}</td><td>${formatDate(contract.start_date)}</td><td>${formatDate(contract.end_date)}</td><td class="amount">${money(contract.value)}</td><td><div class="row-actions"><button class="btn btn-small" data-action="edit-contract" data-id="${contract.id}">Edit</button><button class="btn btn-soft btn-small" data-action="generate-schedule" data-id="${contract.id}" title="Generate a payment schedule">Schedule</button><button class="btn btn-danger btn-small icon-btn" data-action="delete-contract" data-id="${contract.id}" title="Delete contract">×</button></div></td></tr>`).join("");
  content.innerHTML = `<div class="filters"><label class="muted">Filters</label>${projectSelect(filters.project)}<select class="filter-input" data-filter="type" aria-label="Filter by contract type"><option value="">All types</option><option value="new" ${filters.type === "new" ? "selected" : ""}>New</option><option value="terminal" ${filters.type === "terminal" ? "selected" : ""}>Terminal</option></select><select class="filter-input" data-filter="status" aria-label="Filter by contract status"><option value="">All statuses</option><option value="active" ${filters.status === "active" ? "selected" : ""}>Active</option><option value="closed" ${filters.status === "closed" ? "selected" : ""}>Closed</option><option value="cancelled" ${filters.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></div><div class="section-head"><div><h2 class="section-title">Contract register</h2><div class="section-note">${rows ? `${rows.match(/<tr>/g)?.length || 0} visible records` : "No matching records"}</div></div><button class="btn btn-primary" data-action="new-contract">+ New contract</button></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Client / project</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Value</th><th class="align-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card glass empty"><strong>No contracts found</strong>Try another filter or create a new contract.</div>`}`;
}

function renderDebts() {
  const filters = state.filters;
  const rows = state.debts.filter((debt) => (!filters.project || String(debt.project_id) === filters.project) && (!filters.debtStatus || debtState(debt) === filters.debtStatus)).map((debt) => {
    const debtStateValue = debtState(debt);
    return `<tr><td><span class="cell-main">${escapeHtml(debt.client_name)}</span><span class="cell-sub">${escapeHtml(debt.project_name)}</span></td><td>${badge(debt.contract_type)}</td><td>${badge(debtStateValue)}</td><td>${formatDate(debt.due_date)}</td><td class="amount ${debtStateValue === "overdue" ? "danger-text" : ""}">${money(debt.amount)}</td><td>${debt.status === "paid" ? "—" : escapeHtml(debt.notes || "")}</td><td><div class="row-actions">${debt.status !== "paid" ? `<button class="btn btn-soft btn-small" data-action="pay-debt" data-id="${debt.id}">Mark paid</button><button class="btn btn-small" data-action="record-payment" data-id="${debt.id}" title="Record a payment with an optional receipt">Record payment</button>` : ""}<button class="btn btn-small" data-action="edit-debt" data-id="${debt.id}">Edit</button><button class="btn btn-danger btn-small icon-btn" data-action="delete-debt" data-id="${debt.id}" title="Delete debt">×</button></div></td></tr>`;
  }).join("");
  content.innerHTML = `<div class="filters"><label class="muted">Filters</label>${projectSelect(filters.project)}<select class="filter-input" data-filter="debtStatus" aria-label="Filter by debt state"><option value="">All debt states</option><option value="pending" ${filters.debtStatus === "pending" ? "selected" : ""}>Pending</option><option value="upcoming" ${filters.debtStatus === "upcoming" ? "selected" : ""}>Upcoming</option><option value="overdue" ${filters.debtStatus === "overdue" ? "selected" : ""}>Overdue</option><option value="paid" ${filters.debtStatus === "paid" ? "selected" : ""}>Paid</option></select></div><div class="section-head"><div><h2 class="section-title">Debt register</h2><div class="section-note">Client balances linked to contracts</div></div><button class="btn btn-primary" data-action="new-debt">+ New debt</button></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Client / project</th><th>Contract</th><th>State</th><th>Due date</th><th>Amount</th><th>Note</th><th class="align-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card glass empty"><strong>No debts found</strong>Add a debt to a contract or change the filters.</div>`}
    <div class="section">
      <div class="section-head"><div><h2 class="section-title">Recorded payments</h2><div class="section-note">Money actually received, with receipts</div></div><button class="btn btn-soft btn-small" data-action="new-payment">+ Record payment</button></div>
      ${renderPaymentsTable()}
    </div>`;
}

// Payments history under the debts view; receipts open in a new tab.
function renderPaymentsTable() {
  const payments = [...(state.payments || [])].sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
  if (!payments.length) return `<div class="card glass empty"><strong>No payments recorded</strong>Use “Record payment” on a debt to log income with an optional receipt.</div>`;
  const rows = payments.map((payment) => `<tr><td><span class="cell-main">${escapeHtml(payment.client_name)}</span><span class="cell-sub">${escapeHtml(payment.project_name || "")}</span></td><td>${formatDate(payment.paid_at, String(payment.paid_at).length > 10)}</td><td>${badge(payment.method, "neutral")}</td><td class="amount">${money(payment.amount)}</td><td>${escapeHtml(payment.reference || "—")}</td><td><div class="row-actions">${payment.has_receipt ? `<button class="btn btn-small" data-action="open-receipt" data-id="${payment.id}">View receipt</button>` : `<span class="muted">None</span>`}<button class="btn btn-danger btn-small icon-btn" data-action="delete-payment" data-id="${payment.id}" title="Delete payment">×</button></div></td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>Client / project</th><th>Paid at</th><th>Method</th><th>Amount</th><th>Reference</th><th class="align-right">Receipt & actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderReports() {
  const filters = state.reportFilters;
  const types = state.reportTypes || [];
  const history = state.reportHistory || [];
  const typeOptions = types.map((type) => `<option value="${escapeHtml(type.id)}" ${filters.reportType === type.id ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("");
  const sourceOptions = `<option value="">All sources</option><option value="generated" ${filters.source === "generated" ? "selected" : ""}>Generated</option><option value="uploaded" ${filters.source === "uploaded" ? "selected" : ""}>Uploaded</option>`;
  const projectHistoryOptions = projectOptions(filters.projectId);
  const rows = history.map((report) => {
    const date = formatDateTime(report.created_at, true);
    return `<tr>
      <td><span class="cell-main">${escapeHtml(report.title)}</span><span class="cell-sub">${escapeHtml(reportTypeLabel(report.report_type))}</span></td>
      <td>${sourceBadge(report.source)}</td>
      <td>${reportKindBadge(report.file_format)}</td>
      <td><span class="cell-sub">${escapeHtml(report.project_name || "—")}</span></td>
      <td>${escapeHtml(date)}</td>
      <td class="align-right">
        <div class="row-actions">
          <button class="btn btn-small" data-action="download-report" data-id="${report.id}" data-format="${escapeHtml(report.file_format || "xlsx")}" data-source="${escapeHtml(report.source)}">Download</button>
          ${report.source === "generated" ? `<button class="btn btn-small" data-action="reexport-report" data-id="${report.id}" title="Re-generate this report">Re-export</button>` : ""}
          <button class="btn btn-danger btn-small icon-btn" data-action="delete-report" data-id="${report.id}" title="Delete report">×</button>
        </div>
      </td>
    </tr>`;
  }).join("");
  content.innerHTML = `
    <div class="filters">
      <span class="muted">History</span>
      <select class="filter-input" data-filter="source" aria-label="Filter by source">${sourceOptions}</select>
      <select class="filter-input" data-filter="reportType" aria-label="Filter by report type"><option value="">All types</option>${typeOptions}</select>
      <select class="filter-input" data-filter="projectId" aria-label="Filter by project">${projectHistoryOptions}</select>
      <input class="filter-input" data-filter="search" type="search" value="${escapeHtml(filters.search)}" placeholder="Search title or filename" aria-label="Search reports" style="min-width:200px">
      <input class="filter-input" data-filter="from" type="date" value="${escapeHtml(filters.from || "")}" aria-label="From date" style="min-width:150px">
      <input class="filter-input" data-filter="to" type="date" value="${escapeHtml(filters.to || "")}" aria-label="To date" style="min-width:150px">
    </div>
    <div class="section-head">
      <div><h2 class="section-title">Report history</h2><div class="section-note">${history.length} report${history.length === 1 ? "" : "s"} in the workspace</div></div>
      <div class="row-actions">
        <button class="btn btn-primary" data-action="open-report-generate">+ Generate report</button>
        <button class="btn" data-action="open-report-upload">+ Upload report</button>
      </div>
    </div>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>Report</th><th>Source</th><th>Format</th><th>Project</th><th>Created</th><th class="align-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card glass empty"><strong>No reports found</strong>Generate or upload a report to build the history.</div>`}`;
}

function renderProperties() {
  const filters = state.filters;
  const rows = (state.properties || []).filter((property) =>
    (!filters.project || String(property.project_id) === filters.project) &&
    (!filters.propertyStatus || property.status === filters.propertyStatus) &&
    (!filters.type || property.property_type === filters.type)
  );
  const list = rows.map((property) => {
    const price = money(property.price);
    const cover = property.cover_image_id
      ? `<div class="property-cover"><img data-src="${API_ROOT}/properties/${property.id}/images/${property.cover_image_id}/file" alt="${escapeHtml(property.name)}" loading="lazy"></div>`
      : "";
    return `<div class="property-card">
      ${cover}
      <div class="property-head">
        <div class="property-name">${escapeHtml(property.name)}</div>
        <div class="property-type">${badge(property.property_type, "neutral")}</div>
      </div>
      <div class="property-meta">
        <div><span class="muted">Status</span>${badge(property.status)}</div>
        <div><span class="muted">Price</span><span class="amount">${price}</span></div>
        ${property.location ? `<div><span class="muted">Location</span>${escapeHtml(property.location)}</div>` : ""}
        ${property.area ? `<div><span class="muted">Area</span>${numberValue(property.area)} units</div>` : ""}
        ${(property.bedrooms || property.bathrooms) ? `<div><span class="muted">Layout</span>${property.bedrooms || 0} bed · ${property.bathrooms || 0} bath</div>` : ""}
        ${property.image_count ? `<div><span class="muted">Photos</span>${property.image_count}</div>` : ""}
      </div>
      ${property.description ? `<p class="property-desc">${escapeHtml(property.description)}</p>` : ""}
      <div class="property-foot">
        <div><span class="muted">Project</span><span class="cell-sub">${escapeHtml(property.project_name || "—")}</span></div>
        <div><span class="muted">Added</span>${formatDate(property.created_at)}</div>
        <div class="row-actions">
          <button class="btn btn-small" data-action="edit-property" data-id="${property.id}">Edit</button>
          <button class="btn btn-danger btn-small icon-btn" data-action="delete-property" data-id="${property.id}" title="Delete property">×</button>
        </div>
      </div>
    </div>`;
  }).join("");
  content.innerHTML = `
    <div class="filters">
      <span class="muted">Filters</span>
      <select class="filter-input" data-filter="project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${(state.projects || []).map((p) => `<option value="${p.id}" ${filters.project === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <select class="filter-input" data-filter="propertyStatus" aria-label="Filter by property status">
        <option value="">All statuses</option>
        <option value="available" ${filters.propertyStatus === "available" ? "selected" : ""}>Available</option>
        <option value="reserved" ${filters.propertyStatus === "reserved" ? "selected" : ""}>Reserved</option>
        <option value="sold" ${filters.propertyStatus === "sold" ? "selected" : ""}>Sold</option>
        <option value="leased" ${filters.propertyStatus === "leased" ? "selected" : ""}>Leased</option>
      </select>
      <select class="filter-input" data-filter="type" aria-label="Filter by property type">
        <option value="">All types</option>
        <option value="land" ${filters.type === "land" ? "selected" : ""}>Land</option>
        <option value="house" ${filters.type === "house" ? "selected" : ""}>House</option>
        <option value="apartment" ${filters.type === "apartment" ? "selected" : ""}>Apartment</option>
        <option value="villa" ${filters.type === "villa" ? "selected" : ""}>Villa</option>
        <option value="commercial" ${filters.type === "commercial" ? "selected" : ""}>Commercial</option>
        <option value="penthouse" ${filters.type === "penthouse" ? "selected" : ""}>Penthouse</option>
      </select>
    </div>
    <div class="section-head">
      <div><h2 class="section-title">Property register</h2><div class="section-note">${rows.length} propert${rows.length === 1 ? "y" : "ies"} in the workspace</div></div>
      <button class="btn btn-primary" data-action="new-property">+ New property</button>
    </div>
    ${rows.length
      ? `<div class="property-grid">${list}</div>`
      : `<div class="card glass empty"><strong>No properties found</strong>Add the first property to start building your portfolio.</div>`}`;
}

function renderClients() {
  const filters = state.filters;
  const rows = (state.clients || []).filter((client) =>
    (!filters.project || String(client.project_id) === filters.project) &&
    (!filters.clientStatus || client.status === filters.clientStatus)
  );
  const list = rows.map((client) => {
    return `<div class="client-card">
      <div class="client-head">
        <div class="client-name">${escapeHtml(client.name)}</div>
        <div class="client-type">${badge(client.client_type, "neutral")}</div>
      </div>
      <div class="client-meta">
        ${client.email ? `<div><span class="muted">Email</span>${escapeHtml(client.email)}</div>` : ""}
        ${client.phone ? `<div><span class="muted">Phone</span>${escapeHtml(client.phone)}</div>` : ""}
        <div><span class="muted">Status</span>${badge(client.status)}</div>
        ${client.notes ? `<p class="client-notes">${escapeHtml(client.notes)}</p>` : ""}
      </div>
      <div class="client-foot">
        <div><span class="muted">Project</span><span class="cell-sub">${escapeHtml(client.project_name || "—")}</span></div>
        <div><span class="muted">Added</span>${formatDate(client.created_at)}</div>
        <div class="row-actions">
          <button class="btn btn-small" data-action="edit-client" data-id="${client.id}">Edit</button>
          <button class="btn btn-danger btn-small icon-btn" data-action="delete-client" data-id="${client.id}" title="Delete client">×</button>
        </div>
      </div>
    </div>`;
  }).join("");
  content.innerHTML = `
    <div class="filters">
      <span class="muted">Filters</span>
      <select class="filter-input" data-filter="project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${(state.projects || []).map((p) => `<option value="${p.id}" ${filters.project === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <select class="filter-input" data-filter="clientStatus" aria-label="Filter by client status">
        <option value="">All statuses</option>
        <option value="lead" ${filters.clientStatus === "lead" ? "selected" : ""}>Lead</option>
        <option value="active" ${filters.clientStatus === "active" ? "selected" : ""}>Active</option>
        <option value="inactive" ${filters.clientStatus === "inactive" ? "selected" : ""}>Inactive</option>
      </select>
    </div>
    <div class="section-head">
      <div><h2 class="section-title">Client register</h2><div class="section-note">${rows.length} contact${rows.length === 1 ? "" : "s"} in the workspace</div></div>
      <button class="btn btn-primary" data-action="new-client">+ New client</button>
    </div>
    ${rows.length
      ? `<div class="client-grid">${list}</div>`
      : `<div class="card glass empty"><strong>No clients found</strong>Add the first contact to begin tracking people.</div>`}`;
}

function renderAppointments() {
  const filters = state.filters;
  const rows = (state.appointments || []).filter((apt) =>
    (!filters.project || String(apt.project_id) === filters.project) &&
    (!filters.appointmentStatus || apt.status === filters.appointmentStatus) &&
    (!filters.type || apt.appointment_type === filters.type)
  ).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const list = rows.map((apt) => {
    return `<div class="apt-row">
      <div class="apt-time">
        <div class="apt-datetime">${formatDateTime(apt.starts_at, true)}</div>
        ${apt.ends_at ? `<div class="apt-datetime muted">${formatDateTime(apt.ends_at, true)}</div>` : ""}
      </div>
      <div class="apt-body">
        <div class="apt-title">${escapeHtml(apt.title)}</div>
        <div class="apt-meta">
          <div><span class="muted">Client</span><span class="cell-main">${escapeHtml(apt.client_name || "—")}</span></div>
          ${apt.property_name ? `<div><span class="muted">Property</span><span class="cell-sub">${escapeHtml(apt.property_name)}</span></div>` : ""}
          <div><span class="muted">Project</span><span class="cell-sub">${escapeHtml(apt.project_name || "—")}</span></div>
          <div><span class="muted">Type</span>${badge(apt.appointment_type, "neutral")}</div>
          <div><span class="muted">Status</span>${badge(apt.status)}</div>
          ${apt.notes ? `<p class="apt-notes">${escapeHtml(apt.notes)}</p>` : ""}
        </div>
      </div>
      <div class="apt-actions">
        <button class="btn btn-small" data-action="edit-appointment" data-id="${apt.id}">Edit</button>
        <button class="btn btn-danger btn-small icon-btn" data-action="delete-appointment" data-id="${apt.id}" title="Delete appointment">×</button>
      </div>
    </div>`;
  }).join("");
  content.innerHTML = `
    <div class="filters">
      <span class="muted">Filters</span>
      <select class="filter-input" data-filter="project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${(state.projects || []).map((p) => `<option value="${p.id}" ${filters.project === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <select class="filter-input" data-filter="appointmentStatus" aria-label="Filter by appointment status">
        <option value="">All statuses</option>
        <option value="scheduled" ${filters.appointmentStatus === "scheduled" ? "selected" : ""}>Scheduled</option>
        <option value="completed" ${filters.appointmentStatus === "completed" ? "selected" : ""}>Completed</option>
        <option value="cancelled" ${filters.appointmentStatus === "cancelled" ? "selected" : ""}>Cancelled</option>
      </select>
      <select class="filter-input" data-filter="type" aria-label="Filter by appointment type">
        <option value="">All types</option>
        <option value="viewing" ${filters.type === "viewing" ? "selected" : ""}>Viewing</option>
        <option value="call" ${filters.type === "call" ? "selected" : ""}>Call</option>
        <option value="meeting" ${filters.type === "meeting" ? "selected" : ""}>Meeting</option>
        <option value="inspection" ${filters.type === "inspection" ? "selected" : ""}>Inspection</option>
      </select>
    </div>
    <div class="section-head">
      <div><h2 class="section-title">Appointment schedule</h2><div class="section-note">${rows.length} appointment${rows.length === 1 ? "" : "s"} in the workspace</div></div>
      <button class="btn btn-primary" data-action="new-appointment">+ New appointment</button>
    </div>
    ${rows.length
      ? `<div class="apt-list">${list}</div>`
      : `<div class="card glass empty"><strong>No appointments found</strong>Schedule a viewing, call, meeting, or inspection.</div>`}`;
}

function renderDocuments() {
  const filters = state.filters;
  const rows = (state.documents || []).filter((doc) =>
    (!filters.project || String(doc.project_id) === filters.project) &&
    (!filters.documentStatus || doc.status === filters.documentStatus) &&
    (!filters.type || doc.category === filters.type) &&
    (!filters.documentSearch || String(doc.title || "").toLowerCase().includes(filters.documentSearch.toLowerCase()))
  ).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const list = rows.map((doc) => {
    const hasFile = doc.has_file;
    const openPath = hasFile ? `/documents/${doc.id}/file?download=1` : null;
    return `<div class="doc-row">
      <div class="doc-icon">${documentIcon(doc.category)}</div>
      <div class="doc-body">
        <div class="doc-title">${escapeHtml(doc.title)}</div>
        <div class="doc-meta">
          <div><span class="muted">Category</span>${badge(doc.category, "neutral")}</div>
          <div><span class="muted">Status</span>${badge(doc.status)}</div>
          <div><span class="muted">Uploaded</span>${formatDate(doc.uploaded_at || doc.created_at)}</div>
          ${hasFile ? `<div><span class="muted">File</span><span class="cell-sub">${escapeHtml(doc.original_filename || doc.file_name || "")} · ${formatBytes(doc.file_size)}</span></div>` : ""}
          ${doc.client_name ? `<div><span class="muted">Client</span><span class="cell-sub">${escapeHtml(doc.client_name)}</span></div>` : ""}
          ${doc.contract_client ? `<div><span class="muted">Contract</span><span class="cell-sub">${escapeHtml(doc.contract_client)}</span></div>` : ""}
          <div><span class="muted">Project</span><span class="cell-sub">${escapeHtml(doc.project_name || "—")}</span></div>
          ${doc.file_reference ? `<div><span class="muted">Reference</span>${escapeHtml(doc.file_reference)}</div>` : ""}
          ${doc.notes ? `<p class="doc-notes">${escapeHtml(doc.notes)}</p>` : ""}
        </div>
      </div>
      <div class="doc-actions">
        ${hasFile ? `<button class="btn btn-small" data-action="open-document" data-id="${doc.id}">Open</button>` : ""}
        <button class="btn btn-small" data-action="edit-document" data-id="${doc.id}">Edit</button>
        <button class="btn btn-danger btn-small icon-btn" data-action="delete-document" data-id="${doc.id}" title="Delete document">×</button>
      </div>
    </div>`;
  }).join("");
  content.innerHTML = `
    <div class="filters">
      <span class="muted">Filters</span>
      <select class="filter-input" data-filter="project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${(state.projects || []).map((p) => `<option value="${p.id}" ${filters.project === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <select class="filter-input" data-filter="type" aria-label="Filter by document category">
        <option value="">All categories</option>
        <option value="agreement" ${filters.type === "agreement" ? "selected" : ""}>Agreement</option>
        <option value="title" ${filters.type === "title" ? "selected" : ""}>Title</option>
        <option value="invoice" ${filters.type === "invoice" ? "selected" : ""}>Invoice</option>
        <option value="receipt" ${filters.type === "receipt" ? "selected" : ""}>Receipt</option>
        <option value="report" ${filters.type === "report" ? "selected" : ""}>Report</option>
        <option value="permit" ${filters.type === "permit" ? "selected" : ""}>Permit</option>
        <option value="other" ${filters.type === "other" ? "selected" : ""}>Other</option>
      </select>
      <select class="filter-input" data-filter="documentStatus" aria-label="Filter by document status">
        <option value="">All statuses</option>
        <option value="pending" ${filters.documentStatus === "pending" ? "selected" : ""}>Pending</option>
        <option value="approved" ${filters.documentStatus === "approved" ? "selected" : ""}>Approved</option>
        <option value="archived" ${filters.documentStatus === "archived" ? "selected" : ""}>Archived</option>
      </select>
      <input class="filter-input" data-filter="documentSearch" type="search" value="${escapeHtml(filters.documentSearch || "")}" placeholder="Search title" aria-label="Search documents" style="min-width:200px">
    </div>
    <div class="section-head">
      <div><h2 class="section-title">Document register</h2><div class="section-note">${rows.length} document${rows.length === 1 ? "" : "s"} in the workspace</div></div>
      <button class="btn btn-primary" data-action="new-document">+ New document</button>
    </div>
    ${rows.length
      ? `<div class="document-list">${list}</div>`
      : `<div class="card glass empty"><strong>No documents found</strong>Upload or register the first document.</div>`}`;
}

function render() {
  const [title, sub] = viewMeta[state.view];
  pageTitle.textContent = title;
  pageSub.textContent = sub;
  topbarActions.innerHTML =
    state.view === "projects" ? `<button class="btn btn-primary" data-action="new-project">+ New project</button>` :
    state.view === "properties" ? `<button class="btn btn-primary" data-action="new-property">+ New property</button>` :
    state.view === "clients" ? `<button class="btn btn-primary" data-action="new-client">+ New client</button>` :
    state.view === "contracts" ? `<button class="btn btn-primary" data-action="new-contract">+ New contract</button>` :
    state.view === "debts" ? `<button class="btn btn-primary" data-action="new-debt">+ New debt</button><button class="btn" data-action="new-payment">+ Record payment</button>` :
    state.view === "appointments" ? `<button class="btn btn-primary" data-action="new-appointment">+ New appointment</button>` :
    state.view === "documents" ? `<button class="btn btn-primary" data-action="new-document">+ New document</button>` :
    state.view === "reports" ? `<button class="btn btn-primary" data-action="open-report-generate">+ Generate report</button><button class="btn" data-action="open-report-upload">+ Upload report</button>` :
    "";
  if (state.loading) { renderLoading(); return; }
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "projects") renderProjects();
  if (state.view === "properties") renderProperties();
  if (state.view === "clients") renderClients();
  if (state.view === "contracts") renderContracts();
  if (state.view === "debts") renderDebts();
  if (state.view === "appointments") renderAppointments();
  if (state.view === "documents") renderDocuments();
  if (state.view === "reports") renderReports();
  // Authenticated image blobs for property covers, etc.
  hydrateImages(content);
}

function openModal(type, record = null) {
  modal.dataset.type = type;
  let title = "Create record";
  let subtitle = "Add a new entry to the workspace";
  let body = "";
  let submitLabel = "Save record";
  if (type === "project") {
    title = record ? "Edit project" : "New project";
    subtitle = record ? "Update this development." : "Create a development portfolio.";
    body = `<div class="form-grid"><div class="field full"><label for="field-name">Project name</label><input id="field-name" name="name" required maxlength="120" value="${escapeHtml(record?.name || "")}" placeholder="e.g. Riverside Heights"></div><div class="field"><label for="field-status">Status</label><select id="field-status" name="status"><option value="active" ${record?.status !== "archived" ? "selected" : ""}>Active</option><option value="archived" ${record?.status === "archived" ? "selected" : ""}>Archived</option></select></div></div>`;
  }
  if (type === "contract") {
    title = record ? "Edit contract" : "New contract";
    subtitle = record ? "Update contract details." : "Link a client agreement to a project.";
    body = `<div class="form-grid"><div class="field full"><label for="field-project">Project</label><select id="field-project" name="project_id" required><option value="">Select project</option>${projectOptions(record?.project_id)}</select></div><div class="field full"><label for="field-linked-client">Client from register (optional)</label><select id="field-linked-client" name="client_id">${linkedClientOptions(record?.client_id)}</select></div><div class="field"><label for="field-client">Client name</label><input id="field-client" name="client_name" required maxlength="120" value="${escapeHtml(record?.client_name || "")}" placeholder="Client full name"></div><div class="field"><label for="field-type">Contract type</label><select id="field-type" name="contract_type" required><option value="new" ${record?.contract_type === "new" ? "selected" : ""}>New</option><option value="terminal" ${record?.contract_type === "terminal" ? "selected" : ""}>Terminal</option></select></div><div class="field"><label for="field-contract-status">Status</label><select id="field-contract-status" name="status"><option value="active" ${record?.status !== "closed" && record?.status !== "cancelled" ? "selected" : ""}>Active</option><option value="closed" ${record?.status === "closed" ? "selected" : ""}>Closed</option><option value="cancelled" ${record?.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></div><div class="field"><label for="field-value">Contract value</label><input id="field-value" name="value" type="number" min="0" step="0.01" required value="${escapeHtml(record?.value ?? "")}" placeholder="0"></div><div class="field"><label for="field-start">Start date</label><input id="field-start" name="start_date" type="date" value="${escapeHtml(record?.start_date || "")}"></div><div class="field"><label for="field-end">End date</label><input id="field-end" name="end_date" type="date" value="${escapeHtml(record?.end_date || "")}"></div><div class="field full"><label for="field-notes">Notes</label><textarea id="field-notes" name="notes" placeholder="Property, unit, payment terms, or reference">${escapeHtml(record?.notes || "")}</textarea></div></div>`;
  }
  if (type === "schedule") {
    title = "Generate payment schedule";
    subtitle = record ? `Deposit + installments for ${escapeHtml(record.client_name)} · ${money(record.value)}` : "Deposit + equal monthly installments.";
    submitLabel = "Generate schedule";
    const hasDebts = (state.debts || []).some((debt) => String(debt.contract_id) === String(record?.id));
    body = `<div class="form-grid">
      <div class="field"><label for="field-deposit">Deposit now</label><input id="field-deposit" name="deposit" type="number" min="0" step="0.01" value="0" placeholder="0"></div>
      <div class="field"><label for="field-installments">Installments</label><input id="field-installments" name="installments" type="number" min="1" max="120" required value="6"></div>
      <div class="field full"><label for="field-first-due">First installment due</label><input id="field-first-due" name="first_due_date" type="date" required value="${today()}"></div>
      ${hasDebts ? `<div class="field full"><label class="checkbox-field"><input type="checkbox" name="replace" value="yes"><span>This contract already has installments — replace them</span></label></div>` : ""}
      <div class="field full"><div class="field-help">Installments split the remaining value (${money(Math.max(0, numberValue(record?.value) - 0))}) equally, due monthly from the first date. The final installment absorbs rounding. Reminders are created automatically.</div></div>
    </div>`;
  }
  if (type === "payment") {
    title = "Record payment";
    subtitle = "Log money received; attaching a receipt is optional.";
    submitLabel = "Record payment";
    const methods = (state.reportPaymentMethods || []).length
      ? state.reportPaymentMethods
      : [{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank transfer" }, { value: "mobile", label: "Mobile money" }, { value: "card", label: "Card" }, { value: "other", label: "Other" }];
    const prefill = record || {};
    body = `<div class="form-grid">
      <div class="field full"><label for="field-payment-contract">Contract</label><select id="field-payment-contract" name="contract_id" required><option value="">Select contract</option>${contractOptions(prefill.contract_id)}</select></div>
      <div class="field"><label for="field-payment-debt">Installment (optional)</label><select id="field-payment-debt" name="debt_id"><option value="">None — general payment</option>${(state.debts || []).filter((debt) => !prefill.contract_id || String(debt.contract_id) === String(prefill.contract_id)).map((debt) => `<option value="${debt.id}" ${String(debt.id) === String(prefill.debt_id || "") ? "selected" : ""}>${escapeHtml(debt.client_name)} · ${money(debt.amount)} · ${formatDate(debt.due_date)}</option>`).join("")}</select></div>
      <div class="field"><label for="field-payment-amount">Amount</label><input id="field-payment-amount" name="amount" type="number" min="0" step="0.01" required value="${escapeHtml(prefill.amount ?? "")}" placeholder="0"></div>
      <div class="field"><label for="field-payment-date">Paid at</label><input id="field-payment-date" name="paid_at" type="date" required value="${today()}"></div>
      <div class="field"><label for="field-payment-method">Method</label><select id="field-payment-method" name="method">${methods.map((m) => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="field-payment-reference">Reference</label><input id="field-payment-reference" name="reference" maxlength="120" placeholder="Receipt no. / transaction ID"></div>
      <div class="field full"><label for="field-payment-receipt">Receipt (optional)</label><input id="field-payment-receipt" name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.bmp"><div class="field-help">PDF or image of the receipt. You can attach it later too.</div></div>
      <div class="field full"><label for="field-payment-notes">Notes</label><textarea id="field-payment-notes" name="notes" maxlength="2000" placeholder="Purpose or follow-up note">${escapeHtml(prefill.notes || "")}</textarea></div>
    </div>`;
  }
  if (type === "debt") {
    title = record ? "Edit debt" : "New debt";
    subtitle = record ? "Update this client balance." : "Record an amount due from a contract.";
    body = `<div class="form-grid"><div class="field full"><label for="field-contract">Contract</label><select id="field-contract" name="contract_id" required><option value="">Select contract</option>${contractOptions(record?.contract_id)}</select></div><div class="field"><label for="field-debt-client">Client name</label><input id="field-debt-client" name="client_name" required maxlength="120" value="${escapeHtml(record?.client_name || "")}" placeholder="Client full name"></div><div class="field"><label for="field-amount">Amount due</label><input id="field-amount" name="amount" type="number" min="0" step="0.01" required value="${escapeHtml(record?.amount ?? "")}" placeholder="0"></div><div class="field"><label for="field-due">Due date</label><input id="field-due" name="due_date" type="date" value="${escapeHtml(record?.due_date || "")}"></div><div class="field"><label for="field-debt-status">Status</label><select id="field-debt-status" name="status"><option value="pending" ${record?.status === "pending" ? "selected" : ""}>Pending</option><option value="overdue" ${record?.status === "overdue" ? "selected" : ""}>Overdue</option><option value="paid" ${record?.status === "paid" ? "selected" : ""}>Paid</option></select></div><div class="field full"><label for="field-debt-notes">Notes</label><textarea id="field-debt-notes" name="notes" placeholder="Installment or follow-up note">${escapeHtml(record?.notes || "")}</textarea></div></div>`;
  }
  if (type === "property") {
    title = record ? "Edit property" : "New property";
    subtitle = record ? "Update this estate listing." : "Register a new estate asset.";
    body = `<div class="form-grid">
      <div class="field full"><label for="field-project">Project</label><select id="field-project" name="project_id"><option value="">Select project</option>${projectOptions(record?.project_id)}</select></div>
      <div class="field full"><label for="field-name">Property name</label><input id="field-name" name="name" required maxlength="120" value="${escapeHtml(record?.name || "")}" placeholder="e.g. Signature Residence · Phase 1"></div>
      <div class="field"><label for="field-property-type">Type</label><select id="field-property-type" name="property_type"><option value="land" ${record?.property_type === "land" ? "selected" : ""}>Land</option><option value="house" ${record?.property_type === "house" ? "selected" : ""}>House</option><option value="apartment" ${record?.property_type === "apartment" ? "selected" : ""}>Apartment</option><option value="villa" ${record?.property_type === "villa" ? "selected" : ""}>Villa</option><option value="commercial" ${record?.property_type === "commercial" ? "selected" : ""}>Commercial</option><option value="penthouse" ${record?.property_type === "penthouse" ? "selected" : ""}>Penthouse</option></select></div>
      <div class="field"><label for="field-property-status">Status</label><select id="field-property-status" name="status"><option value="available" ${record?.status === "available" ? "selected" : ""}>Available</option><option value="reserved" ${record?.status === "reserved" ? "selected" : ""}>Reserved</option><option value="sold" ${record?.status === "sold" ? "selected" : ""}>Sold</option><option value="leased" ${record?.status === "leased" ? "selected" : ""}>Leased</option></select></div>
      <div class="field"><label for="field-price">Price</label><input id="field-price" name="price" type="number" min="0" step="0.01" value="${escapeHtml(record?.price ?? "")}" placeholder="0"></div>
      <div class="field"><label for="field-location">Location</label><input id="field-location" name="location" required maxlength="120" value="${escapeHtml(record?.location || "")}" placeholder="City or area"></div>
      <div class="field"><label for="field-area">Area</label><input id="field-area" name="area" type="number" min="0" step="0.01" value="${escapeHtml(record?.area ?? "")}" placeholder="0"></div>
      <div class="field"><label for="field-bedrooms">Bedrooms</label><input id="field-bedrooms" name="bedrooms" type="number" min="0" value="${escapeHtml(record?.bedrooms ?? "")}" placeholder="0"></div>
      <div class="field"><label for="field-bathrooms">Bathrooms</label><input id="field-bathrooms" name="bathrooms" type="number" min="0" value="${escapeHtml(record?.bathrooms ?? "")}" placeholder="0"></div>
      <div class="field full"><label for="field-description">Description</label><textarea id="field-description" name="description" maxlength="2000" placeholder="Property summary">${escapeHtml(record?.description || "")}</textarea></div>
      <div class="field"><label class="checkbox-field"><input type="checkbox" name="featured" ${record?.featured ? "checked" : ""}><span>Featured listing</span></label></div>
      ${record ? `<div class="field full"><label>Photos (optional)</label><div class="photo-strip" id="photo-strip" data-property-id="${record.id}">${renderPhotoStrip(record)}</div></div>` : ""}
      <div class="field full"><label for="field-photo">Photo (optional)</label><input id="field-photo" name="photo" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.bmp" data-photo-upload>${record ? "" : `<div class="field-help">Optional. You can add more photos after saving.</div>`}</div>
    </div>`;
  }
  if (type === "client") {
    title = record ? "Edit client" : "New client";
    subtitle = record ? "Update this contact." : "Add a new person or organization.";
    body = `<div class="form-grid">
      <div class="field full"><label for="field-project">Project</label><select id="field-project" name="project_id"><option value="">Select project</option>${projectOptions(record?.project_id)}</select></div>
      <div class="field full"><label for="field-client-name">Full name</label><input id="field-client-name" name="name" required maxlength="120" value="${escapeHtml(record?.name || "")}" placeholder="Client full name"></div>
      <div class="field"><label for="field-email">Email</label><input id="field-email" name="email" type="email" maxlength="120" value="${escapeHtml(record?.email || "")}" placeholder="contact@example.com"></div>
      <div class="field"><label for="field-phone">Phone</label><input id="field-phone" name="phone" maxlength="120" value="${escapeHtml(record?.phone || "")}" placeholder="+255 700 000 000"></div>
      <div class="field"><label for="field-client-type">Type</label><select id="field-client-type" name="client_type"><option value="buyer" ${record?.client_type === "buyer" ? "selected" : ""}>Buyer</option><option value="seller" ${record?.client_type === "seller" ? "selected" : ""}>Seller</option><option value="landlord" ${record?.client_type === "landlord" ? "selected" : ""}>Landlord</option><option value="tenant" ${record?.client_type === "tenant" ? "selected" : ""}>Tenant</option></select></div>
      <div class="field"><label for="field-client-status">Status</label><select id="field-client-status" name="status"><option value="lead" ${record?.status === "lead" ? "selected" : ""}>Lead</option><option value="active" ${record?.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${record?.status === "inactive" ? "selected" : ""}>Inactive</option></select></div>
      <div class="field full"><label for="field-notes">Notes</label><textarea id="field-notes" name="notes" maxlength="2000" placeholder="Relationship or preference note">${escapeHtml(record?.notes || "")}</textarea></div>
    </div>`;
  }
  if (type === "appointment") {
    title = record ? "Edit appointment" : "New appointment";
    subtitle = record ? "Update this schedule entry." : "Book a new viewing, call, meeting, or inspection.";
    body = `<div class="form-grid">
      <div class="field full"><label for="field-client">Client</label><select id="field-client" name="client_id" required><option value="">Select client</option>${clientOptions(record?.client_id)}</select></div>
      <div class="field full"><label for="field-title">Title</label><input id="field-title" name="title" required maxlength="120" value="${escapeHtml(record?.title || "")}" placeholder="e.g. Premium residence tour"></div>
      <div class="field"><label for="field-property">Property</label><select id="field-property" name="property_id"><option value="">None</option>${propertyOptions(record?.property_id)}</select></div>
      <div class="field"><label for="field-project">Project</label><select id="field-project" name="project_id"><option value="">None</option>${projectOptions(record?.project_id)}</select></div>
      <div class="field"><label for="field-type">Type</label><select id="field-type" name="appointment_type"><option value="viewing" ${record?.appointment_type === "viewing" ? "selected" : ""}>Viewing</option><option value="call" ${record?.appointment_type === "call" ? "selected" : ""}>Call</option><option value="meeting" ${record?.appointment_type === "meeting" ? "selected" : ""}>Meeting</option><option value="inspection" ${record?.appointment_type === "inspection" ? "selected" : ""}>Inspection</option></select></div>
      <div class="field"><label for="field-status">Status</label><select id="field-status" name="status"><option value="scheduled" ${record?.status === "scheduled" ? "selected" : ""}>Scheduled</option><option value="completed" ${record?.status === "completed" ? "selected" : ""}>Completed</option><option value="cancelled" ${record?.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></div>
      <div class="field"><label for="field-start">Start</label><input id="field-start" name="starts_at" type="datetime-local" value="${escapeHtml(record?.starts_at ? record.starts_at.replace(" ", "T") : "")}"></div>
      <div class="field"><label for="field-end">End</label><input id="field-end" name="ends_at" type="datetime-local" value="${escapeHtml(record?.ends_at ? record.ends_at.replace(" ", "T") : "")}"></div>
      <div class="field full"><label for="field-notes">Notes</label><textarea id="field-notes" name="notes" maxlength="2000" placeholder="Agenda or preparation note">${escapeHtml(record?.notes || "")}</textarea></div>
    </div>`;
  }
  if (type === "document") {
    title = record ? "Edit document" : "New document";
    subtitle = record ? "Update this document record." : "Upload a file and register the document.";
    const hasFile = record?.has_file;
    body = `<div class="form-grid">
      <div class="field full"><label for="field-project">Project</label><select id="field-project" name="project_id"><option value="">Select project</option>${projectOptions(record?.project_id)}</select></div>
      <div class="field"><label for="field-contract">Contract</label><select id="field-contract" name="contract_id"><option value="">Select contract</option>${contractOptions(record?.contract_id)}</select></div>
      <div class="field"><label for="field-client">Client</label><select id="field-client" name="client_id"><option value="">Select client</option>${clientOptions(record?.client_id)}</select></div>
      <div class="field full"><label for="field-title">Title</label><input id="field-title" name="title" required maxlength="120" value="${escapeHtml(record?.title || "")}" placeholder="Document title"></div>
      <div class="field"><label for="field-category">Category</label><select id="field-category" name="category"><option value="agreement" ${record?.category === "agreement" ? "selected" : ""}>Agreement</option><option value="title" ${record?.category === "title" ? "selected" : ""}>Title</option><option value="invoice" ${record?.category === "invoice" ? "selected" : ""}>Invoice</option><option value="receipt" ${record?.category === "receipt" ? "selected" : ""}>Receipt</option><option value="report" ${record?.category === "report" ? "selected" : ""}>Report</option><option value="permit" ${record?.category === "permit" ? "selected" : ""}>Permit</option><option value="other" ${record?.category === "other" ? "selected" : ""}>Other</option></select></div>
      <div class="field"><label for="field-status">Status</label><select id="field-status" name="status"><option value="pending" ${record?.status === "pending" ? "selected" : ""}>Pending</option><option value="approved" ${record?.status === "approved" ? "selected" : ""}>Approved</option><option value="archived" ${record?.status === "archived" ? "selected" : ""}>Archived</option></select></div>
      <div class="field full"><label for="field-file">File</label><input id="field-file" name="file" type="file" ${record ? "disabled" : ""}>${hasFile ? `<div class="field-help">Current file: <strong>${escapeHtml(record.original_filename || record.file_name || "attached")}</strong></div>` : record ? `<div class="field-help">Files can only be attached while creating a document.</div>` : ""}</div>
      <div class="field full"><label for="field-file-reference">File reference</label><input id="field-file-reference" name="file_reference" maxlength="120" value="${escapeHtml(record?.file_reference || "")}" placeholder="documents/onboarding-checklist.pdf"></div>
      <div class="field full"><label for="field-notes">Notes</label><textarea id="field-notes" name="notes" maxlength="2000" placeholder="Purpose or follow-up note">${escapeHtml(record?.notes || "")}</textarea></div>
    </div>`;
  }
  if (type === "report-generate") {
    title = "Generate report";
    subtitle = "Pick a report type and the filters it declares.";
    submitLabel = "Generate report";
    body = renderReportGenerateForm(record && record.report_type ? record : null);
  }
  if (type === "report-upload") {
    title = "Upload report";
    subtitle = "Attach an existing report file and record it in the history.";
    submitLabel = "Upload report";
    body = renderReportUploadForm();
  }
  if (type === "report-preview") {
    title = "Preview report";
    subtitle = "Generated on the fly from the current filters.";
    body = renderReportPreview();
  }
  const isPreview = type === "report-preview";
  const actions = `<div class="form-actions">
    <button type="button" class="btn" data-action="close-modal">${isPreview ? "Close" : "Cancel"}</button>
    ${type === "report-generate" ? `<button type="button" class="btn btn-soft" data-action="preview-report">Preview</button>` : ""}
    ${isPreview ? "" : `<button type="submit" class="btn btn-primary">${submitLabel}</button>`}
  </div>`;
  const head = `<div class="modal-head"><div><h2 class="modal-title">${title}</h2><p class="modal-sub">${subtitle}</p></div><button class="close-btn" data-action="close-modal" aria-label="Close">×</button></div>`;
  modal.innerHTML = isPreview
    ? `${head}${body}${actions}`
    : `${head}<form id="record-form" data-id="${escapeHtml(record?.id || "")}">${body}${actions}</form>`;
  modalBackdrop.hidden = false;
  hydrateImages(modal);
  const contractSelect = document.getElementById("field-contract");
  const clientInput = document.getElementById("field-debt-client");
  if (contractSelect && clientInput) {
    const syncClient = () => { const contract = state.contracts.find((item) => String(item.id) === contractSelect.value); if (contract && !record) clientInput.value = contract.client_name; };
    contractSelect.addEventListener("change", syncClient);
    syncClient();
  }
  // Contract modal: selecting a registered client fills the name field.
  const linkedClientSelect = document.getElementById("field-linked-client");
  const contractClientInput = document.getElementById("field-client");
  if (linkedClientSelect && contractClientInput) {
    linkedClientSelect.addEventListener("change", () => {
      const client = (state.clients || []).find((item) => String(item.id) === linkedClientSelect.value);
      if (client) contractClientInput.value = client.name;
    });
  }
  // Payment modal: changing the contract refilters installments and default client.
  const paymentContractSelect = document.getElementById("field-payment-contract");
  const paymentDebtSelect = document.getElementById("field-payment-debt");
  if (paymentContractSelect && paymentDebtSelect) {
    paymentContractSelect.addEventListener("change", () => {
      const contractId = paymentContractSelect.value;
      const contract = state.contracts.find((item) => String(item.id) === contractId);
      const options = (state.debts || []).filter((debt) => !contractId || String(debt.contract_id) === contractId)
        .map((debt) => `<option value="${debt.id}">${escapeHtml(debt.client_name)} · ${money(debt.amount)} · ${formatDate(debt.due_date)}</option>`).join("");
      paymentDebtSelect.innerHTML = `<option value="">None — general payment</option>${options}`;
      const amountInput = document.getElementById("field-payment-amount");
      if (contract && amountInput && !amountInput.value) amountInput.placeholder = String(contract.value ?? "0");
    });
  }
  // Property modal: load the optional gallery after render.
  if (type === "property" && record?.id) loadPropertyPhotos(record.id);
  const reportTypeSelect = document.getElementById("field-report-type");
  if (reportTypeSelect && document.getElementById("report-filter-fields")) {
    // The filter set follows the selected report type.
    reportTypeSelect.addEventListener("change", () => {
      const container = document.getElementById("report-filter-fields");
      if (container) container.outerHTML = reportFilterFieldsHtml(reportTypeSelect.value);
    });
  }
  setTimeout(() => modal.querySelector("input, select, button")?.focus(), 0);
  return;
}

function closeModal() {
  modalBackdrop.hidden = true;
  modal.innerHTML = "";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const type = modal.dataset.type;
  const id = form.dataset.id;
  const button = form.querySelector('button[type="submit"]');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    if (type === "project") {
      if (id) await api(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/projects", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Project updated." : "Project created.");
    } else if (type === "contract") {
      data.project_id = Number(data.project_id);
      data.value = numberValue(data.value);
      // Empty string (not null) so the API can unlink an existing client.
      data.client_id = data.client_id ? Number(data.client_id) : "";
      if (id) await api(`/contracts/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/contracts", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Contract updated." : "Contract created.");
    } else if (type === "schedule") {
      const payload = {
        deposit: numberValue(data.deposit, 0),
        installments: Number(data.installments),
        first_due_date: data.first_due_date,
        replace: data.replace === "yes",
      };
      const result = await api(`/contracts/${id}/schedule`, { method: "POST", body: JSON.stringify(payload) });
      showToast(`Schedule created: ${result.created} installment${result.created === 1 ? "" : "s"}.`);
    } else if (type === "payment") {
      data.contract_id = Number(data.contract_id);
      data.debt_id = data.debt_id ? Number(data.debt_id) : null;
      data.amount = numberValue(data.amount);
      const receiptFile = form.querySelector('input[type="file"][name="file"]')?.files?.[0] || null;
      delete data.file;
      if (receiptFile) {
        // Multipart path stores the receipt alongside the payment record.
        const payload = new FormData();
        payload.append("file", receiptFile);
        ["contract_id", "debt_id", "amount", "paid_at", "method", "reference", "notes"].forEach((key) => {
          if (data[key] !== undefined && data[key] !== null && data[key] !== "") payload.append(key, data[key]);
        });
        await api("/payments/upload", { method: "POST", form: true, body: payload });
        showToast("Payment recorded with receipt.");
      } else {
        await api("/payments", { method: "POST", body: JSON.stringify(data) });
        showToast("Payment recorded.");
      }
    } else if (type === "debt") {
      data.contract_id = Number(data.contract_id);
      data.amount = numberValue(data.amount);
      if (id) await api(`/debts/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/debts", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Debt updated." : "Debt created.");
    } else if (type === "property") {
      data.project_id = data.project_id ? Number(data.project_id) : null;
      data.price = numberValue(data.price);
      data.area = numberValue(data.area);
      data.bedrooms = numberValue(data.bedrooms, 0);
      data.bathrooms = numberValue(data.bathrooms, 0);
      data.featured = data.featured ? 1 : 0;
      const photoFile = form.querySelector('input[type="file"][name="photo"]')?.files?.[0] || null;
      delete data.photo;
      const saved = id
        ? await api(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) })
        : await api("/properties", { method: "POST", body: JSON.stringify(data) });
      if (photoFile && saved?.id) {
        // Photos are optional: a failed upload reports but never blocks the save.
        const payload = new FormData();
        payload.append("file", photoFile);
        try {
          await api(`/properties/${saved.id}/images`, { method: "POST", form: true, body: payload });
          if (state.propertyPhotos) delete state.propertyPhotos[saved.id];
          showToast(id ? "Property and photo updated." : "Property and photo created.");
        } catch (photoError) {
          showToast(photoError.message || "Photo could not be uploaded.");
        }
      } else {
        showToast(id ? "Property updated." : "Property created.");
      }
    } else if (type === "client") {
      data.project_id = data.project_id ? Number(data.project_id) : null;
      if (id) await api(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/clients", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Client updated." : "Client created.");
    } else if (type === "appointment") {
      data.client_id = Number(data.client_id);
      data.property_id = data.property_id ? Number(data.property_id) : null;
      data.project_id = data.project_id ? Number(data.project_id) : null;
      if (id) await api(`/appointments/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/appointments", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Appointment updated." : "Appointment created.");
    } else if (type === "document") {
      const file = form.querySelector('input[type="file"][name="file"]')?.files?.[0] || null;
      data.project_id = data.project_id ? Number(data.project_id) : null;
      data.contract_id = data.contract_id ? Number(data.contract_id) : null;
      data.client_id = data.client_id ? Number(data.client_id) : null;
      if (file && !id) {
        // Real upload path: multipart to /documents/upload, which stores the file.
        const payload = new FormData();
        payload.append("file", file);
        ["title", "category", "status", "project_id", "contract_id", "client_id", "file_reference", "notes"].forEach((key) => {
          if (data[key] !== undefined && data[key] !== null && data[key] !== "") payload.append(key, data[key]);
        });
        await api("/documents/upload", { method: "POST", form: true, body: payload });
        showToast("Document uploaded.");
      } else if (id) {
        await api(`/documents/${id}`, { method: "PUT", body: JSON.stringify(data) });
        showToast("Document updated.");
      } else {
        await api("/documents", { method: "POST", body: JSON.stringify(data) });
        showToast("Document created.");
      }
    } else if (type === "report-generate") {
      const created = await api("/reports/generate", { method: "POST", body: JSON.stringify(reportRequestPayload(data)) });
      showToast(`Report generated: ${created.title}.`);
    } else if (type === "report-upload") {
      const file = form.querySelector('input[type="file"][name="file"]')?.files?.[0] || null;
      if (!file) throw new Error("Choose a report file to upload.");
      const payload = new FormData();
      payload.append("file", file);
      ["report_type", "title", "description", "project_id"].forEach((key) => {
        if (data[key] !== undefined && data[key] !== null && data[key] !== "") payload.append(key, data[key]);
      });
      await api("/reports/upload", { method: "POST", form: true, body: payload });
      showToast("Report uploaded.");
    }
    closeModal();
    await refresh();
  } catch (error) {
    showToast(error.message || "Unable to save record.");
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function deleteRecord(type, id) {
  const labels = { project: "project", contract: "contract", debt: "debt", property: "property", client: "client", appointment: "appointment", document: "document", report: "report", payment: "payment" };
  const endpoints = { project: "projects", contract: "contracts", debt: "debts", property: "properties", client: "clients", appointment: "appointments", document: "documents", report: "reports", payment: "payments" };
  const label = labels[type] || type;
  const endpoint = endpoints[type] || type;
  if (!window.confirm(`Delete this ${label}? This action cannot be undone.`)) return;
  try {
    await api(`/${endpoint}/${id}`, { method: "DELETE" });
    showToast(`${label.charAt(0).toUpperCase()}${label.slice(1)} deleted.`);
    await refresh();
  } catch (error) { showToast(error.message || "Unable to delete record."); }
}

async function markPaid(id) {
  try {
    await api(`/debts/${id}/pay`, { method: "POST", body: "{}" });
    showToast("Debt marked as paid.");
    await refresh();
  } catch (error) { showToast(error.message || "Unable to update debt."); }
}

async function dismissReminder(id) {
  try {
    await api(`/reminders/${id}/acknowledge`, { method: "POST", body: "{}" });
    showToast("Reminder dismissed.");
    await refresh();
  } catch (error) { showToast(error.message || "Unable to dismiss reminder."); }
}

async function removePropertyPhoto(propertyId, imageId) {
  try {
    await api(`/properties/${propertyId}/images/${imageId}`, { method: "DELETE" });
    if (state.propertyPhotos) delete state.propertyPhotos[propertyId];
    showToast("Photo removed.");
    const strip = document.getElementById("photo-strip");
    if (strip) loadPropertyPhotos(propertyId);
    await refresh();
  } catch (error) { showToast(error.message || "Unable to remove photo."); }
}

// One-click consistent backup of the SQLite database, then downloads it.
async function createBackup() {
  try {
    const backup = await api("/backups", { method: "POST", body: "{}" });
    showToast(`Backup created: ${backup.name}`);
    await downloadFile(`/backups/${encodeURIComponent(backup.name)}/download`, backup.name);
  } catch (error) { showToast(error.message || "Backup failed."); }
}

async function previewReport() {
  const form = document.getElementById("record-form");
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  try {
    state.reportPreview = await api("/reports/preview", { method: "POST", body: JSON.stringify(reportRequestPayload(data)) });
    openModal("report-preview");
  } catch (error) {
    showToast(error.message || "Unable to preview report.");
  }
}

async function downloadReportById(id) {
  const report = (state.reportHistory || []).find((entry) => String(entry.id) === String(id));
  if (!report) return;
  const path = report.source === "uploaded"
    ? `/reports/${report.id}/file?download=1`
    : `/reports/${report.id}/export?format=${encodeURIComponent(report.file_format || "xlsx")}`;
  const filename = `${report.title || "report"}.${report.file_format || "xlsx"}`;
  try {
    await downloadFile(path, filename);
  } catch (error) {
    showToast(error.message || "Unable to download report.");
  }
}

async function openDocumentFile(id) {
  try {
    await openFileInTab(`/documents/${id}/file`);
  } catch (error) {
    showToast(error.message || "Unable to open document.");
  }
}

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => {
  state.view = item.dataset.view;
  state.filters = { project: "", type: "", status: "", debtStatus: "", propertyStatus: "", clientStatus: "", appointmentStatus: "", documentStatus: "", documentSearch: "", sort: "" };
  document.querySelectorAll(".nav-item").forEach((navItem) => navItem.classList.toggle("active", navItem === item));
  render();
}));

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === "new-project") openModal("project");
  if (action === "edit-project") openModal("project", state.projects.find((item) => String(item.id) === id));
  if (action === "delete-project") deleteRecord("project", id);
  if (action === "new-property") openModal("property");
  if (action === "edit-property") openModal("property", state.properties.find((item) => String(item.id) === id));
  if (action === "delete-property") deleteRecord("property", id);
  if (action === "new-contract") openModal("contract");
  if (action === "edit-contract") openModal("contract", state.contracts.find((item) => String(item.id) === id));
  if (action === "delete-contract") deleteRecord("contract", id);
  if (action === "new-debt") openModal("debt");
  if (action === "edit-debt") openModal("debt", state.debts.find((item) => String(item.id) === id));
  if (action === "delete-debt") deleteRecord("debt", id);
  if (action === "pay-debt") markPaid(id);
  if (action === "generate-schedule") openModal("schedule", state.contracts.find((item) => String(item.id) === id));
  if (action === "new-payment") openModal("payment");
  if (action === "record-payment") {
    const debt = state.debts.find((item) => String(item.id) === id);
    if (debt) openModal("payment", { contract_id: debt.contract_id, debt_id: debt.id, amount: debt.amount });
  }
  if (action === "delete-payment") deleteRecord("payment", id);
  if (action === "open-receipt") openFileInTab(`/payments/${id}/receipt`).catch((error) => showToast(error.message));
  if (action === "dismiss-reminder") dismissReminder(id);
  if (action === "remove-photo") removePropertyPhoto(target.dataset.property, target.dataset.image);
  if (action === "backup-now") createBackup();
  if (action === "new-client") openModal("client");
  if (action === "edit-client") openModal("client", state.clients.find((item) => String(item.id) === id));
  if (action === "delete-client") deleteRecord("client", id);
  if (action === "new-appointment") openModal("appointment");
  if (action === "edit-appointment") openModal("appointment", state.appointments.find((item) => String(item.id) === id));
  if (action === "delete-appointment") deleteRecord("appointment", id);
  if (action === "new-document") openModal("document");
  if (action === "edit-document") openModal("document", state.documents.find((item) => String(item.id) === id));
  if (action === "delete-document") deleteRecord("document", id);
  if (action === "open-document") openDocumentFile(id);
  if (action === "open-report-generate") openModal("report-generate");
  if (action === "open-report-upload") openModal("report-upload");
  if (action === "preview-report") previewReport();
  if (action === "download-report") downloadReportById(id);
  if (action === "reexport-report") openModal("report-generate", state.reportHistory.find((item) => String(item.id) === id));
  if (action === "delete-report") deleteRecord("report", id);
  if (action === "view-debts") {
    state.view = "debts";
    document.querySelectorAll(".nav-item").forEach((navItem) => navItem.classList.toggle("active", navItem.dataset.view === "debts"));
    render();
  }
  if (action === "close-modal") closeModal();
});

content.addEventListener("change", (event) => {
  const filter = event.target.dataset.filter;
  if (!filter) return;
  if (Object.prototype.hasOwnProperty.call(state.reportFilters, filter)) {
    state.reportFilters[filter] = event.target.value;
    loadReportHistory();
    return;
  }
  state.filters[filter] = event.target.value;
  render();
});

// Report history search reloads as you type (debounced), keeping the caret in place.
content.addEventListener("input", (event) => {
  if (event.target.dataset.filter !== "search") return;
  state.reportFilters.search = event.target.value;
  clearTimeout(state.reportSearchTimer);
  state.reportSearchTimer = setTimeout(loadReportHistory, 350);
});

modal.addEventListener("submit", handleFormSubmit);
modalBackdrop.addEventListener("click", (event) => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modalBackdrop.hidden) closeModal(); });

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(authForm));
  authSubmit.disabled = true;
  try {
    const path = authMode === "setup" ? "/auth/setup" : "/auth/login";
    const user = await api(path, { method: "POST", body: JSON.stringify(body) });
    if (!user.token) throw new Error("No session token returned");
    setToken(user.token);
    enterWorkspace(user);
  } catch (error) {
    showAuthMessage(error.message || "Unable to sign in.");
  } finally {
    authSubmit.disabled = false;
  }
});

authToggle.addEventListener("click", () => setAuthMode(authMode === "setup" ? "login" : "setup"));

document.querySelector('[data-action="logout"]').addEventListener("click", async () => {
  try {
    if (getToken()) await api("/auth/logout", { method: "POST", body: "{}" });
  } catch (_) { /* sign out locally even if the request fails */ }
  endSession();
  setAuthMode("login");
});

async function boot() {
  const token = getToken();
  try {
    const { configured } = await api("/auth/state");
    setAuthMode(configured ? "login" : "setup");
  } catch (_) {
    setAuthMode("login");
  }
  if (!token) return;
  try {
    const user = await api("/auth/me");
    enterWorkspace(user);
  } catch (error) {
    if (!error.sessionExpired) hideAuthMessage();
  }
}

boot();
