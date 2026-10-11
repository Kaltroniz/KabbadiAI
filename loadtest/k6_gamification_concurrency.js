import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const errorRate = new Rate('gamification_errors');
export const rewardDuration = new Trend('reward_update_duration');
export const luckySpinDuration = new Trend('lucky_spin_duration');

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    // 50 concurrent users firing rewards and lucky spins simultaneously
    concurrent_gamification: {
      executor: 'constant-vus',
      vus: 50,
      duration: '1m',
    },
  },
  thresholds: {
    'reward_update_duration': ['p(95)<350'],
    'lucky_spin_duration': ['p(95)<300'],
    'gamification_errors': ['rate<0.01'],
  },
};

export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const userEmail = `player_${vuId}@kabadiai-loadtest.in`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-Id': `gamification-k6-${vuId}-${iterId}`,
  };

  // 1. Scan reward test (atomic update + idempotency)
  // Half of the iterations re-use the same lot_id to simulate retries/replay attacks
  const lotId = iterId % 2 === 0 ? `lot_repeat_${vuId}` : `lot_unique_${vuId}_${iterId}`;
  const rewardPayload = JSON.stringify({
    items: [
      { component: 'mobile_phone', count: 1, est_weight_g: 180, condition: 'intact' },
      { component: 'copper_wire', count: 1, est_weight_g: 350, condition: 'intact' },
    ],
    user_id: userEmail,
    lot_id: lotId,
    last_scan_date: '2026-10-10',
    current_streak: 3,
    freeze_tokens: 1,
  });

  const rewardRes = http.post(`${BASE_URL}/gamification/scan-reward`, rewardPayload, { headers });
  rewardDuration.add(rewardRes.timings.duration);

  check(rewardRes, {
    'reward status 200': (r) => r.status === 200,
    'idempotency correctly handled': (r) => {
      try {
        const data = JSON.parse(r.body);
        // If it was a repeated lot, already_awarded should be true and total_xp 0
        if (iterId > 0 && iterId % 2 === 0) {
          return data.already_awarded === true;
        }
        return data.total_xp > 0;
      } catch {
        return false;
      }
    },
  });

  // 2. Lucky Spin test (24h cooldown conditional write)
  const spinPayload = JSON.stringify({ user_id: userEmail });
  const spinRes = http.post(`${BASE_URL}/gamification/lucky-spin`, spinPayload, { headers });
  luckySpinDuration.add(spinRes.timings.duration);

  check(spinRes, {
    'spin returns 200 on first try or 429 on cooldown': (r) => {
      return r.status === 200 || r.status === 429;
    },
  });

  sleep(0.5);
}
