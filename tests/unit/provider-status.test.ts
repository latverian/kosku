import { describe, expect, it } from "vitest";
import { mapProviderStatus, shouldAdvance } from "@/lib/messaging/provider-status";

describe("status pengiriman WA", () => {
  it("memetakan status penyedia", () => {
    expect(mapProviderStatus("DELIVERED")).toBe("delivered");
    expect(mapProviderStatus("read")).toBe("read");
    expect(mapProviderStatus("pending")).toBeNull();
  });
  it("hanya maju", () => {
    expect(shouldAdvance("sent", "read")).toBe(true);
    expect(shouldAdvance("read", "delivered")).toBe(false);
    expect(shouldAdvance("sent", "failed")).toBe(true);
    expect(shouldAdvance("read", "failed")).toBe(false);
  });
});
