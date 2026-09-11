interface InvestigationProgressProps {
  stages: string[];
  activeIndex: number;
}

export function InvestigationProgress({
  stages,
  activeIndex,
}: InvestigationProgressProps) {
  return (
    <div className="investigation-progress" aria-live="polite">
      {stages.map((stage, index) => (
        <div
          className={index <= activeIndex ? "progress-step progress-step--done" : "progress-step"}
          key={stage}
        >
          <span>{index < activeIndex ? "✓" : index + 1}</span>
          {stage}
        </div>
      ))}
    </div>
  );
}
