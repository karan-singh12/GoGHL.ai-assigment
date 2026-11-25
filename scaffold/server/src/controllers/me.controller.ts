import type { Request, Response } from 'express';
import { respond } from '../utils/respond.js';

export const meController = {
  /** GET /api/me: contract E, raw shape `{ sub, workspaces: [{ id, role }] }` (+ name/email for the UI). */
  me(req: Request, res: Response) {
    const u = req.user!;
    return respond.raw(res, 200, {
      sub: u.sub,
      name: u.name,
      email: u.email,
      workspaces: u.workspaces.map(({ id, role }) => ({ id, role })),
    });
  },
};
