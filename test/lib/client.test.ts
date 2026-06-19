import { describe, it, expect } from "vitest";
import { unwrapProject } from "../../src/lib/client.js";

describe("unwrapProject (v0.15.1: ProjectDetailResponse wrapper)", () => {
  it("unwraps a { project, task_count } response", () => {
    const wrapped = {
      project: { id: "p1", build_pipeline: "task_manager" },
      task_count: 5,
    };
    expect(unwrapProject(wrapped)).toEqual({
      id: "p1",
      build_pipeline: "task_manager",
    });
  });

  it("passes a flat project through unchanged (backward compat)", () => {
    const flat = { id: "p1", build_pipeline: "phase" };
    expect(unwrapProject(flat)).toBe(flat);
  });

  it("returns an empty object for null/undefined", () => {
    expect(unwrapProject(null)).toEqual({});
    expect(unwrapProject(undefined)).toEqual({});
  });

  it("preserves the generic type at call sites", () => {
    type T = { id: string; build_pipeline: "phase" | "task_manager" };
    const out = unwrapProject<T>({ project: { id: "x", build_pipeline: "task_manager" } });
    // Compile-time: out.build_pipeline is the union
    const pipeline: "phase" | "task_manager" = out.build_pipeline;
    expect(pipeline).toBe("task_manager");
  });
});
