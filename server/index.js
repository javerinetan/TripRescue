import "dotenv/config";
import cors from "cors";
import express from "express";
import { publicWallets } from "./xrpl.js";

const app = express();
app.use(cors());
app.use(express.json());

// Liveness plus a check that both XRPL wallets loaded from .env.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", product: "trip-rescue", wallets: publicWallets() });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`trip-rescue api on http://localhost:${port}`));
