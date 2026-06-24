import { execFile } from "child_process";
import { randomUUID, timingSafeEqual } from "crypto";
import { promises as dns } from "dns";
import { EventEmitter } from "events";
import { networkInterfaces } from "os";
import { promisify } from "util";

import Bonjour, { Service as BonjourService } from "bonjour-service";
import ouiData from "oui-data";

import { AccessContext } from "../../authorization/authorization.types";
import { ManagedEndpointEntity } from "../../database/entities/managed-endpoint.entity";
import {
  NetworkDiscoveryHostEntity,
  NetworkResolutionSource
} from "../../database/entities/network-discovery-host.entity";
import {
  EndpointRiskLevel,
  EndpointStatus,
  EndpointTelemetry,
  MonitoredEndpointEntity
} from "../../database/entities/monitored-endpoint.entity";
import { ManagedEndpointRepository } from "../../database/repositories/managed-endpoint.repository";
import { MonitoredEndpointRepository } from "../../database/repositories/monitored-endpoint.repository";
import { NetworkDiscoveryHostRepository } from "../../database/repositories/network-discovery-host.repository";
import { AuthorizationService } from "../authorization/authorization.service";
import {
  FortiGateClientService,
  FortiGateKnownDevice
} from "../integrations/fortigate-client.service";
import { AppError } from "../../utils/app-error";

const execFileAsync = promisify(execFile);
const HOSTNAME_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OUI_DATABASE = ouiData as Record<string, string>;

interface CreateEndpointInput {
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  operatingSystem: string;
  loggedInUser?: string;
  tags?: string[];
}

interface AgentHeartbeatInput {
  agentId: string;
  displayName?: string;
  hostname: string;
  ipAddress: string;
  macAddress?: string;
  subnet?: string;
  operatingSystem: string;
  loggedInUser?: string;
  telemetry?: Partial<EndpointTelemetry>;
  metadata?: Record<string, unknown>;
}

export interface EndpointInventorySummary {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  highRisk: number;
  critical: number;
  activeAlerts: number;
}

export interface EndpointInventoryResult {
  endpoints: MonitoredEndpointEntity[];
  summary: EndpointInventorySummary;
}

export interface NetworkScanJob {
  id: string;
  kind: "scan" | "resolve_names";
  state: "queued" | "running" | "completed" | "failed";
  totalTargets: number;
  scannedTargets: number;
  discoveredHosts: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ObservedNetworkEndpoint {
  id: string;
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  interfaceAddress: string;
  macAddress?: string | null;
  vendor?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolutionSource: NetworkResolutionSource;
  resolutionCachedAt?: string;
  operatingSystem: string;
  status: EndpointStatus;
  riskLevel: EndpointRiskLevel;
  loggedInUser?: string;
  telemetry: EndpointTelemetry;
  visibility: "network_only" | "agent";
  activityLevel: "basic_reachability" | "host_telemetry";
  agentInstalled: boolean;
  remoteAccess?: {
    provider: "guacamole" | "meshcentral" | "rustdesk" | "rdp" | "custom";
    mode: "embedded" | "external";
    label: string;
    launchUrl: string;
  };
}

export interface NetworkScanResult {
  scannedAt: string;
  subnets: string[];
  interfaceAddresses: string[];
  endpoints: ObservedNetworkEndpoint[];
  currentJob: NetworkScanJob | null;
}

export interface NetworkMonitorEvent {
  type: "job" | "snapshot";
  job?: NetworkScanJob | null;
  snapshot?: NetworkScanResult;
}

interface DiscoverySubnet {
  cidr: string;
  baseAddress: string;
  interfaceName: string;
  interfaceAddress: string;
  hostAddresses: string[];
  priority: number;
}

interface ReachabilityProbeResult {
  reachable: boolean;
  latencyMs: number | null;
  checkedAt: string;
}

interface HostIdentityResolution {
  displayName: string;
  hostname: string;
  macAddress: string | null;
  vendor: string | null;
  resolutionSource: NetworkResolutionSource;
  resolutionCachedAt: string;
}

interface DiscoveredHostRecord {
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  checkedAt: string;
  latencyMs: number | null;
  interfaceAddress: string;
  interfaceName: string;
  macAddress: string | null;
  vendor: string | null;
  resolutionSource: NetworkResolutionSource;
  resolutionCachedAt: string;
}

interface HostNameResolution {
  hostname: string | null;
  source: NetworkResolutionSource;
  resolvedAt: string;
}

export class EndpointMonitorService {
  private readonly networkEvents = new EventEmitter();
  private readonly commandAvailability = new Map<string, Promise<boolean>>();
  private currentNetworkScanJob: NetworkScanJob | null = null;
  private lastNetworkScannedAt: string | null = null;

  constructor(
    private readonly endpoints: MonitoredEndpointRepository,
    private readonly authorization: AuthorizationService,
    private readonly managedEndpoints?: ManagedEndpointRepository,
    private readonly agentEnrollmentToken?: string,
    private readonly networkDiscoveryHosts?: NetworkDiscoveryHostRepository,
    private readonly fortiGate?: FortiGateClientService
  ) {
    this.networkEvents.setMaxListeners(100);
  }

  subscribeToNetworkEvents(
    listener: (event: NetworkMonitorEvent) => void
  ): () => void {
    const handler = (event: NetworkMonitorEvent) => {
      listener(event);
    };

    this.networkEvents.on("event", handler);
    return () => {
      this.networkEvents.off("event", handler);
    };
  }

  async listInventory(actor: AccessContext): Promise<EndpointInventoryResult> {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: "endpoints.inventory",
      action: "list_monitored_endpoints",
      reason: "Endpoint monitoring requires 'agents' permission"
    });

