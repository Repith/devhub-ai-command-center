import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { Injectable } from "@nestjs/common";

import type { DocumentsConfig } from "./documents.config";

@Injectable()
export class LocalDocumentStorage {
  public constructor(private readonly config: DocumentsConfig) {}

  public getPath(storageKey: string): string {
    const safeKey = normalize(storageKey).replace(/^(\.\.[/\\])+/, "");
    return join(this.config.storageDir, safeKey);
  }

  public async write(storageKey: string, buffer: Buffer): Promise<void> {
    const path = this.getPath(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer, { flag: "wx" });
  }
}
