import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    runId: v.string(), prompt: v.string(), source: v.string(), phone: v.optional(v.string()),
    status: v.string(), iteration: v.number(), specJson: v.optional(v.union(v.string(), v.null())), createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("runs").withIndex("by_runId", (q) => q.eq("runId", args.runId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, iteration: args.iteration, specJson: args.specJson ?? existing.specJson });
      return existing._id;
    }
    return await ctx.db.insert("runs", args);
  },
});

export const get = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) =>
    await ctx.db.query("runs").withIndex("by_runId", (q) => q.eq("runId", runId)).unique(),
});

export const recent = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("runs").order("desc").take(20),
});
