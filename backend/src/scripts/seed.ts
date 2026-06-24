import bcrypt from "bcrypt";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { CanonicalUserRole } from "../authorization/authorization.types";
import { createLogger } from "../config/logger";
import { env } from "../config/env";
import { TaskMetadata } from "../database/entities/task.entity";
import { createPostgresPool } from "../database/postgres";
import { AgentRepository } from "../database/repositories/agent.repository";
import { ConversationRepository } from "../database/repositories/conversation.repository";
import { EmbeddingRepository } from "../database/repositories/embedding.repository";
import { FileRepository } from "../database/repositories/file.repository";
import { MemoryRepository } from "../database/repositories/memory.repository";
import { MessageRepository } from "../database/repositories/message.repository";
import { OrganizationRepository } from "../database/repositories/organization.repository";
import { PolicyAuditLogRepository } from "../database/repositories/policy-audit-log.repository";
import { PolicyRepository } from "../database/repositories/policy.repository";
import { TaskRepository } from "../database/repositories/task.repository";
import { ToolExecutionRepository } from "../database/repositories/tool-execution.repository";
import { UserRepository } from "../database/repositories/user.repository";
import { WorkspaceInvitationRepository } from "../database/repositories/workspace-invitation.repository";
import { WorkspaceMemberRepository } from "../database/repositories/workspace-member.repository";
import { WorkspaceRepository } from "../database/repositories/workspace.repository";
import { runMigrations } from "../database/migration-runner";
import { PolicyService } from "../services/policy/policy.service";
import { WorkspaceService } from "../services/workspace/workspace.service";
import { resolveBackendPath } from "../utils/paths";
import { WorkspaceRole, WorkspaceSummary } from "../workspaces/workspace.types";

interface SeedUserDefinition {
  email: string;
  displayName: string;
  role: CanonicalUserRole;
  workspaceRole: WorkspaceRole;
}

interface SeedRepositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  workspaces: WorkspaceRepository;
  workspaceMembers: WorkspaceMemberRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  memories: MemoryRepository;
  files: FileRepository;
  embeddings: EmbeddingRepository;
  agents: AgentRepository;
  tasks: TaskRepository;
  toolExecutions: ToolExecutionRepository;
  policyAuditLogs: PolicyAuditLogRepository;
}

const SEED_PASSWORD = "SeedPass123!";
const SHARED_WORKSPACE_SEED_KEY = "seed:shared-workspace:v1";
const CURRENT_WORKSPACE_AUDIT_SEED_KEY = "seed:policy-audit:v1";

