const API_ROOT = "/api/v1";

const state = {
  view: "dashboard",
  projects: [],
  contracts: [],
  debts: [],
  reminders: [],
  summary: null,
  projectReports: [],
  filters: { project: "", type: "", status: "", debtStatus: "" },
  loading: true,
  toastTimer: null,
};

const content = document.getElementById("content");
const modalBackdrop = document.getElementById("modal-backdrop");
const modal = document.getElementById("modal");
const pageTitle = document.getElementById("page-title");
const pageSub = document.getElementById("page-sub");
const topbarActions = document.getElementById("topbar-actions");

const viewMeta = {
  dashboard: ["Dashboard", "Overview of contracts, debts, and reminders"],
  projects: ["Projects", "Organize contracts and client records by development"],
  contracts: ["Contracts", "Track new and terminal contracts across every project"],
  debts: ["Debts", "Monitor client balances, due dates, and payment progress"],
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

function badge(value) {
  const normalized = String(value || "").toLowerCase();
  return `<span class="badge badge-${escapeHtml(normalized)}">${escapeHtml(value)}</span>`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function refresh() {
  state.loading = true;
  render();
  try {
    const [projects, contracts, debts, reminders, summary, projectReports] = await Promise.all([
      api("/projects"),
      api("/contracts"),
      api("/debts"),
      api("/reminders"),
      api("/reports/summary"),
      api("/reports/by-project"),
    ]);
    state.projects = projects;
    state.contracts = contracts;
    state.debts = debts;
    state.reminders = reminders;
    state.summary = summary;
    state.projectReports = projectReports;
  } catch (error) {
    showToast(`Workspace could not be loaded: ${error.message}`);
  } finally {
    state.loading = false;
    render();
  }
}

function projectOptions(selected = "") {
  return state.projects.map((project) => `<option value="${project.id}" ${String(project.id) === String(selected) ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("");
}

function contractOptions(selected = "") {
  return state.contracts.map((contract) => `<option value="${contract.id}" ${String(contract.id) === String(selected) ? "selected" : ""}>${escapeHtml(contract.client_name)} · ${escapeHtml(contract.project_name)}</option>`).join("");
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
  const maxProjectValue = Math.max(1, ...state.projectReports.map((project) => numberValue(project.contract_value)));
  const chart = state.projectReports.length ? state.projectReports.map((project) => {
    const height = Math.max(5, Math.round(numberValue(project.contract_value) / maxProjectValue * 110));
    return `<div class="chart-col" title="${escapeHtml(project.name)}: ${money(project.contract_value)}"><div class="chart-value">${money(project.contract_value)}</div><div class="chart-bar" style="height:${height}px"></div><div class="chart-label">${escapeHtml(project.name)}</div></div>`;
  }).join("") : `<div class="empty">Add a project to begin building your portfolio.</div>`;
  content.innerHTML = `
    <div class="grid grid-4">
      ${card("Active projects", summary.active_projects || 0, "Developments in progress", "▥", "teal")}
      ${card("New contracts", newContracts.count || 0, `${money(newContracts.total || 0)} active value`, "↗", "teal")}
      ${card("Open debts", pending.count || 0, `${money(pending.total || 0)} awaiting payment`, "◷", "amber")}
      ${card("Overdue", overdue.count || 0, `${money(overdue.total || 0)} needs follow-up`, "!", "red")}
    </div>
    <div class="section grid grid-2">
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Portfolio value</h2><div class="section-note">Contract value by project</div></div><span class="badge badge-active">Live records</span></div><div class="chart">${chart}</div></article>
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Contract mix</h2><div class="section-note">New versus terminal records</div></div></div><div class="grid grid-2"><div><div class="card-label">New contracts</div><div class="card-value positive">${newContracts.count || 0}</div><div class="card-foot">${money(newContracts.total || 0)}</div></div><div><div class="card-label">Terminal contracts</div><div class="card-value warning-text">${terminal.count || 0}</div><div class="card-foot">${money(terminal.total || 0)}</div></div></div><div class="trend">Use Reports for a detailed breakdown.</div></article>
    </div>
    <div class="section grid grid-2">
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Recent contracts</h2><div class="section-note">Latest additions to the register</div></div><button class="btn btn-soft btn-small" data-action="new-contract">+ New contract</button></div>${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Project</th><th>Type</th><th>Value</th></tr></thead><tbody>${recent.map((contract) => `<tr><td><span class="cell-main">${escapeHtml(contract.client_name)}</span></td><td><span class="cell-sub">${escapeHtml(contract.project_name)}</span></td><td>${badge(contract.contract_type)}</td><td class="amount">${money(contract.value)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No contracts yet</strong>Create the first contract to start the register.</div>`}</article>
      <article class="card glass"><div class="section-head"><div><h2 class="section-title">Payment reminders</h2><div class="section-note">Due now or within the next 7 days</div></div><button class="btn btn-soft btn-small" data-action="view-debts">View debts</button></div><div class="reminder-list">${upcoming.length ? upcoming.map((debt) => `<div class="reminder"><div class="reminder-icon">◷</div><div class="reminder-copy"><div class="reminder-title">${escapeHtml(debt.client_name)}</div><div class="reminder-meta">${escapeHtml(debt.project_name)} · ${money(debt.amount)} · due ${formatDate(debt.due_date)}</div></div><button class="btn btn-small" data-action="edit-debt" data-id="${debt.debt_id || debt.id}">Review</button></div>`).join("") : `<div class="empty"><strong>All clear</strong>No payments are due in the next 7 days.</div>`}</div></article>
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
  const rows = state.contracts.filter((contract) => (!filters.project || String(contract.project_id) === filters.project) && (!filters.type || contract.contract_type === filters.type) && (!filters.status || contract.status === filters.status)).map((contract) => `<tr><td><span class="cell-main">${escapeHtml(contract.client_name)}</span><span class="cell-sub">${escapeHtml(contract.project_name)}</span></td><td>${badge(contract.contract_type)}</td><td>${badge(contract.status)}</td><td>${formatDate(contract.start_date)}</td><td>${formatDate(contract.end_date)}</td><td class="amount">${money(contract.value)}</td><td><div class="row-actions"><button class="btn btn-small" data-action="edit-contract" data-id="${contract.id}">Edit</button><button class="btn btn-danger btn-small icon-btn" data-action="delete-contract" data-id="${contract.id}" title="Delete contract">×</button></div></td></tr>`).join("");
  content.innerHTML = `<div class="filters"><label class="muted">Filters</label>${projectSelect(filters.project)}<select class="filter-input" data-filter="type" aria-label="Filter by contract type"><option value="">All types</option><option value="new" ${filters.type === "new" ? "selected" : ""}>New</option><option value="terminal" ${filters.type === "terminal" ? "selected" : ""}>Terminal</option></select><select class="filter-input" data-filter="status" aria-label="Filter by contract status"><option value="">All statuses</option><option value="active" ${filters.status === "active" ? "selected" : ""}>Active</option><option value="closed" ${filters.status === "closed" ? "selected" : ""}>Closed</option><option value="cancelled" ${filters.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></div><div class="section-head"><div><h2 class="section-title">Contract register</h2><div class="section-note">${rows ? `${rows.match(/<tr>/g)?.length || 0} visible records` : "No matching records"}</div></div><button class="btn btn-primary" data-action="new-contract">+ New contract</button></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Client / project</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Value</th><th class="align-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card glass empty"><strong>No contracts found</strong>Try another filter or create a new contract.</div>`}`;
}

function renderDebts() {
  const filters = state.filters;
  const rows = state.debts.filter((debt) => (!filters.project || String(debt.project_id) === filters.project) && (!filters.debtStatus || debtState(debt) === filters.debtStatus)).map((debt) => {
    const debtStateValue = debtState(debt);
    return `<tr><td><span class="cell-main">${escapeHtml(debt.client_name)}</span><span class="cell-sub">${escapeHtml(debt.project_name)}</span></td><td>${badge(debt.contract_type)}</td><td>${badge(debtStateValue)}</td><td>${formatDate(debt.due_date)}</td><td class="amount ${debtStateValue === "overdue" ? "danger-text" : ""}">${money(debt.amount)}</td><td>${debt.status === "paid" ? "—" : escapeHtml(debt.notes || "")}</td><td><div class="row-actions">${debt.status !== "paid" ? `<button class="btn btn-soft btn-small" data-action="pay-debt" data-id="${debt.id}">Mark paid</button>` : ""}<button class="btn btn-small" data-action="edit-debt" data-id="${debt.id}">Edit</button><button class="btn btn-danger btn-small icon-btn" data-action="delete-debt" data-id="${debt.id}" title="Delete debt">×</button></div></td></tr>`;
  }).join("");
  content.innerHTML = `<div class="filters"><label class="muted">Filters</label>${projectSelect(filters.project)}<select class="filter-input" data-filter="debtStatus" aria-label="Filter by debt state"><option value="">All debt states</option><option value="pending" ${filters.debtStatus === "pending" ? "selected" : ""}>Pending</option><option value="upcoming" ${filters.debtStatus === "upcoming" ? "selected" : ""}>Upcoming</option><option value="overdue" ${filters.debtStatus === "overdue" ? "selected" : ""}>Overdue</option><option value="paid" ${filters.debtStatus === "paid" ? "selected" : ""}>Paid</option></select></div><div class="section-head"><div><h2 class="section-title">Debt register</h2><div class="section-note">Client balances linked to contracts</div></div><button class="btn btn-primary" data-action="new-debt">+ New debt</button></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Client / project</th><th>Contract</th><th>State</th><th>Due date</th><th>Amount</th><th>Note</th><th class="align-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card glass empty"><strong>No debts found</strong>Add a debt to a contract or change the filters.</div>`}`;
}

function renderReports() {
  const summary = state.summary || {};
  const projectRows = state.projectReports.map((project) => `<tr><td><span class="cell-main">${escapeHtml(project.name)}</span></td><td class="amount">${project.new_contracts || 0}</td><td class="amount">${project.terminal_contracts || 0}</td><td class="amount">${money(project.contract_value)}</td><td class="amount ${numberValue(project.open_debts) ? "warning-text" : ""}">${project.open_debts || 0}</td></tr>`).join("");
  const newRows = state.contracts.filter((contract) => contract.contract_type === "new").slice(0, 8).map((contract) => `<tr><td><span class="cell-main">${escapeHtml(contract.client_name)}</span><span class="cell-sub">${escapeHtml(contract.project_name)}</span></td><td>${formatDate(contract.start_date)}</td><td>${badge(contract.status)}</td><td class="amount">${money(contract.value)}</td></tr>`).join("");
  const terminalRows = state.contracts.filter((contract) => contract.contract_type === "terminal").slice(0, 8).map((contract) => `<tr><td><span class="cell-main">${escapeHtml(contract.client_name)}</span><span class="cell-sub">${escapeHtml(contract.project_name)}</span></td><td>${formatDate(contract.end_date)}</td><td>${badge(contract.status)}</td><td class="amount">${money(contract.value)}</td></tr>`).join("");
  content.innerHTML = `<div class="grid grid-4">${card("Total contract value", money((summary.contracts_new?.total || 0) + (summary.contracts_terminal?.total || 0)), "Across all projects", "▥", "teal")}${card("New contracts", summary.contracts_new?.count || 0, `${money(summary.contracts_new?.total || 0)} registered`, "↗", "teal")}${card("Terminal contracts", summary.contracts_terminal?.count || 0, `${money(summary.contracts_terminal?.total || 0)} recorded`, "↘", "amber")}${card("Collected debts", money(summary.debts_paid?.total || 0), `${summary.debts_paid?.count || 0} payments marked paid`, "✓", "teal")}</div><div class="section"><div class="section-head"><div><h2 class="section-title">Portfolio breakdown</h2><div class="section-note">Contracts and open balances by project</div></div></div><div class="table-wrap"><table><thead><tr><th>Project</th><th>New</th><th>Terminal</th><th>Contract value</th><th>Open debts</th></tr></thead><tbody>${projectRows || `<tr><td colspan="5" class="empty">No project data available.</td></tr>`}</tbody></table></div></div><div class="section grid grid-2"><article class="card glass"><div class="section-head"><div><h2 class="section-title">New contracts</h2><div class="section-note">Latest new business</div></div></div><div class="table-wrap"><table><thead><tr><th>Client / project</th><th>Start date</th><th>Status</th><th>Value</th></tr></thead><tbody>${newRows || `<tr><td colspan="4" class="empty">No new contracts yet.</td></tr>`}</tbody></table></div></article><article class="card glass"><div class="section-head"><div><h2 class="section-title">Terminal contracts</h2><div class="section-note">Closed and completed records</div></div></div><div class="table-wrap"><table><thead><tr><th>Client / project</th><th>End date</th><th>Status</th><th>Value</th></tr></thead><tbody>${terminalRows || `<tr><td colspan="4" class="empty">No terminal contracts yet.</td></tr>`}</tbody></table></div></article></div>`;
}

function render() {
  const [title, sub] = viewMeta[state.view];
  pageTitle.textContent = title;
  pageSub.textContent = sub;
  topbarActions.innerHTML = state.view === "projects" ? `<button class="btn btn-primary" data-action="new-project">+ New project</button>` : state.view === "contracts" ? `<button class="btn btn-primary" data-action="new-contract">+ New contract</button>` : state.view === "debts" ? `<button class="btn btn-primary" data-action="new-debt">+ New debt</button>` : "";
  if (state.loading) { renderLoading(); return; }
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "projects") renderProjects();
  if (state.view === "contracts") renderContracts();
  if (state.view === "debts") renderDebts();
  if (state.view === "reports") renderReports();
}

function openModal(type, record = null) {
  modal.dataset.type = type;
  let title = "Create record";
  let subtitle = "Add a new entry to the workspace";
  let body = "";
  if (type === "project") {
    title = record ? "Edit project" : "New project";
    subtitle = record ? "Update this development." : "Create a development portfolio.";
    body = `<div class="form-grid"><div class="field full"><label for="field-name">Project name</label><input id="field-name" name="name" required maxlength="120" value="${escapeHtml(record?.name || "")}" placeholder="e.g. Riverside Heights"></div><div class="field"><label for="field-status">Status</label><select id="field-status" name="status"><option value="active" ${record?.status !== "archived" ? "selected" : ""}>Active</option><option value="archived" ${record?.status === "archived" ? "selected" : ""}>Archived</option></select></div></div>`;
  }
  if (type === "contract") {
    title = record ? "Edit contract" : "New contract";
    subtitle = record ? "Update contract details." : "Link a client agreement to a project.";
    body = `<div class="form-grid"><div class="field full"><label for="field-project">Project</label><select id="field-project" name="project_id" required><option value="">Select project</option>${projectOptions(record?.project_id)}</select></div><div class="field"><label for="field-client">Client name</label><input id="field-client" name="client_name" required maxlength="120" value="${escapeHtml(record?.client_name || "")}" placeholder="Client full name"></div><div class="field"><label for="field-type">Contract type</label><select id="field-type" name="contract_type" required><option value="new" ${record?.contract_type === "new" ? "selected" : ""}>New</option><option value="terminal" ${record?.contract_type === "terminal" ? "selected" : ""}>Terminal</option></select></div><div class="field"><label for="field-contract-status">Status</label><select id="field-contract-status" name="status"><option value="active" ${record?.status !== "closed" && record?.status !== "cancelled" ? "selected" : ""}>Active</option><option value="closed" ${record?.status === "closed" ? "selected" : ""}>Closed</option><option value="cancelled" ${record?.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></div><div class="field"><label for="field-value">Contract value</label><input id="field-value" name="value" type="number" min="0" step="0.01" required value="${escapeHtml(record?.value ?? "")}" placeholder="0"></div><div class="field"><label for="field-start">Start date</label><input id="field-start" name="start_date" type="date" value="${escapeHtml(record?.start_date || "")}"></div><div class="field"><label for="field-end">End date</label><input id="field-end" name="end_date" type="date" value="${escapeHtml(record?.end_date || "")}"></div><div class="field full"><label for="field-notes">Notes</label><textarea id="field-notes" name="notes" placeholder="Property, unit, payment terms, or reference">${escapeHtml(record?.notes || "")}</textarea></div></div>`;
  }
  if (type === "debt") {
    title = record ? "Edit debt" : "New debt";
    subtitle = record ? "Update this client balance." : "Record an amount due from a contract.";
    body = `<div class="form-grid"><div class="field full"><label for="field-contract">Contract</label><select id="field-contract" name="contract_id" required><option value="">Select contract</option>${contractOptions(record?.contract_id)}</select></div><div class="field"><label for="field-debt-client">Client name</label><input id="field-debt-client" name="client_name" required maxlength="120" value="${escapeHtml(record?.client_name || "")}" placeholder="Client full name"></div><div class="field"><label for="field-amount">Amount due</label><input id="field-amount" name="amount" type="number" min="0" step="0.01" required value="${escapeHtml(record?.amount ?? "")}" placeholder="0"></div><div class="field"><label for="field-due">Due date</label><input id="field-due" name="due_date" type="date" value="${escapeHtml(record?.due_date || "")}"></div><div class="field"><label for="field-debt-status">Status</label><select id="field-debt-status" name="status"><option value="pending" ${record?.status === "pending" ? "selected" : ""}>Pending</option><option value="overdue" ${record?.status === "overdue" ? "selected" : ""}>Overdue</option><option value="paid" ${record?.status === "paid" ? "selected" : ""}>Paid</option></select></div><div class="field full"><label for="field-debt-notes">Notes</label><textarea id="field-debt-notes" name="notes" placeholder="Installment or follow-up note">${escapeHtml(record?.notes || "")}</textarea></div></div>`;
  }
  modal.innerHTML = `<div class="modal-head"><div><h2 class="modal-title">${title}</h2><p class="modal-sub">${subtitle}</p></div><button class="close-btn" data-action="close-modal" aria-label="Close">×</button></div><form id="record-form" data-id="${escapeHtml(record?.id || "")}">${body}<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save record</button></div></form>`;
  modalBackdrop.hidden = false;
  const contractSelect = document.getElementById("field-contract");
  const clientInput = document.getElementById("field-debt-client");
  if (contractSelect && clientInput) {
    const syncClient = () => { const contract = state.contracts.find((item) => String(item.id) === contractSelect.value); if (contract && !record) clientInput.value = contract.client_name; };
    contractSelect.addEventListener("change", syncClient);
    syncClient();
  }
  setTimeout(() => modal.querySelector("input, select")?.focus(), 0);
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
      if (id) await api(`/contracts/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/contracts", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Contract updated." : "Contract created.");
    } else if (type === "debt") {
      data.contract_id = Number(data.contract_id);
      data.amount = numberValue(data.amount);
      if (id) await api(`/debts/${id}`, { method: "PUT", body: JSON.stringify(data) });
      else await api("/debts", { method: "POST", body: JSON.stringify(data) });
      showToast(id ? "Debt updated." : "Debt created.");
    }
    closeModal();
    await refresh();
  } catch (error) {
    showToast(error.message || "Unable to save record.");
    button.disabled = false;
    button.textContent = "Save record";
  }
}

async function deleteRecord(type, id) {
  const labels = { project: "project", contract: "contract", debt: "debt" };
  if (!window.confirm(`Delete this ${labels[type]}? This action cannot be undone.`)) return;
  try {
    await api(`/${type === "project" ? "projects" : type === "contract" ? "contracts" : "debts"}/${id}`, { method: "DELETE" });
    showToast(`${labels[type].charAt(0).toUpperCase()}${labels[type].slice(1)} deleted.`);
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

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => {
  state.view = item.dataset.view;
  state.filters = { project: "", type: "", status: "", debtStatus: "" };
  document.querySelectorAll(".nav-item").forEach((navItem) => navItem.classList.toggle("active", navItem === item));
  render();
}));

content.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === "new-project") openModal("project");
  if (action === "edit-project") openModal("project", state.projects.find((item) => String(item.id) === id));
  if (action === "delete-project") deleteRecord("project", id);
  if (action === "new-contract") openModal("contract");
  if (action === "edit-contract") openModal("contract", state.contracts.find((item) => String(item.id) === id));
  if (action === "delete-contract") deleteRecord("contract", id);
  if (action === "new-debt") openModal("debt");
  if (action === "edit-debt") openModal("debt", state.debts.find((item) => String(item.id) === id));
  if (action === "delete-debt") deleteRecord("debt", id);
  if (action === "pay-debt") markPaid(id);
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
  state.filters[filter] = event.target.value;
  render();
});

modal.addEventListener("submit", handleFormSubmit);
modalBackdrop.addEventListener("click", (event) => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modalBackdrop.hidden) closeModal(); });

refresh();
