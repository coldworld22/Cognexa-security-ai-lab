import { readFile } from "fs/promises";
import path from "path";

import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import { AppError } from "../../utils/app-error";

export class DocumentParserService {
  async parse(filePath: string, mimeType: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();

    if (mimeType === "text/plain" || extension === ".txt") {
      return readFile(filePath, "utf-8");
    }

    if (extension === ".pdf") {
      const buffer = await readFile(filePath);
      const parsed = await pdfParse(buffer);
      const normalized = this.normalizeWhitespace(parsed.text);
      if (!normalized) {
        throw new AppError(`No extractable text found in PDF ${path.basename(filePath)}`, 422);
      }

      return normalized;
    }

    if (extension === ".docx") {
      const parsed = await mammoth.extractRawText({
        path: filePath
      });
      const normalized = this.normalizeWhitespace(parsed.value);
      if (!normalized) {
        throw new AppError(
          `No extractable text found in DOCX ${path.basename(filePath)}`,
          422
        );
      }

      return normalized;
    }

    const fallbackText = await readFile(filePath, "utf-8").catch(() => "");
    const normalized = this.normalizeWhitespace(fallbackText);
    if (!normalized) {
      throw new AppError(
        `Unsupported or empty document content for ${path.basename(filePath)}`,
        415
      );
    }

    return normalized;
  }

  private normalizeWhitespace(input: string): string {
    return input
      .replace(/\u0000/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
}
