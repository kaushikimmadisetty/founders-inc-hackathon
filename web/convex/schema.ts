import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  runs: defineTable({
    runId: v.string(),
    prompt: v.string(),
    source: v.string(),
    phone: v.optional(v.string()),
    status: v.string(),
    iteration: v.number(),
    specJson: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
  }).index("by_runId", ["runId"]),
  agentEvents: defineTable({
    runId: v.string(),
    agent: v.string(),
    kind: v.string(),
    message: v.string(),
    payloadJson: v.optional(v.union(v.string(), v.null())),
    iteration: v.number(),
    ts: v.number(),
  }).index("by_runId", ["runId"]),
  artifacts: defineTable({
    runId: v.string(),
    kind: v.string(),
    url: v.string(),
    label: v.optional(v.string()),
    iteration: v.number(),
    ts: v.number(),
  }).index("by_runId", ["runId"]),
  simReports: defineTable({
    runId: v.string(),
    iteration: v.number(),
    passed: v.boolean(),
    failureClass: v.optional(v.string()),
    failureDetail: v.optional(v.string()),
    routeTo: v.optional(v.string()),
    metricsJson: v.string(),
    gifUrl: v.optional(v.union(v.string(), v.null())),
    trajectoryUrl: v.optional(v.union(v.string(), v.null())),
  }).index("by_runId", ["runId"]),
});
