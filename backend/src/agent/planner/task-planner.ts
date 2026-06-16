export class TaskPlanner {
  createPlan(objective: string) {
    const normalized = objective.toLowerCase();
    const steps = [
      "Clarify objective and constraints",
      "Collect relevant context from tools and available knowledge",
      "Execute the most relevant tool-assisted actions",
      "Synthesize findings into a final answer"
    ];

    if (/\b(calculate|sum|multiply|divide|equation)\b/.test(normalized)) {
      steps[2] = "Execute the required calculation or structured query";
    } else if (/\b(repo|repository|code|source|file)\b/.test(normalized)) {
      steps[1] = "Inspect repository and file context relevant to the objective";
    } else if (/\b(doc|docs|documentation|readme|guide)\b/.test(normalized)) {
      steps[1] = "Inspect documentation and written guidance relevant to the objective";
    }

    return steps.map((step, index) => ({
      id: `step-${index + 1}`,
      title: step,
      rationale: objective
    }));
  }
}
