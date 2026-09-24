import db from "../db.js";
import { reportTypeDef, PAYMENT_METHODS } from "../models/reportTypes.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function plusDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const text = (key, label) => ({ key, label, kind: "text" });
const num = (key, label) => ({ key, label, kind: "money" });
const dateCol = (key, label) => ({ key, label, kind: "date" });
const intCol = (key, label) => ({ key, label, kind: "int" });

function whereClause(conditions) {
  return conditions.length ? " WHERE " + conditions.join(" AND ") : "";
}

// Installment display states: Overdue / Due Today / Due Soon / Pending / Paid.
function installmentState(row, today = isoToday()) {
  const amount = money(row.amount);
  const paid = money(row.paid_amount);
  if (row.status === "paid" || amount <= 0 || paid >= amount) return "Paid";
  const due = row.due_date;
  if (row.status === "overdue" || (due && due < today)) return "Overdue";
  if (due && due === today) return "Due Today";
  if (due && due <= plusDays(today, 7)) return "Due Soon";
  return "Pending";
}

function stateMatchesFilter(label, filter) {
  if (!filter) return true;
  if (filter === "paid") return label === "Paid";
  if (filter === "overdue") return label === "Overdue";
  if (filter === "pending") return label === "Pending" || label === "Due Today" || label === "Due Soon";
  return true;
}

