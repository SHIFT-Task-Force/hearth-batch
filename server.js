require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });


const { app } = require("./app");

const logger = require("./lib/logger");

const port = parseInt(process.env.PORT || "3001");
app.listen(port, () => logger.info(`Listening on port ${port}!`));
