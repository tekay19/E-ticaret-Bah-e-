UPDATE site_settings
SET value = value
  - 'fallbackCategories'
  - 'orderStatusLabels'
  - 'returnReasonLabels'
  - 'returnStatusLabels'
  - 'returnConditionLabels'
  - 'checkoutAddressDefaults'
  - 'contactInfo',
  updated_at = NOW()
WHERE key = 'storefront';
