import type { IncomingMessage, ServerResponse, Server } from 'node:http';

export const SAMPLE_BOARD: string;
export const DASHBOARD_DIST: string;
export function createApiHandler(
  repoRoot: string,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
export function dashboardBuilt(distDir?: string): boolean;
export function startDashboardServer(opts: {
  repoRoot: string;
  port?: number;
  host?: string;
  distDir?: string;
}): Promise<{ server: Server; port: number }>;
