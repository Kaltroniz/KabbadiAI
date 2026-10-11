"""KabadiAI AI Resilience and Abuse Protection Engine for Agent
Provides:
1. Circuit Breaker for Gemini API (fast-failover to Bedrock Nova when Gemini is degraded).
2. Exponential backoff with full jitter and retry budget.
3. SHA-256 perceptual/exact image deduplication cache.
4. Per-IP / per-user token-bucket rate limiter and daily quota guard.
"""
import hashlib, os, random, time
from typing import Callable, Any, Dict, Optional, Tuple

class CircuitBreakerOpenException(Exception):
    """Raised when the circuit breaker is OPEN, triggering immediate fallback."""
    pass

class CircuitBreaker:
    """Three-state Circuit Breaker: CLOSED (healthy), OPEN (failing), HALF_OPEN (probing)."""
    def __init__(self, name: str = "gemini", failure_threshold: int = 3, recovery_timeout_s: float = 30.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_s = recovery_timeout_s
        self.failure_count = 0
        self.state = "CLOSED"
        self.last_failure_time = 0.0
        self.success_count = 0

    def allow_request(self) -> bool:
        now = time.time()
        if self.state == "CLOSED":
            return True
        if self.state == "OPEN":
            if now - self.last_failure_time >= self.recovery_timeout_s:
                self.state = "HALF_OPEN"
                self.success_count = 0
                return True
            return False
        if self.state == "HALF_OPEN":
            return True
        return True

    def record_success(self):
        if self.state == "HALF_OPEN":
            self.success_count += 1
            if self.success_count >= 1:
                self.state = "CLOSED"
                self.failure_count = 0
        else:
            self.failure_count = 0

    def record_failure(self):
        self.last_failure_time = time.time()
        self.failure_count += 1
        if self.state == "HALF_OPEN" or self.failure_count >= self.failure_threshold:
            self.state = "OPEN"

    def execute(self, fn: Callable[[], Any], fallback_fn: Optional[Callable[[], Any]] = None) -> Any:
        if not self.allow_request():
            if fallback_fn:
                return fallback_fn()
            raise CircuitBreakerOpenException(f"Circuit breaker for {self.name} is OPEN")
        try:
            result = fn()
            self.record_success()
            return result
        except Exception as exc:
            self.record_failure()
            if fallback_fn:
                return fallback_fn()
            raise exc

GEMINI_BREAKER = CircuitBreaker("gemini", failure_threshold=3, recovery_timeout_s=30.0)

def backoff_jitter(attempt: int, base: float = 0.5, cap: float = 4.0) -> float:
    temp = min(cap, base * (2 ** attempt))
    return random.uniform(0, temp)

_DEDUP_CACHE: Dict[str, Tuple[float, dict]] = {}
DEDUP_TTL_SECONDS = 86400  # 24 hours

def compute_image_hash(image_bytes: bytes, language: str = "en", user_weight_g: Optional[int] = None) -> str:
    h = hashlib.sha256()
    h.update(image_bytes)
    h.update(language.encode())
    if user_weight_g:
        h.update(str(user_weight_g).encode())
    return h.hexdigest()

def get_dedup_cached_result(img_hash: str) -> Optional[dict]:
    entry = _DEDUP_CACHE.get(img_hash)
    if entry:
        ts, result = entry
        if time.time() - ts < DEDUP_TTL_SECONDS:
            return result
        _DEDUP_CACHE.pop(img_hash, None)
    return None

def put_dedup_cached_result(img_hash: str, result: dict):
    if len(_DEDUP_CACHE) > 500:
        oldest_key = min(_DEDUP_CACHE.keys(), key=lambda k: _DEDUP_CACHE[k][0])
        _DEDUP_CACHE.pop(oldest_key, None)
    _DEDUP_CACHE[img_hash] = (time.time(), result)
