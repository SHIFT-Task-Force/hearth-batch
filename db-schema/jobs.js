const {
  pgTable,
  varchar,
  integer,
  jsonb,
  text,
  timestamp,
  index
} = require("drizzle-orm/pg-core");

const STATUS = {
  PENDING: "PENDING",
  INPROGRESS: "INPROGRESS",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  ABANDONED: "ABANDONED"
};

const jobs = pgTable(
  "jobs",
  {
    id: varchar().primaryKey(),
    status: varchar().default(STATUS.PENDING),
    attempts: integer().default(0),
    errors: text(),
    createdAt: timestamp().notNull().defaultNow(),
    fhir_base: varchar().notNull(),
    resource_id: varchar(),
    payload: jsonb()
  },
  (table) => [index("createdAtIndex").on(table.createdAt)]
);

module.exports = { jobs, STATUS };
