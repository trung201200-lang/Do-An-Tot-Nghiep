const router = require('express').Router();
const authenticate = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const users = require('../controllers/userController');

router.use(authenticate, authorizeRoles('ADMIN'));
router.get('/', users.list);
router.post('/', users.create);
router.patch('/:id/status', users.changeStatus);
router.patch('/:id/role', users.changeRole);

module.exports = router;
