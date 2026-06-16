export interface RetrievedChunkSource {
  embeddingId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  chunkReference: string;
  score: number;
}

export interface RetrievedChunkMatch extends RetrievedChunkSource {
  content: string;
}

export interface RetrievalContextMetadata {
  query: string;
  sources: RetrievedChunkSource[];
  maxChunks: number;
  similarityThreshold: number;
  maxContextTokens: number;
  usedContextTokens: number;
}

export interface RetrievalPromptContext {
  contextMessage?: string;
  metadata: RetrievalContextMetadata;
}
