import path from "path";

import { promises as fs } from "fs";

import { FileRepository } from "../../database/repositories/file.repository";
import { EmbeddingRepository } from "../../database/repositories/embedding.repository";
import { DocumentParserService } from "../../rag/ingestion/document-parser.service";
import { TextChunker } from "../../rag/chunking/text-chunker";
import { RetrievalEngine } from "../../rag/retrieval/retrieval-engine";
import { env } from "../../config/env";

interface UploadDocumentInput {
  userId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export class RagService {
  constructor(
    private readonly files: FileRepository,
    private readonly embeddings: EmbeddingRepository,
    private readonly parser: DocumentParserService,
    private readonly chunker: TextChunker,
    private readonly retrieval: RetrievalEngine
  ) {}

  async ingestDocument(input: UploadDocumentInput) {
    const filePath = path.resolve(process.cwd(), env.UPLOADS_PATH, input.originalName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.buffer);

    const file = await this.files.create({
      userId: input.userId,
      fileName: input.originalName,
      mimeType: input.mimeType,
      path: filePath,
      sizeBytes: input.sizeBytes
    });

    const text = await this.parser.parse(filePath, input.mimeType);
    const chunks = this.chunker.chunk(text).map((content, index) => ({
      fileId: file.id,
      chunkIndex: index,
      content,
      vector: this.createEmbedding(content),
      metadata: {
        fileName: input.originalName
      }
    }));

    await this.embeddings.insertMany(chunks);
    await this.files.updateStatus(file.id, "indexed");

    return {
      file,
      chunkCount: chunks.length
    };
  }

  async retrieve(query: string, limit = 5) {
    return this.retrieval.search(this.createEmbedding(query), limit);
  }

  private createEmbedding(content: string): number[] {
    const vector = new Array(env.EMBEDDING_DIMENSION).fill(0);
    for (let index = 0; index < content.length; index += 1) {
      vector[index % env.EMBEDDING_DIMENSION] += content.charCodeAt(index) / 255;
    }
    return vector.map((value) => Number(value.toFixed(4)));
  }
}