async function main(): Promise<void> {
  const logger = createLogger();
  const postgres = createPostgresPool(env.POSTGRES_URL);

  try {
    await runMigrations(postgres, logger);

    const repositories: SeedRepositories = {
      users: new UserRepository(postgres),
      organizations: new OrganizationRepository(postgres),
      workspaces: new WorkspaceRepository(postgres),
      workspaceMembers: new WorkspaceMemberRepository(postgres),
      conversations: new ConversationRepository(postgres),
      messages: new MessageRepository(postgres),
      memories: new MemoryRepository(postgres),
      files: new FileRepository(postgres),
      embeddings: new EmbeddingRepository(postgres),
      agents: new AgentRepository(postgres),
      tasks: new TaskRepository(postgres),
      toolExecutions: new ToolExecutionRepository(postgres),
      policyAuditLogs: new PolicyAuditLogRepository(postgres)
    };
    const policies = new PolicyRepository(postgres);
    const workspaceInvitations = new WorkspaceInvitationRepository(postgres);
    const policyService = new PolicyService(policies, repositories.policyAuditLogs);
    const workspaceService = new WorkspaceService(
      repositories.users,
      repositories.organizations,
      repositories.workspaces,
      repositories.workspaceMembers,
      workspaceInvitations,
      policyService
    );

    const admin = await ensureUser(
      repositories.users,
      workspaceService,
      env.ADMIN_LOGIN,
      env.ADMIN_DISPLAY_NAME,
      "super_admin",
      env.ADMIN_PASSWORD
    );
    const adminSession = await workspaceService.listSessionForUser(admin);
    const currentWorkspace = adminSession.currentWorkspace;

    const additionalUsers = [
      {
        email: "maya.analyst@seed.local",
        displayName: "Maya Analyst",
        role: "manager",
        workspaceRole: "admin"
      },
      {
        email: "sam.engineer@seed.local",
        displayName: "Sam Engineer",
        role: "developer",
        workspaceRole: "member"
      },
      {
        email: "lina.auditor@seed.local",
        displayName: "Lina Auditor",
        role: "viewer",
        workspaceRole: "viewer"
      }
    ] satisfies SeedUserDefinition[];

    const seededUsers = new Map<string, Awaited<ReturnType<typeof ensureUser>>>();
    for (const definition of additionalUsers) {
      const user = await ensureUser(
        repositories.users,
        workspaceService,
        definition.email,
        definition.displayName,
        definition.role,
        SEED_PASSWORD
      );
      seededUsers.set(definition.email, user);
    }

    const sharedWorkspace = await ensureSharedWorkspace(
      postgres,
      repositories,
      policyService,
      admin.id
    );

    await repositories.workspaceMembers.upsert({
      workspaceId: sharedWorkspace.id,
      userId: admin.id,
      role: "owner",
      invitedByUserId: admin.id
    });

    for (const definition of additionalUsers) {
      const user = seededUsers.get(definition.email);
      if (!user) {
        continue;
      }

      await repositories.workspaceMembers.upsert({
        workspaceId: sharedWorkspace.id,
        userId: user.id,
        role: definition.workspaceRole,
        invitedByUserId: admin.id
      });
    }

    await seedCurrentWorkspaceData(
      postgres,
      repositories,
      currentWorkspace,
      admin.id
    );
    await seedSharedWorkspaceData(
      postgres,
      repositories,
      sharedWorkspace,
      admin.id,
      seededUsers.get("sam.engineer@seed.local")?.id ?? admin.id
    );
    await ensurePolicyAuditLogs(
      postgres,
      repositories.policyAuditLogs,
      currentWorkspace,
      admin.id
    );

    const summary = await loadSummary(postgres);
    console.log("Seed completed.");
    console.log(
      JSON.stringify(
        {
          database: env.POSTGRES_URL,
          currentWorkspace: {
            id: currentWorkspace.id,
            name: currentWorkspace.name,
            slug: currentWorkspace.slug
          },
          sharedWorkspace: {
            id: sharedWorkspace.id,
            name: sharedWorkspace.name,
            slug: sharedWorkspace.slug
          },
          sampleCredentials: additionalUsers.map((definition) => ({
            email: definition.email,
            password: SEED_PASSWORD,
            role: definition.role
          })),
          counts: summary
        },
        null,
        2
      )
    );
  } finally {
    await postgres.end();
  }
}

async function ensureUser(
  users: UserRepository,
  workspaceService: WorkspaceService,
  email: string,
  displayName: string,
  role: CanonicalUserRole,
  password: string
) {
  const passwordHash = await bcrypt.hash(password, 12);
  await users.upsert({
    email,
    displayName,
    passwordHash,
    role
  });

  const user = await requireUser(users, email);
  await workspaceService.ensureProvisionedForUser(user);
  return (await requireUser(users, email));
}

async function ensureSharedWorkspace(
  postgres: ReturnType<typeof createPostgresPool>,
  repositories: Pick<
    SeedRepositories,
    "organizations" | "workspaces"
  >,
  policyService: PolicyService,
  createdByUserId: string
): Promise<WorkspaceSummary> {
  const existing = await findWorkspaceBySeedKey(postgres, SHARED_WORKSPACE_SEED_KEY);
  if (existing) {
    return existing;
  }

  const organization = await repositories.organizations.create({
    name: "Seed Security Operations",
    slug: "seed-security-operations",
    billingEmail: env.ADMIN_LOGIN,
    subscriptionPlan: "enterprise",
    subscriptionStatus: "active",
    metadata: {
      seeded: true,
      seedKey: SHARED_WORKSPACE_SEED_KEY
    },
    createdByUserId
  });

  const workspace = await repositories.workspaces.create({
    organizationId: organization.id,
    name: "Threat Hunting",
    slug: "threat-hunting",
    metadata: {
      seeded: true,
      seedKey: SHARED_WORKSPACE_SEED_KEY
    },
    createdByUserId
  });

  await policyService.ensureWorkspaceDefaults(workspace.id, createdByUserId);

  return {
    id: workspace.id,
    organizationId: organization.id,
    organizationName: organization.name,
    name: workspace.name,
    slug: workspace.slug,
    role: "owner",
    isPersonal: workspace.isPersonal,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  };
}

