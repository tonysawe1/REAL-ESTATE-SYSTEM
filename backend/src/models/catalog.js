import db from "../db.js";

function rowsWithProject(table, alias, joins, conditions, params) {
  let sql = `SELECT ${table}.* FROM ${table}${alias}`;
  if (joins) sql += joins;
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  return db.prepare(sql).all(...params);
}

export const Property = {
  all(projectId = null, status = null) {
    const conditions = [];
    const params = [];
    if (projectId) { conditions.push("pr.id = ?"); params.push(projectId); }
    if (status) { conditions.push("p.status = ?"); params.push(status); }
    return rowsWithProject("properties", " p", " LEFT JOIN projects pr ON pr.id = p.project_id", conditions, params);
  },
  get(id) {
    return db.prepare("SELECT p.*, pr.name as project_name FROM properties p LEFT JOIN projects pr ON pr.id = p.project_id WHERE p.id = ?").get(id);
  },
  create(data) {
    return db.prepare(`INSERT INTO properties (project_id, name, property_type, status, price, location, area, bedrooms, bathrooms, description, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(data.project_id || null, data.name, data.property_type, data.status, data.price, data.location, data.area, data.bedrooms || 0, data.bathrooms || 0, data.description || null, data.featured ? 1 : 0);
  },
  update(id, data) {
    return db.prepare(`UPDATE properties SET project_id=?, name=?, property_type=?, status=?, price=?, location=?, area=?, bedrooms=?, bathrooms=?, description=?, featured=? WHERE id=?`).run(data.project_id || null, data.name, data.property_type, data.status, data.price, data.location, data.area, data.bedrooms || 0, data.bathrooms || 0, data.description || null, data.featured ? 1 : 0, id);
  },
  remove(id) { return db.prepare("DELETE FROM properties WHERE id = ?").run(id); },
};

export const Client = {
  all(projectId = null, status = null) {
    const conditions = [];
    const params = [];
    if (projectId) { conditions.push("pr.id = ?"); params.push(projectId); }
    if (status) { conditions.push("c.status = ?"); params.push(status); }
    return rowsWithProject("clients", " c", " LEFT JOIN projects pr ON pr.id = c.project_id", conditions, params);
  },
  get(id) {
    return db.prepare("SELECT c.*, pr.name as project_name FROM clients c LEFT JOIN projects pr ON pr.id = c.project_id WHERE c.id = ?").get(id);
  },
  create(data) {
    return db.prepare(`INSERT INTO clients (project_id, name, email, phone, client_type, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(data.project_id || null, data.name, data.email || null, data.phone || null, data.client_type, data.status, data.notes || null);
  },
  update(id, data) {
    return db.prepare(`UPDATE clients SET project_id=?, name=?, email=?, phone=?, client_type=?, status=?, notes=? WHERE id=?`).run(data.project_id || null, data.name, data.email || null, data.phone || null, data.client_type, data.status, data.notes || null, id);
  },
  remove(id) { return db.prepare("DELETE FROM clients WHERE id = ?").run(id); },
};

export const Appointment = {
  all(status = null, projectId = null) {
    const conditions = [];
    const params = [];
    if (status) { conditions.push("a.status = ?"); params.push(status); }
    if (projectId) { conditions.push("a.project_id = ?"); params.push(projectId); }
    let sql = `SELECT a.*, c.name as client_name, c.phone as client_phone, p.name as property_name, pr.name as project_name
               FROM appointments a
               JOIN clients c ON c.id = a.client_id
               LEFT JOIN properties p ON p.id = a.property_id
               LEFT JOIN projects pr ON pr.id = a.project_id`;
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY a.starts_at ASC";
    return db.prepare(sql).all(...params);
  },
  get(id) {
    return db.prepare(`SELECT a.*, c.name as client_name, c.phone as client_phone, p.name as property_name, pr.name as project_name
                       FROM appointments a JOIN clients c ON c.id = a.client_id
                       LEFT JOIN properties p ON p.id = a.property_id
                       LEFT JOIN projects pr ON pr.id = a.project_id WHERE a.id = ?`).get(id);
  },
  create(data) {
    return db.prepare(`INSERT INTO appointments (client_id, property_id, project_id, title, appointment_type, starts_at, ends_at, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(data.client_id, data.property_id || null, data.project_id || null, data.title, data.appointment_type, data.starts_at, data.ends_at || null, data.status, data.notes || null);
  },
  update(id, data) {
    return db.prepare(`UPDATE appointments SET client_id=?, property_id=?, project_id=?, title=?, appointment_type=?, starts_at=?, ends_at=?, status=?, notes=? WHERE id=?`).run(data.client_id, data.property_id || null, data.project_id || null, data.title, data.appointment_type, data.starts_at, data.ends_at || null, data.status, data.notes || null, id);
  },
  remove(id) { return db.prepare("DELETE FROM appointments WHERE id = ?").run(id); },
};

export const Document = {
  all(status = null, projectId = null) {
    const conditions = [];
    const params = [];
    if (status) { conditions.push("d.status = ?"); params.push(status); }
    if (projectId) { conditions.push("d.project_id = ?"); params.push(projectId); }
    let sql = `SELECT d.*, c.name as client_name, co.client_name as contract_client, pr.name as project_name
               FROM documents d
               LEFT JOIN clients c ON c.id = d.client_id
               LEFT JOIN contracts co ON co.id = d.contract_id
               LEFT JOIN projects pr ON pr.id = d.project_id`;
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY d.created_at DESC";
    return db.prepare(sql).all(...params);
  },
  get(id) {
    return db.prepare(`SELECT d.*, c.name as client_name, co.client_name as contract_client, pr.name as project_name
                       FROM documents d LEFT JOIN clients c ON c.id = d.client_id
                       LEFT JOIN contracts co ON co.id = d.contract_id
                       LEFT JOIN projects pr ON pr.id = d.project_id WHERE d.id = ?`).get(id);
  },
  create(data) {
    return db.prepare(`INSERT INTO documents (project_id, contract_id, client_id, title, category, status, file_reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(data.project_id || null, data.contract_id || null, data.client_id || null, data.title, data.category, data.status, data.file_reference || null, data.notes || null);
  },
  update(id, data) {
    return db.prepare(`UPDATE documents SET project_id=?, contract_id=?, client_id=?, title=?, category=?, status=?, file_reference=?, notes=? WHERE id=?`).run(data.project_id || null, data.contract_id || null, data.client_id || null, data.title, data.category, data.status, data.file_reference || null, data.notes || null, id);
  },
  remove(id) { return db.prepare("DELETE FROM documents WHERE id = ?").run(id); },
};
