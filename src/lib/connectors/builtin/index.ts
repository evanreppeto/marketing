// Barrel that guarantees the built-in connectors self-register. Importing this
// module runs each connector file for its `registerSignalSource` /
// `registerChannel` side effect, then re-exports the impls (so bundlers don't
// tree-shake the side-effecting imports away). Anything that needs a populated
// runtime registry — the detection orchestrator, the dispatch path, the arc
// connectors API — imports from here.
export { weatherSignalConnector, detectWeatherOpportunities } from "./weather-signal";
export { reviewsSignalConnector, detectReviewOpportunities } from "./reviews-signal";
export { webhookChannelConnector, dispatchWebhook } from "./webhook-channel";
