// Imported first by integration tests: points the app at a separate MongoDB
// database and a separate Redis database, so tests never touch dev or check
// data. Must run before config/env.ts loads.
const mongo = process.env.MONGO_URL ?? 'mongodb://localhost:27017/switchboard';
process.env.MONGO_URL = mongo.replace(/\/([^/?]*)(\?|$)/, '/switchboard_test$2');
const redis = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d*$/, '');
process.env.REDIS_URL = `${redis}/15`;
process.env.LOG_LEVEL ??= 'warn';
