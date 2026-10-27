import dotenv from "dotenv";

dotenv.config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be configured in .env.");
}

const parsedUrl = new URL(testDatabaseUrl);

if (parsedUrl.pathname.replace(/^\//, "") !== "amrutam_telemedicine_test") {
  throw new Error("Integration tests may only use amrutam_telemedicine_test.");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
