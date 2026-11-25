import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { jsonRoutes, rawRoutes } from './routes/index.js';

/** Builds the Express app. No I/O here, so tests can create it without a server. */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // the check's load balancer and Vite's proxy run on localhost

  // 1. cross-cutting
  app.use(requestId);
  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(cookieParser());

  // 2. raw-body routes (webhooks) must see the bytes before any JSON parser
  app.use(rawRoutes);

  // 3. JSON routes
  app.use(express.json({ limit: '100kb' }));
  app.use(jsonRoutes);

  // 4. fallthrough
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