// Enriched installments: real payments linked to each debt. Debts already marked
// "paid" in the existing model settle their own amount (no values invented).
function enrichedDebts(conditions = [], params = []) {
  const rows = db.prepare(`
    SELECT d.id, d.contract_id, d.client_name, d.amount, d.due_date, d.status, d.notes,
           c.project_id, c.contract_type, c.status as contract_status, pr.name as project_name,
           COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.debt_id = d.id), 0) as payment_sum
    FROM debts d
    JOIN contracts c ON c.id = d.contract_id
    JOIN projects pr ON pr.id = c.project_id
    ${whereClause(conditions)}
    ORDER BY d.due_date ASC, d.id ASC
  `).all(...params);
  return rows.map((row) => {
    const amount = money(row.amount);
    const rawPaid = money(row.payment_sum);
    const paidAmount = money(row.status === "paid" ? Math.max(rawPaid, amount) : Math.min(amount, rawPaid));
    const outstanding = money(Math.max(0, amount - paidAmount));
    const enriched = { ...row, amount, paid_amount: paidAmount, outstanding };
    enriched.state = installmentState(enriched);
    return enriched;
  });
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

// Contract-level rollups: obligations from installments, paid = actual payments
// against the contract (direct contract payments + payments linked to its debts),
// outstanding = obligations - paid. No legacy double-count for debts already paid.
function contractsEnriched(conditions = [], params = []) {
  const contracts = db.prepare(`
    SELECT c.*, pr.name as project_name
    FROM contracts c JOIN projects pr ON pr.id = c.project_id
    ${whereClause(conditions)}
    ORDER BY c.id ASC
  `).all(...params);
  const debts = enrichedDebts();
  const payments = db.prepare("SELECT contract_id, debt_id, amount FROM payments").all();
  const debtsByContract = new Map();
  for (const debt of debts) {
    if (!debtsByContract.has(debt.contract_id)) debtsByContract.set(debt.contract_id, []);
    debtsByContract.get(debt.contract_id).push(debt);
  }
  const directPaid = new Map();
  const linkedByDebt = new Map();
  for (const payment of payments) {
    if (payment.debt_id == null) {
      directPaid.set(payment.contract_id, money((directPaid.get(payment.contract_id) || 0) + payment.amount));
    } else {
      linkedByDebt.set(payment.debt_id, money((linkedByDebt.get(payment.debt_id) || 0) + payment.amount));
    }
  }
  return contracts.map((contract) => {
    const rows = debtsByContract.get(contract.id) || [];
    let obligations = 0;
    let paidTotal = directPaid.get(contract.id) || 0;
    for (const debt of rows) {
      obligations = money(obligations + debt.amount);
      const linked = linkedByDebt.get(debt.id) || 0;
      paidTotal = money(paidTotal + linked);
    }
    const paid = money(paidTotal);
    return {
      ...contract,
      value: money(contract.value),
      installment_count: rows.length,
      obligations: money(obligations),
      paid_amount: paid,
      outstanding: money(Math.max(0, obligations - paid)),
    };
  });
}

function describeFilters(type, filters) {
  const def = reportTypeDef(type);
  const parts = [];
  if (def.filters.includes("project")) {
    if (filters.project) {
      const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(filters.project);
      parts.push(`Project: ${project ? project.name : `#${filters.project}`}`);
    } else parts.push("Project: All");
  }
  if (def.filters.includes("status")) {
    const label = def.status_values?.find((entry) => entry.value === filters.status)?.label;
    parts.push(filters.status ? `Status: ${label || filters.status}` : "Status: All");
  }
  if (def.filters.includes("date_from") || def.filters.includes("date_to")) {
    const field = def.date_field ? ` (${def.date_field})` : "";
    if (filters.date_from && filters.date_to) parts.push(`Period${field}: ${filters.date_from} to ${filters.date_to}`);
    else if (filters.date_from) parts.push(`Period${field}: from ${filters.date_from}`);
    else if (filters.date_to) parts.push(`Period${field}: until ${filters.date_to}`);
    else parts.push(`Period${field}: All time`);
  }
  if (def.filters.includes("method")) {
    const label = PAYMENT_METHODS.find((entry) => entry.value === filters.method)?.label;
    parts.push(filters.method ? `Method: ${label || filters.method}` : "Method: All");
  }
  if (def.filters.includes("client")) {
    parts.push(filters.client ? `Client contains "${filters.client}"` : "Client: All");
  }
  return parts.join(" · ");
}

function windowFilters(filters, column) {
  const conditions = [];
  const params = [];
  if (filters.date_from) { conditions.push(`${column} >= ?`); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push(`${column} <= ?`); params.push(filters.date_to); }
  return { conditions, params };
}

// ---------------------------------------------------------------------------
// Builders — one per report type. All values read from the live database.
// ---------------------------------------------------------------------------

function buildIncome(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("pay.contract_id IN (SELECT id FROM contracts WHERE project_id = ?)"); params.push(filters.project); }
  if (filters.method) { conditions.push("pay.method = ?"); params.push(filters.method); }
  if (filters.client) { conditions.push("(instr(lower(pay.client_name), lower(?)) > 0 OR instr(lower(c.client_name), lower(?)) > 0)"); params.push(filters.client, filters.client); }
  if (filters.date_from) { conditions.push("pay.paid_at >= ?"); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push("pay.paid_at <= ?"); params.push(filters.date_to); }
  const rows = db.prepare(`
    SELECT pay.id, pay.paid_at, pay.client_name, pay.amount, pay.method, pay.reference, pay.notes,
           pr.name as project_name, c.id as contract_id, d.due_date as installment_due
    FROM payments pay
    JOIN contracts c ON c.id = pay.contract_id
    JOIN projects pr ON pr.id = c.project_id
    LEFT JOIN debts d ON d.id = pay.debt_id
    ${whereClause(conditions)}
    ORDER BY pay.paid_at ASC, pay.id ASC
  `).all(...params);
  const methodLabel = (value) => PAYMENT_METHODS.find((entry) => entry.value === value)?.label || value;
  const mapped = rows.map((row) => ({
    ...row,
    amount: money(row.amount),
    method_label: methodLabel(row.method),
    contract_no: `C-${String(row.contract_id).padStart(4, "0")}`,
  }));
  const total = money(mapped.reduce((sum, row) => sum + row.amount, 0));
  const groupBy = (labelFn) => {
    const map = new Map();
    for (const row of mapped) {
      const key = labelFn(row);
      const entry = map.get(key) || { group: key, count: 0, total: 0 };
      entry.count += 1;
      entry.total = money(entry.total + row.amount);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  };
  return {
    columns: [dateCol("paid_at", "Payment date"), text("client_name", "Client"), text("project_name", "Project"),
      text("contract_no", "Contract"), num("amount", "Amount"), text("method_label", "Payment method"), text("reference", "Reference")],
    rows: mapped,
    totals: [{ label: "Total income", value: total, kind: "money" }, { label: "Payments", value: mapped.length, kind: "int" }],
    sections: [
      { title: "Income by project", columns: [text("group", "Project"), intCol("count", "Payments"), num("total", "Total")], rows: groupBy((r) => r.project_name || "—") },
      { title: "Income by payment method", columns: [text("group", "Payment method"), intCol("count", "Payments"), num("total", "Total")], rows: groupBy((r) => r.method_label) },
      { title: "Income by date", columns: [dateCol("group", "Date"), intCol("count", "Payments"), num("total", "Total")], rows: groupBy((r) => r.paid_at) },
    ],
  };
}

function buildClients(filters) {
  const clientConditions = [];
  const clientParams = [];
  if (filters.project) { clientConditions.push("cl.project_id = ?"); clientParams.push(filters.project); }
  if (filters.status) { clientConditions.push("cl.status = ?"); clientParams.push(filters.status); }
  const clients = db.prepare(`
    SELECT cl.*, pr.name as project_name
    FROM clients cl LEFT JOIN projects pr ON pr.id = cl.project_id
    ${whereClause(clientConditions)}
    ORDER BY cl.name ASC
  `).all(...clientParams);

  const contractConditions = [];
  const contractParams = [];
  if (filters.project) { contractConditions.push("c.project_id = ?"); contractParams.push(filters.project); }
  const contracts = contractsEnriched(contractConditions, contractParams);
  const contractKey = (name) => String(name || "").trim().toLowerCase();
  const byClient = new Map();
  for (const contract of contracts) {
    const key = contractKey(contract.client_name);
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push(contract);
  }

  const rows = [];
  for (const client of clients) {
    const linked = byClient.get(contractKey(client.name)) || [];
    if (!linked.length) {
      rows.push({
        name: client.name, phone: client.phone || "—", email: client.email || "—",
        project_name: client.project_name || "—", contract_no: "—", contract_status: "—",
        contract_amount: 0, paid_amount: 0, outstanding: 0,
      });
      continue;
    }
    for (const contract of linked) {
      rows.push({
        name: client.name, phone: client.phone || "—", email: client.email || "—",
        project_name: contract.project_name || client.project_name || "—",
        contract_no: `C-${String(contract.id).padStart(4, "0")}`,
        contract_status: contract.status,
        contract_amount: contract.value, paid_amount: contract.paid_amount, outstanding: contract.outstanding,
      });
    }
  }
  return {
    columns: [text("name", "Client"), text("phone", "Phone"), text("email", "Email"), text("project_name", "Project"),
      text("contract_no", "Contract"), num("contract_amount", "Contract amount"), num("paid_amount", "Paid"),
      num("outstanding", "Outstanding"), text("contract_status", "Contract status")],
    rows,
    totals: [
      { label: "Contract value", value: money(rows.reduce((sum, row) => sum + row.contract_amount, 0)), kind: "money" },
      { label: "Paid", value: money(rows.reduce((sum, row) => sum + row.paid_amount, 0)), kind: "money" },
      { label: "Outstanding", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), kind: "money" },
    ],
  };
}

function buildProperties(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("p.project_id = ?"); params.push(filters.project); }
  if (filters.status) { conditions.push("p.status = ?"); params.push(filters.status); }
  const rows = db.prepare(`
    SELECT p.*, pr.name as project_name
    FROM properties p LEFT JOIN projects pr ON pr.id = p.project_id
    ${whereClause(conditions)}
    ORDER BY p.name ASC
  `).all(...params).map((row) => ({
    project_name: row.project_name || "—",
    name: row.name,
    location: row.location || "—",
    property_type: row.property_type,
    price: money(row.price),
    status: row.status,
    area: row.area || 0,
    bedrooms: row.bedrooms || 0,
    bathrooms: row.bathrooms || 0,
  }));
  return {
    columns: [text("project_name", "Project"), text("name", "Property / unit"), text("location", "Location"),
      text("property_type", "Type"), num("price", "Price"), text("status", "Status"),
      num("area", "Area"), intCol("bedrooms", "Beds"), intCol("bathrooms", "Baths")],
    rows,
    totals: [
      { label: "Portfolio value", value: money(rows.reduce((sum, row) => sum + row.price, 0)), kind: "money" },
      { label: "Properties", value: rows.length, kind: "int" },
    ],
  };
}

