import type { WorkspaceSummary } from "@/lib/types";

const WORKSPACE_HINTS_STORAGE_KEY = "cognexa.login.workspace-hints";
const MAX_WORKSPACE_HINTS = 6;

export interface WorkspaceHint {
  id: string;
  slug: string;
  name: string;
  organizationName: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function createWorkspaceHint(workspace: WorkspaceSummary): WorkspaceHint {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    organizationName: workspace.organizationName
  };
}

function writeWorkspaceHints(hints: WorkspaceHint[]): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    WORKSPACE_HINTS_STORAGE_KEY,
    JSON.stringify(hints.slice(0, MAX_WORKSPACE_HINTS))
  );
}

function normalizeWorkspaceQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function readWorkspaceHints(): WorkspaceHint[] {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_HINTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as WorkspaceHint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(WORKSPACE_HINTS_STORAGE_KEY);
    return [];
  }
}

export function persistWorkspaceHints(
  workspaces: WorkspaceSummary[],
  selectedWorkspaceId?: string
): WorkspaceHint[] {
  const latest = workspaces.map(createWorkspaceHint);
  const existing = readWorkspaceHints();
  const byId = new Map<string, WorkspaceHint>();
  const selectedHint =
    latest.find((workspace) => workspace.id === selectedWorkspaceId) ??
    existing.find((workspace) => workspace.id === selectedWorkspaceId);

  if (selectedHint) {
    byId.set(selectedHint.id, selectedHint);
  }

  for (const workspace of latest) {
    if (!byId.has(workspace.id)) {
      byId.set(workspace.id, workspace);
    }
  }

  for (const workspace of existing) {
    if (!byId.has(workspace.id)) {
      byId.set(workspace.id, workspace);
    }
  }

  const next = Array.from(byId.values()).slice(0, MAX_WORKSPACE_HINTS);
  writeWorkspaceHints(next);
  return next;
}

export function findWorkspaceMatch(
  workspaces: WorkspaceSummary[],
  query: string
): WorkspaceSummary | null {
  const normalizedQuery = normalizeWorkspaceQuery(query);

  if (!normalizedQuery) {
    return null;
  }

  const exactMatch = workspaces.find((workspace) => {
    const candidates = [
      workspace.slug,
      workspace.name,
      workspace.organizationName,
      `${workspace.organizationName}/${workspace.slug}`,
      `${workspace.organizationName}/${workspace.name}`
    ]
      .map(normalizeWorkspaceQuery)
      .filter(Boolean);

    return candidates.includes(normalizedQuery);
  });

  if (exactMatch) {
    return exactMatch;
  }

  return (
    workspaces.find((workspace) => {
      const candidates = [workspace.slug, workspace.name, workspace.organizationName]
        .map(normalizeWorkspaceQuery)
        .filter(Boolean);

      return candidates.some((candidate) => candidate.includes(normalizedQuery));
    }) ?? null
  );
}
