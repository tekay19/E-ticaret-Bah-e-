ALTER TABLE categories
  ADD COLUMN image_url TEXT;

UPDATE categories
SET image_url = CASE slug
  WHEN 'el-aletleri' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-2.jpg'
  WHEN 'motorlu' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-3.jpg'
  WHEN 'saksilar' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-7.jpg'
  WHEN 'tohumlar' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-6.jpg'
  WHEN 'sulama' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-1.jpg'
  WHEN 'gubre' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-8.jpg'
  WHEN 'toprak' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-5.jpg'
  WHEN 'sus-bitkileri' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-9.jpg'
  WHEN 'bahce-mobilyasi' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-4.jpg'
  WHEN 'yedek-parca' THEN 'https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-2.jpg'
  ELSE image_url
END
WHERE image_url IS NULL;
