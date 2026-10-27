// k6 smoke: guest session, then one collect per iteration.
// Usage: k6 run -e BASE_URL=http://127.0.0.1:8000 ops/k6/collect.js
import http from "k6/http";
import { check, sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
  },
};

const BASE = __ENV.BASE_URL || "http://127.0.0.1:8000";

export default function () {
  const device = `k6-${__VU}-${uuidv4()}`;
  const session = http.post(
    `${BASE}/api/v1/session`,
    JSON.stringify({ universe_seed_name: "atlas-main", device_id: device }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(session, { "session 201": (r) => r.status === 201 });
  if (session.status !== 201) return;
  const token = session.json("data.access_token");
  const x = Math.floor(Math.random() * 1_000_000);
  const planetKey = `planet_${x},2,3_0_probe`;
  const response = http.post(
    `${BASE}/api/v1/planets/${encodeURIComponent(planetKey)}/collect`,
    JSON.stringify({ coordinates: `${x},2,3` }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": uuidv4(),
      },
    },
  );
  check(response, { "collect 200": (r) => r.status === 200 });
  sleep(0.2);
}
