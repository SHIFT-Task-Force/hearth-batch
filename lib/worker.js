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
    `processing... ${job.fhir_base}/${job.resource_id}, attempt: ${
      job.attempts + 1
    }`
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
  const bundled = bundle(payload, fhir_base, resource_id);

  const slsResponse = await superagent.post(SLS_ENDPOINT).send(bundled);

  if (process.env.FHIR_SERVER_TYPE === "hapi") {
    return hapiBugWorkaround(job.fhir_base, slsResponse.body);
  } else if (process.env.FHIR_SERVER_TYPE === "medplum") {
    return patchApproach(job.fhir_base, slsResponse.body);
  } else {
    return superagent.post(job.fhir_base).send(slsResponse.body);
  }
}

const patchApproach = (fhir_base, slsResponseBody) => {
  const entry = slsResponseBody.entry[0];

  const { patchUrl, patchBody } = getPatchInfo(fhir_base, entry);

  return superagent
    .patch(patchUrl)
    .set("Authorization", "Bearer " + process.env.FHIR_SERVER_ACCESS_TOKEN)
    .send(patchBody);
};

const getPatchInfo = (fhir_base, entry) => {
  const fullUrl = entry.fullUrl; // Observation/[id]/$meta-add
  const patchUrl = `${fhir_base}/${fullUrl.replace("/$meta-add", "")}`;

  const securityLabels = entry.resource.parameter[0].valueMeta.security;
  const patchBody = [
    {
      op: "add",
      path: "/meta/security",
      value: []
    },
    ...securityLabels.map((security) => ({
      op: "add",
      path: "/meta/security/-",
      value: security
    }))
  ];

  return {
    patchUrl,
    patchBody
  };
};

const hapiBugWorkaround = (fhir_base, slsResponseBody) =>
  slsResponseBody?.entry?.length
    ? Promise.all(
        slsResponseBody.entry.map((entry) =>
          superagent
            .post(fhir_base + "/" + entry.request.url)
            .send(entry.resource)
        )
      )
    : Promise.all([]);

const bundle = (resource, fhirBase, resourceId) => ({
  resourceType: "Bundle",
  total: 1,
  entry: [
    {
      fullUrl: fhirBase + "/" + resourceId,
      resource
    }
  ]
});

module.exports = {
  nextJob,
  processJob
};
