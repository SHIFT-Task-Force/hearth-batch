const nock = require("nock");
const { eq, and } = require("drizzle-orm");

const { db } = require("../../lib/db");
const { jobs, STATUS } = require("../../db-schema/jobs");
const { nextJob, processJob } = require("../../lib/worker");

const FHIR_SERVER_BASE = "https://mock-fhir-server";
const SLS_SERVER_URL = new URL(process.env.SLS_ENDPOINT);

const SLS_SERVER = nock(SLS_SERVER_URL.origin);
const FHIR_SERVER = nock(FHIR_SERVER_BASE);

it("happy path", async () => {
  await db.insert(jobs).values({
    id: "1",
    fhir_base: FHIR_SERVER_BASE,
    resource_id: "Observation/1"
  });

  await db.insert(jobs).values({
    id: "2",
    fhir_base: FHIR_SERVER_BASE,
    resource_id: "Observation/2",
    payload: {
      resourceType: "Observation",
      id: 2,
      status: "final"
    }
  });

  FHIR_SERVER.get("/Observation/1").reply(200, {
    resourceType: "Observation",
    id: 1,
    status: "final"
  });

  SLS_SERVER.post(SLS_SERVER_URL.pathname).times(2).reply(200, {}); //it's a mock so we don't need the rest.

  FHIR_SERVER.post("/").times(2).reply(200, {});

  const fristJob = await nextJob();
  await processJob(fristJob);
  const secondJob = await nextJob();
  await processJob(secondJob);

  await new Promise((r) => setTimeout(r, 500));
  const processedJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, STATUS.COMPLETED));

  expect(processedJobs.length).toEqual(2);
});

it("error path", async () => {
  await db.insert(jobs).values({
    id: "3",
    fhir_base: FHIR_SERVER_BASE,
    resource_id: "Observation/3"
  });

  await db.insert(jobs).values({
    id: "4",
    fhir_base: FHIR_SERVER_BASE,
    resource_id: "Observation/4",
    payload: {
      resourceType: "Observation",
      id: 2,
      status: "final"
    }
  });

  FHIR_SERVER.get("/Observation/3").times(3).reply(404);

  SLS_SERVER.post(SLS_SERVER_URL.pathname).reply(200, {}); //it's a mock so we don't need the rest.

  FHIR_SERVER.post("/").reply(200, {});

  for (let i = 0; i < 4; i++) {
    const job = await nextJob();
    await processJob(job);
  }

  await new Promise((r) => setTimeout(r, 500));
  const processedJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, STATUS.ERROR), eq(jobs.attempts, 3)));

  expect(processedJobs.length).toEqual(1);
});
