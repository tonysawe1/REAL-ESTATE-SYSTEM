import db from "../db.js";

export const Contract = {
  all(projectId = null, type = null) {
    let sql = `SELECT c.*, p.name as project_name, cl.name as linked_client_name
               FROM contracts c
               JOIN projects p ON p.id = c.project_id
               LEFT JOIN clients cl ON cl.id = c.client_id`;
    const conditions = [];
    const params = [];
    if (projectId) { conditions.push("c.project_id = ?"); params.push(projectId); }
    if (type) { conditions.push("c.contract_type = ?"); params.push(type); }
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY c.created_at DESC";
    return db.prepare(sql).all(...params);
  },
  get(id) {
    return db.prepare(`SELECT c.*, p.name as project_name, cl.name as linked_client_name
                       FROM contracts c
                       JOIN projects p ON p.id = c.project_id
                       LEFT JOIN clients cl ON cl.id = c.client_id
                       WHERE c.id = ?`).get(id);
  },
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO contracts (project_id, client_id, client_name, contract_type, status, value, start_date, end_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.project_id, data.client_id || null, data.client_name, data.contract_type,
      data.status || "active", data.value || 0, data.start_date || null,
      data.end_date || null, data.notes || null
    );
  },
  update(id, data) {
    const stmt = db.prepare(`
      UPDATE contracts
      SET project_id=?, client_id=?, client_name=?, contract_type=?, status=?, value=?, start_date=?, end_date=?, notes=?
      WHERE id=?
    `);
    return stmt.run(
      data.project_id, data.client_id || null, data.client_name, data.contract_type,
      data.status, data.value || 0, data.start_date || null,
      data.end_date || null, data.notes || null, id
    );
  },
  remove(id) {
    return db.prepare("DELETE FROM contracts WHERE id = ?").run(id);
  },
};