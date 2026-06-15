export class TextChunker {
  chunk(content: string, size = 1_000, overlap = 150): string[] {
    if (!content.trim()) {
      return [];
    }

    const chunks: string[] = [];
    let cursor = 0;

    while (cursor < content.length) {
      const end = Math.min(cursor + size, content.length);
      chunks.push(content.slice(cursor, end));
      if (end >= content.length) {
        break;
      }
      cursor = Math.max(end - overlap, cursor + 1);
    }

    return chunks;
  }
}
