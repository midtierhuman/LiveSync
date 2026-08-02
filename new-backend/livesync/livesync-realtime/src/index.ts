import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
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
const CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',')
  : ['http://localhost:4200', 'http://localhost:4000', 'http://localhost:3000'];

const app = express();
app.use(express.json());

// Healthcheck route
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'UP', service: 'livesync-realtime' });
});

const server = http.createServer(app);

// Configure Redis client
const redisClient = new Redis(REDIS_URL);
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
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e6, // 1MB message limit
});

// Setup Socket Handlers
setupEditorSocket(io, documentStateService, documentAccessClient, conflictResolver);

server.listen(PORT, () => {
  console.log(`LiveSync Realtime Service listening on port ${PORT}`);
  console.log(`Connecting to API at: ${API_BASE_URL}`);
});
