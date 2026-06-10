import type { z } from "zod";

import type {
  AgentDefinition,
  McpTenantContext,
  McpToolAuditEntry,
  McpToolId
} from "@devhub/contracts";

export interface ToolCallInput {
  agent: Pick<AgentDefinition, "id" | "enabledToolIds">;
  context: McpTenantContext;
  toolId: McpToolId;
  input: unknown;
}

export interface ToolCallResult<TOutput> {
  output: TOutput;
  outputPreview: string;
}

export interface ToolDefinition<TInput, TOutput> {
  id: McpToolId;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute(input: TInput, context: McpTenantContext): Promise<TOutput>;
}

export interface ToolAuditSink {
  record(entry: McpToolAuditEntry): Promise<void>;
}

export interface ToolRegistryPort {
  list(agent: Pick<AgentDefinition, "enabledToolIds">): readonly McpToolId[];
  call<TOutput = unknown>(
    input: ToolCallInput
  ): Promise<ToolCallResult<TOutput>>;
}

export class ToolRegistryError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ToolRegistryError";
  }
}

export class StaticToolRegistry implements ToolRegistryPort {
  private readonly tools: ReadonlyMap<
    McpToolId,
    ToolDefinition<unknown, unknown>
  >;

  public constructor(
    tools: readonly ToolDefinition<unknown, unknown>[],
    private readonly auditSink?: ToolAuditSink
  ) {
    this.tools = new Map(tools.map((tool) => [tool.id, tool]));
  }

  public list(
    agent: Pick<AgentDefinition, "enabledToolIds">
  ): readonly McpToolId[] {
    return agent.enabledToolIds.filter((toolId): toolId is McpToolId =>
      this.tools.has(toolId as McpToolId)
    );
  }

  public async call<TOutput = unknown>(
    input: ToolCallInput
  ): Promise<ToolCallResult<TOutput>> {
    const startedAt = performance.now();
    const inputPreview = preview(input.input);
    const tool = this.tools.get(input.toolId);
    if (!tool || !input.agent.enabledToolIds.includes(input.toolId)) {
      await this.audit(
        input,
        "DENIED",
        inputPreview,
        null,
        "TOOL_NOT_ALLOWED",
        startedAt
      );
      throw new ToolRegistryError(
        "TOOL_NOT_ALLOWED",
        `Tool ${input.toolId} is not enabled for this agent.`
      );
    }

    try {
      const parsedInput = tool.inputSchema.parse(input.input);
      const output = tool.outputSchema.parse(
        await tool.execute(parsedInput, input.context)
      ) as TOutput;
      const outputPreview = preview(output);
      await this.audit(
        input,
        "COMPLETED",
        inputPreview,
        outputPreview,
        null,
        startedAt
      );
      return { output, outputPreview };
    } catch (error) {
      await this.audit(
        input,
        "FAILED",
        inputPreview,
        null,
        error instanceof ToolRegistryError ? error.code : "TOOL_CALL_FAILED",
        startedAt
      );
      throw error;
    }
  }

  private async audit(
    input: ToolCallInput,
    status: McpToolAuditEntry["status"],
    inputPreview: string,
    outputPreview: string | null,
    errorCode: string | null,
    startedAt: number
  ): Promise<void> {
    await this.auditSink?.record({
      toolId: input.toolId,
      agentId: input.agent.id,
      tenantId: input.context.tenantId,
      correlationId: input.context.correlationId,
      status,
      inputPreview,
      outputPreview,
      errorCode,
      durationMs: Math.round(performance.now() - startedAt)
    });
  }
}

export function preview(value: unknown, maxLength = 2000): string {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return "";
  }
  return serialized.length > maxLength
    ? `${serialized.slice(0, maxLength)}...`
    : serialized;
}
