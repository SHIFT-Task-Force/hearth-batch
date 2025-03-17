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
  console.log("bundled: ", JSON.stringify(bundled, null, 2));
  const slsResponse = await superagent.post(SLS_ENDPOINT).send(bundled);
  console.log("slsResponse.body: ", JSON.stringify(slsResponse.body, null, 2));
  // return superagent.post(job.fhir_base).send(slsResponse.body);
  // return hapiBugWorkaround(job.fhir_base, slsResponse.body);
  return medplumBugWorkaround(job.fhir_base, slsResponse.body);
}

const medplumBugWorkaround = (fhir_base, slsResponseBody) => {
  // fhir_base =  http://localhost:8103/fhir/R4
  // slsResponseBody ={
  //   "resourceType": "Bundle",
  //   "type": "transaction",
  //   "entry": [
  //     {
  //       "fullUrl": "Observation/0195a475-026a-71cf-be2e-89fae3382de0/$meta-add",
  //       "resource": {
  //         "resourceType": "Parameters",
  //         "parameter": [
  //           {
  //             "name": "meta",
  //             "valueMeta": {
  //               "security": [
  //                 {
  //                   "code": "hallucinogen",
  //                   "display": "hallucinogen substance use"
  //                 },
  //                 {
  //                   "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  //                   "code": "SUD",
  //                   "display": "substance use disorder information sensitivity"
  //                 },
  //                 {
  //                   "system": "http://terminology.hl7.org/CodeSystem/v3-Confidentiality",
  //                   "code": "R",
  //                   "display": "restricted",
  //                   "extension": [
  //                     {
  //                       "url": "http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-sec-label-basis",
  //                       "valueCoding": {
  //                         "code": "42CFRPart2",
  //                         "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  //                         "display": "42 CFR Part2"
  //                       }
  //                     },
  //                     {
  //                       "url": "http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-sec-label-classifier",
  //                       "valueReference": {
  //                         "display": "LEAP+ Security Labeling Service"
  //                       }
  //                     }
  //                   ]
  //                 }
  //               ]
  //             }
  //           }
  //         ]
  //       },
  //       "request": {
  //         "method": "POST",
  //         "url": "Observation/0195a475-026a-71cf-be2e-89fae3382de0/$meta-add"
  //       }
  //     }
  //   ]
  // }

  // PATCH /Observation/0195a475-026a-71cf-be2e-89fae3382de0
  // [
  //   {
  //     "op": "add",
  //     "path": "/meta/security",
  //     "value": []
  //   },
  //   {
  //     "op": "add",
  //     "path": "/meta/security/-",
  //     "value": {
  //       "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  //       "code": "SUD",
  //       "display": "substance use disorder information sensitivity"
  //     }
  //   }
  // ]

  const patchUrl =
    slsResponseBody.entry[0].fullUrl.split("/")[0] +
    "/" +
    slsResponseBody.entry[0].fullUrl.split("/")[1];
  // const patchBody = [
  //   {
  //     op: "add",
  //     path: "/meta/security",
  //     value: []
  //   },
  //   {
  //     op: "add",
  //     path: "/meta/security/-",
  //     value: {
  //       code: "hallucinogen",
  //       display: "hallucinogen substance use"
  //     }
  //   },
  //   {
  //     op: "add",
  //     path: "/meta/security/-",
  //     value: {
  //       system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  //       code: "SUD",
  //       display: "substance use disorder information sensitivity"
  //     }
  //   },
  //   {
  //     op: "add",
  //     path: "/meta/security/-",
  //     value: {
  //       system: "http://terminology.hl7.org/CodeSystem/v3-Confidentiality",
  //       code: "R",
  //       display: "restricted",
  //       extension: [
  //         {
  //           url: "http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-sec-label-basis",
  //           valueCoding: {
  //             code: "42CFRPart2",
  //             system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  //             display: "42 CFR Part2"
  //           }
  //         },
  //         {
  //           url: "http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-sec-label-classifier",
  //           valueReference: {
  //             display: "LEAP+ Security Labeling Service"
  //           }
  //         }
  //       ]
  //     }
  //   }
  // ];

  const patchBody = [
    {
      op: "add",
      path: "/meta/security",
      value: []
    },
    ...slsResponseBody.entry[0].resource.parameter[0].valueMeta.security.map(
      (security) => ({
        op: "add",
        path: "/meta/security/-",
        value: security
      })
    )
  ];
  console.log("patchUrl: ", fhir_base + "/" + patchUrl);
  console.log("patchBody: ", JSON.stringify(patchBody, null, 2));
  return superagent
    .patch(fhir_base + "/" + patchUrl)
    .set("Authorization", "Bearer " + process.env.FHIR_SERVER_ACCESS_TOKEN)
    .send(patchBody);
};

const hapiBugWorkaround = (fhir_base, slsResponseBody) =>
  Promise.all(
    slsResponseBody.entry.map((entry) =>
      superagent.post(fhir_base + "/" + entry.request.url).send(entry.resource)
    )
  );

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
