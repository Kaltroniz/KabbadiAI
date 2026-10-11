/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * KabadiAI Resilient API Client
 * - Request deduplication for concurrent identical GET requests
 * - Configurable timeouts via AbortController
 * - Exponential backoff with full jitter for idempotent operations
 * - 429 rate limit handling honoring Retry-After headers
 * - Dual-mode AI Scan: S3 presigned PUT async pipeline with polling + legacy fallback
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export { MAP_TILE_URL };

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  idempotent?: boolean;
  onRetry?: (attempt: number, delayMs: number) => void;
}

// In-flight request deduplication map for GET requests
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Calculates exponential backoff with full jitter: delay = random_between(0, min(maxDelay, baseDelay * 2^attempt))
 */
function calculateJitteredBackoff(attempt: number, baseMs = 400, maxMs = 5000): number {
  const cap = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * cap);
}

/**
 * Sleep helper for backoff delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resilient fetch wrapper with timeout, retry, backoff, and deduplication
 */
export async function resilientFetch<T = any>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const method = (options.method || "GET").toUpperCase();
  const isIdempotent = options.idempotent ?? (method === "GET" || method === "HEAD");
  const maxRetries = options.retries ?? (isIdempotent ? 3 : 0);
  const timeoutMs = options.timeoutMs ?? (method === "GET" ? 12000 : 35000);

  // In-flight deduplication for identical GET requests
  if (method === "GET" && !options.signal) {
    const dedupKey = `${url}:${JSON.stringify(options.headers || {})}`;
    if (inFlightRequests.has(dedupKey)) {
      return inFlightRequests.get(dedupKey) as Promise<T>;
    }
    const promise = executeWithRetry<T>(url, options, maxRetries, timeoutMs)
      .finally(() => inFlightRequests.delete(dedupKey));
    inFlightRequests.set(dedupKey, promise);
    return promise;
  }

  return executeWithRetry<T>(url, options, maxRetries, timeoutMs);
}

async function executeWithRetry<T>(
  url: string,
  options: ApiFetchOptions,
  maxRetries: number,
  timeoutMs: number
): Promise<T> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Chain parent signal if provided
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Handle 429 Rate Limiting with Retry-After header
      if (response.status === 429) {
        if (attempt >= maxRetries) {
          throw new Error("Service is currently busy. Please wait a moment and try again.");
        }
        const retryAfterHeader = response.headers.get("Retry-After");
        const delayMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : calculateJitteredBackoff(attempt, 1000, 6000);

        if (options.onRetry) options.onRetry(attempt + 1, delayMs);
        await sleep(delayMs);
        attempt++;
        continue;
      }

      // Retry on transient 502/503/504 errors for idempotent operations
      if (response.status >= 502 && response.status <= 504 && attempt < maxRetries) {
        const delayMs = calculateJitteredBackoff(attempt);
        if (options.onRetry) options.onRetry(attempt + 1, delayMs);
        await sleep(delayMs);
        attempt++;
        continue;
      }

      // Non-retryable error
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData?.error) errorMessage = errorData.error;
      } catch {
        // ignore json parse error
      }
      throw new Error(errorMessage);

    } catch (err: any) {
      clearTimeout(timer);

      if (err.name === "AbortError") {
        if (options.signal?.aborted) {
          throw new Error("Request cancelled by user.");
        }
        if (attempt < maxRetries) {
          const delayMs = calculateJitteredBackoff(attempt);
          if (options.onRetry) options.onRetry(attempt + 1, delayMs);
          await sleep(delayMs);
          attempt++;
          continue;
        }
        throw new Error("Request timed out. Please check your network connection.");
      }

      // Network failures (offline, connection reset)
      if (attempt < maxRetries) {
        const delayMs = calculateJitteredBackoff(attempt);
        if (options.onRetry) options.onRetry(attempt + 1, delayMs);
        await sleep(delayMs);
        attempt++;
        continue;
      }

      throw err;
    }
  }

  throw new Error("Request failed after retries.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Async Scan Pipeline with Polling & Recovery
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanOptions {
  b64: string;
  mime: string;
  lang: string;
  coords?: { lat: number; lon: number };
  user_weight_g?: number;
  abortSignal?: AbortSignal;
  onProgress?: (stage: "uploading" | "queued" | "processing" | "completed", detail?: string) => void;
}

const ACTIVE_JOB_KEY = "kabadiai_active_scan_job";

export function getPersistedActiveJob(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACTIVE_JOB_KEY);
}

export function clearPersistedActiveJob(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACTIVE_JOB_KEY);
}

/**
 * Converts a base64 string to a binary Blob for direct S3 PUT upload
 */
function b64ToBlob(b64: string, mime: string): Blob {
  const byteChars = atob(b64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime });
}