function buildProjects(filters) {
  const conditions = [];
  const params = [];
  if (filters.status) { conditions.push("p.status = ?"); params.push(filters.status); }
  const projects = db.prepare(`SELECT p.* FROM projects p ${whereClause(conditions)} ORDER BY p.name ASC`).all(...params);
  const contracts = contractsEnriched();
  const payments = db.prepare(`
    SELECT c.project_id as project_id, COALESCE(SUM(pay.amount),0) as total
    FROM payments pay JOIN contracts c ON c.id = pay.contract_id
    GROUP BY c.project_id
  `).all();
  const paidByProject = new Map(payments.map((row) => [row.project_id, money(row.total)]));
  const countBy = (table) => db.prepare(`SELECT project_id, COUNT(*) as c FROM ${table} WHERE project_id IS NOT NULL GROUP BY project_id`);
  const propertyCounts = new Map(countBy("properties").all().map((row) => [row.project_id, row.c]));
  const clientCounts = new Map(countBy("clients").all().map((row) => [row.project_id, row.c]));

  const rows = projects.map((project) => {
    const own = contracts.filter((contract) => contract.project_id === project.id);
    return {
      name: project.name,
      status: project.status,
      properties: propertyCounts.get(project.id) || 0,
      clients: clientCounts.get(project.id) || 0,
      contracts: own.length,
      contract_value: money(own.reduce((sum, contract) => sum + contract.value, 0)),
      payments_received: paidByProject.get(project.id) || 0,
      outstanding: money(own.reduce((sum, contract) => sum + contract.outstanding, 0)),
    };
  });
  return {
    columns: [text("name", "Project"), text("status", "Status"), intCol("properties", "Properties"),
      intCol("clients", "Clients"), intCol("contracts", "Contracts"), num("contract_value", "Total contract value"),
      num("payments_received", "Payments received"), num("outstanding", "Total outstanding")],
    rows,
    totals: [
      { label: "Contract value", value: money(rows.reduce((sum, row) => sum + row.contract_value, 0)), kind: "money" },
      { label: "Payments received", value: money(rows.reduce((sum, row) => sum + row.payments_received, 0)), kind: "money" },
      { label: "Outstanding", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), kind: "money" },
    ],
  };
}

