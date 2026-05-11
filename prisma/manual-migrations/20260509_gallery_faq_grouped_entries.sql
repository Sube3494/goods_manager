ALTER TABLE "GalleryFaq"
ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "entries" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "GalleryFaq"
SET "entries" = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-' || "id",
    'question', COALESCE("question", ''),
    'answer', COALESCE("answer", '')
  )
)
WHERE jsonb_typeof("entries") = 'array'
  AND jsonb_array_length("entries") = 0
  AND COALESCE("question", '') <> '';
