import { Request, Response } from "express";

import { LLMService } from "../../services/llm/llm.service";

export class LLMController {
  constructor(private readonly llm: LLMService) {}

  listProviders = async (_request: Request, response: Response) => {
    const providers = await this.llm.listProviders();
    response.json({
      providers
    });
  };
}
