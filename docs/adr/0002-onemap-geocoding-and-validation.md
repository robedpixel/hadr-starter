# OneMap for both geocoding and Singapore validity

Destinations are resolved with **OneMap** (the Singapore government's official map API), which also *doubles as the "is this location in Singapore?" validator*: because OneMap only covers Singapore, a successful geocode result implies the place is in-country. A location is treated as valid iff OneMap returns at least one result, with an SG bounding-box check on the coordinates as a belt-and-braces sanity check.

This was chosen over Google Maps Geocoding (global, paid beyond a free tier, would require a *separate* explicit country check). OneMap is free, authoritative for SG addresses and 6-digit postal codes, and collapses two requirements (resolve the destination + reject out-of-SG locations) into one API.

## Consequences

- Validation logic is coupled to OneMap's coverage; a place OneMap doesn't know is treated as invalid/out-of-SG even if it exists.
- Ambiguous queries (multiple OneMap matches) are surfaced to the user to disambiguate rather than guessed.
