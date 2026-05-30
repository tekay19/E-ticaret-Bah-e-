UPDATE site_settings
SET value = jsonb_set(
  value,
  '{blogPosts}',
  (
    SELECT jsonb_agg(
      post
      || jsonb_build_object(
        'contentHtml',
        COALESCE(NULLIF(post->>'contentHtml', ''), '<p>' || COALESCE(post->>'excerpt', '') || '</p>'),
        'fontFamily',
        COALESCE(NULLIF(post->>'fontFamily', ''), 'inherit'),
        'fontSize',
        COALESCE(NULLIF(post->>'fontSize', ''), '16px'),
        'textColor',
        COALESCE(NULLIF(post->>'textColor', ''), '#1f2937')
      )
    )
    FROM jsonb_array_elements(value->'blogPosts') AS post
  )
)
WHERE key = 'storefront'
  AND jsonb_typeof(value->'blogPosts') = 'array';
