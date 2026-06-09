# ADR 0002: Ollama as the Primary Local Provider

Status: Accepted

Use Ollama through an OpenAI-compatible adapter for chat and embeddings. Model
names remain environment configuration, with `qwen3:8b` as an example rather
than a hard dependency. LM Studio and cloud providers are deferred adapters.
