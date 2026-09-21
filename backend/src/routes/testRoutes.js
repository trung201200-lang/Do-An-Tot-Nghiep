const router = require('express').Router();
const authenticate = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.use(authenticate);
router.get('/employee', authorizeRoles('EMPLOYEE', 'IT', 'ADMIN'), (req, res) => {
  res.json({ success: true, message: 'Bạn có quyền truy cập endpoint EMPLOYEE.' });
});
router.get('/it', authorizeRoles('IT', 'ADMIN'), (req, res) => {
  res.json({ success: true, message: 'Bạn có quyền truy cập endpoint IT.' });
});
router.get('/admin', authorizeRoles('ADMIN'), (req, res) => {
  res.json({ success: true, message: 'Bạn có quyền truy cập endpoint ADMIN.' });
});

module.exports = router;
