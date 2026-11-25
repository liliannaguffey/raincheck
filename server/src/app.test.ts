import request from "supertest";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";

test("GET /api/health reports API readiness", async () => {
  const response = await request(createApp())
    .get("/api/health")
    .expect("Content-Type", /json/)
    .expect(200);

  expect(response.body).toEqual({ status: "ok" });
});
