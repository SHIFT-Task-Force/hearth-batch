require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });

const { nextJob, processJob } = require("./lib/worker");

console.log(
  `using ${process.env.DATABASE_URL} from .env.${process.env.NODE_ENV || "dev"}`
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms * 1000));

async function main() {
  while (true) {
    const job = await nextJob();
    console.log("job in worker main", job);
    if (!job) {
      await sleep(process.env.FREQUENCY || 10);
    } else {
      await processJob(job);
    }
  }
}

main()
  .then()
  .catch((e) => console.log(e));
