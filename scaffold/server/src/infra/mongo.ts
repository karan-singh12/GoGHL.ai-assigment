import { MongoClient, type Db } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let client: MongoClient | undefined;
let db: Db | undefined;

export async function connectMongo(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.mongoUrl, {
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 50,
    // Every acknowledged write is on disk before we answer 2xx (crash safety, level 2).
    writeConcern: { w: 'majority', journal: true },
  });
  await client.connect();
  db = client.db();
  await db.command({ ping: 1 });
  logger.info('mongo connected', { db: db.databaseName });
  return db;
}

/** The connected database. Throws if called before connectMongo() so misuse is loud. */
export function getDb(): Db {
  if (!db) throw new Error('MongoDB is not connected yet; call connectMongo() during boot');
  return db;
}

export async function pingMongo(): Promise<boolean> {
  try {
    await getDb().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}

/** E11000: the unique index already holds this document, which for us means "already stored". */
export const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
