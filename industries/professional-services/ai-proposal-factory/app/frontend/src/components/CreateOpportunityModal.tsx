import { useEffect, useState, type FormEvent } from "react";
import type { OpportunityCreate } from "../types";

type Props = {
  onCancel: () => void;
  onSave: (payload: OpportunityCreate) => Promise<void>;
};

type FormState = {
  customer: string;
  name: string;
  industry: string;
  estimated_value: string;
  delivery_duration: string;
  business_problem: string;
  expected_outcomes: string;
  scope: string;
  stakeholders: string;
  constraints: string;
  target_timeline: string;
  budget_assumptions: string;
  notes: string;
};

const initialState: FormState = {
  customer: "",
  name: "",
  industry: "",
  estimated_value: "",
  delivery_duration: "",
  business_problem: "",
  expected_outcomes: "",
  scope: "",
  stakeholders: "",
  constraints: "",
  target_timeline: "",
  budget_assumptions: "",
  notes: "",
};

const requiredFields = {
  customer: "Customer name",
  name: "Opportunity name",
  industry: "Industry",
  business_problem: "Business problem",
  scope: "Scope",
} as const;

const lines = (value: string) =>
  value.split("\n").map((item) => item.trim()).filter(Boolean);

export function CreateOpportunityModal({ onCancel, onSave }: Props) {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, saving]);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    Object.entries(requiredFields).forEach(([field, label]) => {
      const key = field as keyof typeof requiredFields;
      if (!form[key].trim()) nextErrors[key] = `${label} is required.`;
    });
    if (form.customer.trim().length === 1) nextErrors.customer = "Use at least 2 characters.";
    if (form.name.trim().length === 1) nextErrors.name = "Use at least 2 characters.";
    if (form.industry.trim().length === 1) nextErrors.industry = "Use at least 2 characters.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setSubmitError("");
    try {
      await onSave({
        customer: form.customer.trim(),
        name: form.name.trim(),
        industry: form.industry.trim(),
        estimated_value: form.estimated_value.trim(),
        delivery_duration: form.delivery_duration.trim(),
        business_problem: form.business_problem.trim(),
        expected_outcomes: lines(form.expected_outcomes),
        scope: form.scope.trim(),
        stakeholders: lines(form.stakeholders),
        constraints: lines(form.constraints),
        target_timeline: form.target_timeline.trim(),
        budget_assumptions: form.budget_assumptions.trim(),
        notes: form.notes.trim(),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The opportunity could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: keyof FormState) =>
    errors[field] ? <span className="field-error">{errors[field]}</span> : null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onCancel();
    }}>
      <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-opportunity-title">
        <header>
          <div>
            <p className="eyebrow">NEW CUSTOMER OPPORTUNITY</p>
            <h2 id="create-opportunity-title">Create opportunity</h2>
            <p>Capture enough context to select meeting notes and start proposal generation.</p>
          </div>
          <button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Close create opportunity">×</button>
        </header>
        <form onSubmit={submit} noValidate>
          {submitError && <div className="form-error">{submitError}</div>}
          <div className="create-form-grid">
            <label>Customer name <b>*</b>
              <input autoFocus value={form.customer} onChange={(event) => update("customer", event.target.value)} aria-invalid={Boolean(errors.customer)} />
              {fieldError("customer")}
            </label>
            <label>Opportunity name <b>*</b>
              <input value={form.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} />
              {fieldError("name")}
            </label>
            <label>Industry <b>*</b>
              <input value={form.industry} onChange={(event) => update("industry", event.target.value)} aria-invalid={Boolean(errors.industry)} placeholder="e.g. Financial Services" />
              {fieldError("industry")}
            </label>
            <label>Estimated value
              <input value={form.estimated_value} onChange={(event) => update("estimated_value", event.target.value)} placeholder="e.g. €450K" />
            </label>
            <label>Target timeline
              <input value={form.target_timeline} onChange={(event) => update("target_timeline", event.target.value)} placeholder="e.g. Start Q1, launch in 6 months" />
            </label>
            <label>Expected delivery duration
              <input value={form.delivery_duration} onChange={(event) => update("delivery_duration", event.target.value)} placeholder="e.g. 24 weeks" />
            </label>
            <label className="full">Business problem <b>*</b>
              <textarea value={form.business_problem} onChange={(event) => update("business_problem", event.target.value)} aria-invalid={Boolean(errors.business_problem)} />
              {fieldError("business_problem")}
            </label>
            <label className="full">Expected outcomes
              <textarea value={form.expected_outcomes} onChange={(event) => update("expected_outcomes", event.target.value)} placeholder="One outcome per line" />
            </label>
            <label className="full">Scope <b>*</b>
              <textarea value={form.scope} onChange={(event) => update("scope", event.target.value)} aria-invalid={Boolean(errors.scope)} />
              {fieldError("scope")}
            </label>
            <label>Stakeholders
              <textarea value={form.stakeholders} onChange={(event) => update("stakeholders", event.target.value)} placeholder="One stakeholder per line" />
            </label>
            <label>Constraints
              <textarea value={form.constraints} onChange={(event) => update("constraints", event.target.value)} placeholder="One constraint per line" />
            </label>
            <label className="full">Budget / effort assumptions
              <textarea value={form.budget_assumptions} onChange={(event) => update("budget_assumptions", event.target.value)} />
            </label>
            <label className="full">Additional notes
              <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
            </label>
          </div>
          <footer>
            <span><b>*</b> Required fields</span>
            <div>
              <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving opportunity…" : "Create opportunity"}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
