UPDATE site_settings
SET value = jsonb_set(
  value,
  '{blogPosts}',
  (
    SELECT jsonb_agg(post - 'contentHtml' - 'fontFamily' - 'fontSize' - 'textColor')
    FROM jsonb_array_elements(value->'blogPosts') AS post
  )
)
WHERE key = 'storefront'
  AND jsonb_typeof(value->'blogPosts') = 'array';
