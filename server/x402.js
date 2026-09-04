// x402 protocol layer for the XRPL scheme.
//
// Header and payload names follow the XRPL x402 specification
// (https://xrpl-x402.t54.ai/docs/xrpl-scheme) rather than the placeholder names
// first sketched in docs/API_CONTRACT.md:
//
//   PAYMENT-REQUIRED    server -> client   base64 JSON payment challenge
//   PAYMENT-SIGNATURE   client -> server   base64 JSON signed payment payload
//   PAYMENT-RESPONSE    server -> client   base64 JSON settlement result
//
// Networks are CAIP-2 identifiers: xrpl:0 Mainnet, xrpl:1 Testnet, xrpl:2 Devnet.

export const X402_VERSION = 2;
export const HEADER_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_RESPONSE = "PAYMENT-RESPONSE";

export const SCHEME = "exact";
export const NETWORK_TESTNET = "xrpl:1";
export const ASSET_XRP = "XRP";

// Requirements stay claimable for this long before the supplier rejects them.
export const MAX_TIMEOUT_SECONDS = 600;

export function encodeHeader(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeHeader(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// An invoice id binds one payment to exactly one recovery and one offer, so a
// receipt for a different offer can never unlock this resource.
export function invoiceIdFor(recoveryId, offerId) {
  return `${recoveryId}:${offerId}`;
}

export function buildPaymentRequirements({ offer, payTo, sourceTag, recoveryId, issuedAt = new Date() }) {
  const expiresAt = new Date(issuedAt.getTime() + MAX_TIMEOUT_SECONDS * 1000);
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: SCHEME,
        network: NETWORK_TESTNET,
        asset: ASSET_XRP,
        payTo,
        amount: offer.amountDrops,
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        resource: offer.resourcePath,
        description: offer.description,
        extra: {
          invoiceId: invoiceIdFor(recoveryId, offer.id),
          sourceTag,
        },
      },
    ],
    expiresAt: expiresAt.toISOString(),
  };
}

// The UI and docs/API_CONTRACT.md speak PaymentRequirement; the wire speaks the
// x402 accepts entry. This is the single translation point between them.
export function toContractRequirement(requirements, { requirementId }) {
  const accepted = requirements.accepts[0];
  return {
    requirementId,
    scheme: accepted.scheme,
    network: accepted.network,
    asset: accepted.asset,
    amountDrops: accepted.amount,
    destination: accepted.payTo,
    memo: accepted.extra.invoiceId,
    expiresAt: requirements.expiresAt,
  };
}

export function parsePaymentSignature(headerValue) {
  const payload = decodeHeader(headerValue);
  if (!payload) return { ok: false, reason: "PAYMENT-SIGNATURE is missing or not base64 JSON." };
  if (payload.x402Version !== X402_VERSION) {
    return { ok: false, reason: `Unsupported x402Version ${payload.x402Version}.` };
  }
  const blob = payload.payload?.signedTxBlob;
  if (typeof blob !== "string" || blob.length === 0) {
    return { ok: false, reason: "payload.signedTxBlob is missing." };
  }
  return { ok: true, accepted: payload.accepted, signedTxBlob: blob };
}

export function buildPaymentSignature({ accepted, signedTxBlob }) {
  return { x402Version: X402_VERSION, accepted, payload: { signedTxBlob } };
}
