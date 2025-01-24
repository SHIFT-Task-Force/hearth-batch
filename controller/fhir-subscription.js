const {
  registerJobs,
  extractJobs,
} = require("../lib/fhir-subscription-notification");

async function post(req, res, next) {
  try {
    const bundle = req.body;
    console.log("Registered jobs");
    await registerJobs(extractJobs(bundle));
    res.status(200).end("Hello World");
  } catch (e) {
    next(e);
  }
}

module.exports = { post };
