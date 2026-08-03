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

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*'],
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

// Initialize Services
const operationLog = new RedisOperationLog(redisClient);
const documentStateService = new RedisDocumentStateService(redisClient, operationLog);
const documentAccessClient = new DocumentAccessClient(API_BASE_URL);
const conflictResolver = new ConflictResolver();

// Configure Socket.IO Server
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
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

// Start stale connection sweeper to clean up orphaned Redis entries every 30 seconds
editorHub.startStaleConnectionSweeper(30000);

server.listen(PORT, () => {
  console.log(`LiveSync Realtime Service listening on port ${PORT}`);
  console.log(`Connecting to API at: ${API_BASE_URL}`);
});
