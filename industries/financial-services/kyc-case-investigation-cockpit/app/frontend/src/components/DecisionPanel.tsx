import { useState } from "react";

interface DecisionPanelProps {
  recommendedAction?: string;
  onSubmit: (action: string, reason: string) => Promise<void>;
}

export function DecisionPanel({
  recommendedAction,
  onSubmit,
}: DecisionPanelProps) {
  const [action, setAction] = useState("Request More Information");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      setError("Enter an analyst reason before confirming the decision.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(action, reason);
      setReason("");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="decision-panel">
      <div>
        <span className="eyebrow">Human decision</span>
        <h3>Record analyst action</h3>
        <p>
          AI output is advisory. Only this explicit analyst confirmation changes
          the case status.
        </p>
      </div>
      {recommendedAction && (
        <div className="recommendation">
          Advisory recommendation: <strong>{recommendedAction}</strong>
        </div>
      )}
      <div className="decision-actions">
        {["Approve", "Request More Information", "Escalate"].map((option) => (
          <button
            className={action === option ? "decision-action decision-action--active" : "decision-action"}
            key={option}
            onClick={() => setAction(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Analyst reason"
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explain the evidence and reasoning for this decision..."
        value={reason}
      />
      {error && <div className="form-error">{error}</div>}
      <button
        className="primary-button"
        disabled={saving}
        onClick={submit}
        type="button"
      >
        {saving ? "Recording decision..." : `Confirm ${action}`}
      </button>
    </section>
  );
}
