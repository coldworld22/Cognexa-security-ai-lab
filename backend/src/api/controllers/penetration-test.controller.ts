import { randomUUID } from "crypto";

import { Request, Response } from "express";
import { Logger } from "pino";

import {
  AdvancedPenetrationTestRunDetail,
  AdvancedPenetrationTestRunSummary,
  AdminService
} from "../../services/admin/admin.service";
import { initializeSse, sendSseEvent } from "../../utils/streaming";

export class PenetrationTestController {
  private readonly logger: Logger;

  constructor(
    private readonly admin: AdminService,
    logger: Logger
  ) {
    this.logger = logger.child({
      controller: "penetration-test"
    });
  }

  listRuns = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit?: number };
    const runs = await this.admin.listAdvancedPenetrationTests(
      request.auth!,
      limit
    );

    response.json({ runs });
  };

  getRun = async (request: Request, response: Response) => {
    const run = await this.admin.getAdvancedPenetrationTestRun(
      request.auth!,
      request.params.runId as string
    );

    response.json({ run });
  };

  getReport = async (request: Request, response: Response) => {
    const report = await this.admin.getAdvancedPenetrationTestReport(
      request.auth!,
      request.params.runId as string
    );

    response.json({ report });
  };

  startStream = async (request: Request, response: Response) => {
    const runId = randomUUID();
    const orchestrator = await this.admin.startAdvancedPenetrationTest(
      request.auth!,
      {
        target: request.body.target as string,
        verificationId: request.body.verificationId as string,
        authProfiles: request.body.authProfiles as
          | Array<{
              name: string;
              role: "anonymous" | "low_privilege" | "high_privilege";
              headers?: Record<string, string>;
              cookies?: Record<string, string>;
            }>
          | undefined,
        authEndpointDescriptors: request.body.authEndpointDescriptors as
          | Array<{
              type: "auth_api";
              name: string;
              entryUrl: string;
              endpoint: string;
              method?: "POST";
              contentType?: string;
              fields: string[];
              tokenFields?: string[];
              stagingOnly?: boolean;
              productionMode?: "passive_only";
            }>
          | undefined,
        manualFormValidation: request.body.manualFormValidation as
          | {
              rateLimitPerMinute?: number;
              credentialLabels?: string[];
              notes?: string;
            }
          | undefined,
        maxPages: request.body.maxPages as number | undefined,
        maxRequests: request.body.maxRequests as number | undefined,
        conversationId: request.body.conversationId as string | undefined,
        runId
      }
    );

    initializeSse(response);
    this.safeSend(response, "started", {
      runId,
      target: request.body.target,
      timestamp: new Date().toISOString(),
      message: "Advanced AI penetration test started."
    });

    const emitter = orchestrator.getEventEmitter();
    const onUpdate = (event: unknown) => {
      if (!response.writableEnded && !response.destroyed) {
        this.safeSend(response, "update", event);
      }
    };

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      emitter.off("update", onUpdate);
      request.off("close", cleanup);
      response.off("close", cleanup);
    };

    emitter.on("update", onUpdate);
    request.on("close", cleanup);
    response.on("close", cleanup);

    void orchestrator
      .run()
      .then(async () => {
        const run = await this.admin.getAdvancedPenetrationTestRun(
          request.auth!,
          runId
        );
        cleanup();
        this.safeSend(response, "finished", {
          runId,
          run,
          report: run.report,
          message: "Advanced AI penetration test completed."
        });
        response.end();
      })
      .catch(async (error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Advanced AI penetration test failed.";

        this.logger.error(
          {
            error,
            runId,
            target: request.body.target
          },
          "Advanced penetration test stream failed"
        );

        let latestRun: AdvancedPenetrationTestRunDetail | null = null;
        try {
          latestRun = await this.admin.getAdvancedPenetrationTestRun(
            request.auth!,
            runId
          );
        } catch {
          latestRun = null;
        }

        cleanup();
        this.safeSend(response, "error", {
          runId,
          error: message,
          run: latestRun
        });
        response.end();
      });
  };

  private safeSend(
    response: Response,
    event: string,
    data:
      | Record<string, unknown>
      | AdvancedPenetrationTestRunSummary[]
      | AdvancedPenetrationTestRunDetail
      | unknown
  ): void {
    if (response.writableEnded || response.destroyed) {
      return;
    }

    sendSseEvent(response, event, data);
  }
}
