import { useParams } from 'react-router';
import { messageFor } from '../../constants/uiMessages';
import { conversationAbilities } from '../../domain/permissions';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FullPageSpinner } from '../../shared/ui/Spinner';
import { useRequiredWorkspace } from '../workspace/useWorkspace';
import { Composer } from './Composer';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { useConversation } from './useConversation';
import { useMessages } from './useMessages';
import { useReply } from './useReply';

export function ConversationPane() {
  const { contact = '' } = useParams(); // react-router decodes the param ("+1415...")
  const { workspaceId, sub, role } = useRequiredWorkspace();

  const conv = useConversation(workspaceId, contact);
  const msgs = useMessages(workspaceId, contact);
  const reply = useReply(workspaceId, contact, sub);

  if (conv.isPending) return <FullPageSpinner label="Loading conversation" />;
  if (conv.isError)
    return (
      <div className="center-fill">
        <EmptyState title={messageFor(conv.error)}>
          <Button size="sm" onClick={() => conv.refetch()}>
            Try again
          </Button>
        </EmptyState>
      </div>
    );

  const abilities = conversationAbilities(conv.data, sub, role);

  return (
    <section className="conversation" aria-label={`Conversation with ${contact}`}>
      <ConversationHeader conversation={conv.data} workspace={workspaceId} sub={sub} role={role} />
      {msgs.isPending ? (
        <FullPageSpinner label="Loading messages" />
      ) : msgs.isError ? (
        <EmptyState title={messageFor(msgs.error)}>
          <Button size="sm" onClick={() => msgs.refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : (
        <MessageList
          messages={msgs.messages}
          hasOlder={Boolean(msgs.hasNextPage)}
          loadingOlder={msgs.isFetchingNextPage}
          onLoadOlder={() => msgs.fetchNextPage()}
          onRetry={reply.retry}
        />
      )}
      <Composer onSend={reply.send} disabledReason={abilities.canReply ? undefined : abilities.replyBlockedReason} />
    </section>
  );
}

export function NoConversationSelected() {
  return (
    <div className="center-fill">
      <EmptyState title="Select a conversation to start." />
    </div>
  );
}
