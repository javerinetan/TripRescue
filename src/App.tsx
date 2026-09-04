import PaymentFlow from "./PaymentFlow";

export default function App() {
  return (
    <main className="shell">
      <header className="masthead">
        <h1>Trip Rescue</h1>
        <p>When one booking breaks, fix the whole trip.</p>
      </header>
      {/* Min Xie: trip graph and cascade view mount above this line. */}
      <PaymentFlow />
    </main>
  );
}
