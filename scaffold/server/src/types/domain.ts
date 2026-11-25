import type { ObjectId } from 'mongodb';

// Persistent document shapes. DB_SCHEMA.md explains every field and index.

export type ConversationState = 'open' | 'closed';
export type Direction = 'in' | 'out';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface LastMessagePreview {
  text: string;
  dir: Direction;
  at: Date;
}

export interface ConversationDoc {
  _id: ObjectId;
  workspace: string;
  contact: string;
  state: ConversationState;
  assignee: string | null;
  assignedAt: Date | null;
  lastActivityAt: Date;
  lastMessage: LastMessagePreview | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc {
  _id: ObjectId;
  workspace: string;
  contact: string;
  dir: Direction;
  text: string;
  occurredAt: Date;
  createdAt: Date;
  /** in: Pigeon pmsg_ id (dedupe key); out: Pigeon pm_ id once accepted */
  providerMessageId: string | null;

  // inbound
  eventId?: string;

  // outbound
  clientRef?: string;
  authorSub?: string | null;
  status?: DeliveryStatus;
  statusRank?: number;
  statusAt?: Date;

  // outbox: present only while a send is still owed
  outboxDueAt?: Date;
  outboxOwner?: string | null;
  sendAttempts?: number;
  lastSendError?: string | null;
  acceptedAt?: Date;
}

// Realtime events are not Mongo documents: see realtime/eventStream.ts (Redis Streams).
