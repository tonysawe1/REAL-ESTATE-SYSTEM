import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "realestate-unit-"));
process.env.DB_PATH = path.join(dataDir, "unit-system.db");

let database;
try {
  const [{ default: db }, { runMigrations }, { Project }, { Client, Property, PropertyImage }, { Contract }, { Debt }, { Payment }, { Reminder }, { Report }] = await Promise.all([
    import("./backend/src/db.js"),
    import("./backend/src/migrate.js"),
    import("./backend/src/models/project.js"),
    import("./backend/src/models/catalog.js"),
    import("./backend/src/models/contract.js"),
    import("./backend/src/models/debt.js"),
    import("./backend/src/models/payment.js"),
    import("./backend/src/models/reminder.js"),
    import("./backend/src/models/report.js"),
  ]);
  database = db;

  runMigrations();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('contracts','payments','property_images') ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, ["contracts", "payments", "property_images"]);

  const projectId = Number(Project.create("Unit Project").lastInsertRowid);
  const clientId = Number(Client.create({ project_id: projectId, name: "Unit Client", client_type: "buyer", status: "active" }).lastInsertRowid);
  const contractId = Number(Contract.create({ project_id: projectId, client_id: clientId, client_name: "Unit Client", contract_type: "new", value: 1000 }).lastInsertRowid);
  const firstDebtId = Number(Debt.create({ contract_id: contractId, client_name: "Unit Client", amount: 600, due_date: "2099-01-01" }).lastInsertRowid);
  const secondDebtId = Number(Debt.create({ contract_id: contractId, client_name: "Unit Client", amount: 400, due_date: "2099-02-01" }).lastInsertRowid);
  const reminderTime = new Date(Date.now() + 86400000).toISOString().replace("T", " ").slice(0, 19);
  Reminder.sync(firstDebtId, reminderTime);
  assert.equal(Reminder.upcoming(2).some((row) => row.debt_id === firstDebtId), true);

  const paymentId = Number(Payment.create({ contract_id: contractId, debt_id: firstDebtId, client_name: "Unit Client", amount: 600, paid_at: "2026-09-25 10:00:00", method: "bank" }).lastInsertRowid);
  Payment.syncInstallment(firstDebtId);
  assert.equal(Debt.get(firstDebtId).status, "paid");
  assert.equal(Payment.forDebt(firstDebtId), 600);

  Payment.update(paymentId, { contract_id: contractId, debt_id: secondDebtId, client_name: "Unit Client", amount: 400, paid_at: "2026-09-25 10:00:00", method: "bank" });
  Payment.syncInstallment(firstDebtId, true);
  Payment.syncInstallment(secondDebtId, true);
  assert.equal(Debt.get(firstDebtId).status, "pending");
  assert.equal(Debt.get(secondDebtId).status, "paid");

  Payment.remove(paymentId);
  Payment.syncInstallment(secondDebtId, true);
  assert.equal(Debt.get(secondDebtId).status, "pending");
  Reminder.sync(secondDebtId, null);
  assert.equal(Reminder.upcoming(2).some((row) => row.debt_id === secondDebtId), false);

  const propertyId = Number(Property.create({ project_id: projectId, name: "Unit Villa", property_type: "villa", status: "available", price: 5000, location: "Test", area: 100 }).lastInsertRowid);
  assert.equal(Property.get(propertyId).image_count, 0);
  PropertyImage.create(propertyId, { original_filename: "unit.png", stored_name: "unit.png", file_size: 4, mime_type: "image/png" });
  assert.equal(Property.get(propertyId).image_count, 1);

  const summary = Report.summary();
  assert.equal(summary.income_all.total, 0);
  assert.equal(summary.properties_available, 1);
  assert.equal(summary.clients_active, 1);
  console.log("UNIT_TESTS_PASSED");
} catch (error) {
  console.error("UNIT_TESTS_FAILED", error);
  process.exitCode = 1;
} finally {
  try {
    database?.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(`Unit test temporary cleanup skipped: ${error.message}`);
  }
}
