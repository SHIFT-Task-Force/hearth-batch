const {
  registerJobs,
  extractJobs,
  extractJobsForR4
} = require("../lib/fhir-subscription-notification");

async function post(req, res, next) {
  try {
    // get body and tell if it is a bundle or a single resource
    const body = req.body;
    let jobs = [];

    if (body.resourceType == "Bundle") {
      jobs = extractJobs(body);
    } else {
      jobs = extractJobsForR4(body);
    }
    await registerJobs(jobs);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
}

module.exports = { post };
