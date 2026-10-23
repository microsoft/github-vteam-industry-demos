export type Segment = 'healthy' | 'watchlist' | 'high'
export type Account = {
  id: string; name: string; industry: string; region: string; arr: number; currency: string
  plan: string; owner: string; seats_licensed: number; seats_active: number
  weekly_active_users: number[]; usage_weeks: string[]
  features: { name: string; adoption_percent: number }[]
  renewal_date: string; contract_start: string; renewal_terms: string
  csat: number; sentiment: string; last_touchpoint: string; context: string
  positive_evidence: string[]; missing_evidence: string[]; notes: string
  contact: { name: string; role: string; email: string }
  support: { open_cases: number; critical_cases: number; issues: {
    id: string; title: string; severity: string; status: string; opened_date: string; detail: string
  }[] }
  recent_activity: { date: string; title: string; detail: string }[]
}
export type Health = {
  score: number; segment: Segment; disclaimer: string
  components: { name: string; points: number; maximum: number; evidence: string }[]
}
export type Risk = {
  risk_level: Segment; explanation: string; top_risk_drivers: string[]
  positive_signals: string[]; renewal_concerns: string[]
  confidence: { level: string; rationale: string; limitations: string[] }
}
export type Plan = {
  recommended_actions: { action: string; priority: string; owner_role: string; suggested_timeframe: string; rationale: string }[]
  plan_30_days: { period: string; goal: string; actions: string[] }[]
  renewal_talking_points: string[]; draft_outreach_email: { subject: string; body: string }
  limitations: string[]; human_approval_required: boolean
}
export type Envelope<T> = {
  output: T; response_id: string; at: string; agent: string; model: string
  source: string; api_version: string; risk_response_id: string | null
}
export type Summary = { account: Account; health: Health; revision: number }
export type Detail = Summary & {
  risk: Envelope<Risk> | null; plan: Envelope<Plan> | null
  edits: { subject?: string; body?: string; notes?: string }
  action_states: Record<string, { status: string; accepted_at?: string; completed_at?: string }>
  history: { id: number; at: string; title: string; detail: string }[]; updated_at: string
}
export type HealthStatus = {
  account_count: number
  agents: { configured: boolean; auth_mode: string; runtime_verified_this_process: Record<string, string> }
}
