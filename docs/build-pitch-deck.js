const pptxgen = require("pptxgenjs");

const INK = "0E1A2B";
const INK_SOFT = "1B2A3F";
const PAPER = "FFFFFF";
const SURFACE = "F2F5F8";
const LINE = "DCE3EA";
const TEXT = "16202C";
const MUTED = "5D6B7C";
const AGENT = "3B6FE0";
const BROKEN = "D14B4B";
const RISK = "D99A2B";
const SAFE = "1E9E63";
const ICE = "C6D4E6";

const H = "Cambria";
const B = "Calibri";

const W = 13.33;
const M = 0.7;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Team Peanutss";
pres.title = "Trip Rescue";

// ---------- helpers ----------

function dot(slide, x, y, color, size = 0.17) {
  slide.addShape(pres.ShapeType.ellipse, {
    x, y, w: size, h: size, fill: { color },
  });
}

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: INK };
  return s;
}

function lightSlide(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: 11.9, h: 0.26,
      fontFace: B, fontSize: 11, bold: true, color: AGENT,
      charSpacing: 2, isTextBox: true, margin: 0,
    });
  }
  if (title) {
    s.addText(title, {
      x: M, y: kicker ? 0.72 : 0.5, w: 11.9, h: 0.85,
      fontFace: H, fontSize: 34, bold: true, color: TEXT,
      isTextBox: true, margin: 0,
    });
  }
  return s;
}

function card(slide, x, y, w, h, fill = SURFACE) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: fill }, line: { color: LINE, width: 1 },
  });
}

// ---------- 1. Title ----------
{
  const s = darkSlide();

  // Status-dot motif: the trip, breaking left to right.
  const dots = [BROKEN, BROKEN, RISK, RISK, BROKEN];
  dots.forEach((c, i) => {
    dot(s, M + i * 0.46, 1.62, c, 0.2);
    if (i < dots.length - 1) {
      s.addShape(pres.ShapeType.line, {
        x: M + 0.2 + i * 0.46, y: 1.72, w: 0.26, h: 0,
        line: { color: "3A4A5F", width: 1.5 },
      });
    }
  });

  s.addText("Trip Rescue", {
    x: M, y: 2.15, w: 11.9, h: 1.35,
    fontFace: H, fontSize: 68, bold: true, color: PAPER,
    isTextBox: true, margin: 0,
  });

  s.addText("When one booking breaks, fix the whole trip.", {
    x: M, y: 3.5, w: 11.9, h: 0.6,
    fontFace: B, fontSize: 25, color: ICE,
    isTextBox: true, margin: 0,
  });

  s.addText("Travel providers understand their booking. Trip Rescue understands your trip.", {
    x: M, y: 4.15, w: 10, h: 0.45,
    fontFace: B, fontSize: 15, color: MUTED, italic: true,
    isTextBox: true, margin: 0,
  });

  s.addShape(pres.ShapeType.line, {
    x: M, y: 5.4, w: 3.2, h: 0, line: { color: "31415A", width: 1 },
  });

  s.addText("Team Peanutss   ·   Javerine Tan   ·   Min Xie", {
    x: M, y: 5.6, w: 8, h: 0.35,
    fontFace: B, fontSize: 15, bold: true, color: PAPER,
    isTextBox: true, margin: 0,
  });
  s.addText("SingHacks 2026   ·   Ripple Challenge   ·   AI-native business on the XRP Ledger", {
    x: M, y: 5.98, w: 10, h: 0.35,
    fontFace: B, fontSize: 13, color: MUTED,
    isTextBox: true, margin: 0,
  });

  s.addNotes("Trip Rescue. When one booking breaks, we fix the whole trip. Two of us, Javerine and Min Xie, Team Peanutss.");
}

