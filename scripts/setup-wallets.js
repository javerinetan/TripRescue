import fs from "node:fs";
import path from "node:path";
import xrpl from "xrpl";

const envPath = path.resolve(".env");
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const values = Object.fromEntries(existing.split(/\r?\n/).filter(Boolean).map((line) => {
  const split = line.indexOf("=");
  return split < 0 ? [line, ""] : [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, "")];
}));

function append(name, value) {
  const prefix = fs.existsSync(envPath) && fs.statSync(envPath).size > 0 ? "\n" : "";
  fs.appendFileSync(envPath, `${prefix}${name}="${value}"`, { encoding: "utf8", mode: 0o600 });
  values[name] = value;
}

function ensureWallet(name) {
  if (values[name]) return xrpl.Wallet.fromSeed(values[name]);
  const wallet = xrpl.Wallet.generate();
  append(name, wallet.seed);
  return wallet;
}

const agent = ensureWallet("XRPL_AGENT_SEED");
const merchant = ensureWallet("XRPL_MERCHANT_SEED");
if (!values.PORT) append("PORT", "8787");
if (!values.XRPL_NETWORK) append("XRPL_NETWORK", "testnet");
if (!values.XRPL_RPC) append("XRPL_RPC", "wss://s.altnet.rippletest.net:51233");
if (!values.XRPL_EXPLORER) append("XRPL_EXPLORER", "https://testnet.xrpl.org/transactions");

const client = new xrpl.Client(values.XRPL_RPC || "wss://s.altnet.rippletest.net:51233");
await client.connect();
try {
  async function ensureFunded(wallet, label) {
    try {
      const balance = await client.getXrpBalance(wallet.address);
      return { label, address: wallet.address, balance };
    } catch {
      const funded = await client.fundWallet(wallet);
      return { label, address: wallet.address, balance: funded.balance };
    }
  }
  const results = [await ensureFunded(agent, "Agent"), await ensureFunded(merchant, "Merchant")];
  for (const result of results) console.log(`${result.label}: ${result.address} (${result.balance} XRP testnet)`);
  console.log("Seeds were saved to .env and were not displayed.");
} finally {
  await client.disconnect();
}

