import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    runId: v.string(), agent: v.string(), kind: v.string(), message: v.string(),
    payloadJson: v.optional(v.union(v.string(), v.null())), iteration: v.number(), ts: v.number(),
  },
  handler: async (ctx, args) => await ctx.db.insert("agentEvents", args),
});

export const forRun = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) =>
    await ctx.db.query("agentEvents").withIndex("by_runId", (q) => q.eq("runId", runId)).collect(),
});
