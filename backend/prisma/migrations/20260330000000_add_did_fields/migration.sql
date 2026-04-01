ALTER TABLE "students"
ADD COLUMN IF NOT EXISTS "did" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "students_did_key"
ON "students"("did");

ALTER TABLE "certificates"
ADD COLUMN IF NOT EXISTS "did" TEXT;
