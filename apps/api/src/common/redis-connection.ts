import type { ConnectionOptions } from "bullmq";

export function toRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = parseDatabase(url.pathname);
  const host = normalizeHost(url.hostname);
  const connection: ConnectionOptions = {
    host,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null
  };

  const username = decode(url.username);
  const password = decode(url.password);
  if (username) {
    connection.username = username;
  }
  if (password) {
    connection.password = password;
  }
  if (database !== undefined) {
    connection.db = database;
  }
  if (host === "127.0.0.1") {
    connection.family = 4;
  }
  if (url.protocol === "rediss:") {
    connection.tls = {};
  }
  return connection;
}

function normalizeHost(host: string): string {
  return host === "localhost" ? "127.0.0.1" : host;
}

function decode(value: string): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}

function parseDatabase(pathname: string): number | undefined {
  const value = pathname.replace(/^\//, "");
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
