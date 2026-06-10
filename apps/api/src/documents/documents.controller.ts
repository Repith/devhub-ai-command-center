import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import {
  uuidSchema,
  type Document,
  type DocumentChunkList,
  type DocumentList
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { maxDocumentUploadBytes } from "./documents.config";
import { DocumentsService } from "./documents.service";
import type { UploadedMultipartFile } from "./documents.service";

@Controller("documents")
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
  public constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService
  ) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  public list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<DocumentList> {
    return this.documents.list(principal);
  }

  @Get(":documentId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public get(
    @CurrentUser() principal: RequestPrincipal,
    @Param("documentId", new ZodValidationPipe(uuidSchema)) documentId: string
  ): Promise<Document> {
    return this.documents.get(principal, documentId);
  }

  @Get(":documentId/chunks")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public chunks(
    @CurrentUser() principal: RequestPrincipal,
    @Param("documentId", new ZodValidationPipe(uuidSchema)) documentId: string
  ): Promise<DocumentChunkList> {
    return this.documents.listChunks(principal, documentId);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: maxDocumentUploadBytes }
    })
  )
  public upload(
    @CurrentUser() principal: RequestPrincipal,
    @UploadedFile() file?: UploadedMultipartFile
  ): Promise<Document> {
    return this.documents.upload(principal, file);
  }
}
