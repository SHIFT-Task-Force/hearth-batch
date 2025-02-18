require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "dev"}`
});

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 3;
const SLS_ENDPOINT = process.env.SLS_ENDPOINT;

const superagent = require("superagent");

const { eq, lt, or, and, asc } = require("drizzle-orm");
const { db } = require("./db");
const { jobs, STATUS } = require("../db-schema/jobs");

async function nextJob() {
  const nextJobs = await db
    .select()
    .from(jobs)
    .orderBy(asc(jobs.createdAt))
    .where(
      or(
        eq(jobs.status, STATUS.PENDING),
        and(eq(jobs.status, STATUS.ERROR), lt(jobs.attempts, MAX_ATTEMPTS))
      )
    )
    .limit(1);

  return nextJobs?.[0];
}

const registerJobIsCompleted = (job) =>
  db.update(jobs).set({ status: STATUS.COMPLETED }).where(eq(jobs.id, job.id));

const registerJobIsInProgress = (job) =>
  db
    .update(jobs)
    .set({ status: STATUS.INPROGRESS, attempts: job.attempts + 1 })
    .where(eq(jobs.id, job.id));

const registerJobIsInError = (job, errors) =>
  db
    .update(jobs)
    .set({ status: STATUS.ERROR, errors: JSON.stringify(errors) })
    .where(eq(jobs.id, job.id));

async function processJob(job) {
  console.log(
    `processing... ${job.fhir_base}/${job.payload.resourceType}/${
      job.resource_id
    }, attempt: ${job.attempts + 1}`
  );
  try {
    await registerJobIsInProgress(job);
    await maybeRetrievePayload(job);
    await invokeLabeling(job);
    await registerJobIsCompleted(job);
  } catch (error) {
    console.log(error.message);
    await registerJobIsInError(job, error.message);
  }
}

async function maybeRetrievePayload(job) {
  if (job.payload) {
    return job;
  }

  const payloadResponse = await superagent
    .get(job.fhir_base + "/" + job.resource_id)
    .set("Accept", "application/json");
  return { ...job, payload: payloadResponse.body };
}

async function invokeLabeling(job) {
  const { resource_id, payload, fhir_base } = job;
  const { resourceType } = payload;
  const slsResponse = await superagent
    .post(SLS_ENDPOINT)
    .send(bundle(payload, resource_id, fhir_base));
  console.log("SLS_ENDPOINT", SLS_ENDPOINT);
  console.log(
    "bundle",
    JSON.stringify(bundle(payload, resource_id, fhir_base))
  );
  console.log(
    "slsResponse",
    JSON.stringify(slsResponse.body.entry[0].resource)
  );
  console.log("fhir_base", job.fhir_base + "/" + resourceType);
  return superagent
    .post(job.fhir_base + "/" + resourceType)
    .set("Authorization", "Basic YWRtaW46QWRtaW4xMjM=")
    .send(slsResponse.body.entry[0].resource);
}

const bundle = (resource, resourceId, fhirBase) => ({
  resourceType: "Bundle",
  total: 1,
  entry: [
    {
      fullUrl: fhirBase + "/" + resource.resourceType + "/" + resourceId,
      resource
    }
  ]
});

module.exports = {
  nextJob,
  processJob
};
