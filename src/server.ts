import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "node:crypto";

// Polyfills for Web APIs in Node.js environment
if (typeof globalThis.ReadableStream === 'undefined') {
  const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web');
  (globalThis as any).ReadableStream = ReadableStream;
  (globalThis as any).WritableStream = WritableStream;
  (globalThis as any).TransformStream = TransformStream;
}

if (typeof globalThis.Blob === 'undefined') {
  const { Blob } = require('node:buffer');
  (globalThis as any).Blob = Blob;
}

if (typeof globalThis.File === 'undefined') {
  (globalThis as any).File = class {
    name: string;
    type: string;
    lastModified: number;
    size: number;
    webkitRelativePath: string = '';

    constructor(fileBits: any[], fileName: string, options: any = {}) {
      this.name = fileName;
      this.type = options.type || '';
      this.lastModified = options.lastModified || Date.now();
      this.size = 0;
      if (Array.isArray(fileBits)) {
        this.size = fileBits.reduce((acc: number, bit: any) => acc + (bit.length || bit.size || 0), 0);
      }
    }

    slice() { return new (globalThis as any).Blob(); }
    stream() { return new (globalThis as any).ReadableStream(); }
    text() { return Promise.resolve(''); }
    arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
  };
}

if (typeof globalThis.FormData === 'undefined') {
  const { FormData } = require('undici');
  (globalThis as any).FormData = FormData;
}

if (typeof globalThis.Headers === 'undefined') {
  const { Headers } = require('undici');
  (globalThis as any).Headers = Headers;
}

if (typeof globalThis.Request === 'undefined') {
  const { Request } = require('undici');
  (globalThis as any).Request = Request;
}

if (typeof globalThis.Response === 'undefined') {
  const { Response } = require('undici');
  (globalThis as any).Response = Response;
}
import { logger } from "./config/logger.js";
import { TOOLS } from "./tools/definitions.js";
import { handleToolCall } from "./tools/handlers.js";
import { setupResourceHandlers } from "./resources/handlers.js";
import { BrowserState } from "./types/global.js";
import { closeBrowser } from "./browser/connection.js";

// Initialize global state
const state: BrowserState = {
  consoleLogs: [],
  screenshots: new Map(),
};

// Create Express app
const app = express();

// Add CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Api-Key, mcp-session-id');
  res.header('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json());

// Function to create a fresh server instance for each request
function createServer(): Server {
  const server = new Server(
    {
      name: "example-servers/puppeteer",
      version: "0.7.2",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Setup resource handlers
  setupResourceHandlers(server, state);

  // Setup tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments ?? {}, state, server)
  );

  return server;
}

// Handle MCP requests
app.post('/mcp', async (req, res) => {
  try {
    logger.debug('Handling MCP request', {
      method: req.body?.method,
      sessionId: req.headers['mcp-session-id'],
      hasBody: !!req.body,
      headers: Object.keys(req.headers)
    });

    // Create fresh server and transport for each request (stateless mode)
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    // Handle cleanup on response close
    res.on('close', () => {
      logger.debug('Request closed, cleaning up');
      transport.close();
      server.close();
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle the request
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    logger.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

let httpServer: any;

// Handle server shutdown
process.on('SIGINT', async () => {
  logger.info("Puppeteer MCP Server shutting down");

  // Close browser
  await closeBrowser();

  // Close HTTP server
  if (httpServer) {
    httpServer.close();
  }

  process.exit(0);
});

// Start the server
export async function runServer() {
  try {
    const port = process.env.PORT || 3000;
    logger.info(`Starting MCP HTTP server on port ${port}`);

    httpServer = app.listen(port, () => {
      logger.info(`MCP server started successfully on port ${port}`);
      logger.info(`Health check available at http://localhost:${port}/health`);
      logger.info(`MCP endpoint available at http://localhost:${port}/mcp`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}
