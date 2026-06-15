import { readFile } from "fs/promises";
import path from "path";

export class DocumentParserService {
  async parse(filePath: string, mimeType: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();

    if (mimeType === "text/plain" || extension === ".txt") {
      return readFile(filePath, "utf-8");
    }

    if (extension === ".pdf") {
      return `PDF parsing placeholder for ${path.basename(filePath)}. Replace with a pdf parser adapter in production.`;
    }

    if (extension === ".docx") {
      return `DOCX parsing placeholder for ${path.basename(filePath)}. Replace with a docx parser adapter in production.`;
    }

    return readFile(filePath, "utf-8").catch(() => "");
  }
}
