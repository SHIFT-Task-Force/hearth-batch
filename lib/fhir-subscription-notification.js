const crypto = require("crypto");
const { db } = require("../lib/db");
const { jobs } = require("../db-schema/jobs");

const extractJobs = (bundle) =>
  bundle.type == "subscription-notification"
    ? bundle.entry
        .filter((entry) => validJobEntry(entry))
        .map((entry) => entryToJob(entry))
    : bundle.entry.map((entry) => entryToJob(entry));

const validJobEntry = (entry) =>
  entry?.resource?.resourceType != "SubscriptionStatus" && //not the status resource
  entry?.request?.url && //fhir id exists
  ["PUT", "POST"].includes(entry?.request?.method) && //a create or update
  ["200", "201", 200, 201].includes(entry?.response?.status); //a successful create or update

const entryToJob = (entry) => ({
  resource_id: entry?.resource?.id || entry.request.url,
  payload: entry.resource,
  fhir_base: entry.fullUrl.replace("/" + entry.request.url, "")
});

const registerJobs = async (jobs) =>
  Promise.all(jobs.map((job) => registerJob(job)));

const registerJob = (job) => {
  console.log("job in registerJob", job);
  return db.insert(jobs).values({
    ...job,
    id: crypto.randomUUID()
  });
};

module.exports = { registerJobs, extractJobs };
