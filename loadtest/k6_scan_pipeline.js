import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const errorRate = new Rate('scan_errors');
export const uploadUrlDuration = new Trend('upload_url_duration');
export const jobSubmitDuration = new Trend('job_submit_duration');
export const jobPollDuration = new Trend('job_poll_duration');

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    // Ramp to 20 AI scans/sec (Target peak capacity for 50k DAU)
    scan_pipeline_load: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 150,
      stages: [
        { duration: '30s', target: 10 },    // Warmup to 10 scans/s
        { duration: '1m', target: 20 },     // Ramp to target peak 20 scans/s
        { duration: '2m', target: 20 },     // Sustain 20 scans/s peak
        { duration: '30s', target: 0 },      // Cool down
      ],
    },
  },
  thresholds: {
    'upload_url_duration': ['p(95)<300'],
    'job_submit_duration': ['p(95)<400'],
    'scan_errors': ['rate<0.02'],
  },
};

export default function () {
  const correlationId = `scan-k6-${__VU}-${__ITER}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-Id': correlationId,
  };

  // Step 1: Request presigned S3 upload URL
  const uploadPayload = JSON.stringify({
    media_type: 'image/jpeg',
    content_length: 125000,
  });

  const uploadRes = http.post(`${BASE_URL}/scan/upload-url`, uploadPayload, { headers });
  uploadUrlDuration.add(uploadRes.timings.duration);

  let uploadOk = check(uploadRes, {
    'upload-url status 200': (r) => r.status === 200,
    'has upload_url and job_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.upload_url && body.job_id && body.s3_key);
      } catch {
        return false;
      }
    },
  });

  if (!uploadOk) {
    errorRate.add(1);
    return;
  }

  const uploadData = JSON.parse(uploadRes.body);
  const { job_id, s3_key } = uploadData;

  // Step 2: Enqueue async scan job to SQS
  const jobPayload = JSON.stringify({
    job_id: job_id,
    s3_key: s3_key,
    language: 'hi',
    lat: 28.6139,
    lon: 77.2090,
    user_weight_g: 1500,
  });

  const submitRes = http.post(`${BASE_URL}/scan/jobs`, jobPayload, { headers });
  jobSubmitDuration.add(submitRes.timings.duration);

  let submitOk = check(submitRes, {
    'job submit status 202': (r) => r.status === 202,
    'job status is QUEUED': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'QUEUED';
      } catch {
        return false;
      }
    },
  });

  if (!submitOk) {
    errorRate.add(1);
    return;
  }

  // Step 3: Poll for job completion
  sleep(1);
  const pollRes = http.get(`${BASE_URL}/scan/jobs/${job_id}`, { headers });
  jobPollDuration.add(pollRes.timings.duration);

  check(pollRes, {
    'poll status 200': (r) => r.status === 200,
  });

  errorRate.add(0);
}
