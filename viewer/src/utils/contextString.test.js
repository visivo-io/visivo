/* eslint-disable no-template-curly-in-string */
import { ContextString } from "./contextString";

describe("ContextString", () => {
  describe("toString", () => {
    it("returns the original value", () => {
      const ctx = new ContextString("${ref(foo)}");
      expect(ctx.toString()).toBe("${ref(foo)}");
    });
  });

  describe("equals", () => {
    it("returns true when context strings match", () => {
      const a = new ContextString("${ref(foo)}");
      const b = new ContextString("${ref(foo)}");
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when comparing with non-context string", () => {
      const a = new ContextString("${ref(foo)}");
      expect(a.equals("foo")).toBe(false);
    });
  });

  describe("getReference", () => {
    it("extracts the reference inside ref()", () => {
      const ctx = new ContextString("${ref(myMetric)}");
      expect(ctx.getReference()).toBe("myMetric");
    });

    it("returns null if no ref is found", () => {
      const ctx = new ContextString("plain string");
      expect(ctx.getReference()).toBeNull();
    });
  });

  describe("getRefPropsPath", () => {
    it("extracts the props path after ref()", () => {
      const ctx = new ContextString("${ref(myMetric).value}");
      expect(ctx.getRefPropsPath()).toBe(".value");
    });

    it("returns null if no props path exists", () => {
      const ctx = new ContextString("${ref(myMetric)}");
      expect(ctx.getRefPropsPath()).toBe("");
    });
  });

  describe("getPath", () => {
    it("returns null when no inline path is present", () => {
      const ctx = new ContextString("${ref(foo)}");
      expect(ctx.getPath()).toBeNull();
    });
  });

  describe("getRefAttr", () => {
    it("returns the whole matched ref string", () => {
      const ctx = new ContextString("${ref(myMetric).value}");
      expect(ctx.getRefAttr()).toBe("${ref(myMetric).value}");
    });

    it("returns null when no ref attr exists", () => {
      const ctx = new ContextString("${foo.bar}");
      expect(ctx.getRefAttr()).toBeNull();
    });
  });

  describe("getAllRefs", () => {
    it("returns all refs in the string", () => {
      const ctx = new ContextString("${ref(foo)} and ${ref(bar).baz}");
      expect(ctx.getAllRefs()).toEqual(["${ref(foo)}", "${ref(bar).baz}"]);
    });

    it("returns empty array if no refs found", () => {
      const ctx = new ContextString("plain text");
      expect(ctx.getAllRefs()).toEqual([]);
    });
  });

  describe("isContextString", () => {
    it("returns true for ContextString instance", () => {
      const ctx = new ContextString("${ref(foo)}");
      expect(ContextString.isContextString(ctx)).toBe(true);
    });

    it("returns true for valid context string", () => {
      expect(ContextString.isContextString("${ref(bar)}")).toBe(true);
    });

    it("returns false for plain string", () => {
      expect(ContextString.isContextString("hello")).toBe(false);
    });

    it("returns false for non-string object", () => {
      expect(ContextString.isContextString({})).toBe(false);
    });
  });
});
