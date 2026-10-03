import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { IssueStore } from "../../src/tracker/store.js";

let store: IssueStore;
beforeEach(() => {
  store = new IssueStore(path.join(mkdtempSync(path.join(tmpdir(), "store-")), "issues.json"));
});

describe("IssueStore", () => {
  it("starts from the seed with every issue open", () => {
    expect(store.list().length).toBe(store.all().length);
  });

  it("rejects labels outside the allowed set", () => {
    expect(() => store.addLabels(1, ["urgent!!"])).toThrow(/Unknown label/);
  });

  it("closes an issue once", () => {
    store.close(11, "fixed");
    expect(store.get(11).state).toBe("closed");
    expect(() => store.close(11, "again")).toThrow(/already closed/);
  });
});
