import { BaseVectorStore } from "../base-vector-store";

export class RetrievalEngine {
  constructor(private readonly vectorStore: BaseVectorStore) {}

  async search(queryVector: number[], limit = 5) {
    return this.vectorStore.search(queryVector, limit);
  }
}
