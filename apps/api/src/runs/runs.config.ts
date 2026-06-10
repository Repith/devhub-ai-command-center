export interface RunsConfig {
  redisUrl: string;
}

export function loadRunsConfig(): RunsConfig {
  return {
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379"
  };
}
