const {
  registerJobs,
  extractJobs
} = require("../lib/fhir-subscription-notification");

async function post(req, res, next) {
  try {
    const bundle = req.body;
    await registerJobs(extractJobs(bundle));
    res.status(204).end();
  } catch (e) {
    next(e);
  }
}

module.exports = { post };
