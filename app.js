const express = require("express");
const morgan = require("morgan");

const FHIRSubscription = require("./controller/fhir-subscription");

const { error } = require("./controller/error");

const app = express();

//trust proxy
app.set("trust proxy", true);

//middlewares
process.env.NODE_ENV === "production" || app.use(morgan("dev"));
app.use(express.json({ type: ["application/json", "application/fhir+json"] }));

//routes
app.post("/fhir-subscription", FHIRSubscription.post);

app.use(error);

module.exports = {
  app
};
