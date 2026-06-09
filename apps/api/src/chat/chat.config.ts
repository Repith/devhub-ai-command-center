export interface ChatConfig {
  ollamaBaseUrl: string;
  ollamaApiKey: string;
  defaultModel: string;
}

export const CHAT_CONFIG = Symbol("CHAT_CONFIG");

export function loadChatConfig(): ChatConfig {
  return {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    ollamaApiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    defaultModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b"
  };
}