function buildContracts(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("c.project_id = ?"); params.push(filters.project); }
  if (filters.status) { conditions.push("c.status = ?"); params.push(filters.status); }
  if (filters.client) { conditions.push("instr(lower(c.client_name), lower(?)) > 0"); params.push(filters.client); }
  if (filters.date_from) { conditions.push("c.start_date >= ?"); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push("c.start_date <= ?"); params.push(filters.date_to); }
  const rows = contractsEnriched(conditions, params).map((contract) => ({
    contract_no: `C-${String(contract.id).padStart(4, "0")}`,
    client_name: contract.client_name,
    project_name: contract.project_name,
    contract_type: contract.contract_type,
    status: contract.status,
    start_date: contract.start_date || "—",
    value: contract.value,
    installments: contract.installment_count,
    paid_amount: contract.paid_amount,
    outstanding: contract.outstanding,
  }));
  return {
    columns: [text("contract_no", "Contract #"), text("client_name", "Client"), text("project_name", "Project"),
      text("contract_type", "Type"), text("status", "Status"), dateCol("start_date", "Start date"),
      num("value", "Contract amount"), intCol("installments", "Installments"),
      num("paid_amount", "Paid"), num("outstanding", "Outstanding")],
    rows,
    totals: [
      { label: "Contract value", value: money(rows.reduce((sum, row) => sum + row.value, 0)), kind: "money" },
      { label: "Paid", value: money(rows.reduce((sum, row) => sum + row.paid_amount, 0)), kind: "money" },
      { label: "Outstanding", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), kind: "money" },
    ],
  };
}

