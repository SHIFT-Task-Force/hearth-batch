const crypto = require("crypto");
const { db } = require("../lib/db");
const { jobs } = require("../db-schema/jobs");

const extractJobs = (bundle) =>
  bundle.type == "subscription-notification" && bundle.entry
    ? bundle.entry
        .filter((entry) => validJobEntry(entry))
        .map((entry) => entryToJob(entry))
    : [];

const extractJobsForR4 = (resource) =>
  [resource]
    .filter((resource) => !resource?.meta?.security)
    .map((resource) => ({
      resource_id: `${resource.resourceType}/${resource.id}`,
      payload: resource,
      fhir_base: process.env.FHIR_SERVER_BASE
    }));

const validJobEntry = (entry) =>
  entry?.resource?.resourceType != "SubscriptionStatus" && //not the status resource
  ["PUT", "POST"].includes(entry?.request?.method); //a create or update

const entryToJob = (entry) => ({
  resource_id: resourceId(entry),
  payload: entry.resource,
  fhir_base: process.env.FHIR_SERVER_BASE
});

const registerJobs = async (jobs) =>
  Promise.all(jobs.map((job) => registerJob(job)));

const registerJob = (job) =>
  db.insert(jobs).values({
    ...job,
    id: crypto.randomUUID()
  });

const resourceId = (entry) =>
  entry?.resource?.resourceType && entry?.resource?.id
    ? `${entry?.resource?.resourceType}/${entry?.resource?.id}`
    : resourceIdFromFullUrl(entry.fullUrl);

const resourceIdFromFullUrl = (fullUrl) =>
  fullUrl.includes("_history/")
    ? fullUrl.split("/").slice(-4).join("/")
    : fullUrl.split("/").slice(-2).join("/");

module.exports = { registerJobs, extractJobs, extractJobsForR4 };
