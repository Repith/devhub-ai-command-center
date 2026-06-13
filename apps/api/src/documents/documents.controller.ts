import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Body,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import type { Request, Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import {
  uuidSchema,
  type Document,
  type DocumentChunkList,
  type DocumentList,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
  type KnowledgeSearchStreamEvent,
  knowledgeSearchRequestSchema
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
  private readonly logger = new Logger(DocumentsController.name);

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

  @Post("search")
  @Roles("OWNER", "ADMIN", "MEMBER")
  @HttpCode(HttpStatus.OK)
  public search(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(knowledgeSearchRequestSchema))
    input: KnowledgeSearchRequest
  ): Promise<KnowledgeSearchResponse> {
    return this.documents.search(principal, input);
  }

  @Post("search/stream")
  @Roles("OWNER", "ADMIN", "MEMBER")
  @HttpCode(HttpStatus.OK)
  public async streamSearch(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(knowledgeSearchRequestSchema))
    input: KnowledgeSearchRequest,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const prepared = await this.documents.prepareSearchStream(principal, input);
    const abortController = new AbortController();
    const cancel = (): void => {
      if (!response.writableEnded) {
        abortController.abort(new Error("Client disconnected."));
      }
    };
    response.once("close", cancel);
    request.once("aborted", cancel);

    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-store");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    await this.write(response, prepared.started);

    try {
      for await (const event of prepared.events(abortController.signal)) {
        await this.write(response, event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        const event = this.toSearchErrorEvent(error);
        this.logger.error(
          `${event.code} for tenant ${principal.tenantId} search stream`
        );
        await this.write(response, event);
      }
    } finally {
      response.off("close", cancel);
      request.off("aborted", cancel);
      if (!response.writableEnded) {
        response.end();
      }
    }
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

  @Post(":documentId/reindex")
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.ACCEPTED)
  public reindex(
    @CurrentUser() principal: RequestPrincipal,
    @Param("documentId", new ZodValidationPipe(uuidSchema)) documentId: string
  ): Promise<Document> {
    return this.documents.reindex(principal, documentId);
  }

  @Delete(":documentId")
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(
    @CurrentUser() principal: RequestPrincipal,
    @Param("documentId", new ZodValidationPipe(uuidSchema)) documentId: string
  ): Promise<void> {
    return this.documents.delete(principal, documentId);
  }

  private async write(
    response: Response,
    event: KnowledgeSearchStreamEvent
  ): Promise<void> {
    if (!response.write(`${JSON.stringify(event)}\n`)) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          response.off("drain", onDrain);
          response.off("close", onClose);
        };
        const onDrain = (): void => {
          cleanup();
          resolve();
        };
        const onClose = (): void => {
          cleanup();
          reject(new Error("Client disconnected during stream write."));
        };
        response.once("drain", onDrain);
        response.once("close", onClose);
      });
    }
  }

  private toSearchErrorEvent(
    error: unknown
  ): Extract<KnowledgeSearchStreamEvent, { type: "knowledge.search.error" }> {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response && "code" in response) {
        return {
          version: 1,
          type: "knowledge.search.error",
          code: String(response.code),
          message:
            "message" in response
              ? String(response.message)
              : "The knowledge answer could not be completed."
        };
      }
    }
    return {
      version: 1,
      type: "knowledge.search.error",
      code: "KNOWLEDGE_ANSWER_FAILED",
      message: "The knowledge answer could not be completed."
    };
  }
}
