const base = "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default";

export const wpAssets = {
  logo: `${base}/wp-content/plugins/templatemela-plugin-toolband/layouts/default/img/logo.svg`,
  hero1: `${base}/wp-content/uploads/2024/10/main-banner-1.jpg`,
  hero2: `${base}/wp-content/uploads/2024/10/main-banner-2.jpg`,
  cms1: `${base}/wp-content/uploads/2024/10/cms-banner-1.jpg`,
  cms2: `${base}/wp-content/uploads/2024/10/cms-banner-2.jpg`,
  cms3: `${base}/wp-content/uploads/2024/10/cms-banner-3.jpg`,
  shopBanner: `${base}/wp-content/uploads/2023/10/shop-banner-2.jpg`,
  productImages: [
    `${base}/wp-content/uploads/2023/10/23-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/14-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/09-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/05-1-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/06-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/03-2-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/01-460x460.jpg`,
    `${base}/wp-content/uploads/2023/12/02-460x460.jpg`,
  ],
  categoryImages: [2, 3, 7, 6, 1, 8, 5, 9, 4].map((id) => `${base}/wp-content/uploads/2024/10/cat-${id}.jpg`),
  brands: [1, 2, 3, 4, 5, 6].map((id) => `${base}/wp-content/uploads/2024/10/${id}.png`),
};
