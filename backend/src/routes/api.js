import { Router } from "express";
import { Project } from "../models/project.js";
import { Contract } from "../models/contract.js";
import { Debt } from "../models/debt.js";
import { Reminder } from "../models/reminder.js";
import { Report } from "../models/report.js";
import { Property, Client, Appointment, Document } from "../models/catalog.js";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  createSession,
  tokenFromRequest,
  publicUser,
  requireAuth,
} from "../auth.js";
import db from "../db.js";

const router = Router();
const projectStatuses = new Set(["active", "archived"]);
const contractTypes = new Set(["new", "terminal"]);
const contractStatuses = new Set(["active", "closed", "cancelled"]);
const debtStatuses = new Set(["pending", "paid", "overdue"]);
const propertyTypes = new Set(["land", "house", "apartment", "villa", "commercial", "penthouse"]);
const propertyStatuses = new Set(["available", "reserved", "sold", "leased"]);
const clientTypes = new Set(["buyer", "seller", "landlord", "tenant"]);
const clientStatuses = new Set(["lead", "active", "inactive"]);
const appointmentTypes = new Set(["viewing", "call", "meeting", "inspection"]);
const appointmentStatuses = new Set(["scheduled", "completed", "cancelled"]);
const documentCategories = new Set(["agreement", "title", "invoice", "receipt", "report", "permit", "other"]);
const documentStatuses = new Set(["pending", "approved", "archived"]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function route(handler) {
  return (req, res, next) => {
    try {
      handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

function parseId(value, field = "id", optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, `${field} must be a positive integer`);
  return id;
}

function requiredText(value, field, max = 120) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer`);
  return text;
}

function optionalText(value, field, max = 2000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer`);
  return text;
}

function enumValue(value, allowed, fallback, field) {
  const selected = value === undefined || value === "" ? fallback : value;
  if (!allowed.has(selected)) throw new HttpError(400, `${field} is invalid`);
  return selected;
}

function nonNegativeNumber(value, field, fallback = 0) {
  const selected = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(selected) || selected < 0) throw new HttpError(400, `${field} must be a non-negative number`);
  return selected;
}

function nonNegativeInteger(value, field, fallback = 0) {
  const selected = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(selected) || selected < 0) throw new HttpError(400, `${field} must be a non-negative integer`);
  return selected;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${field} must use YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new HttpError(400, `${field} is invalid`);
  return value;
}

