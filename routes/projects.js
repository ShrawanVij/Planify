const express = require('express');
const { pool } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/projects - Get projects for current user
router.get('/', async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'admin') {
      query = `
        SELECT p.*, u.name as owner_name,
          COUNT(DISTINCT pm.user_id) as member_count,
          COUNT(DISTINCT t.id) as task_count,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN tasks t ON p.id = t.project_id
        GROUP BY p.id, u.name
        ORDER BY p.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT p.*, u.name as owner_name, pm_me.role as my_role,
          COUNT(DISTINCT pm.user_id) as member_count,
          COUNT(DISTINCT t.id) as task_count,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks
        FROM projects p
        JOIN project_members pm_me ON p.id = pm_me.project_id AND pm_me.user_id = $1
        LEFT JOIN users u ON p.owner_id = u.id
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN tasks t ON p.id = t.project_id
        GROUP BY p.id, u.name, pm_me.role
        ORDER BY p.created_at DESC
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST /api/projects - Create project (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), description || '', req.user.id]
    );
    const project = result.rows[0];

    // Auto-add owner as admin member
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [project.id, req.user.id, 'admin']
    );

    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/projects/:id - Get single project with members
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      const access = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (access.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    }

    const projectResult = await pool.query(
      `SELECT p.*, u.name as owner_name FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = $1`,
      [id]
    );

    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.role as system_role, pm.role as project_role, pm.joined_at
       FROM project_members pm JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1 ORDER BY pm.joined_at`,
      [id]
    );

    const tasksResult = await pool.query(
      `SELECT t.*, u.name as assignee_name FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = $1 ORDER BY t.created_at DESC`,
      [id]
    );

    res.json({
      project: projectResult.rows[0],
      members: membersResult.rows,
      tasks: tasksResult.rows,
    });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// PUT /api/projects/:id - Update project (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, description, status } = req.body;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description),
       status = COALESCE($3, status) WHERE id = $4 RETURNING *`,
      [name, description, status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// POST /api/projects/:id/members - Add member (admin only)
router.post('/:id/members', requireAdmin, async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const userExists = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userExists.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3`,
      [req.params.id, user_id, role || 'member']
    );
    res.json({ message: 'Member added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /api/projects/:id/members/:userId (admin only)
router.delete('/:id/members/:userId', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