// ---------- 2. The problem ----------
{
  const s = lightSlide("You didn't buy a trip. You bought five things that depend on each other.", "The problem");

  const chain = [
    ["Flight", "Demo Air"],
    ["Airport bus", "Hakone Express"],
    ["Hotel", "Hakone Springs"],
    ["Rental car", "Hakone Drive"],
    ["Activity", "Fuji Day Tours"],
  ];
  const cw = 2.16;
  chain.forEach(([name, provider], i) => {
    const x = M + i * (cw + 0.28);
    card(s, x, 2.05, cw, 1.15);
    s.addText(name, {
      x: x + 0.16, y: 2.24, w: cw - 0.32, h: 0.3,
      fontFace: B, fontSize: 14, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
    s.addText(provider, {
      x: x + 0.16, y: 2.58, w: cw - 0.32, h: 0.45,
      fontFace: B, fontSize: 11, color: MUTED, isTextBox: true, margin: 0,
    });
    if (i < chain.length - 1) {
      s.addText("→", {
        x: x + cw + 0.02, y: 2.45, w: 0.24, h: 0.3,
        fontFace: B, fontSize: 16, color: MUTED, align: "center", isTextBox: true, margin: 0,
      });
    }
  });

  s.addText("Bought separately. Operationally inseparable.", {
    x: M, y: 3.42, w: 11.9, h: 0.35,
    fontFace: B, fontSize: 14, italic: true, color: MUTED, isTextBox: true, margin: 0,
  });

  card(s, M, 4.1, 5.75, 2.4);
  s.addText("Each provider sees one row", {
    x: M + 0.3, y: 4.32, w: 5.15, h: 0.35,
    fontFace: B, fontSize: 17, bold: true, color: TEXT, isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "The airline knows about the flight.", options: { bullet: true, breakLine: true } },
      { text: "The hotel knows about the room.", options: { bullet: true, breakLine: true } },
      { text: "Nobody holds the dependencies between them.", options: { bullet: true } },
    ],
    {
      x: M + 0.3, y: 4.78, w: 5.15, h: 1.5,
      fontFace: B, fontSize: 14, color: MUTED, paraSpaceAfter: 8, isTextBox: true, margin: 0,
    },
  );

  card(s, M + 6.15, 4.1, 5.75, 2.4, INK);
  s.addText("So the traveller becomes the integration layer", {
    x: M + 6.45, y: 4.32, w: 5.15, h: 0.6,
    fontFace: B, fontSize: 17, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });
  s.addText(
    "At 2am, in an airport, on a dying phone — working out what is still possible, what money is already lost, and what must be secured before anything is cancelled.",
    {
      x: M + 6.45, y: 4.95, w: 5.15, h: 1.35,
      fontFace: B, fontSize: 14, color: ICE, isTextBox: true, margin: 0,
    },
  );

  s.addNotes("Independent travellers assemble a trip from unrelated providers. Each provider only understands its own booking. When something breaks, the traveller has to do the integration themselves.");
}

// ---------- 3. The cascade ----------
{
  const s = lightSlide("One cancellation. Five consequences.", "What actually happens");

  const rows = [
    ["Singapore → Narita flight", "Service cancelled", BROKEN, "Broken"],
    ["Narita → Hakone bus", "Departs before the replacement lands", BROKEN, "Broken"],
    ["Hakone hotel", "No-show risk on a non-refundable night", RISK, "At risk"],
    ["Rental car pickup", "Pickup window passes before arrival", RISK, "At risk"],
    ["Mount Fuji activity", "Prerequisites can no longer be met", BROKEN, "Broken"],
  ];

  // Spine first, dots on top of it.
  s.addShape(pres.ShapeType.line, {
    x: M + 0.11, y: 2.11, w: 0, h: 0.72 * (rows.length - 1),
    line: { color: LINE, width: 1 },
  });
  rows.forEach(([name, why, color, label], i) => {
    const y = 1.95 + i * 0.72;
    dot(s, M + 0.02, y + 0.16, color, 0.18);
    s.addText(name, {
      x: M + 0.42, y: y + 0.02, w: 4.2, h: 0.3,
      fontFace: B, fontSize: 15, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
    s.addText(label.toUpperCase(), {
      x: M + 4.7, y: y + 0.05, w: 1.0, h: 0.26,
      fontFace: B, fontSize: 10, bold: true, color, charSpacing: 1, isTextBox: true, margin: 0,
    });
    s.addText(why, {
      x: M + 5.85, y: y + 0.02, w: 4.5, h: 0.32,
      fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  card(s, 10.75, 1.9, 1.88, 3.7, INK);
  s.addText("3", {
    x: 10.9, y: 2.15, w: 1.6, h: 0.75,
    fontFace: H, fontSize: 52, bold: true, color: BROKEN, align: "center", isTextBox: true, margin: 0,
  });
  s.addText("broken", {
    x: 10.9, y: 2.88, w: 1.6, h: 0.3,
    fontFace: B, fontSize: 13, color: ICE, align: "center", isTextBox: true, margin: 0,
  });
  s.addText("2", {
    x: 10.9, y: 3.6, w: 1.6, h: 0.75,
    fontFace: H, fontSize: 52, bold: true, color: RISK, align: "center", isTextBox: true, margin: 0,
  });
  s.addText("at risk", {
    x: 10.9, y: 4.33, w: 1.6, h: 0.3,
    fontFace: B, fontSize: 13, color: ICE, align: "center", isTextBox: true, margin: 0,
  });
  s.addText("from one\ncancelled flight", {
    x: 10.9, y: 4.85, w: 1.6, h: 0.6,
    fontFace: B, fontSize: 11, color: MUTED, align: "center", isTextBox: true, margin: 0,
  });

  s.addText("The real problem is not \"find me another flight.\" It is \"one booking broke — fix the consequences across my whole trip.\"", {
    x: M, y: 5.95, w: 11.9, h: 0.5,
    fontFace: B, fontSize: 16, italic: true, color: TEXT, isTextBox: true, margin: 0,
  });

  s.addNotes("This is the cascade. One cancellation, and three of five bookings are broken, two more at risk. Our engine computes this deterministically and the tests pin these exact five outcomes.");
}

// ---------- 4. Why it is still unsolved ----------
{
  const s = lightSlide("Plenty of products fix the flight. None fix the trip.", "Where the gap is");

  const players = [
    ["TripIt", "Aggregates every booking into one itinerary and alerts you.", "Then tells you to call the airline yourself."],
    ["Freebird · Navan", "Automatically rebook a disrupted flight, sold through card issuers and corporate travel.", "The flight only. Your hotel, car and activity are still your problem."],
    ["The airline", "Rebooks you onto its own next available service.", "It has never heard of the other four things you bought."],
  ];

  players.forEach(([name, does, stops], i) => {
    const x = M + i * 4.06;
    card(s, x, 2.0, 3.78, 2.85);
    s.addText(name, {
      x: x + 0.28, y: 2.24, w: 3.22, h: 0.35,
      fontFace: B, fontSize: 18, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
    s.addText(does, {
      x: x + 0.28, y: 2.68, w: 3.22, h: 1.0,
      fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0,
    });
    dot(s, x + 0.28, 3.86, BROKEN, 0.13);
    s.addText(stops, {
      x: x + 0.5, y: 3.76, w: 3.0, h: 0.95,
      fontFace: B, fontSize: 13, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
  });

  card(s, M, 5.2, 11.93, 1.15, INK);
  s.addText("Everyone repairs the booking they sold you. We repair the trip you actually have.", {
    x: M + 0.4, y: 5.42, w: 11.1, h: 0.7,
    fontFace: H, fontSize: 22, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });

  s.addNotes("We are not claiming nobody solves flight disruption. Freebird did it and was acquired. Navan does it for corporate. The gap is that all of them stop at one provider's booking. Nobody reasons across independently booked services.");
}

// ---------- 5. The product ----------
{
  const s = lightSlide("You make one decision. The agent does the rest — inside limits you set.", "The product");

  const steps = [
    ["1", "We model the trip", "Bookings plus the dependencies between them, not a flat list."],
    ["2", "We compute the cascade", "What is broken, what is merely at risk, and why."],
    ["3", "You pick a strategy", "Three complete whole-trip recoveries, with their trade-offs shown."],
    ["4", "The agent executes", "Discovers suppliers, decides, pays, and verifies — within your mandate."],
  ];

  steps.forEach(([n, title, body], i) => {
    const y = 1.95 + i * 1.02;
    s.addShape(pres.ShapeType.ellipse, {
      x: M, y, w: 0.46, h: 0.46, fill: { color: AGENT },
    });
    s.addText(n, {
      x: M, y: y + 0.05, w: 0.46, h: 0.34,
      fontFace: B, fontSize: 16, bold: true, color: PAPER, align: "center", isTextBox: true, margin: 0,
    });
    s.addText(title, {
      x: M + 0.68, y: y - 0.02, w: 6.4, h: 0.32,
      fontFace: B, fontSize: 16, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
    s.addText(body, {
      x: M + 0.68, y: y + 0.32, w: 6.4, h: 0.45,
      fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  card(s, 8.15, 1.9, 4.5, 4.35, INK);
  s.addText("RESCUE MANDATE", {
    x: 8.45, y: 2.12, w: 3.9, h: 0.28,
    fontFace: B, fontSize: 11, bold: true, color: AGENT, charSpacing: 2, isTextBox: true, margin: 0,
  });
  s.addText("What you authorise", {
    x: 8.45, y: 2.42, w: 3.9, h: 0.35,
    fontFace: B, fontSize: 17, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });

  const terms = [
    ["Budget", "up to S$300 extra"],
    ["Deadline", "arrive before 12:00"],
    ["Preserve", "the Fuji activity"],
    ["Suppliers", "allow-listed only"],
    ["Network", "XRPL Testnet"],
  ];
  terms.forEach(([k, v], i) => {
    const y = 2.95 + i * 0.46;
    s.addText(k, {
      x: 8.45, y, w: 1.45, h: 0.3,
      fontFace: B, fontSize: 12, color: MUTED, isTextBox: true, margin: 0,
    });
    s.addText(v, {
      x: 9.9, y, w: 2.45, h: 0.3,
      fontFace: B, fontSize: 12, bold: true, color: PAPER, isTextBox: true, margin: 0,
    });
  });

  s.addText("Exceed any of these and the agent stops and comes back to you.", {
    x: 8.45, y: 5.4, w: 3.9, h: 0.7,
    fontFace: B, fontSize: 12, italic: true, color: ICE, isTextBox: true, margin: 0,
  });

  s.addText("Strategic human control. Tactical agent autonomy.", {
    x: M, y: 6.1, w: 7.2, h: 0.4,
    fontFace: H, fontSize: 19, bold: true, color: TEXT, isTextBox: true, margin: 0,
  });

  s.addNotes("The trust model. You are not approving every transaction, and the agent is not unlimited. You authorise a strategy and its boundaries; inside them the agent acts.");
}

// ---------- 6. Priority ----------
{
  const s = lightSlide("The same cancellation should not resolve the same way for everyone.", "What makes it different");

  const cols = [
    ["Leisure", "Keep the cost down", "S$300", "Most reliable", "Protected transfer", "S$48", "cheapest allowed", SAFE],
    ["Business", "Be there for the meeting", "S$600", "Fastest", "Express rail", "S$61", "arrives earliest", AGENT],
    ["Family", "Prefer dependability", "S$450", "Most reliable", "Protected transfer", "S$48", "lowest risk", SAFE],
  ];

  cols.forEach(([label, want, budget, plan, supplier, price, why, color], i) => {
    const x = M + i * 4.06;
    const highlight = i === 1;
    card(s, x, 1.95, 3.78, 3.55, highlight ? INK : SURFACE);
    const fg = highlight ? PAPER : TEXT;
    const dim = highlight ? ICE : MUTED;

    s.addText(label, {
      x: x + 0.28, y: 2.15, w: 3.22, h: 0.35,
      fontFace: B, fontSize: 19, bold: true, color: fg, isTextBox: true, margin: 0,
    });
    s.addText(want, {
      x: x + 0.28, y: 2.52, w: 3.22, h: 0.3,
      fontFace: B, fontSize: 12, italic: true, color: dim, isTextBox: true, margin: 0,
    });

    const pairs = [["Budget", budget], ["Recommended", plan], ["Agent buys", supplier]];
    pairs.forEach(([k, v], j) => {
      const y = 2.98 + j * 0.55;
      s.addText(k, {
        x: x + 0.28, y, w: 3.22, h: 0.24,
        fontFace: B, fontSize: 10, color: dim, charSpacing: 1, isTextBox: true, margin: 0,
      });
      s.addText(v, {
        x: x + 0.28, y: y + 0.22, w: 3.22, h: 0.3,
        fontFace: B, fontSize: 14, bold: true, color: fg, isTextBox: true, margin: 0,
      });
    });

    s.addText(price, {
      x: x + 0.28, y: 4.68, w: 1.4, h: 0.42,
      fontFace: H, fontSize: 26, bold: true, color: highlight ? "6C9BFF" : color, isTextBox: true, margin: 0,
    });
    s.addText(why, {
      x: x + 1.62, y: 4.8, w: 1.9, h: 0.3,
      fontFace: B, fontSize: 11, color: dim, isTextBox: true, margin: 0,
    });
  });

  s.addText("The business traveller's agent knowingly pays S$61 instead of S$48, because arriving earlier is what it was authorised to value.", {
    x: M, y: 5.7, w: 11.9, h: 0.4,
    fontFace: B, fontSize: 15, color: TEXT, isTextBox: true, margin: 0,
  });

  card(s, M, 6.18, 11.93, 0.72);
  dot(s, M + 0.28, 6.42, SAFE, 0.16);
  s.addText("Preference ranks the options. It can never relax a limit — every offer is cleared by deterministic policy first.", {
    x: M + 0.58, y: 6.3, w: 11.1, h: 0.45,
    fontFace: B, fontSize: 13, bold: true, color: TEXT, isTextBox: true, margin: 0,
  });

  s.addNotes("This is our differentiator and the live moment in the demo. Same disruption, change one input, and the agent reaches a different economic decision and pays a different supplier on-chain.");
}

// ---------- 7. Why x402 / XRPL ----------
{
  const s = lightSlide("A card can buy a hotel room. It cannot open an account with a company you have never met.", "Why x402 and XRPL");

  card(s, M, 2.15, 5.75, 3.15);
  s.addText("What a card payment needs first", {
    x: M + 0.3, y: 2.38, w: 5.15, h: 0.35,
    fontFace: B, fontSize: 17, bold: true, color: TEXT, isTextBox: true, margin: 0,
  });
  const needs = [
    "An account with that supplier",
    "An API key or a checkout page",
    "A human to enter the details",
    "A relationship agreed in advance",
  ];
  needs.forEach((t, i) => {
    const y = 2.88 + i * 0.55;
    dot(s, M + 0.3, y + 0.06, "AEB9C9", 0.14);
    s.addText(t, {
      x: M + 0.57, y, w: 4.9, h: 0.35,
      fontFace: B, fontSize: 14, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  card(s, M + 6.18, 2.15, 5.75, 3.15, INK);
  s.addText("What our agent does instead", {
    x: M + 6.48, y: 2.38, w: 5.15, h: 0.35,
    fontFace: B, fontSize: 17, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });
  const flow = [
    "Reads a registry it did not ship with",
    "Meets a supplier it has never seen",
    "Learns the price from its 402 response",
    "Decides, pays, and is served — one round trip",
  ];
  flow.forEach((t, i) => {
    const y = 2.88 + i * 0.55;
    dot(s, M + 6.48, y + 0.06, AGENT, 0.14);
    s.addText(t, {
      x: M + 6.75, y, w: 4.9, h: 0.35,
      fontFace: B, fontSize: 14, color: ICE, isTextBox: true, margin: 0,
    });
  });

  const stats = [
    ["Sub-cent", "fee per settlement"],
    ["~3-5s", "to validated finality"],
    ["Native", "payments and escrow, no contract"],
  ];
  stats.forEach(([big, small], i) => {
    const x = M + i * 4.06;
    s.addText(big, {
      x, y: 5.55, w: 3.78, h: 0.5,
      fontFace: H, fontSize: 30, bold: true, color: AGENT, isTextBox: true, margin: 0,
    });
    s.addText(small, {
      x, y: 6.05, w: 3.78, h: 0.6,
      fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  s.addNotes("This is the slide that answers why not Stripe. The point is not that blockchain is cheaper. It is that no account, no key and no checkout exist between our agent and a supplier it just discovered.");
}

// ---------- 8. The loop ----------
{
  const s = lightSlide("Need, discovery, decision, payment, delivery — in one uninterrupted loop.", "How it works");

  const loop = [
    ["Discover", "Agent reads the supplier registry at runtime"],
    ["Challenge", "Supplier answers 402 with PAYMENT-REQUIRED"],
    ["Decide", "Mandate re-checked: budget, allow-list, deadline"],
    ["Sign", "Agent signs the payment intent — but does not submit"],
    ["Settle", "Supplier submits and waits for XRPL validation"],
    ["Verify", "Supplier re-reads the ledger independently"],
    ["Deliver", "Reservation hold released to the agent"],
    ["Recover", "Itinerary restored, receipt inspectable"],
  ];

  loop.forEach(([title, body], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = M + col * 3.06;
    const y = 2.05 + row * 2.05;
    card(s, x, y, 2.82, 1.72);
    s.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.24, y: y + 0.18, w: 1.0, h: 0.3,
      fontFace: B, fontSize: 12, bold: true, color: AGENT, isTextBox: true, margin: 0,
    });
    s.addText(title, {
      x: x + 0.24, y: y + 0.5, w: 2.35, h: 0.32,
      fontFace: B, fontSize: 16, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
    s.addText(body, {
      x: x + 0.24, y: y + 0.86, w: 2.35, h: 0.75,
      fontFace: B, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  card(s, M, 6.22, 11.93, 0.78, INK);
  s.addText("The agent signs; the supplier settles and verifies. Delivery before payment is structurally impossible, not merely forbidden.", {
    x: M + 0.4, y: 6.4, w: 11.1, h: 0.45,
    fontFace: B, fontSize: 14, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });

  s.addNotes("Eight steps. The important design choice is step four and five: the agent signs but does not submit. The supplier submits, waits for validation, and re-verifies on the ledger before releasing anything.");
}

// ---------- 9. Safeguards ----------
{
  const s = lightSlide("We can break it on stage — and nothing moves.", "Trust and failure handling");

  const faults = [
    ["Supplier goes offline", "Refused at the challenge, before any payment is attempted", "Budget untouched", RISK],
    ["Settlement rejected", "Execution fails, nothing is delivered, reserved budget released", "No money stranded", BROKEN],
    ["Budget exhausted", "Agent halts and returns to the traveller for re-authorisation", "No payment made", RISK],
  ];

  faults.forEach(([title, what, outcome, color], i) => {
    const x = M + i * 4.06;
    card(s, x, 2.0, 3.78, 2.6);
    dot(s, x + 0.28, 2.28, color, 0.16);
    s.addText(title, {
      x: x + 0.56, y: 2.18, w: 3.0, h: 0.35,
      fontFace: B, fontSize: 15, bold: true, color: TEXT, isTextBox: true, margin: 0,
    });
    s.addText(what, {
      x: x + 0.28, y: 2.68, w: 3.22, h: 1.05,
      fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0,
    });
    s.addText(outcome, {
      x: x + 0.28, y: 3.92, w: 3.22, h: 0.35,
      fontFace: B, fontSize: 14, bold: true, color: SAFE, isTextBox: true, margin: 0,
    });
  });

  s.addText("Seven release-blocking invariants, each covered by tests", {
    x: M, y: 4.85, w: 11.9, h: 0.35,
    fontFace: B, fontSize: 16, bold: true, color: TEXT, isTextBox: true, margin: 0,
  });

  const inv = [
    "The agent cannot exceed the mandate",
    "No delivery before verified settlement",
    "Retries cannot double-spend",
    "Mismatched payments unlock nothing",
    "Server state beats client input",
    "Seeds never leave the server",
    "Every decision carries its reason",
  ];
  inv.forEach((t, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = M + col * 3.02;
    const y = 5.32 + row * 0.52;
    dot(s, x, y + 0.06, SAFE, 0.13);
    s.addText(t, {
      x: x + 0.22, y, w: 2.72, h: 0.42,
      fontFace: B, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  s.addText("38 automated tests · deterministic policy · full decision trace in the UI", {
    x: M, y: 6.5, w: 11.9, h: 0.35,
    fontFace: B, fontSize: 13, italic: true, color: MUTED, isTextBox: true, margin: 0,
  });

  s.addNotes("Safeguards you cannot break on demand are just claims. We ship a fault injector. Break it live: money does not move, nothing is delivered, and the reserved budget is released.");
}

// ---------- 10. Proof ----------
{
  const s = darkSlide();

  s.addText("NOT A MOCKUP", {
    x: M, y: 0.62, w: 11.9, h: 0.3,
    fontFace: B, fontSize: 11, bold: true, color: AGENT, charSpacing: 2, isTextBox: true, margin: 0,
  });
  s.addText("Real payments, on the real ledger.", {
    x: M, y: 0.98, w: 11.9, h: 0.7,
    fontFace: H, fontSize: 34, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });

  const txs = [
    ["20482189", "6BA53E5B…31D5", "48000 drops", "leisure priority"],
    ["20482546", "F91CE25D…3971", "48000 drops", "leisure priority"],
    ["20483474", "D399B05B…5D88", "61000 drops", "business priority — different supplier"],
  ];
  s.addText("LEDGER", { x: M, y: 2.0, w: 1.6, h: 0.26, fontFace: B, fontSize: 10, bold: true, color: MUTED, charSpacing: 1, isTextBox: true, margin: 0 });
  s.addText("TRANSACTION", { x: M + 1.7, y: 2.0, w: 2.6, h: 0.26, fontFace: B, fontSize: 10, bold: true, color: MUTED, charSpacing: 1, isTextBox: true, margin: 0 });
  s.addText("AMOUNT", { x: M + 4.6, y: 2.0, w: 2.0, h: 0.26, fontFace: B, fontSize: 10, bold: true, color: MUTED, charSpacing: 1, isTextBox: true, margin: 0 });
  s.addText("RUN", { x: M + 6.9, y: 2.0, w: 4.5, h: 0.26, fontFace: B, fontSize: 10, bold: true, color: MUTED, charSpacing: 1, isTextBox: true, margin: 0 });

  txs.forEach(([ledger, hash, amount, note], i) => {
    const y = 2.42 + i * 0.52;
    s.addShape(pres.ShapeType.line, { x: M, y: y - 0.08, w: 11.9, h: 0, line: { color: "2A3A52", width: 1 } });
    s.addText(ledger, { x: M, y, w: 1.6, h: 0.32, fontFace: "Courier New", fontSize: 13, color: ICE, isTextBox: true, margin: 0 });
    s.addText(hash, { x: M + 1.7, y, w: 2.8, h: 0.32, fontFace: "Courier New", fontSize: 13, bold: true, color: PAPER, isTextBox: true, margin: 0 });
    s.addText(amount, { x: M + 4.6, y, w: 2.2, h: 0.32, fontFace: "Courier New", fontSize: 13, color: SAFE, isTextBox: true, margin: 0 });
    s.addText(note, { x: M + 6.9, y, w: 5.0, h: 0.32, fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0 });
  });

  s.addText("All validated on XRPL Testnet · tesSUCCESS · SourceTag 20260530 · verifiable in the explorer", {
    x: M, y: 4.15, w: 11.9, h: 0.35,
    fontFace: B, fontSize: 13, italic: true, color: MUTED, isTextBox: true, margin: 0,
  });

  const bigs = [["38", "automated tests"], ["3", "failure modes, live"], ["0", "seeds in the browser"]];
  bigs.forEach(([n, l], i) => {
    const x = M + i * 4.06;
    s.addText(n, {
      x, y: 4.95, w: 3.78, h: 0.85,
      fontFace: H, fontSize: 60, bold: true, color: PAPER, isTextBox: true, margin: 0,
    });
    s.addText(l, {
      x, y: 5.85, w: 3.78, h: 0.35,
      fontFace: B, fontSize: 14, color: ICE, isTextBox: true, margin: 0,
    });
  });

  s.addNotes("Three real Testnet transactions, all validated. Note the third: the business priority run settles a different amount to a different supplier, because the agent reached a different decision.");
}

// ---------- 11. Business model ----------
{
  const s = lightSlide("The people who lose most when a trip breaks are not only the traveller.", "The business");

  const tiers = [
    ["Trip Guardian", "Free", "Import bookings, dependency graph, disruption alerts.", "Acquisition and the trip graph itself.", MUTED],
    ["Rescue Pass", "S$10-20 per trip", "Whole-trip recovery, three strategies, bounded autonomous execution.", "Bought at the moment of booking a complex trip.", AGENT],
    ["Distribution", "B2B2C", "Insurers, card issuers, OTAs and corporate travel embed Trip Rescue.", "They already pay for disruption — in claims and in churn.", SAFE],
  ];

  tiers.forEach(([name, price, what, why, color], i) => {
    const x = M + i * 4.06;
    card(s, x, 2.0, 3.78, 3.35, i === 1 ? INK : SURFACE);
    const fg = i === 1 ? PAPER : TEXT;
    const dim = i === 1 ? ICE : MUTED;
    s.addText(name, {
      x: x + 0.28, y: 2.22, w: 3.22, h: 0.35,
      fontFace: B, fontSize: 18, bold: true, color: fg, isTextBox: true, margin: 0,
    });
    s.addText(price, {
      x: x + 0.28, y: 2.62, w: 3.22, h: 0.4,
      fontFace: H, fontSize: 21, bold: true, color: i === 1 ? "6C9BFF" : color, isTextBox: true, margin: 0,
    });
    s.addText(what, {
      x: x + 0.28, y: 3.14, w: 3.22, h: 1.1,
      fontFace: B, fontSize: 13, color: dim, isTextBox: true, margin: 0,
    });
    s.addText(why, {
      x: x + 0.28, y: 4.38, w: 3.22, h: 0.8,
      fontFace: B, fontSize: 12.5, bold: true, italic: true, color: fg, isTextBox: true, margin: 0,
    });
  });

  card(s, M, 5.62, 11.93, 1.25);
  s.addText("Why an insurer cares", {
    x: M + 0.4, y: 5.8, w: 4.0, h: 0.32,
    fontFace: B, fontSize: 14, bold: true, color: TEXT, isTextBox: true, margin: 0,
  });
  s.addText("A claim reimburses a loss after the trip is ruined. Trip Rescue spends a fraction of that to stop the loss happening — and the traveller keeps the holiday they paid for.", {
    x: M + 0.4, y: 6.12, w: 11.1, h: 0.6,
    fontFace: B, fontSize: 13.5, color: MUTED, isTextBox: true, margin: 0,
  });

  s.addNotes("B2C alone is weak because disruption is infrequent. The stronger route is B2B2C. Insurers pay claims, card issuers compete on travel benefits, OTAs lose customers to a ruined trip.");
}

// ---------- 12. Close ----------
{
  const s = darkSlide();

  const dots = [SAFE, SAFE, SAFE, SAFE, SAFE];
  dots.forEach((c, i) => {
    dot(s, M + i * 0.46, 1.5, c, 0.2);
    if (i < dots.length - 1) {
      s.addShape(pres.ShapeType.line, {
        x: M + 0.2 + i * 0.46, y: 1.6, w: 0.26, h: 0,
        line: { color: "2A6B4C", width: 1.5 },
      });
    }
  });
  s.addText("trip recovered", {
    x: M + 2.5, y: 1.42, w: 3.0, h: 0.35,
    fontFace: B, fontSize: 13, italic: true, color: SAFE, isTextBox: true, margin: 0,
  });

  s.addText("\"Don't just make an agent that can pay.\nBuild a business because agents can pay.\"", {
    x: M, y: 2.2, w: 11.5, h: 1.5,
    fontFace: H, fontSize: 30, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });
  s.addText("— the challenge north star", {
    x: M, y: 3.68, w: 6.0, h: 0.35,
    fontFace: B, fontSize: 13, color: MUTED, isTextBox: true, margin: 0,
  });

  s.addText("Remove the agent and the traveller is back to coordinating five providers alone. Remove autonomous payment and every recovery stops at a checkout page.", {
    x: M, y: 4.35, w: 11.0, h: 0.85,
    fontFace: B, fontSize: 17, color: ICE, isTextBox: true, margin: 0,
  });

  s.addShape(pres.ShapeType.line, { x: M, y: 5.6, w: 11.93, h: 0, line: { color: "2A3A52", width: 1 } });

  s.addText("Trip Rescue", {
    x: M, y: 5.82, w: 5.0, h: 0.45,
    fontFace: H, fontSize: 24, bold: true, color: PAPER, isTextBox: true, margin: 0,
  });
  s.addText("When one booking breaks, fix the whole trip.", {
    x: M, y: 6.3, w: 6.5, h: 0.35,
    fontFace: B, fontSize: 14, color: ICE, isTextBox: true, margin: 0,
  });
  s.addText("github.com/javerinetan/TripRescue", {
    x: 7.6, y: 5.9, w: 5.03, h: 0.35,
    fontFace: "Courier New", fontSize: 14, color: AGENT, align: "right", isTextBox: true, margin: 0,
  });
  s.addText("Team Peanutss · Javerine Tan · Min Xie", {
    x: 7.6, y: 6.3, w: 5.03, h: 0.35,
    fontFace: B, fontSize: 13, color: MUTED, align: "right", isTextBox: true, margin: 0,
  });

  s.addNotes("Close on the north star. Remove the agent, or remove autonomous payment, and this product stops working. That is the test the challenge sets.");
}

pres.writeFile({ fileName: "TripRescue.pptx" }).then(() => console.log("wrote TripRescue.pptx"));
