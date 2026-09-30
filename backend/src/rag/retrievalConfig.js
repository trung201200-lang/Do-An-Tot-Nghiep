module.exports = Object.freeze({
  TOP_K_VALUES: Object.freeze([1, 3, 5]),
  DEFAULT_K: 3,
  // Không có threshold production mặc định. Chọn từ DEV, khóa trước TEST.
  DEFAULT_THRESHOLD: null,
  THRESHOLD_POLICY: 'DEV: max balanced accuracy; tie: fewer OUT false positives, then lower threshold',
});