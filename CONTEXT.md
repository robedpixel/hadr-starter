# Parking Agent

A personal, single-user agent — exposed as a Telegram bot — that reads travel-destination requests the user sends it, resolves the destination in Singapore, and suggests nearby car parks — warning when a car park's free lots are running low.

## Language

**Availability**:
The number of free (unoccupied) lots in a car park, or that number as a percentage of the car park's total capacity. This is the quantity the agent measures and reasons about.
_Avoid_: Occupancy (means the inverse — how *full* the car park is — and caused a requirements contradiction; do not use it to describe free space).

**Low-availability warning**:
A caution the agent attaches to a car-park suggestion when its Availability falls below the Availability threshold, signalling that the remaining lots may be taken before the user arrives. It is a static check against current Availability only — it does not account for the user's travel time.
_Avoid_: "Occupancy warning".

**Availability threshold**:
The configured cut-off below which a car park's Availability is considered "low" and triggers a Low-availability warning. Expressed as a percentage of capacity with an absolute-lots floor.

**Parking request**:
A message from the user expressing intent to drive somewhere in Singapore, from which the agent derives a Destination.
_Avoid_: Query, command.

**Destination**:
The single Singapore place the user wants to drive to, resolved to coordinates. A request with no in-Singapore Destination is refused.
_Avoid_: Location (too vague), address (only one of several accepted forms).

**Car park**:
A parking facility near a Destination **for which the agent has live Availability data**. Facilities without live data are out of scope — the agent never considers or mentions them. The agent suggests Car parks; it does not reserve or pay for them.

**Full**:
A Car park with zero free lots. Full Car parks are excluded from Suggestions.

**Suggestion**:
The agent's response to a valid Parking request: a short, ranked shortlist of non-Full Car parks near the Destination, each with its current Availability and, where applicable, a Low-availability warning. Below-threshold Car parks are still included (carrying the warning); only Full ones are omitted.

**Suggest-another**:
A follow-up request in which the user, unsatisfied with a Suggestion, asks the agent for the next-best Car parks not yet offered for the current Parking request, until the candidates are exhausted.
