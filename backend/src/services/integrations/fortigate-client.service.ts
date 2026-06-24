import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

export interface FortiGateClientOptions {
  allowSelfSigned: boolean;
  apiToken?: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  vdom?: string;
}

export interface FortiGateKnownDevice {
  ipAddress: string;
  hostname?: string;
  macAddress?: string;
  vendor?: string;
  interfaceName?: string;
  sourcePath: string;
}

interface FortiGateApiResponse {
  results?: unknown;
  result?: unknown;
  data?: unknown;
}

export class FortiGateClientService {
  private readonly allowSelfSigned: boolean;
  private readonly apiToken?: string;
  private readonly baseUrl?: URL;
  private readonly requestTimeoutMs: number;
  private readonly vdom?: string;

  constructor(options: FortiGateClientOptions) {
    this.allowSelfSigned = options.allowSelfSigned;
    this.apiToken = options.apiToken?.trim() || undefined;
    this.baseUrl = options.baseUrl?.trim()
      ? new URL(options.baseUrl.trim())
      : undefined;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000;
    this.vdom = options.vdom?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiToken);
  }

  getBaseOrigin(): string | null {
    return this.baseUrl ? this.baseUrl.origin : null;
  }

  async listKnownDevices(): Promise<FortiGateKnownDevice[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const endpointPaths = [
      "/api/v2/monitor/system/arp",
      "/api/v2/monitor/system/arp/select",
      "/api/v2/monitor/system/dhcp",
      "/api/v2/monitor/system/dhcp/select",
      "/api/v2/monitor/system/dhcp/lease",
      "/api/v2/monitor/system/dhcp/lease/select",
      "/api/v2/monitor/user/device/query",
      "/api/v2/monitor/user/device/select"
    ] as const;

    const responses = await Promise.all(
      endpointPaths.map(async (path) => ({
        path,
        payload: await this.fetchPath(path).catch(() => null)
      }))
    );

    const devicesByIp = new Map<string, FortiGateKnownDevice>();
    const devicesByMac = new Map<string, FortiGateKnownDevice>();

    for (const response of responses) {
      if (!response.payload) {
        continue;
      }

      for (const candidate of this.parseDeviceCandidates(response.payload, response.path)) {
        const normalizedIp = candidate.ipAddress.trim();
        const normalizedMac = candidate.macAddress
          ? this.normalizeMacAddress(candidate.macAddress)
          : undefined;

        const existing =
          devicesByIp.get(normalizedIp) ??
          (normalizedMac ? devicesByMac.get(normalizedMac) : undefined);
        const merged = this.mergeDevice(existing, {
          ...candidate,
          ipAddress: normalizedIp,
          macAddress: normalizedMac
        });

        devicesByIp.set(normalizedIp, merged);
        if (normalizedMac) {
          devicesByMac.set(normalizedMac, merged);
        }
      }
    }

    return Array.from(devicesByIp.values());
  }

  private async fetchPath(path: string): Promise<FortiGateApiResponse> {
    const url = new URL(path, this.baseUrl!.origin);
    if (this.vdom) {
      url.searchParams.set("vdom", this.vdom);
    }

    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise<FortiGateApiResponse>((resolve, reject) => {
      const request = requester(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number.parseInt(url.port, 10) : undefined,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiToken!}`
          },
          timeout: this.requestTimeoutMs,
          rejectUnauthorized: !this.allowSelfSigned
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(
                new Error(`FortiGate API ${path} returned status ${response.statusCode ?? 0}.`)
              );
              return;
            }

            try {
              resolve(JSON.parse(body) as FortiGateApiResponse);
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      request.on("error", reject);
      request.on("timeout", () => {
        request.destroy(new Error(`FortiGate API ${path} timed out.`));
      });
      request.end();
    });
  }

  private parseDeviceCandidates(
    payload: FortiGateApiResponse,
    sourcePath: string
  ): FortiGateKnownDevice[] {
    const records = this.extractRecords(payload);
    const candidates: FortiGateKnownDevice[] = [];

    for (const record of records) {
      const ipAddress = this.pickString(record, [
        "ip",
        "ip-address",
        "ip_address",
        "address",
        "addr",
        "assigned_ip",
        "lease_ip"
      ]);

      if (!ipAddress || !this.looksLikeIpv4(ipAddress)) {
        continue;
      }

      const hostname = this.pickString(record, [
        "hostname",
        "host-name",
        "name",
        "device-name",
        "device_name",
        "client-hostname",
        "description"
      ]);
      const macAddress = this.pickString(record, [
        "mac",
        "macaddr",
        "mac-address",
        "hardware_addr",
        "hardware-address"
      ]);
      const vendor = this.pickString(record, [
        "vendor",
        "manufacturer",
        "os_name"
      ]);
      const interfaceName = this.pickString(record, [
        "interface",
        "interface-name",
        "interface_name",
        "devname"
      ]);

      candidates.push({
        ipAddress,
        hostname,
        macAddress,
        vendor,
        interfaceName,
        sourcePath
      });
    }

    return candidates;
  }

  private extractRecords(payload: FortiGateApiResponse): Array<Record<string, unknown>> {
    const raw =
      payload.results ??
      payload.result ??
      payload.data ??
      [];

    if (Array.isArray(raw)) {
      return raw.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      );
    }

    if (raw && typeof raw === "object") {
      const objectEntries = Object.values(raw as Record<string, unknown>);
      if (objectEntries.every((entry) => entry && typeof entry === "object")) {
        return objectEntries.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
        );
      }
    }

    return [];
  }

  private mergeDevice(
    existing: FortiGateKnownDevice | undefined,
    incoming: FortiGateKnownDevice
  ): FortiGateKnownDevice {
    if (!existing) {
      return incoming;
    }

    return {
      ipAddress: incoming.ipAddress,
      hostname: existing.hostname ?? incoming.hostname,
      macAddress: existing.macAddress ?? incoming.macAddress,
      vendor: existing.vendor ?? incoming.vendor,
      interfaceName: existing.interfaceName ?? incoming.interfaceName,
      sourcePath: existing.sourcePath
    };
  }

  private pickString(
    record: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const direct = record[key];
      if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
      }
    }

    return undefined;
  }

  private looksLikeIpv4(value: string): boolean {
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
  }

  private normalizeMacAddress(value: string): string {
    return value.trim().toUpperCase().replace(/-/g, ":");
  }
}
