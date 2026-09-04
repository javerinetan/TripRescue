import "dotenv/config";
import cors from "cors";
import express from "express";
import { createRouter } from "./routes.js";
import { publicWallets } from "./xrpl.js";

const app = express();
app.use(cors());
app.use(express.json());

// Liveness plus a check that both XRPL wallets loaded from .env.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", product: "trip-rescue", wallets: publicWallets() });
});

// Supplier, x402 and payment routes.
app.use("/api", createRouter());

// API_PORT wins so an injected PORT (some dev harnesses set it to the web
// port) cannot make the API collide with Vite.
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 8787);
app.listen(port, () => console.log(`trip-rescue api on http://localhost:${port}`));
