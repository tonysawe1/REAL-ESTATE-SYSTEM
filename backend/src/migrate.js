import db from "./db.js";

const migrations = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','staff')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  contract_type TEXT NOT NULL CHECK(contract_type IN ('new','terminal')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','cancelled')),
  value REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL,
  remind_at TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'house' CHECK(property_type IN ('land','house','apartment','villa','commercial','penthouse')),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','sold','leased')),
  price REAL NOT NULL DEFAULT 0,
  location TEXT NOT NULL,
  area REAL NOT NULL DEFAULT 0,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  client_type TEXT NOT NULL DEFAULT 'buyer' CHECK(client_type IN ('buyer','seller','landlord','tenant')),
  status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','active','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  property_id INTEGER,
  project_id INTEGER,
  title TEXT NOT NULL,
  appointment_type TEXT NOT NULL DEFAULT 'viewing' CHECK(appointment_type IN ('viewing','call','meeting','inspection')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  contract_id INTEGER,
  client_id INTEGER,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('agreement','title','invoice','receipt','report','permit','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','archived')),
  file_reference TEXT,
  notes TEXT,
  original_filename TEXT,
  stored_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  debt_id INTEGER,
  client_name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0),
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank','mobile','card','other')),
  reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'generated' CHECK(source IN ('generated','uploaded')),
  project_id INTEGER,
  description TEXT,
  filters_json TEXT,
  file_format TEXT,
  original_filename TEXT,
  stored_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS property_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  original_filename TEXT,
  stored_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_debts_contract ON debts(contract_id);
