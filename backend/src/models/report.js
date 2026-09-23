import db from "../db.js";

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
    };
  },
  byProject() {
    return db.prepare(`
      SELECT p.id, p.name,
             SUM(CASE WHEN c.contract_type='new' THEN 1 ELSE 0 END) as new_contracts,
             SUM(CASE WHEN c.contract_type='terminal' THEN 1 ELSE 0 END) as terminal_contracts,
             COALESCE(SUM(c.value),0) as contract_value,
              (SELECT COUNT(*) FROM contracts cx JOIN debts d ON d.contract_id = cx.id WHERE cx.project_id = p.id AND d.status='pending') as open_debts,
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
};