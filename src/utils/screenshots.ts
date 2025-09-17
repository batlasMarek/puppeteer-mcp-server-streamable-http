import { writeFile, mkdir, access } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../config/logger.js";

// Default screenshots directory
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || "screenshots";

/**
 * Ensure screenshots directory exists
 */
export async function ensureScreenshotsDir(): Promise<string> {
  try {
    await access(SCREENSHOTS_DIR);
    logger.debug('Screenshots directory exists', { dir: SCREENSHOTS_DIR });
  } catch {
    logger.info('Creating screenshots directory', { dir: SCREENSHOTS_DIR });
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
  }
  return SCREENSHOTS_DIR;
}

/**
 * Save screenshot to disk
 */
export async function saveScreenshotToDisk(
  name: string,
  base64Data: string,
  timestamp?: string
): Promise<string> {
  try {
    const screenshotsDir = await ensureScreenshotsDir();

    // Create filename with timestamp if provided
    const timestampSuffix = timestamp ? `_${timestamp}` : `_${Date.now()}`;
    const filename = `${name}${timestampSuffix}.png`;
    const filepath = join(screenshotsDir, filename);

    // Convert base64 to buffer and save
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filepath, buffer);

    logger.info('Screenshot saved to disk', {
      name,
      filepath,
      size: buffer.length
    });

    return filepath;
  } catch (error) {
    logger.error('Failed to save screenshot to disk', {
      name,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Generate a safe filename from screenshot name
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Get screenshot file path
 */
export function getScreenshotPath(name: string, timestamp?: string): string {
  const timestampSuffix = timestamp ? `_${timestamp}` : `_${Date.now()}`;
  const filename = `${sanitizeFilename(name)}${timestampSuffix}.png`;
  return join(SCREENSHOTS_DIR, filename);
}