async function seedCurrentWorkspaceData(
  postgres: ReturnType<typeof createPostgresPool>,
  repositories: SeedRepositories,
  workspace: WorkspaceSummary,
  userId: string
): Promise<void> {
  await repositories.memories.upsert({
    workspaceId: workspace.id,
    userId,
    memoryType: "preference",
    key: "response_style",
    value: "Prefer concise, tester-oriented summaries with clear next actions.",
    score: 0.95
  });
  await repositories.memories.upsert({
    workspaceId: workspace.id,
    userId,
    memoryType: "long_term",
    key: "primary_focus",
    value: "Investigate suspicious automation, RAG quality, and workspace policy drift.",
    score: 0.9
  });

  const triageConversation = await ensureConversation(
    postgres,
    repositories.conversations,
    workspace.id,
    userId,
    "Triage suspicious PowerShell alert",
    env.DEFAULT_LLM_PROVIDER,
    env.DEFAULT_LLM_MODEL
  );
  await ensureConversationMessages(postgres, repositories.messages, triageConversation.id, [
    {
      workspaceId: workspace.id,
      conversationId: triageConversation.id,
      role: "user",
      content:
        "Review this alert: repeated PowerShell execution from a workstation after a phishing report."
    },
    {
      workspaceId: workspace.id,
      conversationId: triageConversation.id,
      role: "assistant",
      content:
        "Initial triage suggests suspicious script execution. Check parent process lineage, encoded command usage, and outbound connections."
    },
    {
      workspaceId: workspace.id,
      conversationId: triageConversation.id,
      role: "tool",
      content:
        "{\"query\":\"PowerShell encoded command detection playbook\",\"hits\":2}",
      toolName: "documentation-search"
    },
    {
      workspaceId: workspace.id,
      conversationId: triageConversation.id,
      role: "assistant",
      content:
        "Recommended next step: isolate the endpoint if the encoded command reaches credential stores or remote download utilities."
    }
  ]);
  await repositories.conversations.touch(triageConversation.id);

  const ciConversation = await ensureConversation(
    postgres,
    repositories.conversations,
    workspace.id,
    userId,
    "Review CI secret scanning findings",
    env.DEFAULT_LLM_PROVIDER,
    env.DEFAULT_LLM_MODEL
  );
  await ensureConversationMessages(postgres, repositories.messages, ciConversation.id, [
    {
      workspaceId: workspace.id,
      conversationId: ciConversation.id,
      role: "user",
      content:
        "Summarize the secret scanning findings from the last CI run and suggest the highest priority remediation."
    },
    {
      workspaceId: workspace.id,
      conversationId: ciConversation.id,
      role: "assistant",
      content:
        "Two high-confidence findings appear to be exposed service tokens in test fixtures. Rotate them first, then move them into environment-backed secrets."
    }
  ]);
  await repositories.conversations.touch(ciConversation.id);

  const runbookFile = await ensureFile(
    postgres,
    repositories.files,
    workspace.id,
    userId,
    "incident-response-runbook.md",
    "text/markdown",
    [
      "# Incident Response Runbook",
      "",
      "1. Validate the alert source and triage scope.",
      "2. Capture host, process, and network evidence.",
      "3. Contain active compromise before credential rotation.",
      "4. Preserve artifacts for root-cause analysis."
    ].join("\n"),
    "indexed"
  );
  await ensureEmbeddings(postgres, repositories.embeddings, workspace.id, runbookFile.id, [
    "Validate the alert source before containment begins.",
    "Capture host, process, and network evidence for root-cause analysis."
  ]);

  await ensureFile(
    postgres,
    repositories.files,
    workspace.id,
    userId,
    "agent-hardening-notes.txt",
    "text/plain",
    [
      "Workspace policy posture can be opened or tightened per tenant.",
      "Tool-level guardrails still enforce SSRF and read-only database boundaries.",
      "Track policy audit logs for every evaluated request."
    ].join("\n"),
    "indexed"
  );

  await ensureFile(
    postgres,
    repositories.files,
    workspace.id,
    userId,
    "pending-customer-questionnaire.txt",
    "text/plain",
    "Awaiting approval before indexing customer-provided architecture notes.",
    "uploaded"
  );

  await ensureFile(
    postgres,
    repositories.files,
    workspace.id,
    userId,
    "corrupted-scan-export.json",
    "application/json",
    "{ invalid-json",
    "failed"
  );

  const agent = await ensureAgent(
    postgres,
    repositories.agents,
    workspace.id,
    userId,
    "SOC Copilot",
    "Assists with alert triage, incident summarization, and evidence gathering.",
    "You are a pragmatic security operations copilot. Summarize findings, highlight risk, and recommend only safe next actions.",
    ["documentation-search", "repository-search", "file-search", "calculator"]
  );

  const completedTask = await ensureTask(
    postgres,
    repositories.tasks,
    workspace.id,
    agent.id,
    triageConversation.id,
    "Summarize PowerShell alert evidence",
    "Summarize the suspicious PowerShell execution and suggest the next containment action.",
    "completed",
    "The activity looks suspicious because it pairs encoded PowerShell execution with follow-up network behavior. Containment should focus on the host and any exposed credentials."
  );

  const completedExecution = await ensureToolExecution(
    postgres,
    repositories.toolExecutions,
    workspace.id,
    completedTask.id,
    "documentation-search",
    {
      query: "PowerShell encoded command incident response"
    },
    {
      hits: [
        "PowerShell incident playbook",
        "Credential theft containment checklist"
      ]
    },
    "completed"
  );

  const completedMetadata: TaskMetadata = {
    steps: [
      {
        id: "collect-context",
        title: "Collect response guidance",
        rationale: "Use the knowledge base to frame the alert response.",
        status: "completed",
        startedAt: completedTask.createdAt,
        finishedAt: completedTask.updatedAt,
        note: "Referenced incident response documentation before summarizing the alert.",
        toolName: "documentation-search",
        toolInput: {
          query: "PowerShell encoded command incident response"
        },
        toolExecutionId: completedExecution.id,
        toolOutputPreview:
          "{\"hits\":[\"PowerShell incident playbook\",\"Credential theft containment checklist\"]}"
      },
      {
        id: "produce-summary",
        title: "Write containment summary",
        rationale: "Turn the collected evidence into a tester-friendly summary.",
        status: "completed",
        startedAt: completedTask.createdAt,
        finishedAt: completedTask.updatedAt,
        note: "Summarized the evidence and recommended immediate host isolation."
      }
    ],
    executedTools: ["documentation-search"],
    reasoningLog: [
      "[collect-context] Referenced incident documentation to avoid ad-hoc response advice.",
      "[produce-summary] Focused the summary on containment, credential exposure, and follow-up collection."
    ],
    finalSummary:
      "The seeded task indicates likely malicious PowerShell behavior with follow-up network activity. The next action is host isolation and credential review.",
    lastUpdatedAt: new Date().toISOString()
  };
  await repositories.tasks.updateState(completedTask.id, {
    metadata: completedMetadata,
    result: completedTask.result,
    status: completedTask.status
  });

  const failedTask = await ensureTask(
    postgres,
    repositories.tasks,
    workspace.id,
    agent.id,
    ciConversation.id,
    "Validate suspicious SQL from alert notes",
    "Check whether the SQL snippet from analyst notes is safe to execute.",
    "failed",
    "Execution was blocked because the query was incomplete and potentially unsafe."
  );

  const failedExecution = await ensureToolExecution(
    postgres,
    repositories.toolExecutions,
    workspace.id,
    failedTask.id,
    "database-query",
    {
      sql: "SELECT * FROM credentials WHERE "
    },
    {},
    "failed",
    "Rejected incomplete SQL during seeded demo execution."
  );

  const failedMetadata: TaskMetadata = {
    steps: [
      {
        id: "inspect-sql",
        title: "Inspect the SQL snippet",
        rationale: "Determine whether the note can be executed safely.",
        status: "failed",
        startedAt: failedTask.createdAt,
        finishedAt: failedTask.updatedAt,
        note: "The SQL statement ended with an unsafe trailing predicate.",
        toolName: "database-query",
        toolInput: {
          sql: "SELECT * FROM credentials WHERE "
        },
        toolExecutionId: failedExecution.id,
        error: "Rejected incomplete SQL during seeded demo execution."
      }
    ],
    executedTools: ["database-query"],
    reasoningLog: [
      "[inspect-sql] Failed: Rejected incomplete SQL during seeded demo execution."
    ],
    finalSummary:
      "The sample task failed intentionally to demonstrate an unsafe database operation in the task timeline.",
    lastUpdatedAt: new Date().toISOString()
  };
  await repositories.tasks.updateState(failedTask.id, {
    metadata: failedMetadata,
    result: failedTask.result,
    status: failedTask.status
  });
}

