import db from "../db.js";

const reminderSelect = `SELECT r.id, r.remind_at, r.sent, d.id as debt_id, d.amount, d.due_date,
                               d.client_name, d.status as debt_status, d.notes,
                               c.project_id, c.contract_type, p.name as project_name
                        FROM reminders r
                        JOIN debts d ON d.id = r.debt_id
                        JOIN contracts c ON c.id = d.contract_id
                        JOIN projects p ON p.id = c.project_id`;

export const Reminder = {
  due() {
    return db.prepare(`${reminderSelect}
                       WHERE r.sent = 0 AND r.remind_at <= datetime('now')
                       ORDER BY r.remind_at ASC`).all();
  },
  upcoming(days = 30) {
    return db.prepare(`${reminderSelect}
                       WHERE r.sent = 0 AND r.remind_at > datetime('now')
                         AND r.remind_at <= datetime('now', '+' || ? || ' days')
                       ORDER BY r.remind_at ASC`).all(days);
  },
  acknowledge(id) {
    return db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(id);
  },
};
