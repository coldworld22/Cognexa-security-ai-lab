export class TaskPlanner {
  createPlan(objective: string) {
    return [
      "Clarify objective and constraints",
      "Collect relevant context from memory and retrieval systems",
      "Select tools or model calls required for execution",
      "Execute steps and synthesize result"
    ].map((step, index) => ({
      id: `step-${index + 1}`,
      title: step,
      rationale: objective
    }));
  }
}