async function seedSharedWorkspaceData(
  postgres: ReturnType<typeof createPostgresPool>,
  repositories: SeedRepositories,
  workspace: WorkspaceSummary,
  adminUserId: string,
  actorUserId: string
): Promise<void> {
  const conversation = await ensureConversation(
    postgres,
    repositories.conversations,
    workspace.id,
    actorUserId,
    "Hunt for anomalous authentication burst",
    env.DEFAULT_LLM_PROVIDER,
    env.DEFAULT_LLM_MODEL
  );
  await ensureConversationMessages(postgres, repositories.messages, conversation.id, [
    {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      role: "user",
      content:
        "Investigate the overnight spike in authentication attempts across the engineering VPN."
    },
    {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      role: "assistant",
      content:
        "Correlate source IP distribution, failed-to-success ratios, and any new user-agent clusters before deciding whether the spike is benign."
    }
  ]);
  await repositories.conversations.touch(conversation.id);

  await repositories.memories.upsert({
    workspaceId: workspace.id,
    userId: adminUserId,
    memoryType: "preference",
    key: "workspace_focus",
    value: "Threat hunting workspace prioritizes authentication and endpoint anomalies.",
    score: 0.85
  });
}

async function ensureConversation(
  postgres: ReturnType<typeof createPostgresPool>,
  conversations: ConversationRepository,
  workspaceId: string,
  userId: string,
  title: string,
  modelProvider: string,
  modelName: string
) {
  const existing = await postgres.query<{ id: string }>(
    `SELECT id
     FROM conversations
     WHERE workspace_id = $1 AND user_id = $2 AND title = $3
     LIMIT 1`,
    [workspaceId, userId, title]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const conversation = await conversations.findById(existing.rows[0]!.id);
    if (conversation) {
      return conversation;
    }
  }

  return conversations.create({
    workspaceId,
    userId,
    title,
    modelProvider,
    modelName
  });
}

