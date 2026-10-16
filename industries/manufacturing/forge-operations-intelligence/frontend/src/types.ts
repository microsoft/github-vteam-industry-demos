export interface Site { id: string; name: string; location: string; specialty: string }
export interface Line {
  id: string; site_id: string; name: string; planned_minutes: number; downtime_minutes: number;
  ideal_rate: number; output: number; rejects: number; target: number;
}
export interface Machine {
  id: string; line_id: string; name: string; health: string; utilization: number;
  last_maintenance: string; alert: string;
}
export interface Telemetry {
  id: string; machine_id: string; timestamp: string; vibration_mm_s: number;
  temperature_c: number; pressure_bar: number; cycle_seconds: number; fault_code: string | null;
}
export interface Attribution { response_id: string; model: string; agent: string; version: string; timestamp: string }
export interface Hypothesis { suspected_cause: string; evidence: string[]; confidence: number; uncertainty: string }
export interface Investigation {
  summary: string; facts: string[]; hypotheses: Hypothesis[]; business_impact: string;
  questions: string[]; qualified_human_review_required: true;
}
export interface Action {
  priority: number; action: string; owner_role: string; urgency: 'immediate_review' | 'planned';
  expected_benefit: string; safety_checks: string[];
}
export interface Plan {
  summary: string; actions: Action[]; preventive_steps: string[];
  qualified_human_review_required: true; approved: false;
}
export interface Result<T> { content: T; attribution: Attribution; edited: boolean }
export interface Review { reviewer: string; comment: string; timestamp: string }
export interface Incident {
  id: string; machine_id: string; title: string; severity: string; fault_code: string;
  downtime_minutes: number; timestamp: string; impact: string; notes: string; state: string; revision: number;
  investigation: Result<Investigation> | null; investigation_review: Review | null;
  plan: Result<Plan> | null; approval: Review | null;
}
export interface Activity {
  id: string; timestamp: string; incident_id: string | null; kind: string; message: string;
  actor: string; attribution?: Attribution | null;
}
export interface Job {
  id: string; incident_id: string; key: string; status: string; progress: string;
  started_at: string; finished_at?: string; attribution?: Attribution; result?: Result<Investigation | Plan>;
}
export interface AIState {
  active_job: string | null; next_eligible_at: string | null; cooldown_seconds: number; calls_today: number;
  daily_limit: number; agents: { key: string; name: string; version: string; last_call: Job | null }[];
}
export interface Metrics {
  oee: number; availability: number; performance: number; quality: number;
  downtime: number; output: number; target: number; rejects: number;
}
export interface State {
  sites: Site[]; lines: Line[]; machines: Machine[]; telemetry: Telemetry[]; incidents: Incident[];
  activity: Activity[]; jobs: Record<string, Job>; ai: AIState; snapshot_at: string; server_time: string;
}