CREATE INDEX IF NOT EXISTS idx_debts_due ON debts(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_debt ON reminders(debt_id);
CREATE INDEX IF NOT EXISTS idx_properties_project ON properties(project_id);
CREATE INDEX IF NOT EXISTS idx_clients_project ON clients(project_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
`;

export function runMigrations() {
  db.exec(migrations);
  ensureColumn("documents", "original_filename", "TEXT");
  ensureColumn("documents", "stored_name", "TEXT");
  ensureColumn("documents", "file_size", "INTEGER");
  ensureColumn("documents", "mime_type", "TEXT");
  ensureColumn("documents", "uploaded_at", "TEXT");
  // Optional client link on contracts (manual client_name still supported).
  ensureColumn("contracts", "client_id", "INTEGER REFERENCES clients(id) ON DELETE SET NULL");
  // Optional receipt document attached to a payment.
  ensureColumn("payments", "receipt_document_id", "INTEGER REFERENCES documents(id) ON DELETE SET NULL");
}

// Additive-only column migration: never modifies or drops existing columns.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function seed() {
  const hasProjects = db.prepare("SELECT COUNT(*) as c FROM projects").get().c;
  if (hasProjects > 0) {
    seedCatalog();
    return;
  }

  const insertProject = db.prepare("INSERT INTO projects (name, status) VALUES (?, ?)");
  const insertContract = db.prepare(`INSERT INTO contracts (project_id, client_name, contract_type, status, value, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDebt = db.prepare(`INSERT INTO debts (contract_id, client_name, amount, due_date, status, notes) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertReminder = db.prepare("INSERT INTO reminders (debt_id, remind_at) VALUES (?, ?)");
  const insertProperty = db.prepare(`INSERT INTO properties (project_id, name, property_type, status, price, location, area, bedrooms, bathrooms, description, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertClient = db.prepare(`INSERT INTO clients (project_id, name, email, phone, client_type, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertAppointment = db.prepare(`INSERT INTO appointments (client_id, property_id, project_id, title, appointment_type, starts_at, ends_at, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDocument = db.prepare(`INSERT INTO documents (project_id, contract_id, client_id, title, category, status, file_reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const tx = db.transaction(() => {
    const p1 = insertProject.run("Riverside Heights", "active").lastInsertRowid;
    const p2 = insertProject.run("Lakeside Villas", "active").lastInsertRowid;
    const p3 = insertProject.run("Harbour Point", "archived").lastInsertRowid;

    const c1 = insertContract.run(p1, "Amina Patel", "new", "active", 120000, "2026-09-01", "2027-03-01", "Sale of Plot 14, phase 2").lastInsertRowid;
    const c2 = insertContract.run(p1, "John Mwangi", "terminal", "closed", 85000, "2026-05-10", "2026-08-20", "Terminal payout settled").lastInsertRowid;
    const c3 = insertContract.run(p2, "Sarah Otieno", "new", "active", 210000, "2026-09-15", "2027-06-15", "Villa purchase, payment plan").lastInsertRowid;

    const d1 = insertDebt.run(c1, "Amina Patel", 40000, "2026-10-05", "pending", "Balance after deposit").lastInsertRowid;
    const d2 = insertDebt.run(c3, "Sarah Otieno", 70000, "2026-09-25", "pending", "First installment").lastInsertRowid;
    const d3 = insertDebt.run(c3, "Sarah Otieno", 70000, "2026-11-10", "pending", "Second installment").lastInsertRowid;
    insertReminder.run(d1, "2026-10-01 09:00:00");
    insertReminder.run(d3, "2026-11-05 09:00:00");

    const prop1 = insertProperty.run(p1, "Plot 14 · Phase 2", "land", "available", 120000, "Riverside, Dar es Salaam", 720, 0, 0, "Prime residential plot with approved access road.", 1).lastInsertRowid;
    const prop2 = insertProperty.run(p2, "Villa 08 · Lake View", "villa", "reserved", 210000, "Lakeside, Dar es Salaam", 480, 4, 3, "Four-bedroom villa with lake view and private garden.", 1).lastInsertRowid;
    const prop3 = insertProperty.run(p1, "Commercial Suite 3", "commercial", "leased", 85000, "Harbour Point, Dar es Salaam", 260, 0, 2, "Ready-to-use commercial suite near the waterfront.", 0).lastInsertRowid;

    const client1 = insertClient.run(p1, "Amina Patel", "amina@example.com", "+255 700 000 001", "buyer", "active", "Interested in Plot 14.").lastInsertRowid;
    const client2 = insertClient.run(p2, "Sarah Otieno", "sarah@example.com", "+255 700 000 002", "buyer", "active", "Payment plan client for Villa 08.").lastInsertRowid;
    const client3 = insertClient.run(p1, "John Mwangi", "john@example.com", "+255 700 000 003", "seller", "inactive", "Terminal contract completed.").lastInsertRowid;

    insertAppointment.run(client1, prop1, p1, "Site visit · Plot 14", "viewing", "2026-09-24 10:00:00", "2026-09-24 11:00:00", "scheduled", "Meet at the riverside entrance.");
    insertAppointment.run(client2, prop2, p2, "Villa handover meeting", "meeting", "2026-09-26 14:00:00", "2026-09-26 15:00:00", "scheduled", "Review final payment schedule.");
    insertAppointment.run(client3, null, p1, "Contract close-out call", "call", "2026-09-22 09:00:00", "2026-09-22 09:30:00", "completed", "Confirm terminal documents.");

    insertDocument.run(p1, c1, client1, "Sale Agreement · Plot 14", "agreement", "pending", "documents/plot-14-agreement.pdf", "Awaiting client signature.");
    insertDocument.run(p2, c3, client2, "Title Deed · Villa 08", "title", "approved", "documents/villa-08-title.pdf", "Verified by legal team.");
    insertDocument.run(p1, c1, client1, "Deposit Receipt", "receipt", "approved", "documents/amina-deposit.pdf", "Receipt issued after deposit.");
    insertDocument.run(p1, null, client3, "Terminal Contract Report", "report", "archived", "documents/terminal-report.pdf", "Closed contract record.");
  });

  tx();
  seedCatalog();
}

export function seedCatalog() {
  const hasProperties = db.prepare("SELECT COUNT(*) as c FROM properties").get().c;
  const hasClients = db.prepare("SELECT COUNT(*) as c FROM clients").get().c;
  const hasAppointments = db.prepare("SELECT COUNT(*) as c FROM appointments").get().c;
  const hasDocuments = db.prepare("SELECT COUNT(*) as c FROM documents").get().c;
  if (hasProperties && hasClients && hasAppointments && hasDocuments) return;

  const firstProject = db.prepare("SELECT id FROM projects ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at ASC LIMIT 1").get();
  const secondProject = db.prepare("SELECT id FROM projects WHERE id != ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at ASC LIMIT 1").get(firstProject?.id || 0);
  const firstContract = db.prepare("SELECT id, project_id, client_name FROM contracts ORDER BY created_at ASC LIMIT 1").get();
  const firstClient = db.prepare("SELECT id FROM clients ORDER BY created_at ASC LIMIT 1").get();
  const firstProperty = db.prepare("SELECT id FROM properties ORDER BY created_at ASC LIMIT 1").get();

  const insertProperty = db.prepare(`INSERT INTO properties (project_id, name, property_type, status, price, location, area, bedrooms, bathrooms, description, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertClient = db.prepare(`INSERT INTO clients (project_id, name, email, phone, client_type, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertAppointment = db.prepare(`INSERT INTO appointments (client_id, property_id, project_id, title, appointment_type, starts_at, ends_at, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDocument = db.prepare(`INSERT INTO documents (project_id, contract_id, client_id, title, category, status, file_reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const tx = db.transaction(() => {
    if (!hasProperties && firstProject) {
      insertProperty.run(firstProject.id, "Signature Residence · Phase 1", "villa", "available", 280000, "Green Valley, Dar es Salaam", 520, 4, 3, "Premium residence with landscaped grounds and private parking.", 1);
      if (secondProject) insertProperty.run(secondProject.id, "Executive Office Suite", "commercial", "available", 95000, "City Centre, Dar es Salaam", 180, 0, 1, "Flexible office suite for established businesses.", 0);
    }
    if (!hasClients && firstProject) {
      insertClient.run(firstProject.id, "Neema Kamau", "neema@example.com", "+255 700 000 004", "buyer", "lead", "Looking for a premium family residence.");
      if (secondProject) insertClient.run(secondProject.id, "Office Connections Ltd", "leasing@example.com", "+255 700 000 005", "tenant", "lead", "Interested in flexible office space.");
    }
    if (!hasAppointments && firstClient && firstProperty) {
      insertAppointment.run(firstClient.id, firstProperty.id, firstProject.id, "Premium residence tour", "viewing", "2026-09-25 11:00:00", "2026-09-25 12:00:00", "scheduled", "Prepare brochure and site access.");
    }
    if (!hasDocuments && firstProject && firstContract && firstClient) {
      insertDocument.run(firstProject.id, firstContract.id, firstClient.id, "Client onboarding checklist", "report", "pending", "documents/onboarding-checklist.pdf", "Complete before contract execution.");
    }
  });

  tx();
}

if (process.argv.includes("--seed-only")) {
  runMigrations();
  seed();
  console.log("seeded");
  process.exit(0);
}
