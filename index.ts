#!/usr/bin/env node
import { runServer } from "./src/server.js";

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

runServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
