interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "amber" | "green";
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
}: MetricCardProps) {
  return (
    <article className={`metric metric--${tone}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}</div>
      <div className="metric__detail">{detail}</div>
    </article>
  );
}
