-- Add password column to students table
ALTER TABLE "students" ADD COLUMN "password" TEXT NOT NULL DEFAULT '';

-- Note: In production, you should:
-- 1. Add the column as nullable first
-- 2. Update existing records with proper passwords
-- 3. Then make it non-nullable
-- For this development setup, we're using a default empty string
