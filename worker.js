require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });

const { nextJob, processJob } = require("./lib/worker");

console.log(
  `using ${process.env.DATABASE_URL} from .env.${process.env.NODE_ENV || "dev"}`
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms * 1000));

async function main() {
  while (true) {
    const job = await nextJob();
    if (job) {
      console.log(job);
      await processJob(job);
    } else {
      await sleep(process.env.FREQUENCY || 10);
    }
  }
}

main()
  .then()
  .catch((e) => console.log(e));
