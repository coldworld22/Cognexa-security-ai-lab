import { AdminAuthorizedTestingAdvancedRunEntry } from "@/components/auth/admin-authorized-testing-advanced-run-entry";

export default async function AdminAuthorizedTestingAdvancedRunPage({
  params
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return <AdminAuthorizedTestingAdvancedRunEntry runId={runId} />;
}
