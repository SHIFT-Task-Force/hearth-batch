const crypto = require("crypto");
const { db } = require("../lib/db");
const { jobs } = require("../db-schema/jobs");

const extractJobs = (bundle) =>
  bundle.type == "subscription-notification" && bundle.entry
    ? bundle.entry
        .filter((entry) => validJobEntry(entry))
        .map((entry) => entryToJob(entry))
    : bundle.entry.map((entry) => entryToJob(entry));

const validJobEntry = (entry) =>
  entry?.resource?.resourceType != "SubscriptionStatus" && //not the status resource
  ["PUT", "POST"].includes(entry?.request?.method); //a create or update

const entryToJob = (entry) => ({
  resource_id: entry.request.url || `${entry?.resource?.resourceType}/${entry?.resource?.id}`,
  payload: entry.resource,
  fhir_base: process.env.FHIR_SERVER_BASE
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
