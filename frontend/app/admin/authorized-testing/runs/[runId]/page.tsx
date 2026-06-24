import { AdminAuthorizedTestingRunEntry } from "@/components/auth/admin-authorized-testing-run-entry";

export default async function AdminAuthorizedTestingRunPage({
  params
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return <AdminAuthorizedTestingRunEntry runId={runId} />;
}
