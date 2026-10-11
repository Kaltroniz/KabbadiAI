import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');
export const readLatency = new Trend('read_endpoint_duration');

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    // 1. Ramp Profile: ramp up to 150 req/sec (target peak read capacity for 50k DAU)
    ramp_test: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '30s', target: 50 },   // Warmup to 50 req/s
        { duration: '1m', target: 150 },    // Ramp to peak 150 req/s
        { duration: '2m', target: 150 },    // Sustain peak read traffic
        { duration: '30s', target: 0 },     // Ramp down
      ],
    },
    // 2. Spike Profile: sudden traffic burst to 250 req/sec
    spike_test: {
      executor: 'ramping-arrival-rate',
      startTime: '4m',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { duration: '10s', target: 250 },   // Instant spike to 250 req/s
        { duration: '30s', target: 250 },   // Hold spike
        { duration: '20s', target: 50 },    // Recover
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500'],     // Target: p95 < 500 ms for read endpoints
    'read_endpoint_duration': ['p(95)<400'],
    'errors': ['rate<0.01'],                // Error rate < 1%
  },
};

export default function () {
  const endpoints = [
    '/stats',
    '/hotspots',
    '/recyclers?lat=28.6139&lon=77.2090',
    '/gamification/leaderboard?city=delhi&xp=1500&name=KabaadiTester',
    '/gamification/profile',
  ];

  // Pick random read endpoint
  const path = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = `${BASE_URL}${path}`;

  const params = {
    headers: {
      'Accept': 'application/json',
      'X-Correlation-Id': `k6-${__VU}-${__ITER}`,
    },
    tags: { name: path.split('?')[0] },
  };

  const res = http.get(url, params);
  readLatency.add(res.timings.duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'has valid json body': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}
