import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations, seed } from "./migrate.js";
import apiRoutes from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve static frontend
const frontendDir = path.resolve(__dirname, "..", "..", "frontend");
app.use(express.static(frontendDir));

// API
app.use("/api/v1", apiRoutes);

app.use((error, req, res, next) => {
  if (req.path.startsWith("/api")) {
    const status = error.status || 500;
    return res.status(status).json({ error: status >= 500 ? "internal server error" : error.message });
  }
  next(error);
});

// SPA fallback: serve index.html for non-asset routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(frontendDir, "index.html"));
});

runMigrations();
seed();

app.listen(PORT, () => {
  console.log(`Real Estate System running at http://localhost:${PORT}`);
});