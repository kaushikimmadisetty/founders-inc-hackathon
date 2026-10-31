import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: { runId: v.string(), kind: v.string(), url: v.string(), label: v.optional(v.string()), iteration: v.number(), ts: v.number() },
  handler: async (ctx, args) => await ctx.db.insert("artifacts", args),
});

export const forRun = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) =>
    await ctx.db.query("artifacts").withIndex("by_runId", (q) => q.eq("runId", runId)).collect(),
});
