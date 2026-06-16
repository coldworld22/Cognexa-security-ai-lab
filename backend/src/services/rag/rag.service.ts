import path from "path";
import { randomUUID } from "crypto";

import { promises as fs } from "fs";

import { AccessContext } from "../../authorization/authorization.types";
import { FileRepository } from "../../database/repositories/file.repository";
import { EmbeddingRepository } from "../../database/repositories/embedding.repository";
import { EmbeddingService } from "../../rag/embedding/embedding.service";
import { DocumentParserService } from "../../rag/ingestion/document-parser.service";
import { TextChunker } from "../../rag/chunking/text-chunker";
import { env } from "../../config/env";
import { resolveBackendPath } from "../../utils/paths";
import { AppError } from "../../utils/app-error";
import { AuthorizationService } from "../authorization/authorization.service";
import { RetrievalContextService } from "./retrieval-context.service";

interface UploadDocumentInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export class RagService {
  constructor(
    private readonly files: FileRepository,
    private readonly embeddings: EmbeddingRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly parser: DocumentParserService,
    private readonly chunker: TextChunker,
    private readonly authorization: AuthorizationService,
    private readonly retrievalContext: RetrievalContextService
  ) {}

  async ingestDocument(input: UploadDocumentInput & { actor: AccessContext }) {
    await this.authorization.assertPermission(input.actor, "rag", {
      layer: "service",
      resource: "rag.documents",
      action: "upload_document",
      reason: "Document ingestion requires 'rag' permission"
    });

    const storedFileName = `${randomUUID()}-${this.sanitizeFileName(input.originalName)}`;
    const filePath = path.resolve(
      resolveBackendPath(env.UPLOADS_PATH),
      storedFileName
    );
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.buffer);

    const file = await this.files.create({
      workspaceId: input.actor.workspaceId,
      userId: input.actor.userId,
      fileName: input.originalName,
      mimeType: input.mimeType,
      path: filePath,
      sizeBytes: input.sizeBytes
    });

    const text = await this.parser.parse(filePath, input.mimeType);
    const chunkContents = this.chunker.chunk(text);
    if (chunkContents.length === 0) {
      throw new AppError("No text chunks were produced from the uploaded document", 422);
    }

    const vectors = await this.embeddingService.embedDocuments(chunkContents);
    const chunks = chunkContents.map((content, index) => ({
      workspaceId: input.actor.workspaceId,
      fileId: file.id,
      chunkIndex: index,
      content,
      vector: vectors[index]!.vector,
      metadata: {
        workspaceId: input.actor.workspaceId,
        userId: input.actor.userId,
        fileId: file.id,
        fileName: input.originalName,
        storedFileName,
        chunkIndex: index,
        embeddingModel: vectors[index]!.model,
        embeddingProvider: vectors[index]!.provider,
        embeddingDimensions: vectors[index]!.dimensions
      }
    }));

    await this.embeddings.insertMany(chunks);
    await this.files.updateStatus(file.id, "indexed");

    return {
      file,
      chunkCount: chunks.length
    };
  }

  async retrieve(actor: AccessContext, query: string, limit = 5) {
    await this.authorization.assertPermission(actor, "rag", {
      layer: "service",
      resource: "rag.retrieve",
      action: "retrieve_context",
      reason: "Retrieval requires 'rag' permission"
    });

    return this.retrievalContext.retrieveChunkMatches({
      workspaceId: actor.workspaceId,
      query,
      limit
    });
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  }
}
