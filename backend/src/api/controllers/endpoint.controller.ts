import { Request, Response } from "express";

import { EndpointMonitorService } from "../../services/endpoints/endpoint-monitor.service";

export class EndpointController {
  constructor(private readonly endpoints: EndpointMonitorService) {}

  listInventory = async (request: Request, response: Response) => {
    const inventory = await this.endpoints.listInventory(request.auth!);
    response.json(inventory);
  };

  createEndpoint = async (request: Request, response: Response) => {
    const endpoint = await this.endpoints.createEndpoint(request.auth!, {
      displayName: request.body.displayName as string,
      hostname: request.body.hostname as string,
      ipAddress: request.body.ipAddress as string,
      subnet: request.body.subnet as string,
      operatingSystem: request.body.operatingSystem as string,
      loggedInUser: request.body.loggedInUser as string | undefined,
      tags: request.body.tags as string[] | undefined
    });

    response.status(201).json({ endpoint });
  };

  discoverEndpoints = async (request: Request, response: Response) => {
    const inventory = await this.endpoints.discoverLocalEndpoints(request.auth!);
    response.json(inventory);
  };

  refreshInventory = async (request: Request, response: Response) => {
    const inventory = await this.endpoints.refreshInventory(request.auth!);
    response.json(inventory);
  };

  ingestAgentHeartbeat = async (request: Request, response: Response) => {
    const endpoint = await this.endpoints.ingestAgentHeartbeat(
      request.header("x-endpoint-enrollment-token") ?? undefined,
      {
        agentId: request.body.agentId as string,
        displayName: request.body.displayName as string | undefined,
        hostname: request.body.hostname as string,
        ipAddress: request.body.ipAddress as string,
        macAddress: request.body.macAddress as string | undefined,
        subnet: request.body.subnet as string | undefined,
        operatingSystem: request.body.operatingSystem as string,
        loggedInUser: request.body.loggedInUser as string | undefined,
        telemetry: request.body.telemetry as
          | {
              cpuUsagePercent?: number;
              memoryUsagePercent?: number;
              diskUsagePercent?: number;
              latencyMs?: number | null;
              activeAlerts?: number;
              networkRxKbps?: number;
              networkTxKbps?: number;
            }
          | undefined,
        metadata: request.body.metadata as Record<string, unknown> | undefined
      }
    );

    response.status(202).json({ endpoint });
  };
}
