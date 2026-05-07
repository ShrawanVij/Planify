const express = require('express');
const { pool } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.user_id = users.id) as project_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = users.id) as task_count
       FROM users ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/users/:id/role - Update user role (admin only)
router.put('/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or member' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role',
      [role, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/users/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
