const request = require("supertest");
const { eq, and } = require("drizzle-orm");
const { app } = require("../../app");
const { db } = require("../../lib/db");
const { jobs, STATUS } = require("../../db-schema/jobs");

const ID_ONLY = require("../fixtures/subscription-notification-id-only.json");
const FULL = require("../fixtures/subscription-notification-full.json");
const PATH = "/fhir-subscription";

it("process id only bundle", async () => {
  const res = await request(app)
    .post(PATH)
    .set("Accept", "application/json")
    .send(ID_ONLY);

  expect(res.status).toEqual(204);
  const job = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.fhir_base, process.env.FHIR_SERVER_BASE),
        eq(jobs.resource_id, "Encounter/2")
      )
    );
  expect(job.length).toEqual(1);
  expect(job[0].status).toEqual(STATUS.PENDING);
});

it("process full bundle", async () => {
  const res = await request(app)
    .post(PATH)
    .set("Accept", "application/json")
    .send(FULL);
  expect(res.status).toEqual(204);
  const job = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.fhir_base, process.env.FHIR_SERVER_BASE),
        eq(jobs.resource_id, "Encounter/2")
      )
    );
  expect(job.length).toEqual(1);
  expect(job[0].status).toEqual(STATUS.PENDING);
});
