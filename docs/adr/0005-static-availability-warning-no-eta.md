# Low-availability warning is static, with no travel-time/ETA modelling

The `REQS.md` phrase *"may be taken before I arrive"* is served **only** by a static Low-availability warning: the agent compares a car park's *current* Availability against the Availability threshold and warns if it is below. It deliberately does **not** estimate the user's ETA, model how fast lots are emptying, or otherwise reason about time-to-arrival.

This is recorded because a future reader will see "before I arrive" in the requirements and reasonably expect ETA/fill-rate logic — its absence is intentional, not an oversight. The trade-off (chosen by the owner): a static check is far simpler and has no dependency on live traffic/routing data, at the cost of not accounting for the drive time itself.

## Consequences

- ETA-aware or fill-rate-aware warnings are explicitly out of scope for v1; adding them later is a contained, additive change.