    const endpoints = await this.endpoints.listByWorkspace(actor.workspaceId);
    return this.toInventory(endpoints);
  }

  async createEndpoint(
    actor: AccessContext,
    input: CreateEndpointInput
  ): Promise<MonitoredEndpointEntity> {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: "endpoints.inventory",
      action: "create_monitored_endpoint",
      reason: "Endpoint monitoring requires 'agents' permission"
    });

    const existing = await this.endpoints.findByWorkspaceAndIpAddress(
      actor.workspaceId,
      input.ipAddress
    );
    if (existing) {
      throw new AppError("An endpoint with this IP address already exists.", 409);
    }

    return this.endpoints.create({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      displayName: input.displayName.trim(),
      hostname: input.hostname.trim().toLowerCase(),
      ipAddress: input.ipAddress.trim(),
      subnet: input.subnet.trim(),
      operatingSystem: input.operatingSystem.trim(),
      status: "online",
      riskLevel: "low",
      lastSeenAt: new Date().toISOString(),
      loggedInUser: input.loggedInUser?.trim() || undefined,
      tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
      telemetry: {
        activeAlerts: 0,
        latencyMs: null
      },
      metadata: {
        createdFrom: "workspace_ui",
        workspaceRole: actor.workspaceRole
      }
    });
  }

  async refreshInventory(actor: AccessContext): Promise<EndpointInventoryResult> {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: "endpoints.inventory",
      action: "refresh_monitored_endpoints",
      reason: "Endpoint monitoring requires 'agents' permission"
    });

    const existing = await this.endpoints.listByWorkspace(actor.workspaceId);
    const refreshed = await this.refreshReachability(existing);
    return this.toInventory(refreshed);
  }

  async discoverLocalEndpoints(actor: AccessContext): Promise<EndpointInventoryResult> {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: "endpoints.discovery",
      action: "discover_local_endpoints",
      reason: "LAN discovery requires 'agents' permission"
    });

    const scan = await this.performNetworkDiscoveryScan({
      forceNameResolution: false
    });

    await Promise.all(
      scan.discoveredHosts.map(async (host) => {
        const existing = await this.endpoints.findByWorkspaceAndIpAddress(
          actor.workspaceId,
          host.ipAddress
        );

        if (existing) {
          const telemetry: EndpointTelemetry = {
            ...existing.telemetry,
            latencyMs: host.latencyMs
          };

          await this.endpoints.updateStatus(existing.id, {
            status: this.resolveStatus(existing.riskLevel, telemetry, true),
            lastSeenAt: host.checkedAt,
            telemetry,
            metadata: {
              ...existing.metadata,
              discoveredAt: host.checkedAt,
              discoveryInterface: host.interfaceAddress,
              discoveryInterfaceName: host.interfaceName,
              resolvedHostname: host.hostname,
              resolvedHostnameSource: host.resolutionSource,
              resolutionCachedAt: host.resolutionCachedAt,
              macAddress: host.macAddress,
              vendor: host.vendor,
              visibility: existing.metadata.visibility ?? "network_only",
              agentInstalled: existing.metadata.agentInstalled ?? false
            }
          });
          return;
        }

        await this.endpoints.create({
          workspaceId: actor.workspaceId,
          createdByUserId: actor.userId,
          displayName: host.displayName,
          hostname: host.hostname,
          ipAddress: host.ipAddress,
          subnet: host.subnet,
          operatingSystem: "Unknown",
          status: "online",
          riskLevel: "low",
          lastSeenAt: host.checkedAt,
          tags: ["discovered", "network-only"],
          telemetry: {
            activeAlerts: 0,
            latencyMs: host.latencyMs
          },
          metadata: {
            createdFrom: "lan_discovery",
            discoveredAt: host.checkedAt,
            discoveryInterface: host.interfaceAddress,
            discoveryInterfaceName: host.interfaceName,
            resolvedHostname: host.hostname,
            resolvedHostnameSource: host.resolutionSource,
            resolutionCachedAt: host.resolutionCachedAt,
            macAddress: host.macAddress,
            vendor: host.vendor,
            visibility: "network_only",
            agentInstalled: false,
            activityLevel: "basic_reachability"
          }
        });
      })
    );

    return this.listInventory(actor);
  }

  async getCurrentNetworkSnapshot(): Promise<NetworkScanResult> {
    const subnets = this.getDiscoverySubnets();
    const discoveryHosts = this.networkDiscoveryHosts
      ? await this.networkDiscoveryHosts.listAll()
      : [];
    const managedEndpoints = this.managedEndpoints
      ? await this.managedEndpoints.listRecent(this.getManagedEndpointCutoff())
      : [];

    return {
      scannedAt: this.resolveLastScannedAt(discoveryHosts, managedEndpoints),
      subnets: subnets.map((subnet) => subnet.cidr),
      interfaceAddresses: [...new Set(subnets.map((subnet) => subnet.interfaceAddress))],
      endpoints: this.mergeManagedTelemetry(discoveryHosts, managedEndpoints).sort(
        (left, right) => {
          const leftRank =
            left.status === "online" ? 0 : left.status === "degraded" ? 1 : 2;
          const rightRank =
            right.status === "online" ? 0 : right.status === "degraded" ? 1 : 2;

          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }

          return this.ipToInt(left.ipAddress) - this.ipToInt(right.ipAddress);
        }
      ),
      currentJob: this.currentNetworkScanJob
    };
  }

  async startNetworkScan(options: {
    forceNameResolution?: boolean;
  } = {}): Promise<NetworkScanJob> {
    if (!this.networkDiscoveryHosts) {
      throw new AppError("Network discovery storage is not available.", 503);
    }

    if (
      this.currentNetworkScanJob &&
      (this.currentNetworkScanJob.state === "queued" ||
        this.currentNetworkScanJob.state === "running")
    ) {
      return this.currentNetworkScanJob;
    }

    const job: NetworkScanJob = {
      id: randomUUID(),
      kind: options.forceNameResolution ? "resolve_names" : "scan",
      state: "queued",
      totalTargets: 0,
      scannedTargets: 0,
      discoveredHosts: 0,
      startedAt: new Date().toISOString()
    };
    this.currentNetworkScanJob = job;
    this.emitNetworkEvent({
      type: "job",
      job
    });

    void this.runNetworkScanJob(job, {
      forceNameResolution: options.forceNameResolution ?? false
    });

    return job;
  }

  async ingestAgentHeartbeat(
    enrollmentToken: string | undefined,
    input: AgentHeartbeatInput
  ): Promise<ManagedEndpointEntity> {
    if (!this.managedEndpoints) {
      throw new AppError("Managed endpoint telemetry is not available.", 503);
    }

    if (!this.agentEnrollmentToken) {
      throw new AppError("Endpoint enrollment token is not configured.", 503);
    }

    if (!enrollmentToken || !this.tokensMatch(enrollmentToken, this.agentEnrollmentToken)) {
      throw new AppError("Invalid endpoint enrollment token.", 403);
    }

    const normalizedTelemetry: EndpointTelemetry = {
      activeAlerts: input.telemetry?.activeAlerts ?? 0,
      cpuUsagePercent: input.telemetry?.cpuUsagePercent,
      memoryUsagePercent: input.telemetry?.memoryUsagePercent,
      diskUsagePercent: input.telemetry?.diskUsagePercent,
      latencyMs: input.telemetry?.latencyMs ?? null,
      networkRxKbps: input.telemetry?.networkRxKbps,
      networkTxKbps: input.telemetry?.networkTxKbps
    };
    const riskLevel = this.resolveRiskLevel(normalizedTelemetry);
    const status = this.resolveStatus(riskLevel, normalizedTelemetry, true);
    const normalizedHostname = input.hostname.trim().toLowerCase();
    const normalizedIpAddress = input.ipAddress.trim();

    return this.managedEndpoints.upsertHeartbeat({
      agentId: input.agentId.trim(),
      displayName:
        input.displayName?.trim() ||
        this.toDisplayName(normalizedHostname, normalizedIpAddress),
      hostname: normalizedHostname,
      ipAddress: normalizedIpAddress,
      macAddress: input.macAddress?.trim().toUpperCase().replace(/-/g, ":"),
      subnet: input.subnet?.trim(),
      operatingSystem: input.operatingSystem.trim(),
      loggedInUser: input.loggedInUser?.trim(),
      status,
      riskLevel,
      lastSeenAt: new Date().toISOString(),
      telemetry: normalizedTelemetry,
      metadata: {
        source: "endpoint_agent",
        ...(input.metadata ?? {})
      }
    });
  }

  private async runNetworkScanJob(
    job: NetworkScanJob,
    options: {
      forceNameResolution: boolean;
    }
  ): Promise<void> {
    try {
      job.state = "running";
      this.emitNetworkEvent({
        type: "job",
        job: {
          ...job
        }
      });

      const scan = await this.performNetworkDiscoveryScan({
        forceNameResolution: options.forceNameResolution,
        onProgress: (progress) => {
          this.currentNetworkScanJob = {
            ...job,
            state: "running",
            totalTargets: progress.totalTargets,
            scannedTargets: progress.scannedTargets,
            discoveredHosts: progress.discoveredHosts
          };
          this.emitNetworkEvent({
            type: "job",
            job: this.currentNetworkScanJob
          });
        }
      });

      await Promise.all(
        scan.discoveredHosts.map((host) =>
          this.networkDiscoveryHosts!.upsert({
            ipAddress: host.ipAddress,
            hostname: host.hostname,
            macAddress: host.macAddress,
            vendor: host.vendor,
            subnet: host.subnet,
            interfaceAddress: host.interfaceAddress,
            status: "online",
            resolutionSource: host.resolutionSource,
            resolutionCachedAt: host.resolutionCachedAt,
            lastSeenAt: host.checkedAt,
            metadata: {
              discoveryInterfaceName: host.interfaceName,
              latencyMs: host.latencyMs
            }
          })
        )
      );

      const discoveredIpAddresses = new Set(
        scan.discoveredHosts.map((host) => host.ipAddress)
      );
      const passiveFortiGateDevices = scan.fortiGateDevices.filter(
        (device) =>
          !discoveredIpAddresses.has(device.ipAddress) &&
          scan.subnets.some((subnet) => this.isIpInCidr(device.ipAddress, subnet.cidr))
      );

      await Promise.all(
        passiveFortiGateDevices.map((device) =>
          this.networkDiscoveryHosts!.upsert({
            ipAddress: device.ipAddress,
            hostname:
              this.sanitizeResolvedHostName(device.hostname, device.ipAddress) ??
              device.ipAddress,
            macAddress: device.macAddress
              ? this.normalizeMacAddress(device.macAddress)
              : null,
            vendor: device.vendor ?? null,
            subnet:
              scan.subnets.find((subnet) => this.isIpInCidr(device.ipAddress, subnet.cidr))
                ?.cidr ?? this.deriveFallbackSubnet(device.ipAddress),
            interfaceAddress:
              scan.subnets.find((subnet) => this.isIpInCidr(device.ipAddress, subnet.cidr))
                ?.interfaceAddress ?? device.ipAddress,
            status: "offline",
            resolutionSource: device.hostname ? "fortigate" : "unresolved",
            resolutionCachedAt: scan.scannedAt,
            lastSeenAt: scan.scannedAt,
            metadata: {
              discoveryInterfaceName: device.interfaceName ?? "fortigate",
              importedFrom: "fortigate"
            }
          })
        )
      );

      await this.networkDiscoveryHosts!.markMissingOffline(
        scan.subnets.map((subnet) => subnet.cidr),
        [
          ...scan.discoveredHosts.map((host) => host.ipAddress),
          ...passiveFortiGateDevices.map((device) => device.ipAddress)
        ],
        scan.scannedAt
      );

      this.lastNetworkScannedAt = scan.scannedAt;
      this.currentNetworkScanJob = {
        ...job,
        state: "completed",
        totalTargets: scan.totalTargets,
        scannedTargets: scan.totalTargets,
        discoveredHosts: scan.discoveredHosts.length,
        completedAt: scan.scannedAt
      };

      this.emitNetworkEvent({
        type: "job",
        job: this.currentNetworkScanJob
      });
      this.emitNetworkEvent({
        type: "snapshot",
        snapshot: await this.getCurrentNetworkSnapshot()
      });
    } catch (error) {
      this.currentNetworkScanJob = {
        ...job,
        state: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Network scan failed."
      };
      this.emitNetworkEvent({
        type: "job",
        job: this.currentNetworkScanJob
      });
    }
  }

  private async performNetworkDiscoveryScan(options: {
    forceNameResolution: boolean;
    onProgress?: (progress: {
      totalTargets: number;
      scannedTargets: number;
      discoveredHosts: number;
    }) => void;
  }): Promise<{
    scannedAt: string;
    totalTargets: number;
    subnets: DiscoverySubnet[];
    discoveredHosts: DiscoveredHostRecord[];
    fortiGateDevices: FortiGateKnownDevice[];
  }> {
    const subnets = this.getDiscoverySubnets();
    if (subnets.length === 0) {
      throw new AppError(
        "No eligible IPv4 LAN interface was found on the server.",
        400
      );
    }

    const existingHosts = this.networkDiscoveryHosts
      ? await this.networkDiscoveryHosts.listAll()
      : [];
    const existingByIp = new Map(existingHosts.map((host) => [host.ipAddress, host]));
    const fortiGateDevices = this.fortiGate?.isConfigured()
      ? await this.fortiGate.listKnownDevices().catch(() => [])
      : [];
    const fortiGateByIp = new Map(
      fortiGateDevices.map((device) => [device.ipAddress, device])
    );
    const fortiGateByMac = new Map(
      fortiGateDevices
        .filter((device) => device.macAddress)
        .map((device) => [this.normalizeMacAddress(device.macAddress!), device])
    );
    const targets = subnets.flatMap((subnet) =>
      subnet.hostAddresses.map((ipAddress) => ({
        ipAddress,
        subnet: subnet.cidr,
        interfaceAddress: subnet.interfaceAddress,
        interfaceName: subnet.interfaceName
      }))
    );
    const queue = [...targets];
    const discoveredHosts: DiscoveredHostRecord[] = [];
    const totalTargets = queue.length;
    const concurrency = Math.min(32, Math.max(1, totalTargets));
    let scannedTargets = 0;
    let discoveredCount = 0;
    let mdnsHostMapPromise: Promise<Map<string, string>> | null = null;

    const emitProgress = () => {
      options.onProgress?.({
        totalTargets,
        scannedTargets,
        discoveredHosts: discoveredCount
      });
    };

    emitProgress();

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) {
            return;
          }

          try {
            const result = await this.probeReachability(next.ipAddress, 500);
            if (!result.reachable) {
              continue;
            }

            const identity = await this.resolveHostIdentity(next.ipAddress, {
              existingHost: existingByIp.get(next.ipAddress),
              fortiGateHint: fortiGateByIp.get(next.ipAddress),
              getFortiGateHintByMac: (macAddress) =>
                fortiGateByMac.get(this.normalizeMacAddress(macAddress)),
              forceNameResolution: options.forceNameResolution,
              getMdnsHostMap: () => {
                if (!mdnsHostMapPromise) {
                  mdnsHostMapPromise = this.browseMdnsHostnames();
                }

                return mdnsHostMapPromise;
              }
            });

            discoveredHosts.push({
              displayName: identity.displayName,
              hostname: identity.hostname,
              ipAddress: next.ipAddress,
              subnet: next.subnet,
              checkedAt: result.checkedAt,
              latencyMs: result.latencyMs,
              interfaceAddress: next.interfaceAddress,
              interfaceName: next.interfaceName,
              macAddress: identity.macAddress,
              vendor: identity.vendor,
              resolutionSource: identity.resolutionSource,
              resolutionCachedAt: identity.resolutionCachedAt
            });
            discoveredCount += 1;
          } finally {
            scannedTargets += 1;
            if (scannedTargets === totalTargets || scannedTargets % 8 === 0) {
              emitProgress();
            }
          }
        }
      })
    );

    const scannedAt =
      discoveredHosts.reduce<string | null>((latest, host) => {
        if (!latest) {
          return host.checkedAt;
        }

        return new Date(host.checkedAt).getTime() > new Date(latest).getTime()
          ? host.checkedAt
          : latest;
      }, null) ?? new Date().toISOString();

    emitProgress();

    return {
      scannedAt,
      totalTargets,
      subnets,
      discoveredHosts,
      fortiGateDevices
    };
  }

  private async refreshReachability(
    endpoints: MonitoredEndpointEntity[]
  ): Promise<MonitoredEndpointEntity[]> {
    if (endpoints.length === 0) {
      return [];
    }

    const queue = endpoints.map((endpoint, index) => ({
      endpoint,
      index
    }));
    const refreshed: MonitoredEndpointEntity[] = new Array(endpoints.length);
    const concurrency = Math.min(6, endpoints.length);

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) {
            return;
          }

          refreshed[next.index] = await this.refreshEndpoint(next.endpoint);
        }
      })
    );

    return refreshed;
  }

  private async refreshEndpoint(
    endpoint: MonitoredEndpointEntity
  ): Promise<MonitoredEndpointEntity> {
    const probe = await this.probeReachability(endpoint.ipAddress, 1000);
    const telemetry: EndpointTelemetry = {
      ...endpoint.telemetry,
      latencyMs: probe.latencyMs
    };
    const metadata = {
      ...endpoint.metadata,
      lastProbeAt: probe.checkedAt
    };
    const status = this.resolveStatus(endpoint.riskLevel, telemetry, probe.reachable);

    return this.endpoints.updateStatus(endpoint.id, {
      status,
      lastSeenAt: probe.reachable ? probe.checkedAt : endpoint.lastSeenAt,
      telemetry,
      metadata
    });
  }

  private resolveStatus(
    riskLevel: EndpointRiskLevel,
    telemetry: EndpointTelemetry,
    reachable: boolean
  ): EndpointStatus {
    if (!reachable) {
      return "offline";
    }

    if (
      riskLevel === "critical" ||
      telemetry.activeAlerts > 0 ||
      (telemetry.cpuUsagePercent ?? 0) >= 90 ||
      (telemetry.memoryUsagePercent ?? 0) >= 90 ||
      (telemetry.diskUsagePercent ?? 0) >= 95
    ) {
      return "degraded";
    }

    return "online";
  }

  private toInventory(endpoints: MonitoredEndpointEntity[]): EndpointInventoryResult {
    return {
      endpoints,
      summary: {
        total: endpoints.length,
        online: endpoints.filter((endpoint) => endpoint.status === "online").length,
        degraded: endpoints.filter((endpoint) => endpoint.status === "degraded").length,
        offline: endpoints.filter((endpoint) => endpoint.status === "offline").length,
        highRisk: endpoints.filter((endpoint) => endpoint.riskLevel === "high").length,
        critical: endpoints.filter((endpoint) => endpoint.riskLevel === "critical").length,
        activeAlerts: endpoints.reduce(
          (count, endpoint) => count + (endpoint.telemetry.activeAlerts ?? 0),
          0
        )
      }
    };
  }

  private toObservedEndpoint(
    host: NetworkDiscoveryHostEntity
  ): ObservedNetworkEndpoint {
    return {
      id: host.ipAddress,
      displayName: this.toDisplayName(host.hostname, host.ipAddress),
      hostname: host.hostname,
      ipAddress: host.ipAddress,
      subnet: host.subnet,
      interfaceAddress: host.interfaceAddress,
      macAddress: host.macAddress ?? null,
      vendor: host.vendor ?? null,
      firstSeenAt: host.firstSeenAt,
      lastSeenAt: host.lastSeenAt,
      resolutionSource: host.resolutionSource,
      resolutionCachedAt: host.resolutionCachedAt,
      operatingSystem: "Unknown",
      status: host.status,
      riskLevel: "low",
      loggedInUser: undefined,
      telemetry: {
        activeAlerts: 0,
        latencyMs:
          typeof host.metadata.latencyMs === "number"
            ? (host.metadata.latencyMs as number)
            : null
      },
      visibility: "network_only",
      activityLevel: "basic_reachability",
      agentInstalled: false,
      remoteAccess: undefined
    };
  }

  private toManagedObservedEndpoint(endpoint: ManagedEndpointEntity): ObservedNetworkEndpoint {
    return {
      id: `agent:${endpoint.agentId}`,
      displayName: endpoint.displayName,
      hostname: endpoint.hostname,
      ipAddress: endpoint.ipAddress,
      subnet: endpoint.subnet ?? this.deriveFallbackSubnet(endpoint.ipAddress),
      interfaceAddress: endpoint.ipAddress,
      macAddress: endpoint.macAddress ?? null,
      vendor: endpoint.macAddress
        ? this.resolveMacVendor(endpoint.macAddress) ?? null
        : null,
      firstSeenAt: endpoint.createdAt,
      lastSeenAt: endpoint.lastSeenAt,
      resolutionSource: "agent",
      resolutionCachedAt: endpoint.updatedAt,
      operatingSystem: endpoint.operatingSystem,
      status: endpoint.status,
      riskLevel: endpoint.riskLevel,
      loggedInUser: endpoint.loggedInUser,
      telemetry: endpoint.telemetry,
      visibility: "agent",
      activityLevel: "host_telemetry",
      agentInstalled: true,
      remoteAccess: this.extractRemoteAccess(endpoint.metadata)
    };
  }

  private mergeManagedTelemetry(
    discoveryHosts: NetworkDiscoveryHostEntity[],
    managedEndpoints: ManagedEndpointEntity[]
  ): ObservedNetworkEndpoint[] {
    const observedByIp = new Map<string, ObservedNetworkEndpoint>();
    const discoveryByMac = new Map(
      discoveryHosts
        .filter((host) => host.macAddress)
        .map((host) => [this.normalizeMacAddress(host.macAddress!), host])
    );

    for (const host of discoveryHosts) {
      observedByIp.set(host.ipAddress, this.toObservedEndpoint(host));
    }

    for (const managedEndpoint of managedEndpoints) {
      const discoveryMatch =
        observedByIp.get(managedEndpoint.ipAddress) ??
        (managedEndpoint.macAddress
          ? (() => {
              const match = discoveryByMac.get(
                this.normalizeMacAddress(managedEndpoint.macAddress)
              );
              return match ? observedByIp.get(match.ipAddress) : undefined;
            })()
          : undefined);

      if (!discoveryMatch) {
        observedByIp.set(
          managedEndpoint.ipAddress,
          this.toManagedObservedEndpoint(managedEndpoint)
        );
        continue;
      }

      const firstSeenAt =
        new Date(managedEndpoint.createdAt).getTime() <
        new Date(discoveryMatch.firstSeenAt).getTime()
          ? managedEndpoint.createdAt
          : discoveryMatch.firstSeenAt;
      const lastSeenAt =
        new Date(managedEndpoint.lastSeenAt).getTime() >
        new Date(discoveryMatch.lastSeenAt).getTime()
          ? managedEndpoint.lastSeenAt
          : discoveryMatch.lastSeenAt;

      observedByIp.set(managedEndpoint.ipAddress, {
        ...discoveryMatch,
        id: `agent:${managedEndpoint.agentId}`,
        displayName: managedEndpoint.displayName,
        hostname: managedEndpoint.hostname || discoveryMatch.hostname,
        ipAddress: managedEndpoint.ipAddress,
        subnet: managedEndpoint.subnet ?? discoveryMatch.subnet,
        interfaceAddress: discoveryMatch.interfaceAddress,
        macAddress: managedEndpoint.macAddress ?? discoveryMatch.macAddress,
        vendor:
          discoveryMatch.vendor ??
          (managedEndpoint.macAddress
            ? this.resolveMacVendor(managedEndpoint.macAddress) ?? null
            : null),
        firstSeenAt,
        lastSeenAt,
        resolutionSource: "agent",
        resolutionCachedAt: managedEndpoint.updatedAt,
        operatingSystem: managedEndpoint.operatingSystem,
        status: managedEndpoint.status,
        riskLevel: managedEndpoint.riskLevel,
        loggedInUser: managedEndpoint.loggedInUser,
        telemetry: {
          ...discoveryMatch.telemetry,
          ...managedEndpoint.telemetry,
          latencyMs: discoveryMatch.telemetry.latencyMs
        },
        visibility: "agent",
        activityLevel: "host_telemetry",
        agentInstalled: true,
        remoteAccess: this.extractRemoteAccess(managedEndpoint.metadata)
      });
    }

    return Array.from(observedByIp.values());
  }

  private getDiscoverySubnets(): DiscoverySubnet[] {
    const interfaces = networkInterfaces();
    const subnets: DiscoverySubnet[] = [];

    for (const [interfaceName, entries] of Object.entries(interfaces)) {
      for (const entry of entries ?? []) {
        if (
          entry.family !== "IPv4" ||
          entry.internal ||
          !entry.address ||
          !entry.netmask ||
          !this.isLanEligibleIpv4(entry.address)
        ) {
          continue;
        }

        const prefixLength = this.netmaskToPrefix(entry.netmask);
        const cappedPrefixLength = Math.max(prefixLength, 24);
        const baseAddress = this.calculateBaseAddress(entry.address, cappedPrefixLength);
        const hostAddresses = this.buildHostAddresses(baseAddress, cappedPrefixLength, entry.address);

        if (hostAddresses.length === 0) {
          continue;
        }

        subnets.push({
          cidr: `${baseAddress}/${cappedPrefixLength}`,
          baseAddress,
          interfaceName,
          interfaceAddress: entry.address,
          hostAddresses,
          priority: this.scoreDiscoveryInterface(interfaceName, entry.address)
        });
      }
    }

    const uniqueSubnets = new Map<string, DiscoverySubnet>();
    for (const subnet of subnets) {
      const existing = uniqueSubnets.get(subnet.cidr);
      if (!existing || existing.priority < subnet.priority) {
        uniqueSubnets.set(subnet.cidr, subnet);
      }
    }

    const discoveredSubnets = Array.from(uniqueSubnets.values());
    const preferredSubnets = discoveredSubnets.filter(
      (subnet) => !this.isProbablyVirtualInterface(subnet.interfaceName)
    );

    return (preferredSubnets.length > 0 ? preferredSubnets : discoveredSubnets)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }

        return this.ipToInt(left.interfaceAddress) - this.ipToInt(right.interfaceAddress);
      })
      .slice(0, 3);
  }

  private async probeReachability(
    ipAddress: string,
    timeoutMs: number
  ): Promise<ReachabilityProbeResult> {
    const checkedAt = new Date().toISOString();
    const command =
      process.platform === "win32"
        ? {
            executable: "ping",
            args: ["-n", "1", "-w", String(timeoutMs), ipAddress]
          }
        : {
            executable: "ping",
            args: ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), ipAddress]
          };

    try {
      const { stdout } = await execFileAsync(command.executable, command.args, {
        timeout: Math.max(3000, timeoutMs + 1000)
      });

      return {
        reachable: true,
        latencyMs: this.extractLatency(stdout),
        checkedAt
      };
    } catch {
      return {
        reachable: false,
        latencyMs: null,
        checkedAt
      };
    }
  }

  private extractLatency(stdout: string): number | null {
    const directMatch = stdout.match(/time[=<]?\s*([\d.]+)\s*ms/i);
    if (directMatch) {
      return Math.round(Number.parseFloat(directMatch[1]!));
    }

    const windowsMatch = stdout.match(/Average = (\d+)(?:ms|msec)/i);
    if (windowsMatch) {
      return Number.parseInt(windowsMatch[1]!, 10);
    }

    return null;
  }

  private async resolveHostIdentity(
    ipAddress: string,
    options: {
      existingHost?: NetworkDiscoveryHostEntity;
      fortiGateHint?: FortiGateKnownDevice;
      getFortiGateHintByMac: (macAddress: string) => FortiGateKnownDevice | undefined;
      forceNameResolution: boolean;
      getMdnsHostMap: () => Promise<Map<string, string>>;
    }
  ): Promise<HostIdentityResolution> {
    const [nameResolution, macAddress] = await Promise.all([
      this.resolveHostName(ipAddress, options),
      this.resolveMacAddress(ipAddress)
    ]);

    const hostname = nameResolution.hostname ?? options.existingHost?.hostname ?? ipAddress;
    const normalizedMacAddress =
      macAddress ??
      options.fortiGateHint?.macAddress ??
      options.existingHost?.macAddress ??
      null;
    const fortiGateHintByMac = normalizedMacAddress
      ? options.getFortiGateHintByMac(normalizedMacAddress)
      : undefined;
    const vendor =
      options.fortiGateHint?.vendor ??
      fortiGateHintByMac?.vendor ??
      (normalizedMacAddress ? this.resolveMacVendor(normalizedMacAddress) : null) ??
      options.existingHost?.vendor ??
      null;

    return {
      displayName: this.toDisplayName(hostname, ipAddress),
      hostname,
      macAddress: normalizedMacAddress,
      vendor,
      resolutionSource: nameResolution.source,
      resolutionCachedAt: nameResolution.resolvedAt
    };
  }

  private async resolveHostName(
    ipAddress: string,
    options: {
      existingHost?: NetworkDiscoveryHostEntity;
      fortiGateHint?: FortiGateKnownDevice;
      forceNameResolution: boolean;
      getMdnsHostMap: () => Promise<Map<string, string>>;
    }
  ): Promise<HostNameResolution> {
    if (!options.forceNameResolution && this.isHostnameCacheFresh(options.existingHost)) {
      if (
        options.existingHost?.hostname &&
        options.existingHost.hostname !== options.existingHost.ipAddress
      ) {
        return {
          hostname: options.existingHost.hostname,
          source: options.existingHost.resolutionSource,
          resolvedAt:
            options.existingHost.resolutionCachedAt ?? options.existingHost.updatedAt
        };
      }

      const cachedFortiGateName = this.sanitizeResolvedHostName(
        options.fortiGateHint?.hostname,
        ipAddress
      );
      if (cachedFortiGateName) {
        return {
          hostname: cachedFortiGateName,
          source: "fortigate",
          resolvedAt:
            options.existingHost?.resolutionCachedAt ??
            options.existingHost?.updatedAt ??
            new Date().toISOString()
        };
      }

      return {
        hostname: null,
        source: options.existingHost?.resolutionSource ?? "unresolved",
        resolvedAt:
          options.existingHost?.resolutionCachedAt ??
          options.existingHost?.updatedAt ??
          new Date().toISOString()
      };
    }

    const resolvedAt = new Date().toISOString();
    const dnsHostname = await this.resolveDnsHostName(ipAddress);
    if (dnsHostname) {
      return {
        hostname: dnsHostname,
        source: "dns",
        resolvedAt
      };
    }

    const netBiosName = await this.resolveNetBiosName(ipAddress);
    if (netBiosName) {
      return {
        hostname: netBiosName,
        source: "netbios",
        resolvedAt
      };
    }

    const mdnsName = await this.resolveMdnsHostName(ipAddress, options.getMdnsHostMap);
    if (mdnsName) {
      return {
        hostname: mdnsName,
        source: "mdns",
        resolvedAt
      };
    }

    const smbName = await this.resolveSmbHostName(ipAddress);
    if (smbName) {
      return {
        hostname: smbName,
        source: "smb",
        resolvedAt
      };
    }

    const fortiGateName = this.sanitizeResolvedHostName(
      options.fortiGateHint?.hostname,
      ipAddress
    );
    if (fortiGateName) {
      return {
        hostname: fortiGateName,
        source: "fortigate",
        resolvedAt
      };
    }

    return {
      hostname: null,
      source: "unresolved",
      resolvedAt
    };
  }

  private async resolveDnsHostName(ipAddress: string): Promise<string | null> {
    try {
      const names = await dns.reverse(ipAddress);
      const hostname = this.sanitizeResolvedHostName(names[0], ipAddress);
      if (hostname) {
        return hostname;
      }
    } catch {
      // Fall through.
    }

    const pingHost = await this.resolveHostNameFromPing(ipAddress);
    if (pingHost) {
      return pingHost;
    }

    return this.resolveHostNameFromNslookup(ipAddress);
  }

  private async resolveHostNameFromPing(ipAddress: string): Promise<string | null> {
    try {
      const { stdout } =
        process.platform === "win32"
          ? await execFileAsync("ping", ["-a", "-n", "1", "-w", "800", ipAddress], {
              timeout: 2500
            })
          : await execFileAsync(
              "ping",
              ["-c", "1", "-W", "1", ipAddress],
              {
                timeout: 2500
              }
            );

      const windowsMatch = stdout.match(/Pinging\s+([^\s\[]+)\s+\[/i);
      const unixMatch = stdout.match(/^PING\s+([^\s(]+)\s+\(/im);
      return this.sanitizeResolvedHostName(
        windowsMatch?.[1] ?? unixMatch?.[1],
        ipAddress
      );
    } catch {
      return null;
    }
  }

  private async resolveHostNameFromNslookup(ipAddress: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("nslookup", [ipAddress], {
        timeout: 2500
      });
      const match =
        stdout.match(/name\s*=\s*([^\s]+)\.?/i) ??
        stdout.match(/Name:\s+([^\s]+)\.?/i);
      return this.sanitizeResolvedHostName(match?.[1], ipAddress);
    } catch {
      return null;
    }
  }

  private async resolveNetBiosName(ipAddress: string): Promise<string | null> {
    if (process.platform === "win32") {
      try {
        const { stdout } = await execFileAsync("nbtstat", ["-A", ipAddress], {
          timeout: 2500
        });
        return this.extractNetBiosName(stdout, ipAddress);
      } catch {
        return null;
      }
    }

    if (!(await this.hasCommand("nmblookup"))) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync("nmblookup", ["-A", ipAddress], {
        timeout: 3000
      });
      return this.extractNetBiosName(stdout, ipAddress);
    } catch {
      return null;
    }
  }

  private extractNetBiosName(stdout: string, ipAddress: string): string | null {
    const lines = stdout.split(/\r?\n/);

    for (const line of lines) {
      const hostname =
        this.sanitizeResolvedHostName(
          line.match(/^\s*([^\s<]+)\s+<00>\s+UNIQUE\s+Registered/i)?.[1],
          ipAddress
        ) ??
        this.sanitizeResolvedHostName(
          line.match(/^\s*([^\s<]+)\s+<00>\s+-\s+[A-Z]\s+<ACTIVE>/i)?.[1],
          ipAddress
        );

      if (hostname) {
        return hostname;
      }
    }

    return null;
  }

  private async resolveMdnsHostName(
    ipAddress: string,
    getMdnsHostMap: () => Promise<Map<string, string>>
  ): Promise<string | null> {
    const hosts = await getMdnsHostMap();
    return this.sanitizeResolvedHostName(hosts.get(ipAddress) ?? undefined, ipAddress);
  }

  private async browseMdnsHostnames(): Promise<Map<string, string>> {
    const bonjour = new Bonjour();
    const discoveredHosts = new Map<string, string>();
    const serviceTypes = ["workstation", "smb", "ssh", "http", "device-info"];

    const captureService = (service: BonjourService) => {
      const hostname = this.sanitizeResolvedHostName(
        service.host || service.fqdn || service.name,
        ""
      );
      if (!hostname) {
        return;
      }

      for (const address of service.addresses ?? []) {
        if (address.includes(":")) {
          continue;
        }

        discoveredHosts.set(address, hostname);
      }
    };

    const browsers = serviceTypes.map((type) => bonjour.find({ type }, captureService));

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1500);
    });

    for (const browser of browsers) {
      browser.stop();
    }

    await new Promise<void>((resolve) => {
      bonjour.destroy(() => resolve());
    });

    return discoveredHosts;
  }

  private async resolveSmbHostName(ipAddress: string): Promise<string | null> {
    const nmapHostname = await this.resolveSmbHostNameFromNmap(ipAddress);
    if (nmapHostname) {
      return nmapHostname;
    }

    if (process.platform === "win32") {
      return this.resolveSmbHostNameFromNetView(ipAddress);
    }

    return null;
  }

  private async resolveSmbHostNameFromNmap(ipAddress: string): Promise<string | null> {
    if (!(await this.hasCommand("nmap"))) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(
        "nmap",
        ["-Pn", "-p", "445", "--script", "smb-os-discovery", ipAddress],
        {
          timeout: 6000
        }
      );
      const match =
        stdout.match(/Computer name:\s*([^\r\n]+)/i) ??
        stdout.match(/NetBIOS computer name:\s*([^\r\n]+)/i);
      return this.sanitizeResolvedHostName(match?.[1], ipAddress);
    } catch {
      return null;
    }
  }

  private async resolveSmbHostNameFromNetView(ipAddress: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "net",
        ["view", `\\\\${ipAddress}`],
        {
          timeout: 4000
        }
      );
      const match = stdout.match(/Shared resources at \\\\([^\r\n]+)/i);
      return this.sanitizeResolvedHostName(match?.[1], ipAddress);
    } catch {
      return null;
    }
  }

  private async resolveMacAddress(ipAddress: string): Promise<string | null> {
    try {
      const command =
        process.platform === "win32"
          ? {
              executable: "arp",
              args: ["-a", ipAddress]
            }
          : process.platform === "darwin"
            ? {
                executable: "arp",
                args: ["-n", ipAddress]
              }
            : {
                executable: (await this.hasCommand("ip")) ? "ip" : "arp",
                args: (await this.hasCommand("ip"))
                  ? ["neigh", "show", ipAddress]
                  : ["-n", ipAddress]
              };

      const { stdout } = await execFileAsync(command.executable, command.args, {
        timeout: 2000
      });
      return this.extractMacAddress(stdout);
    } catch {
      return null;
    }
  }

  private extractMacAddress(stdout: string): string | null {
    const match = stdout.match(/((?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2})/i);
    if (!match?.[1]) {
      return null;
    }

    return match[1].toUpperCase().replace(/-/g, ":");
  }

  private resolveMacVendor(macAddress: string): string | null {
    const normalizedPrefix = macAddress
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-F]/g, "")
      .slice(0, 6);

    if (!normalizedPrefix || normalizedPrefix.length < 6) {
      return null;
    }

    return OUI_DATABASE[normalizedPrefix] ?? null;
  }

  private sanitizeResolvedHostName(
    value: string | undefined,
    ipAddress: string
  ): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().replace(/\.$/, "");
    if (!normalized || normalized === ipAddress) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private toDisplayName(hostname: string, fallbackIpAddress: string): string {
    if (!hostname || hostname === fallbackIpAddress) {
      return fallbackIpAddress;
    }

    return hostname.split(".")[0] ?? hostname;
  }

  private isHostnameCacheFresh(host?: NetworkDiscoveryHostEntity): boolean {
    if (!host?.resolutionCachedAt) {
      return false;
    }

    return Date.now() - new Date(host.resolutionCachedAt).getTime() < HOSTNAME_CACHE_TTL_MS;
  }

  private async hasCommand(command: string): Promise<boolean> {
    const existing = this.commandAvailability.get(command);
    if (existing) {
      return existing;
    }

    const probe = (async () => {
      try {
        await execFileAsync(
          process.platform === "win32" ? "where" : "which",
          [command],
          {
            timeout: 1500
          }
        );
        return true;
      } catch {
        return false;
      }
    })();

    this.commandAvailability.set(command, probe);
    return probe;
  }

  private isLanEligibleIpv4(ipAddress: string): boolean {
    if (ipAddress.startsWith("10.")) {
      return true;
    }

    if (ipAddress.startsWith("192.168.")) {
      return true;
    }

    const parts = ipAddress.split(".").map((part) => Number.parseInt(part, 10));
    const [firstOctet, secondOctet] = parts;

    if (
      firstOctet === 100 &&
      typeof secondOctet === "number" &&
      secondOctet >= 64 &&
      secondOctet <= 127
    ) {
      return true;
    }

    return (
      firstOctet === 172 &&
      typeof secondOctet === "number" &&
      secondOctet >= 16 &&
      secondOctet <= 31
    );
  }

  private isProbablyVirtualInterface(interfaceName: string): boolean {
    return /vethernet|hyper-v|wsl|host-only|virtualbox|vmware|docker|container|loopback|bluetooth|tailscale|zerotier|hamachi|npcap|default switch/i.test(
      interfaceName
    );
  }

  private scoreDiscoveryInterface(interfaceName: string, ipAddress: string): number {
    let score = 0;

    if (this.isProbablyVirtualInterface(interfaceName)) {
      score -= 1000;
    }

    if (/wi-?fi|wlan|wireless/i.test(interfaceName)) {
      score += 400;
    }

    if (/ethernet|lan/i.test(interfaceName)) {
      score += 250;
    }

    if (ipAddress.startsWith("192.168.")) {
      score += 120;
    } else if (ipAddress.startsWith("10.")) {
      score += 110;
    } else if (ipAddress.startsWith("100.")) {
      score += 140;
    } else if (ipAddress.startsWith("172.")) {
      score += 80;
    }

    return score;
  }

  private resolveRiskLevel(telemetry: EndpointTelemetry): EndpointRiskLevel {
    if (
      telemetry.activeAlerts > 0 ||
      (telemetry.cpuUsagePercent ?? 0) >= 95 ||
      (telemetry.memoryUsagePercent ?? 0) >= 95 ||
      (telemetry.diskUsagePercent ?? 0) >= 98
    ) {
      return "critical";
    }

    if (
      (telemetry.cpuUsagePercent ?? 0) >= 90 ||
      (telemetry.memoryUsagePercent ?? 0) >= 90 ||
      (telemetry.diskUsagePercent ?? 0) >= 95
    ) {
      return "high";
    }

    if (
      (telemetry.cpuUsagePercent ?? 0) >= 80 ||
      (telemetry.memoryUsagePercent ?? 0) >= 80 ||
      (telemetry.diskUsagePercent ?? 0) >= 90
    ) {
      return "medium";
    }

    return "low";
  }

  private resolveLastScannedAt(
    discoveryHosts: NetworkDiscoveryHostEntity[],
    managedEndpoints: ManagedEndpointEntity[]
  ): string {
    if (this.lastNetworkScannedAt) {
      return this.lastNetworkScannedAt;
    }

    const latestDiscovery = discoveryHosts
      .map((host) => host.updatedAt)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    const latestManaged = managedEndpoints
      .map((endpoint) => endpoint.lastSeenAt)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

    return latestDiscovery ?? latestManaged ?? new Date().toISOString();
  }

  private getManagedEndpointCutoff(): string {
    return new Date(Date.now() - 15 * 60 * 1000).toISOString();
  }

  private normalizeMacAddress(value: string): string {
    return value.trim().toUpperCase().replace(/-/g, ":");
  }

  private deriveFallbackSubnet(ipAddress: string): string {
    const octets = ipAddress.split(".");
    if (octets.length !== 4) {
      return ipAddress;
    }

    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }

  private emitNetworkEvent(event: NetworkMonitorEvent): void {
    this.networkEvents.emit("event", event);
  }

  private extractRemoteAccess(
    metadata: Record<string, unknown>
  ):
    | {
        provider: "guacamole" | "meshcentral" | "rustdesk" | "rdp" | "custom";
        mode: "embedded" | "external";
        label: string;
        launchUrl: string;
      }
    | undefined {
    const remoteAccess = metadata.remoteAccess;
    if (!remoteAccess || typeof remoteAccess !== "object" || Array.isArray(remoteAccess)) {
      return undefined;
    }

    const provider = this.pickMetadataString(remoteAccess, "provider");
    const mode = this.pickMetadataString(remoteAccess, "mode");
    const launchUrl = this.pickMetadataString(remoteAccess, "launchUrl");
    const label = this.pickMetadataString(remoteAccess, "label");

    if (
      !provider ||
      !mode ||
      !launchUrl ||
      !["guacamole", "meshcentral", "rustdesk", "rdp", "custom"].includes(provider) ||
      !["embedded", "external"].includes(mode) ||
      !this.isSafeRemoteAccessUrl(launchUrl)
    ) {
      return undefined;
    }

    return {
      provider: provider as "guacamole" | "meshcentral" | "rustdesk" | "rdp" | "custom",
      mode: mode as "embedded" | "external",
      label: label || "Open remote session",
      launchUrl
    };
  }

  private pickMetadataString(
    value: unknown,
    key: string
  ): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const candidate = record[key];
    if (typeof candidate !== "string") {
      return undefined;
    }

    const trimmed = candidate.trim();
    return trimmed || undefined;
  }

  private isSafeRemoteAccessUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  private tokensMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private netmaskToPrefix(netmask: string): number {
    const bits = netmask
      .split(".")
      .map((part) => Number.parseInt(part, 10).toString(2).padStart(8, "0"))
      .join("");

    return bits.replace(/0+$/, "").length;
  }

  private calculateBaseAddress(ipAddress: string, prefixLength: number): string {
    const ipValue = this.ipToInt(ipAddress);
    const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
    return this.intToIp(ipValue & mask);
  }

  private isIpInCidr(ipAddress: string, cidr: string): boolean {
    const [baseAddress, prefix] = cidr.split("/");
    if (!baseAddress || !prefix) {
      return false;
    }

    const prefixLength = Number.parseInt(prefix, 10);
    if (Number.isNaN(prefixLength)) {
      return false;
    }

    return this.calculateBaseAddress(ipAddress, prefixLength) === baseAddress;
  }

  private buildHostAddresses(
    baseAddress: string,
    prefixLength: number,
    interfaceAddress: string
  ): string[] {
    const hostCount = Math.min(254, Math.max(0, 2 ** (32 - prefixLength) - 2));
    const start = this.ipToInt(baseAddress) + 1;
    const interfaceValue = this.ipToInt(interfaceAddress);
    const addresses: string[] = [];

    for (let offset = 0; offset < hostCount; offset += 1) {
      const value = start + offset;
      if (value === interfaceValue) {
        continue;
      }

      addresses.push(this.intToIp(value));
    }

    return addresses;
  }

  private ipToInt(ipAddress: string): number {
    return ipAddress
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
  }

  private intToIp(value: number): string {
    return [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255
    ].join(".");
  }
}
