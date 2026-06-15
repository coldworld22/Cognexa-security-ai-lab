import { Request, Response } from "express";

import { MemoryService } from "../../services/memory/memory.service";

export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  getContext = async (request: Request, response: Response) => {
    const context = await this.memory.getUserContext(request.auth!.userId);
    response.json(context);
  };

  savePreference = async (request: Request, response: Response) => {
    const preference = await this.memory.savePreference(
      request.auth!.userId,
      request.body.key as string,
      request.body.value as string
    );
    response.status(201).json({ preference });
  };
}
