import db from "../db.js";

const reportSelect = `SELECT r.*, p.name as project_name
                     FROM reports r
                     LEFT JOIN projects p ON p.id = r.project_id`;

export const Report = {
  summary() {
    const projects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status='active'").get();
    const contractsTotal = db.prepare("SELECT COUNT(*) as count FROM contracts").get();
    const contractsNew = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total FROM contracts WHERE contract_type='new' AND status='active'").get();
    const contractsTerminal = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total FROM contracts WHERE contract_type='terminal'").get();
    const debtsPending = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM debts WHERE status='pending'").get();
    const debtsOverdue = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM debts WHERE status='overdue' OR (status='pending' AND due_date < date('now'))").get();
    const debtsPaid = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM debts WHERE status='paid'").get();
    const propertiesAvailable = db.prepare("SELECT COUNT(*) as count FROM properties WHERE status='available'").get();
    const clientsActive = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status='active'").get();
    const appointmentsScheduled = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status='scheduled'").get();
    const documentsPending = db.prepare("SELECT COUNT(*) as count FROM documents WHERE status='pending'").get();
    // Actual money received: total and within the last 30 days.
    const incomeAll = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM payments").get();
    const income30 = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM payments WHERE paid_at >= datetime('now', '-30 days')").get();
    return {
      active_projects: projects.count,
      contracts_total: contractsTotal.count,
      contracts_new: { count: contractsNew.count, total: contractsNew.total },
      contracts_terminal: { count: contractsTerminal.count, total: contractsTerminal.total },
      debts_pending: { count: debtsPending.count, total: debtsPending.total },
      debts_overdue: { count: debtsOverdue.count, total: debtsOverdue.total },
      debts_paid: { count: debtsPaid.count, total: debtsPaid.total },
      properties_available: propertiesAvailable.count,
      clients_active: clientsActive.count,
      appointments_scheduled: appointmentsScheduled.count,
      documents_pending: documentsPending.count,
      income_all: { count: incomeAll.count, total: incomeAll.total },
      income_30d: { count: income30.count, total: income30.total },
    };
  },
  byProject() {
    return db.prepare(`
      SELECT p.id, p.name,
             SUM(CASE WHEN c.contract_type='new' THEN 1 ELSE 0 END) as new_contracts,
             SUM(CASE WHEN c.contract_type='terminal' THEN 1 ELSE 0 END) as terminal_contracts,
             COALESCE(SUM(c.value),0) as contract_value,
             (SELECT COUNT(*) FROM debts d JOIN contracts cx ON cx.id = d.contract_id WHERE cx.project_id = p.id AND d.status='pending') as open_debts,
             (SELECT COUNT(*) FROM properties pr WHERE pr.project_id = p.id) as properties,
             (SELECT COUNT(*) FROM clients cl WHERE cl.project_id = p.id) as clients,
             (SELECT COUNT(*) FROM appointments a WHERE a.project_id = p.id AND a.status='scheduled') as appointments,
             (SELECT COUNT(*) FROM documents doc WHERE doc.project_id = p.id AND doc.status='pending') as documents
      FROM projects p
      LEFT JOIN contracts c ON c.project_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.name
    `).all();
  },
  newContracts() {
    return db.prepare(`SELECT c.*, p.name as project_name
                       FROM contracts c
                       JOIN projects p ON p.id = c.project_id
                       WHERE c.contract_type='new'
                       ORDER BY c.created_at DESC`).all();
  },
  terminalContracts() {
    return db.prepare(`SELECT c.*, p.name as project_name
                       FROM contracts c
                       JOIN projects p ON p.id = c.project_id
                       WHERE c.contract_type='terminal'
                       ORDER BY c.created_at DESC`).all();
  },
  history(filters = {}) {
    const conditions = [];
    const params = [];
    if (filters.projectId) { conditions.push("r.project_id = ?"); params.push(filters.projectId); }
    if (filters.source) { conditions.push("r.source = ?"); params.push(filters.source); }
    if (filters.reportType) { conditions.push("r.report_type = ?"); params.push(filters.reportType); }
    if (filters.search) {
      conditions.push("(instr(lower(r.title), lower(?)) > 0 OR instr(lower(COALESCE(r.original_filename, '')), lower(?)) > 0)");
      params.push(filters.search, filters.search);
    }
    if (filters.from) { conditions.push("date(r.created_at) >= ?"); params.push(filters.from); }
    if (filters.to) { conditions.push("date(r.created_at) <= ?"); params.push(filters.to); }
    let sql = reportSelect;
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY r.created_at DESC, r.id DESC LIMIT 250";
    return db.prepare(sql).all(...params);
  },
  get(id) {
    return db.prepare(`${reportSelect} WHERE r.id = ?`).get(id);
  },
  create(data) {
    const result = db.prepare(`
      INSERT INTO reports
        (title, report_type, source, project_id, description, filters_json, file_format, original_filename, stored_name, file_size, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.title,
      data.report_type,
      data.source || "generated",
      data.project_id || null,
      data.description || null,
      data.filters_json || null,
      data.file_format || null,
      data.original_filename || null,
      data.stored_name || null,
      data.file_size || null,
      data.mime_type || null,
    );
    return this.get(Number(result.lastInsertRowid));
  },
  remove(id) {
    return db.prepare("DELETE FROM reports WHERE id = ?").run(id);
  },
};