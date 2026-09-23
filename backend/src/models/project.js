import db from "../db.js";

export const Project = {
  all() {
    return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
  },
  get(id) {
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  },
  create(name, status = "active") {
    const stmt = db.prepare("INSERT INTO projects (name, status) VALUES (?, ?)");
    return stmt.run(name, status);
  },
  update(id, name, status) {
    const stmt = db.prepare("UPDATE projects SET name = ?, status = ? WHERE id = ?");
    return stmt.run(name, status, id);
  },
  remove(id) {
    return db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  },
};