async function ensureConversationMessages(
  postgres: ReturnType<typeof createPostgresPool>,
  messages: MessageRepository,
  conversationId: string,
  inputs: Array<{
    workspaceId: string;
    conversationId: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolName?: string;
  }>
): Promise<void> {
  const countResult = await postgres.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM messages
     WHERE conversation_id = $1`,
    [conversationId]
  );

  if ((countResult.rows[0]?.count ?? 0) > 0) {
    return;
  }

  for (const input of inputs) {
    await messages.create(input);
  }
}

async function ensureFile(
  postgres: ReturnType<typeof createPostgresPool>,
  files: FileRepository,
  workspaceId: string,
  userId: string,
  fileName: string,
  mimeType: string,
  content: string,
  status: "uploaded" | "indexed" | "failed"
) {
  const existing = await postgres.query<{
    id: string;
    path: string;
  }>(
    `SELECT id, path
     FROM files
     WHERE workspace_id = $1 AND user_id = $2 AND file_name = $3
     LIMIT 1`,
    [workspaceId, userId, fileName]
  );

  const uploadsDirectory = path.resolve(resolveBackendPath(env.UPLOADS_PATH), "seed");
  await mkdir(uploadsDirectory, { recursive: true });
  const filePath = path.join(uploadsDirectory, fileName);
  await writeFile(filePath, content, "utf-8");

  if ((existing.rowCount ?? 0) > 0) {
    await files.updateStatus(existing.rows[0]!.id, status);
    return {
      id: existing.rows[0]!.id,
      path: existing.rows[0]!.path,
      status
    };
  }

  const file = await files.create({
    workspaceId,
    userId,
    fileName,
    mimeType,
    path: filePath,
    sizeBytes: Buffer.byteLength(content)
  });
  if (status !== "uploaded") {
    await files.updateStatus(file.id, status);
  }

  return {
    id: file.id,
    path: file.path,
    status
  };
}

async function ensureEmbeddings(
  postgres: ReturnType<typeof createPostgresPool>,
  embeddings: EmbeddingRepository,
  workspaceId: string,
  fileId: string,
  chunks: string[]
): Promise<void> {
  const existing = await postgres.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM embeddings
     WHERE file_id = $1`,
    [fileId]
  );

  if ((existing.rows[0]?.count ?? 0) > 0) {
    return;
  }

  await embeddings.insertMany(
    chunks.map((content, index) => ({
      workspaceId,
      fileId,
      chunkIndex: index,
      content,
      vector: createVector(index + 1),
      metadata: {
        seeded: true,
        chunkLabel: `seed-chunk-${index + 1}`
      }
    }))
  );
}

