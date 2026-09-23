import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const configuredDbPath = process.env.DB_PATH || path.join(projectRoot, "data", "system.db");
const dbPath = path.isAbsolute(configuredDbPath) ? configuredDbPath : path.resolve(projectRoot, configuredDbPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export default db;