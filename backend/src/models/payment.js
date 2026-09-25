import db from "../db.js";

const paymentSelect = `SELECT p.*, c.project_id, c.contract_type, c.status as contract_status,
                              pr.name as project_name, d.due_date as installment_due, d.notes as installment_notes,
                              doc.original_filename as receipt_filename, doc.stored_name as receipt_stored_name, doc.mime_type as receipt_mime_type
                       FROM payments p
                       JOIN contracts c ON c.id = p.contract_id
                       LEFT JOIN projects pr ON pr.id = c.project_id
                       LEFT JOIN debts d ON d.id = p.debt_id
                       LEFT JOIN documents doc ON doc.id = p.receipt_document_id`;

export const Payment = {
  all(filters = {}) {
    const conditions = [];
    const params = [];
    if (filters.projectId) { conditions.push("c.project_id = ?"); params.push(filters.projectId); }
    if (filters.contractId) { conditions.push("p.contract_id = ?"); params.push(filters.contractId); }
    if (filters.method) { conditions.push("p.method = ?"); params.push(filters.method); }
    if (filters.from) { conditions.push("p.paid_at >= ?"); params.push(filters.from); }
    if (filters.to) { conditions.push("p.paid_at <= ?"); params.push(filters.to); }
    let sql = paymentSelect;
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY p.paid_at DESC, p.id DESC";
    return db.prepare(sql).all(...params);
  },
  get(id) {
    return db.prepare(`${paymentSelect} WHERE p.id = ?`).get(id);
  },
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO payments (contract_id, debt_id, client_name, amount, paid_at, method, reference, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.contract_id, data.debt_id || null, data.client_name,
      data.amount, data.paid_at, data.method || "cash",
      data.reference || null, data.notes || null
    );
  },
  update(id, data) {
    const stmt = db.prepare(`
      UPDATE payments
      SET contract_id=?, debt_id=?, client_name=?, amount=?, paid_at=?, method=?, reference=?, notes=?
      WHERE id=?
    `);
    return stmt.run(
      data.contract_id, data.debt_id || null, data.client_name,
      data.amount, data.paid_at, data.method || "cash",
      data.reference || null, data.notes || null, id
    );
  },
  // Attach or replace the receipt document link (file columns live on documents).
  setReceipt(id, documentId) {
    return db.prepare("UPDATE payments SET receipt_document_id = ? WHERE id = ?").run(documentId || null, id);
  },
  remove(id) {
    return db.prepare("DELETE FROM payments WHERE id = ?").run(id);
  },
  // Actual recorded income inside an optional window (never derived from contracts).
  incomeTotals(filters = {}) {
    const conditions = [];
    const params = [];
    if (filters.projectId) { conditions.push("c.project_id = ?"); params.push(filters.projectId); }
    if (filters.method) { conditions.push("p.method = ?"); params.push(filters.method); }
    if (filters.from) { conditions.push("p.paid_at >= ?"); params.push(filters.from); }
    if (filters.to) { conditions.push("p.paid_at <= ?"); params.push(filters.to); }
    let sql = `SELECT COUNT(*) as count, COALESCE(SUM(p.amount),0) as total
               FROM payments p JOIN contracts c ON c.id = p.contract_id`;
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    return db.prepare(sql).get(...params);
  },
  // Payments are the source of truth for automatic installment settlement.
  // `force` is used after a payment is deleted or moved: even a manually
  // settled installment must become open again when its only payment goes away.
  syncInstallment(debtId, force = false) {
    if (!debtId) return;
    const debt = db.prepare("SELECT id, amount, due_date, status FROM debts WHERE id = ?").get(debtId);
    if (!debt) return;
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE debt_id = ?").get(debtId).total;
    if (!force && paid === 0 && debt.status === "paid") return;
    let status;
    if (debt.amount > 0 && paid >= debt.amount) {
      status = "paid";
    } else {
      status = debt.due_date && debt.due_date < db.prepare("SELECT date('now') AS today").get().today ? "overdue" : "pending";
    }
    if (status !== debt.status) db.prepare("UPDATE debts SET status = ? WHERE id = ?").run(status, debtId);
  },
  // Payments made against a contract (optionally only those linked to a given debt).
  forDebt(debtId) {
    return db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE debt_id = ?").get(debtId).total;
  },
};
