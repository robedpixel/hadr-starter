# LTA DataMall for live car-park availability

Live car-park Availability comes from the **LTA DataMall Carpark Availability** API. It was chosen over data.gov.sg's HDB-only feed because DataMall has the broadest coverage (LTA, HDB, and URA car parks, including commercial lots near malls and attractions — the places a user actually drives to) and returns available lots, total lots, and location, giving us both Availability and capacity for the threshold logic.

Requires a free LTA DataMall API key. data.gov.sg's HDB feed can be added later as a supplementary source if coverage gaps appear.

## Consequences

- Car parks absent from DataMall (e.g. some private/attraction lots) will have no Availability; the agent says so rather than inventing a suggestion.
