import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    runId: v.string(), iteration: v.number(), passed: v.boolean(), failureClass: v.optional(v.string()),
    failureDetail: v.optional(v.string()), routeTo: v.optional(v.string()), metricsJson: v.string(),
    gifUrl: v.optional(v.union(v.string(), v.null())), trajectoryUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => await ctx.db.insert("simReports", args),
});

export const forRun = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) =>
    await ctx.db.query("simReports").withIndex("by_runId", (q) => q.eq("runId", runId)).collect(),
});
