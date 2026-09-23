import db from "../db.js";

export const Debt = {
  all(status = null, projectId = null) {
    let sql = `SELECT d.*, c.client_name as contract_client, c.project_id,
                      c.contract_type, p.name as project_name
               FROM debts d
               JOIN contracts c ON c.id = d.contract_id
               JOIN projects p ON p.id = c.project_id`;
    const conditions = [];
    const params = [];
    if (status) { conditions.push("d.status = ?"); params.push(status); }
    if (projectId) { conditions.push("c.project_id = ?"); params.push(projectId); }
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY d.due_date ASC, d.created_at DESC";
    return db.prepare(sql).all(...params);
  },
  get(id) {
    return db.prepare(`SELECT d.*, c.client_name as contract_client, c.project_id,
                              c.contract_type, p.name as project_name
                       FROM debts d
                       JOIN contracts c ON c.id = d.contract_id
                       JOIN projects p ON p.id = c.project_id
                       WHERE d.id = ?`).get(id);
  },
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO debts (contract_id, client_name, amount, due_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const status = data.status || "pending";
    return stmt.run(
      data.contract_id, data.client_name, data.amount || 0,
      data.due_date || null, status, data.notes || null
    );
  },
  update(id, data) {
    const stmt = db.prepare(`
      UPDATE debts
      SET contract_id=?, client_name=?, amount=?, due_date=?, status=?, notes=?
      WHERE id=?
    `);
    return stmt.run(
      data.contract_id, data.client_name, data.amount || 0,
      data.due_date || null, data.status || "pending", data.notes || null, id
    );
  },
  remove(id) {
    return db.prepare("DELETE FROM debts WHERE id = ?").run(id);
  },
  markPaid(id) {
    return db.prepare("UPDATE debts SET status='paid' WHERE id = ?").run(id);
  },
  overdue() {
    return db.prepare(`SELECT d.*, c.client_name as contract_client, c.project_id,
                              p.name as project_name
                       FROM debts d
                       JOIN contracts c ON c.id = d.contract_id
                       JOIN projects p ON p.id = c.project_id
                        WHERE (d.status='overdue' OR (d.status='pending' AND d.due_date < date('now')))
                        ORDER BY d.due_date ASC`).all();
  },
  upcoming(days = 7) {
    return db.prepare(`SELECT d.*, c.client_name as contract_client, c.project_id,
                              p.name as project_name
                       FROM debts d
                       JOIN contracts c ON c.id = d.contract_id
                       JOIN projects p ON p.id = c.project_id
                       WHERE d.status='pending'
                         AND d.due_date >= date('now')
                         AND d.due_date <= date('now', '+' || ? || ' days')
                       ORDER BY d.due_date ASC`).all(days);
  },
};