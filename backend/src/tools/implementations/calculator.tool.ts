import { BaseTool } from "../base-tool";

interface CalculatorInput {
  expression: string;
}

export class CalculatorTool extends BaseTool<CalculatorInput, { result: number }> {
  readonly metadata = {
    name: "calculator",
    description: "Evaluate simple arithmetic expressions.",
    category: "math" as const,
    inputSchema: {
      expression: "string"
    }
  };

  async execute(input: CalculatorInput) {
    if (!/^[0-9+\-*/().\s]+$/.test(input.expression)) {
      throw new Error("Expression contains unsupported characters");
    }

    const result = Function(`"use strict"; return (${input.expression});`)() as number;
    return { result };
  }
}
