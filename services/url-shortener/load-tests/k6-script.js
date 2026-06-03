import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const SHORT_CODES = [];

export function setup() {
  // Pre-create some short URLs for read testing
  const urls = ['https://github.com', 'https://google.com', 'https://stackoverflow.com'];
  urls.forEach(url => {
    const res = http.post(
      `${BASE_URL}/api/shorten`,
      JSON.stringify({ url }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status === 200 || res.status === 201) {
      SHORT_CODES.push(JSON.parse(res.body).shortCode);
    }
  });
  return { shortCodes: SHORT_CODES };
}

export default function (data) {
  // 80% reads (analytics), 20% writes (new shorten) — realistic ratio
  if (Math.random() < 0.8 && data.shortCodes.length > 0) {
    const code = data.shortCodes[Math.floor(Math.random() * data.shortCodes.length)];
    const res = http.get(`${BASE_URL}/api/analytics/${code}`);
    check(res, { 'analytics status 200': (r) => r.status === 200 });
  } else {
    const res = http.post(
      `${BASE_URL}/api/shorten`,
      JSON.stringify({ url: `https://example.com/${Math.random()}` }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    check(res, { 'shorten status 200': (r) => r.status === 200 || r.status === 201 });
  }
  sleep(0.1);
}
