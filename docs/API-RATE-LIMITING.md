# Gemini / Groq request scheduling

`server/api-rate-limit.js` exports one shared `rateLimitedFetch`. Both real provider transports use it by default; injected test transports remain deterministic.

- A batch contains at most three HTTP requests across both providers. The next batch starts only after all response bodies complete and a one-second pause.
- HTTP 429 retries wait 15, 30, and 60 seconds. A longer numeric or HTTP-date Retry-After is respected. Waiting releases the queue slot.
- This means one initial attempt plus three retries (four HTTP attempts). This resolves the overlapping request for three retry intervals and switching after three failures by counting three failed retries. After exhaustion, the existing automatic mode switches from Gemini to Groq once. It does not loop back indefinitely. Explicit provider-only mode stays provider-only.
- Other HTTP errors are not blindly retried. Existing provider fallback rules and factual verification remain in force.
- Cancellation interrupts retry waits and prevents another request. Provider time budgets are ten minutes to accommodate backoff; original checks still reject incomplete or unsupported results.
- Rate-limit exhaustion shows a dismissible, persistent Japanese status message instead of opening the failure dialog. Other errors retain their diagnostic UI.
- A single application process shares the queue. Multiple independent app/server instances have independent queues. This does not increase account quotas or solve daily exhaustion.

Transport integration:

```js
import {rateLimitedFetch} from './api-rate-limit.js';
// Both Gemini and Groq default their fetchImpl to rateLimitedFetch.
```

Tests inject a fake clock/sleep, without spending API quota. Live provider success is not implied by these tests.
