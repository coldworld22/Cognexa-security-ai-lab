import { Request, Response } from "express";

import { RagService } from "../../services/rag/rag.service";

export class RagController {
  constructor(private readonly rag: RagService) {}

  upload = async (request: Request, response: Response) => {
    const file = request.file;
    if (!file) {
      response.status(400).json({ error: "No file uploaded" });
      return;
    }

    const result = await this.rag.ingestDocument({
      actor: request.auth!,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      buffer: file.buffer
    });

    response.status(201).json(result);
  };

  retrieve = async (request: Request, response: Response) => {
    const matches = await this.rag.retrieve(
      request.auth!,
      request.body.query as string,
      request.body.limit as number
    );
    response.json({ matches });
  };
}