function buildPayments(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("pay.contract_id IN (SELECT id FROM contracts WHERE project_id = ?)"); params.push(filters.project); }
  if (filters.method) { conditions.push("pay.method = ?"); params.push(filters.method); }
  if (filters.client) { conditions.push("(instr(lower(pay.client_name), lower(?)) > 0 OR instr(lower(c.client_name), lower(?)) > 0)"); params.push(filters.client, filters.client); }
  if (filters.date_from) { conditions.push("pay.paid_at >= ?"); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push("pay.paid_at <= ?"); params.push(filters.date_to); }
  const methodLabel = (value) => PAYMENT_METHODS.find((entry) => entry.value === value)?.label || value;
  const rows = db.prepare(`
    SELECT pay.*, pr.name as project_name, c.id as contract_id, d.due_date as installment_due, d.notes as installment_notes
    FROM payments pay
    JOIN contracts c ON c.id = pay.contract_id
    JOIN projects pr ON pr.id = c.project_id
    LEFT JOIN debts d ON d.id = pay.debt_id
    ${whereClause(conditions)}
    ORDER BY pay.paid_at ASC, pay.id ASC
  `).all(...params).map((row) => ({
    paid_at: row.paid_at,
    client_name: row.client_name,
    project_name: row.project_name,
    contract_no: `C-${String(row.contract_id).padStart(4, "0")}`,
    installment: row.debt_id
      ? `#${row.debt_id}${row.installment_due ? ` · due ${row.installment_due}` : ""}${row.installment_notes ? ` · ${row.installment_notes}` : ""}`
      : "—",
    amount: money(row.amount),
    method_label: methodLabel(row.method),
    reference: row.reference || "—",
    notes: row.notes || "—",
  }));
  return {
    columns: [dateCol("paid_at", "Payment date"), text("client_name", "Client"), text("contract_no", "Contract"),
      text("project_name", "Project"), text("installment", "Installment"), num("amount", "Amount"),
      text("method_label", "Payment method"), text("reference", "Reference"), text("notes", "Note")],
    rows,
    totals: [
      { label: "Total payments", value: money(rows.reduce((sum, row) => sum + row.amount, 0)), kind: "money" },
      { label: "Payments", value: rows.length, kind: "int" },
    ],
  };
}

function installmentRows(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("c.project_id = ?"); params.push(filters.project); }
  if (filters.client) { conditions.push("(instr(lower(d.client_name), lower(?)) > 0 OR instr(lower(c.client_name), lower(?)) > 0)"); params.push(filters.client, filters.client); }
  if (filters.date_from) { conditions.push("d.due_date >= ?"); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push("d.due_date <= ?"); params.push(filters.date_to); }
  let rows = enrichedDebts(conditions, params);
  if (filters.status) rows = rows.filter((row) => stateMatchesFilter(row.state, filters.status));
  // Installment number per contract in schedule order.
  const counters = new Map();
  return rows.map((row) => {
    const count = (counters.get(row.contract_id) || 0) + 1;
    counters.set(row.contract_id, count);
    return {
      client_name: row.client_name,
      project_name: row.project_name,
      contract_no: `C-${String(row.contract_id).padStart(4, "0")}`,
      installment: count,
      debt_id: row.id,
      amount: money(row.amount),
      due_date: row.due_date || "—",
      paid_amount: row.paid_amount,
      outstanding: row.outstanding,
      status: row.state,
      notes: row.notes || "—",
    };
  });
}

function buildDebt(filters) {
  const rows = installmentRows(filters);
  return {
    columns: [text("client_name", "Client"), text("project_name", "Project"), text("contract_no", "Contract"),
      text("installment", "Installment"), dateCol("due_date", "Due date"), num("amount", "Amount due"),
      num("paid_amount", "Amount paid"), num("outstanding", "Outstanding"), text("status", "Status")],
    rows,
    totals: [
      { label: "Amount due", value: money(rows.reduce((sum, row) => sum + row.amount, 0)), kind: "money" },
      { label: "Amount paid", value: money(rows.reduce((sum, row) => sum + row.paid_amount, 0)), kind: "money" },
      { label: "Outstanding", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), kind: "money" },
    ],
  };
}

function buildOverdue(filters) {
  const today = isoToday();
  const rows = installmentRows(filters)
    .filter((row) => row.status === "Overdue")
    .map((row) => ({
      ...row,
      days_overdue: row.due_date && row.due_date !== "—" && row.due_date < today ? daysBetween(row.due_date, today) : 0,
    }));
  return {
    columns: [text("client_name", "Client"), text("project_name", "Project"), text("contract_no", "Contract"),
      text("installment", "Installment"), dateCol("due_date", "Due date"), intCol("days_overdue", "Days overdue"),
      num("amount", "Amount due"), num("paid_amount", "Amount paid"), num("outstanding", "Outstanding")],
    rows,
    totals: [
      { label: "Overdue amount", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), kind: "money" },
      { label: "Overdue installments", value: rows.length, kind: "int" },
    ],
  };
}

function buildInstallments(filters) {
  const rows = installmentRows(filters);
  return {
    columns: [text("client_name", "Client"), text("contract_no", "Contract"), text("installment", "Installment #"),
      dateCol("due_date", "Due date"), num("amount", "Amount"), num("paid_amount", "Paid amount"),
      num("outstanding", "Outstanding"), text("status", "Status"), text("notes", "Note")],
    rows,
    totals: [
      { label: "Scheduled", value: money(rows.reduce((sum, row) => sum + row.amount, 0)), kind: "money" },
      { label: "Paid", value: money(rows.reduce((sum, row) => sum + row.paid_amount, 0)), kind: "money" },
      { label: "Outstanding", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), kind: "money" },
    ],
  };
}

