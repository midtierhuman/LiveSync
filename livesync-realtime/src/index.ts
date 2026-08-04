import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

import { RedisOperationLog } from './services/operationLog';
import { RedisDocumentStateService } from './services/documentStateService';
import { DocumentAccessClient } from './services/documentAccessClient';
import { ConflictResolver } from './services/conflictResolver';
import { setupEditorSocket } from './sockets/editorSocket';

dotenv.config();

const PORT = process.env.PORT || 5000;
const API_BASE_URL = process.env.API_BASE_URL || process.env.Services__ApiBaseUrl || 'http://localhost:8080';
const REDIS_URL = process.env.REDIS_URL || process.env.Redis__ConnectionString || 'redis://localhost:6379';
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || '';

const parseAllowedOrigins = (rawValue: string): Set<string> => {
  const raw = (rawValue || '').trim();
  if (!raw) return new Set<string>();

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return new Set(
          parsed.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
        );
      }
    } catch {
      return new Set<string>();
    }
  }

  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
};

const allowedOrigins = parseAllowedOrigins(CORS_ALLOWED_ORIGINS);
if (allowedOrigins.size === 0) {
  ['http://localhost:4200', 'http://localhost:4000', 'http://localhost:5038'].forEach((origin) =>
    allowedOrigins.add(origin)
  );
}

const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true;
  return allowedOrigins.has(origin);
};

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin denied'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
);

app.use(express.json());

// Healthcheck route
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'UP', service: 'livesync-realtime' });
});

const server = http.createServer(app);

// Configure Redis client
const redisClient = new Redis(REDIS_URL);
const redisPubClient = redisClient;
const redisSubClient = redisClient.duplicate();

redisClient.on('connect', () => console.log('Connected to Redis successfully'));
redisClient.on('error', (err: unknown) => console.error('Redis Client Error:', err));
redisSubClient.on('error', (err: unknown) => console.error('Redis SubClient Error:', err));

// Initialize Services
const operationLog = new RedisOperationLog(redisClient);
const documentStateService = new RedisDocumentStateService(redisClient, operationLog);
const documentAccessClient = new DocumentAccessClient(API_BASE_URL);
const conflictResolver = new ConflictResolver();

// Configure Socket.IO Server
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Socket.IO origin denied'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e6, // 1MB message limit
  pingInterval: 10000, // Send a ping every 10 seconds
  pingTimeout: 5000, // Wait 5 seconds for pong before considering dead
});

// Wire Redis adapter so all replicas share rooms and broadcasts
io.adapter(createAdapter(redisPubClient, redisSubClient));

// Setup Socket.IO Handlers
const editorHub = setupEditorSocket(io, documentStateService, documentAccessClient, conflictResolver);

// Start stale connection sweeper & periodic PostgreSQL Write-Back flusher
editorHub.startStaleConnectionSweeper(30000);
editorHub.startPeriodicPostgresFlusher(60000);

server.listen(PORT, () => {
  console.log(`LiveSync Realtime Service listening on port ${PORT}`);
  console.log(`Connecting to API at: ${API_BASE_URL}`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down LiveSync Realtime Service...`);
  editorHub.stopStaleConnectionSweeper();
  editorHub.stopPeriodicPostgresFlusher();
  io.close(() => {
    server.close(async () => {
      try {
        await redisClient.quit();
        await redisSubClient.quit();
        console.log('Redis connections closed cleanly.');
      } catch (err) {
        console.error('Error closing Redis connections:', err);
      }
      process.exit(0);
    });
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
