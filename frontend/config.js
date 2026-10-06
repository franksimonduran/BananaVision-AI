export default Object.freeze({
  API_BASE: location.port === '5500' ? `${location.protocol}//${location.hostname}:8000` : location.origin,
  REQUEST_TIMEOUT_MS: 30000, STREAM_INTERVAL_MS: 1000, MAX_HISTORY: 1000, HISTORY_PAGE_SIZE: 50, ALERT_INTERVAL_MS: 5000,
  MAX_IMAGE_SIZE_MB: 5, MAX_BATCH_FILES: 10, MAX_BATCH_SIZE_MB: 20,
  JPEG_QUALITY: 0.92
});
