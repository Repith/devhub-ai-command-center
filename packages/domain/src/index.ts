export const SYSTEM_NAME = "DevHub AI Command Center";

export function formatServiceName(serviceName: string): string {
  return `${SYSTEM_NAME} ${serviceName}`;
}

export * from "./repositories.js";
export * from "./transitions.js";