function optionalDateTime(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new HttpError(400, `${field} must use YYYY-MM-DD HH:MM`);
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field} is invalid`);
  return value.replace(" ", "T");
}

function validEmail(value, field = "email") {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new HttpError(400, `${field} is invalid`);
  return value.trim();
}

function validateProject(body, current = {}) {
  return {
    name: requiredText(body.name ?? current.name, "name"),
    status: enumValue(body.status ?? current.status, projectStatuses, "active", "status"),
  };
}

function validateContract(body, current = {}) {
  const data = {
    project_id: parseId(body.project_id ?? current.project_id, "project_id"),
    client_name: requiredText(body.client_name ?? current.client_name, "client_name"),
    contract_type: enumValue(body.contract_type ?? current.contract_type, contractTypes, "new", "contract_type"),
    status: enumValue(body.status ?? current.status, contractStatuses, "active", "status"),
    value: nonNegativeNumber(body.value ?? current.value, "value"),
    start_date: optionalDate(body.start_date ?? current.start_date, "start_date"),
    end_date: optionalDate(body.end_date ?? current.end_date, "end_date"),
    notes: optionalText(body.notes ?? current.notes, "notes"),
  };
  if (data.start_date && data.end_date && data.end_date < data.start_date) throw new HttpError(400, "end_date cannot be before start_date");
  return data;
}

function validateDebt(body, current = {}) {
  return {
    contract_id: parseId(body.contract_id ?? current.contract_id, "contract_id"),
    client_name: requiredText(body.client_name ?? current.client_name, "client_name"),
    amount: nonNegativeNumber(body.amount ?? current.amount, "amount"),
    due_date: optionalDate(body.due_date ?? current.due_date, "due_date"),
    status: enumValue(body.status ?? current.status, debtStatuses, "pending", "status"),
    notes: optionalText(body.notes ?? current.notes, "notes"),
  };
}

function validateProperty(body, current = {}) {
  return {
    project_id: parseId(body.project_id ?? current.project_id, "project_id", true),
    name: requiredText(body.name ?? current.name, "name"),
    property_type: enumValue(body.property_type ?? current.property_type, propertyTypes, "house", "property_type"),
    status: enumValue(body.status ?? current.status, propertyStatuses, "available", "status"),
    price: nonNegativeNumber(body.price ?? current.price, "price"),
    location: requiredText(body.location ?? current.location, "location"),
    area: nonNegativeNumber(body.area ?? current.area, "area"),
    bedrooms: nonNegativeInteger(body.bedrooms ?? current.bedrooms, "bedrooms"),
    bathrooms: nonNegativeInteger(body.bathrooms ?? current.bathrooms, "bathrooms"),
    description: optionalText(body.description ?? current.description, "description"),
    featured: Boolean(body.featured ?? current.featured),
  };
}

function validateClient(body, current = {}) {
  return {
    project_id: parseId(body.project_id ?? current.project_id, "project_id", true),
    name: requiredText(body.name ?? current.name, "name"),
    email: validEmail(body.email ?? current.email),
    phone: optionalText(body.phone ?? current.phone, "phone", 40),
    client_type: enumValue(body.client_type ?? current.client_type, clientTypes, "buyer", "client_type"),
    status: enumValue(body.status ?? current.status, clientStatuses, "lead", "status"),
    notes: optionalText(body.notes ?? current.notes, "notes"),
  };
}

function validateAppointment(body, current = {}) {
  const data = {
    client_id: parseId(body.client_id ?? current.client_id, "client_id"),
    property_id: parseId(body.property_id ?? current.property_id, "property_id", true),
    project_id: parseId(body.project_id ?? current.project_id, "project_id", true),
    title: requiredText(body.title ?? current.title, "title"),
    appointment_type: enumValue(body.appointment_type ?? current.appointment_type, appointmentTypes, "viewing", "appointment_type"),
    starts_at: optionalDateTime(body.starts_at ?? current.starts_at, "starts_at"),
    ends_at: optionalDateTime(body.ends_at ?? current.ends_at, "ends_at"),
    status: enumValue(body.status ?? current.status, appointmentStatuses, "scheduled", "status"),
    notes: optionalText(body.notes ?? current.notes, "notes"),
  };
  if (!data.starts_at) throw new HttpError(400, "starts_at is required");
  if (data.starts_at && data.ends_at && data.ends_at <= data.starts_at) throw new HttpError(400, "ends_at must be after starts_at");
  return data;
}

function validateDocument(body, current = {}) {
  return {
    project_id: parseId(body.project_id ?? current.project_id, "project_id", true),
    contract_id: parseId(body.contract_id ?? current.contract_id, "contract_id", true),
    client_id: parseId(body.client_id ?? current.client_id, "client_id", true),
    title: requiredText(body.title ?? current.title, "title"),
    category: enumValue(body.category ?? current.category, documentCategories, "other", "category"),
    status: enumValue(body.status ?? current.status, documentStatuses, "pending", "status"),
    file_reference: optionalText(body.file_reference ?? current.file_reference, "file_reference", 300),
    notes: optionalText(body.notes ?? current.notes, "notes"),
  };
}

function requireRecord(record, label = "Record") {
  if (!record) throw new HttpError(404, `${label} not found`);
  return record;
}

router.get("/health", route((req, res) => res.json({ status: "ok" })));
router.get("/auth/state", route((req, res) => res.json({ configured: db.prepare("SELECT COUNT(*) as count FROM users").get().count > 0 })));
router.post("/auth/setup", route((req, res) => {
  if (db.prepare("SELECT COUNT(*) as count FROM users").get().count > 0) throw new HttpError(409, "workspace already configured");
  const body = req.body || {};
  const displayName = requiredText(body.display_name, "display_name", 80);
  const email = validEmail(body.email, "email");
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 128) throw new HttpError(400, "password must be between 8 and 128 characters");
  const result = db.prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)").run(email, hashPassword(password), displayName);
  const session = createSession(Number(result.lastInsertRowid));
  res.status(201).json({ ...publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(Number(result.lastInsertRowid))), ...session });
}));
router.post("/auth/login", route((req, res) => {
  const body = req.body || {};
  const email = validEmail(body.email, "email");
  const password = typeof body.password === "string" ? body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, "email or password is incorrect");
  const session = createSession(user.id);
  res.json({ ...publicUser(user), ...session });
}));
router.post("/auth/logout", route((req, res) => {
  const token = tokenFromRequest(req);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  res.json({ ok: true });
}));
router.get("/auth/me", requireAuth, route((req, res) => res.json(publicUser(req.user))));
router.use(requireAuth);

router.get("/projects", route((req, res) => res.json(Project.all())));
router.get("/projects/:id", route((req, res) => res.json(requireRecord(Project.get(parseId(req.params.id)), "Project"))));
router.post("/projects", route((req, res) => {
  const data = validateProject(req.body || {});
  const result = Project.create(data.name, data.status);
  res.status(201).json(Project.get(Number(result.lastInsertRowid)));
}));
router.put("/projects/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Project.get(id), "Project");
  const data = validateProject(req.body || {}, current);
  Project.update(id, data.name, data.status);
  res.json(Project.get(id));
}));
router.delete("/projects/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Project.get(id), "Project");
  Project.remove(id);
  res.json({ ok: true });
}));

router.get("/contracts", route((req, res) => {
  const projectId = req.query.project_id === undefined ? null : parseId(req.query.project_id, "project_id");
  const type = req.query.type || null;
  if (type && !contractTypes.has(type)) throw new HttpError(400, "type is invalid");
  res.json(Contract.all(projectId, type));
}));
router.get("/contracts/:id", route((req, res) => res.json(requireRecord(Contract.get(parseId(req.params.id)), "Contract"))));
router.post("/contracts", route((req, res) => {
  const data = validateContract(req.body || {});
  const result = Contract.create(data);
  res.status(201).json(Contract.get(Number(result.lastInsertRowid)));
}));
router.put("/contracts/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Contract.get(id), "Contract");
  const data = validateContract(req.body || {}, current);
  Contract.update(id, data);
  res.json(Contract.get(id));
}));
router.delete("/contracts/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Contract.get(id), "Contract");
  Contract.remove(id);
  res.json({ ok: true });
}));

router.get("/debts/overdue", route((req, res) => res.json(Debt.overdue())));
router.get("/debts/upcoming", route((req, res) => {
  const days = req.query.days === undefined ? 7 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new HttpError(400, "days must be an integer between 0 and 365");
  res.json(Debt.upcoming(days));
}));
router.get("/debts", route((req, res) => {
  const status = req.query.status || null;
  const projectId = req.query.project_id === undefined ? null : parseId(req.query.project_id, "project_id");
  if (status && !debtStatuses.has(status)) throw new HttpError(400, "status is invalid");
  res.json(Debt.all(status, projectId));
}));
router.get("/debts/:id", route((req, res) => res.json(requireRecord(Debt.get(parseId(req.params.id)), "Debt"))));
router.post("/debts", route((req, res) => {
  const data = validateDebt(req.body || {});
  const result = Debt.create(data);
  res.status(201).json(Debt.get(Number(result.lastInsertRowid)));
}));
router.put("/debts/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Debt.get(id), "Debt");
  const data = validateDebt(req.body || {}, current);
  Debt.update(id, data);
  res.json(Debt.get(id));
}));
router.post("/debts/:id/pay", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Debt.get(id), "Debt");
  Debt.markPaid(id);
  res.json(Debt.get(id));
}));
router.delete("/debts/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Debt.get(id), "Debt");
  Debt.remove(id);
  res.json({ ok: true });
}));

router.get("/reminders", route((req, res) => res.json(Reminder.due())));
router.get("/reminders/upcoming", route((req, res) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new HttpError(400, "days must be an integer between 0 and 365");
  res.json(Reminder.upcoming(days));
}));
router.post("/reminders/:id/acknowledge", route((req, res) => {
  const id = parseId(req.params.id);
  const result = Reminder.acknowledge(id);
  if (!result.changes) throw new HttpError(404, "Reminder not found");
  res.json({ ok: true });
}));

router.get("/properties", route((req, res) => {
  const projectId = req.query.project_id === undefined ? null : parseId(req.query.project_id, "project_id");
  const status = req.query.status || null;
  if (status && !propertyStatuses.has(status)) throw new HttpError(400, "status is invalid");
  res.json(Property.all(projectId, status));
}));
router.get("/properties/:id", route((req, res) => res.json(requireRecord(Property.get(parseId(req.params.id)), "Property"))));
router.post("/properties", route((req, res) => {
  const data = validateProperty(req.body || {});
  const result = Property.create(data);
  res.status(201).json(Property.get(Number(result.lastInsertRowid)));
}));
router.put("/properties/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Property.get(id), "Property");
  const data = validateProperty(req.body || {}, current);
  Property.update(id, data);
  res.json(Property.get(id));
}));
router.delete("/properties/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Property.get(id), "Property");
  Property.remove(id);
  res.json({ ok: true });
}));

router.get("/clients", route((req, res) => {
  const projectId = req.query.project_id === undefined ? null : parseId(req.query.project_id, "project_id");
  const status = req.query.status || null;
  if (status && !clientStatuses.has(status)) throw new HttpError(400, "status is invalid");
  res.json(Client.all(projectId, status));
}));
router.get("/clients/:id", route((req, res) => res.json(requireRecord(Client.get(parseId(req.params.id)), "Client"))));
router.post("/clients", route((req, res) => {
  const data = validateClient(req.body || {});
  const result = Client.create(data);
  res.status(201).json(Client.get(Number(result.lastInsertRowid)));
}));
router.put("/clients/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Client.get(id), "Client");
  const data = validateClient(req.body || {}, current);
  Client.update(id, data);
  res.json(Client.get(id));
}));
router.delete("/clients/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Client.get(id), "Client");
  Client.remove(id);
  res.json({ ok: true });
}));

router.get("/appointments", route((req, res) => {
  const status = req.query.status || null;
  const projectId = req.query.project_id === undefined ? null : parseId(req.query.project_id, "project_id");
  if (status && !appointmentStatuses.has(status)) throw new HttpError(400, "status is invalid");
  res.json(Appointment.all(status, projectId));
}));
router.get("/appointments/:id", route((req, res) => res.json(requireRecord(Appointment.get(parseId(req.params.id)), "Appointment"))));
router.post("/appointments", route((req, res) => {
  const data = validateAppointment(req.body || {});
  const result = Appointment.create(data);
  res.status(201).json(Appointment.get(Number(result.lastInsertRowid)));
}));
router.put("/appointments/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Appointment.get(id), "Appointment");
  const data = validateAppointment(req.body || {}, current);
  Appointment.update(id, data);
  res.json(Appointment.get(id));
}));
router.delete("/appointments/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Appointment.get(id), "Appointment");
  Appointment.remove(id);
  res.json({ ok: true });
}));

router.get("/documents", route((req, res) => {
  const status = req.query.status || null;
  const projectId = req.query.project_id === undefined ? null : parseId(req.query.project_id, "project_id");
  if (status && !documentStatuses.has(status)) throw new HttpError(400, "status is invalid");
  res.json(Document.all(status, projectId));
}));
router.get("/documents/:id", route((req, res) => res.json(requireRecord(Document.get(parseId(req.params.id)), "Document"))));
router.post("/documents", route((req, res) => {
  const data = validateDocument(req.body || {});
  const result = Document.create(data);
  res.status(201).json(Document.get(Number(result.lastInsertRowid)));
}));
router.put("/documents/:id", route((req, res) => {
  const id = parseId(req.params.id);
  const current = requireRecord(Document.get(id), "Document");
  const data = validateDocument(req.body || {}, current);
  Document.update(id, data);
  res.json(Document.get(id));
}));
router.delete("/documents/:id", route((req, res) => {
  const id = parseId(req.params.id);
  requireRecord(Document.get(id), "Document");
  Document.remove(id);
  res.json({ ok: true });
}));

router.get("/reports/summary", route((req, res) => res.json(Report.summary())));
router.get("/reports/by-project", route((req, res) => res.json(Report.byProject())));
router.get("/reports/new-contracts", route((req, res) => res.json(Report.newContracts())));
router.get("/reports/terminal-contracts", route((req, res) => res.json(Report.terminalContracts())));

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? "internal server error" : error.message });
});

export default router;
