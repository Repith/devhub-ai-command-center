import { formatServiceName } from "@devhub/domain";

export function getWorkerName(): string {
  return formatServiceName("Worker");
}

if (require.main === module) {
  console.log(`${getWorkerName()} is ready.`);
}
