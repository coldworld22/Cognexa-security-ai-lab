import { AssistantWorkspace } from "@/components/app/assistant-workspace";

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;

  return <AssistantWorkspace conversationId={conversationId} />;
}