async function ensureAgent(
  postgres: ReturnType<typeof createPostgresPool>,
  agents: AgentRepository,
  workspaceId: string,
  userId: string,
  name: string,
  description: string,
  instructions: string,
  enabledTools: string[]
) {
  const existing = await postgres.query<{ id: string }>(
    `SELECT id
     FROM agents
     WHERE workspace_id = $1 AND user_id = $2 AND name = $3
     LIMIT 1`,
    [workspaceId, userId, name]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const agent = await agents.findById(existing.rows[0]!.id);
    if (agent) {
      return agent;
    }
  }

  return agents.create({
    workspaceId,
    userId,
    name,
    description,
    instructions,
    enabledTools
  });
}

async function ensureTask(
  postgres: ReturnType<typeof createPostgresPool>,
  tasks: TaskRepository,
  workspaceId: string,
  agentId: string,
  conversationId: string,
  title: string,
  objective: string,
  status: "queued" | "running" | "completed" | "failed",
  result: string
) {
  const existing = await postgres.query<{ id: string }>(
    `SELECT id
     FROM tasks
     WHERE workspace_id = $1 AND agent_id = $2 AND title = $3
     LIMIT 1`,
    [workspaceId, agentId, title]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const task = await tasks.findById(existing.rows[0]!.id);
    if (task) {
      return task;
    }
  }

  return tasks.create({
    workspaceId,
    agentId,
    conversationId,
    title,
    objective,
    status,
    result
  });
}

async function ensureToolExecution(
  postgres: ReturnType<typeof createPostgresPool>,
  toolExecutions: ToolExecutionRepository,
  workspaceId: string,
  taskId: string,
  toolName: string,
  inputPayload: Record<string, unknown>,
  outputPayload: Record<string, unknown>,
  status: "started" | "completed" | "failed",
  errorMessage?: string
) {
  const existing = await postgres.query<{ id: string }>(
    `SELECT id
     FROM tool_executions
     WHERE workspace_id = $1 AND task_id = $2 AND tool_name = $3
     LIMIT 1`,
    [workspaceId, taskId, toolName]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const rows = await toolExecutions.findByTaskId(taskId);
    const toolExecution = rows.find(
      (candidate) => candidate.id === existing.rows[0]!.id
    );
    if (toolExecution) {
      return toolExecution;
    }
  }

  return toolExecutions.create({
    workspaceId,
    taskId,
    toolName,
    inputPayload,
    outputPayload,
    status,
    errorMessage
  });
}

