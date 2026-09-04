// The x402 exchange, shown as it actually happened.
//
// The 402 challenge and the payment proof are the technically interesting part
// of this product and they are normally invisible. This panel prints the real
// headers and decoded payloads so a reviewer can read the protocol rather than
// take our word for it.

import { useState } from "react";
import type { WireExchange } from "./api";

export default function WireInspector({ exchanges }: { exchanges: WireExchange[] }) {
  const [open, setOpen] = useState(true);
  if (exchanges.length === 0) return null;

  return (
    <section className="panel wire">
      <button className="panel-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="panel-title">x402 exchange</span>
        <span className="panel-sub">{exchanges.length} messages on the wire</span>
        <span className={`chevron ${open ? "open" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="wire-body">
          {exchanges.map((message, index) => (
            <div key={index} className={`wire-msg ${message.dir}`}>
              <div className="wire-line">
                <span className="arrow">{message.dir === "out" ? "→" : "←"}</span>
                <span className="wire-label">{message.label}</span>
                {message.header && <code className="wire-header">{message.header}</code>}
                {message.note && <span className="wire-note">{message.note}</span>}
              </div>
              {message.payload != null && (
                <pre className="wire-payload">{JSON.stringify(message.payload, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
