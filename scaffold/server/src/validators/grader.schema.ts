import { z } from 'zod';

const workspace = z.string().min(1).max(128);
const contact = z.string().min(1).max(64);

export const GraderReplyBody = z.object({
  workspace,
  contact,
  text: z.string().min(1).max(4096),
  client_ref: z.string().min(1).max(200),
});

export const GraderClaimBody = z.object({
  workspace,
  contact,
  agent: z.string().min(1).max(200),
});