async function ensurePolicyAuditLogs(
  postgres: ReturnType<typeof createPostgresPool>,
  policyAuditLogs: PolicyAuditLogRepository,
  workspace: WorkspaceSummary,
  userId: string
): Promise<void> {
  const existing = await postgres.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM policy_audit_logs
     WHERE workspace_id = $1
       AND request_context ->> 'seedKey' = $2`,
    [workspace.id, CURRENT_WORKSPACE_AUDIT_SEED_KEY]
  );

  if ((existing.rows[0]?.count ?? 0) > 0) {
    return;
  }

  await policyAuditLogs.create({
    userId,
    workspaceId: workspace.id,
    organizationId: workspace.organizationId,
    action: "chat.stream_message",
    category: "document_access",
    decision: "allow",
    mode: "open",
    scopeType: "workspace",
    scopeId: workspace.id,
    requestContext: {
      seedKey: CURRENT_WORKSPACE_AUDIT_SEED_KEY,
      contentPreview: "Summarize the uploaded incident response runbook."
    }
  });

  await policyAuditLogs.create({
    userId,
    workspaceId: workspace.id,
    organizationId: workspace.organizationId,
    action: "tools.execute",
    category: "database_queries",
    toolName: "database-query",
    decision: "allow",
    mode: "open",
    scopeType: "workspace",
    scopeId: workspace.id,
    requestContext: {
      seedKey: CURRENT_WORKSPACE_AUDIT_SEED_KEY,
      sqlPreview: "SELECT id, email FROM users LIMIT 10"
    }
  });
}

async function findWorkspaceBySeedKey(
  postgres: ReturnType<typeof createPostgresPool>,
  seedKey: string
): Promise<WorkspaceSummary | null> {
  const result = await postgres.query<{
    id: string;
    organization_id: string;
    organization_name: string;
    name: string;
    slug: string;
    is_personal: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT
       w.id,
       w.organization_id,
       o.name AS organization_name,
       w.name,
       w.slug,
       w.is_personal,
       w.created_at,
       w.updated_at
     FROM workspaces w
     INNER JOIN organizations o ON o.id = w.organization_id
     WHERE w.metadata ->> 'seedKey' = $1
     LIMIT 1`,
    [seedKey]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  const row = result.rows[0]!;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    name: row.name,
    slug: row.slug,
    role: "owner",
    isPersonal: row.is_personal,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function requireUser(users: UserRepository, email: string) {
  const user = await users.findByEmail(email);
  if (!user) {
    throw new Error(`Expected user '${email}' to exist after upsert`);
  }

  return user;
}

function createVector(seed: number): number[] {
  const vector = Array.from({ length: env.EMBEDDING_DIMENSION }, () => 0);
  vector[seed % env.EMBEDDING_DIMENSION] = 1;
  vector[(seed * 7) % env.EMBEDDING_DIMENSION] = 0.5;
  vector[(seed * 13) % env.EMBEDDING_DIMENSION] = 0.25;
  return vector;
}

async function loadSummary(postgres: ReturnType<typeof createPostgresPool>) {
  const result = await postgres.query<{
    users: number;
    organizations: number;
    workspaces: number;
    conversations: number;
    messages: number;
    files: number;
    embeddings: number;
    agents: number;
    tasks: number;
    tool_executions: number;
    policy_audit_logs: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM organizations) AS organizations,
      (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
      (SELECT COUNT(*)::int FROM conversations) AS conversations,
      (SELECT COUNT(*)::int FROM messages) AS messages,
      (SELECT COUNT(*)::int FROM files) AS files,
      (SELECT COUNT(*)::int FROM embeddings) AS embeddings,
      (SELECT COUNT(*)::int FROM agents) AS agents,
      (SELECT COUNT(*)::int FROM tasks) AS tasks,
      (SELECT COUNT(*)::int FROM tool_executions) AS tool_executions,
      (SELECT COUNT(*)::int FROM policy_audit_logs) AS policy_audit_logs
  `);

  return result.rows[0]!;
}

main().catch((error: unknown) => {
  console.error("Database seed failed", error);
  process.exitCode = 1;
});