function buildFollowups(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("a.project_id = ?"); params.push(filters.project); }
  if (filters.status) { conditions.push("a.status = ?"); params.push(filters.status); }
  if (filters.date_from) { conditions.push("date(a.starts_at) >= ?"); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push("date(a.starts_at) <= ?"); params.push(filters.date_to); }
  const appointments = db.prepare(`
    SELECT a.*, c.name as client_name, c.phone, c.email, pr.name as project_name, prop.name as property_name
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN projects pr ON pr.id = a.project_id
    LEFT JOIN properties prop ON prop.id = a.property_id
    ${whereClause(conditions)}
    ORDER BY a.starts_at ASC
  `).all(...params);

  const allAppointments = db.prepare("SELECT client_id, starts_at, id FROM appointments ORDER BY starts_at ASC").all();
  const contracts = db.prepare("SELECT id, client_name, project_id FROM contracts").all();
  const contractKey = (name) => String(name || "").trim().toLowerCase();

  const rows = appointments.map((row) => {
    const next = allAppointments.find((entry) =>
      entry.client_id === row.client_id && entry.starts_at > row.starts_at && entry.id !== row.id);
    const relatedContract = contracts.find((contract) =>
      contractKey(contract.client_name) === contractKey(row.client_name) &&
      (!row.project_id || contract.project_id === row.project_id));
    return {
      client_name: row.client_name,
      contact: [row.phone, row.email].filter(Boolean).join(" · ") || "—",
      followup_date: row.starts_at,
      followup_type: row.appointment_type,
      notes: row.notes || row.title || "—",
      next_followup: next ? next.starts_at : "—",
      project_name: row.project_name || "—",
      contract_no: relatedContract ? `C-${String(relatedContract.id).padStart(4, "0")}` : "—",
      status: row.status,
    };
  });
  return {
    columns: [text("client_name", "Client"), text("contact", "Contact"), dateCol("followup_date", "Follow-up date"),
      text("followup_type", "Follow-up type"), text("notes", "Notes"), dateCol("next_followup", "Next follow-up"),
      text("project_name", "Project"), text("contract_no", "Contract"), text("status", "Status")],
    rows,
    totals: [{ label: "Follow-ups", value: rows.length, kind: "int" }],
  };
}

function buildDocuments(filters) {
  const conditions = [];
  const params = [];
  if (filters.project) { conditions.push("d.project_id = ?"); params.push(filters.project); }
  if (filters.status) { conditions.push("d.status = ?"); params.push(filters.status); }
  if (filters.date_from) { conditions.push("date(COALESCE(d.uploaded_at, d.created_at)) >= ?"); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push("date(COALESCE(d.uploaded_at, d.created_at)) <= ?"); params.push(filters.date_to); }
  const rows = db.prepare(`
    SELECT d.*, pr.name as project_name, cl.name as client_name, co.id as contract_id
    FROM documents d
    LEFT JOIN projects pr ON pr.id = d.project_id
    LEFT JOIN clients cl ON cl.id = d.client_id
    LEFT JOIN contracts co ON co.id = d.contract_id
    ${whereClause(conditions)}
    ORDER BY d.created_at DESC
  `).all(...params).map((row) => ({
    title: row.title,
    category: row.category,
    project_name: row.project_name || "—",
    client_name: row.client_name || "—",
    contract_no: row.contract_id ? `C-${String(row.contract_id).padStart(4, "0")}` : "—",
    uploaded_at: row.uploaded_at || row.created_at,
    status: row.status,
    file_name: row.original_filename || row.file_reference || "—",
    file_size: row.file_size ? formatBytes(row.file_size) : "—",
  }));
  return {
    columns: [text("title", "Document"), text("category", "Category"), text("project_name", "Project"),
      text("client_name", "Client"), text("contract_no", "Contract"), dateCol("uploaded_at", "Upload date"),
      text("status", "Status"), text("file_name", "File"), text("file_size", "Size")],
    rows,
    totals: [{ label: "Documents", value: rows.length, kind: "int" }],
  };
}

