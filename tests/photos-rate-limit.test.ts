import { describe, expect, it } from "vitest";
import { consumeDailyRequest } from "../src/handlers/photos.js";

describe("photo daily limit", () => {
  it("allows thirty requests and resets on the following UTC day", () => {
    const user = {
      telegram_id: 1,
      last_request_ts: 0,
      request_count: 0,
      request_day: "2026-08-16",
      page: 0,
    };
    const today = new Date("2026-08-16T12:00:00.000Z");
    for (let request = 0; request < 30; request += 1) {
      expect(consumeDailyRequest(user, today)).toBe(true);
    }
    expect(consumeDailyRequest(user, today)).toBe(false);
    expect(consumeDailyRequest(user, new Date("2026-08-17T00:00:00.000Z"))).toBe(true);
    expect(user.request_count).toBe(1);
  });
});