/**
 * Polls GET /scan/jobs/{id} until the job completes or fails
 */
export async function pollScanJob(
  jobId: string,
  abortSignal?: AbortSignal,
  onProgress?: (stage: "queued" | "processing" | "completed", detail?: string) => void
): Promise<any> {
  const startTime = Date.now();
  const maxPollDurationMs = 50000; // 50 seconds max
  let intervalMs = 1200;

  while (Date.now() - startTime < maxPollDurationMs) {
    if (abortSignal?.aborted) {
      throw new Error("Scan cancelled by user.");
    }

    try {
      const jobData = await resilientFetch<any>(`/scan/jobs/${jobId}`, {
        method: "GET",
        signal: abortSignal,
        timeoutMs: 8000,
        retries: 2,
      });

      const status = jobData?.status;

      if (status === "COMPLETED" && jobData?.result) {
        clearPersistedActiveJob();
        if (onProgress) onProgress("completed");
        return jobData.result;
      }

      if (status === "FAILED") {
        clearPersistedActiveJob();
        throw new Error(jobData?.error || "AI scan could not process the photo.");
      }

      if (status === "PROCESSING") {
        if (onProgress) onProgress("processing", "AI models analyzing e-waste components…");
      } else {
        if (onProgress) onProgress("queued", "Waiting in processing queue…");
      }

      // Linear backoff for poll interval up to 3s
      await sleep(intervalMs);
      intervalMs = Math.min(3000, intervalMs + 400);

    } catch (err: any) {
      if (err.name === "AbortError" || abortSignal?.aborted) {
        throw new Error("Scan cancelled by user.");
      }
      // If temporary poll check failed, brief wait then continue
      await sleep(1500);
    }
  }

  clearPersistedActiveJob();
  throw new Error("Scan processing took longer than expected. Please try again.");
}

/**
 * Submits an image scan through the async pipeline, with automatic fallback to sync /agent
 */
export async function executeScan(options: ScanOptions): Promise<any> {
  const useAsync = process.env.NEXT_PUBLIC_ASYNC_SCAN !== "0";

  if (useAsync) {
    try {
      if (options.onProgress) options.onProgress("uploading", "Requesting secure direct upload URL…");

      // Step 1: Request presigned S3 upload URL
      const uploadRes = await resilientFetch<any>("/scan/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: options.mime,
          content_length: Math.round(options.b64.length * 0.75),
        }),
        signal: options.abortSignal,
        timeoutMs: 10000,
      });

      if (!uploadRes?.upload_url || !uploadRes?.s3_key || !uploadRes?.job_id) {
        throw new Error("Invalid upload URL response from server.");
      }

      const { upload_url, s3_key, job_id } = uploadRes;
      if (typeof window !== "undefined") {
        sessionStorage.setItem(ACTIVE_JOB_KEY, job_id);
      }

      // Step 2: Upload raw image binary directly to S3 via PUT
      if (options.onProgress) options.onProgress("uploading", "Uploading image directly to storage…");
      const imageBlob = b64ToBlob(options.b64, options.mime);
      const s3Upload = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": options.mime },
        body: imageBlob,
        signal: options.abortSignal,
      });

      if (!s3Upload.ok) {
        throw new Error(`Direct S3 upload failed with status ${s3Upload.status}`);
      }

      // Step 3: Enqueue scan job
      if (options.onProgress) options.onProgress("queued", "Enqueuing scan job for AI analysis…");
      await resilientFetch<any>("/scan/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id,
          s3_key,
          language: options.lang,
          lat: options.coords?.lat,
          lon: options.coords?.lon,
          user_weight_g: options.user_weight_g,
        }),
        signal: options.abortSignal,
        timeoutMs: 12000,
      });

      // Step 4: Poll until completion
      return await pollScanJob(job_id, options.abortSignal, options.onProgress);

    } catch (asyncErr: any) {
      if (options.abortSignal?.aborted) {
        clearPersistedActiveJob();
        throw asyncErr;
      }
      console.warn("Async scan pipeline bypassed due to error, falling back to sync /agent:", asyncErr.message);
      clearPersistedActiveJob();
    }
  }

  // Fallback: Synchronous legacy POST /agent
  if (options.onProgress) options.onProgress("processing", "Analyzing photo via fallback AI channel…");
  const payload: any = {
    image_b64: options.b64,
    media_type: options.mime,
    language: options.lang,
  };
  if (options.coords) {
    payload.lat = options.coords.lat;
    payload.lon = options.coords.lon;
  }
  if (options.user_weight_g) {
    payload.user_weight_g = options.user_weight_g;
  }

  return await resilientFetch<any>("/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.abortSignal,
    timeoutMs: 35000,
    retries: 1,
  });
}
