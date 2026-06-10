import { Module } from "@nestjs/common";

import { PrismaDocumentRepository } from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { BullMqDocumentIngestionQueue } from "./document-queue.service";
import { loadDocumentsConfig } from "./documents.config";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import {
  DOCUMENT_INGESTION_QUEUE,
  DOCUMENT_REPOSITORY
} from "./documents.tokens";
import { LocalDocumentStorage } from "./local-document-storage.service";

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [
    { provide: "DOCUMENTS_CONFIG", useFactory: loadDocumentsConfig },
    {
      provide: DOCUMENT_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<typeof PrismaDocumentRepository>[0]
      ): PrismaDocumentRepository => new PrismaDocumentRepository(database)
    },
    {
      provide: DOCUMENT_INGESTION_QUEUE,
      useExisting: BullMqDocumentIngestionQueue
    },
    BullMqDocumentIngestionQueue,
    {
      provide: LocalDocumentStorage,
      inject: ["DOCUMENTS_CONFIG"],
      useFactory: (
        config: ConstructorParameters<typeof LocalDocumentStorage>[0]
      ): LocalDocumentStorage => new LocalDocumentStorage(config)
    },
    DocumentsService
  ],
  exports: [DOCUMENT_REPOSITORY, DOCUMENT_INGESTION_QUEUE]
})
export class DocumentsModule {}
