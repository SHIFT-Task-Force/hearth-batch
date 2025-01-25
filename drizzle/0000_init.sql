CREATE TABLE "jobs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"status" varchar DEFAULT 'PENDING',
	"attempts" integer DEFAULT 0,
	"errors" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"fhir_base" varchar NOT NULL,
	"resource_id" varchar,
	"payload" jsonb
);
--> statement-breakpoint
CREATE INDEX "createdAtIndex" ON "jobs" USING btree ("createdAt");