function buildSummary(filters) {
  const income = windowQuery("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM payments", filters, "paid_at");
  const contracts = windowQuery("SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total FROM contracts", filters, "start_date");
  const dueInPeriod = windowQuery("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM debts", filters, "due_date");
  const appointments = windowQuery("SELECT COUNT(*) as count FROM appointments a", filters, "date(a.starts_at)");
  const documents = windowQuery("SELECT COUNT(*) as count FROM documents d", filters, "date(d.created_at)");
  const newClients = windowQuery("SELECT COUNT(*) as count FROM clients cl", filters, "date(cl.created_at)");
  const overdueConditions = windowFilters(filters, "d.due_date");
  const overdue = enrichedDebts(overdueConditions.conditions, overdueConditions.params).filter((row) => row.state === "Overdue");
  const activeProjects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").get().count;

  const rows = [
    { metric: "Income received", count: income.count, amount: money(income.total), note: "Actual recorded payments" },
    { metric: "Contracts started", count: contracts.count, amount: money(contracts.total), note: "By contract start date" },
    { metric: "Installments due", count: dueInPeriod.count, amount: money(dueInPeriod.total), note: "By due date" },
    { metric: "Follow-ups held", count: appointments.count, amount: null, note: "Appointments in period" },
    { metric: "Documents uploaded", count: documents.count, amount: null, note: "In period" },
    { metric: "New clients added", count: newClients.count, amount: null, note: "In period" },
    { metric: "Overdue installments (current)", count: overdue.length, amount: money(overdue.reduce((sum, row) => sum + row.outstanding, 0)), note: "As of today" },
    { metric: "Active projects (current)", count: activeProjects, amount: null, note: "As of today" },
  ];
  return {
    columns: [text("metric", "Metric"), intCol("count", "Count"), num("amount", "Amount"), text("note", "Notes")],
    rows,
    totals: [{ label: "Income in period", value: money(income.total), kind: "money" }],
  };
}

function windowQuery(baseSql, filters, column) {
  const { conditions, params } = windowFilters(filters, column);
  return db.prepare(`${baseSql}${whereClause(conditions)}`).get(...params);
}

const builders = {
  income: buildIncome,
  clients: buildClients,
  properties: buildProperties,
  projects: buildProjects,
  contracts: buildContracts,
  payments: buildPayments,
  debt: buildDebt,
  overdue: buildOverdue,
  installments: buildInstallments,
  followups: buildFollowups,
  documents: buildDocuments,
  summary: buildSummary,
};

// Validates raw request filters against the selected report type.
export function parseFilters(type, raw = {}) {
  const def = reportTypeDef(type);
  if (!def) throw new Error("Unknown report type");
  const filters = {};
  const allowed = new Set(def.filters);
  const intOrNull = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw new Error("project filter must be a positive integer");
    return id;
  };
  const dateOrNull = (value, field) => {
    if (value === undefined || value === null || value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`${field} must use YYYY-MM-DD`);
    return String(value);
  };
  if (allowed.has("project")) filters.project = intOrNull(raw.project ?? raw.project_id);
  if (allowed.has("date_from")) filters.date_from = dateOrNull(raw.date_from, "date_from");
  if (allowed.has("date_to")) filters.date_to = dateOrNull(raw.date_to, "date_to");
  if (allowed.has("status") && raw.status) {
    if (!def.status_values?.some((entry) => entry.value === raw.status)) throw new Error("status filter is invalid for this report");
    filters.status = raw.status;
  }
  if (allowed.has("method") && raw.method) {
    if (!PAYMENT_METHODS.some((entry) => entry.value === raw.method)) throw new Error("method filter is invalid");
    filters.method = raw.method;
  }
  if (allowed.has("client") && raw.client) {
    const client = String(raw.client).trim();
    if (client.length > 80) throw new Error("client filter must be 80 characters or fewer");
    if (client) filters.client = client;
  }
  if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
    throw new Error("date_from cannot be after date_to");
  }
  return filters;
}

export function buildReport(type, filters) {
  const builder = builders[type];
  if (!builder) throw new Error("Unknown report type");
  const def = reportTypeDef(type);
  const result = builder(filters);
  return {
    brand: "MKUYU",
    brand_sub: "Real Estate Management System",
    type,
    title: def.label,
    description: def.description,
    filters_text: describeFilters(type, filters) || "No filters applied",
    generated_at: new Date().toISOString(),
    row_count: result.rows.length,
    ...result,
  };
}










