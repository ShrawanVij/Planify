const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/tasks - Get tasks (with filters)
router.get('/', async (req, res) => {
  const { project_id, status, priority, assigned_to } = req.query;

  try {
    let conditions = [];
    let params = [];
    let idx = 1;

    if (req.user.role !== 'admin') {
      // Members only see tasks in their projects
      conditions.push(`t.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = $${idx}
      )`);
      params.push(req.user.id);
      idx++;
    }

    if (project_id) { conditions.push(`t.project_id = $${idx}`); params.push(project_id); idx++; }
    if (status) { conditions.push(`t.status = $${idx}`); params.push(status); idx++; }
    if (priority) { conditions.push(`t.priority = $${idx}`); params.push(priority); idx++; }
    if (assigned_to) { conditions.push(`t.assigned_to = $${idx}`); params.push(assigned_to); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT t.*, 
        u.name as assignee_name, u.email as assignee_email,
        cb.name as creator_name,
        p.name as project_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users cb ON t.created_by = cb.id
       LEFT JOIN projects p ON t.project_id = p.id
       ${where}
       ORDER BY 
         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         t.due_date ASC NULLS LAST, t.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks - Create task
router.post('/', async (req, res) => {
  const { project_id, title, description, assigned_to, status, priority, due_date } = req.body;

  if (!project_id || !title) {
    return res.status(400).json({ error: 'project_id and title are required' });
  }

  try {
    // Check project access
    if (req.user.role !== 'admin') {
      const access = await pool.query(
        'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
        [project_id, req.user.id]
      );
      if (access.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (project_id, title, description, assigned_to, status, priority, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [project_id, title.trim(), description || '', assigned_to || null,
       status || 'todo', priority || 'medium', due_date || null, req.user.id]
    );

    const task = result.rows[0];

    // Fetch with joins
    const fullTask = await pool.query(
      `SELECT t.*, u.name as assignee_name, p.name as project_name, cb.name as creator_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users cb ON t.created_by = cb.id
       WHERE t.id = $1`,
      [task.id]
    );

    res.status(201).json(fullTask.rows[0]);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req, res) => {
  const { title, description, assigned_to, status, priority, due_date } = req.body;
  const taskId = req.params.id;

  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = taskResult.rows[0];

    // Members can only update status of tasks in their projects
    if (req.user.role !== 'admin') {
      const access = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
        [task.project_id, req.user.id]
      );
      if (access.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `UPDATE tasks SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        assigned_to = COALESCE($3, assigned_to),
        status = COALESCE($4, status),
        priority = COALESCE($5, priority),
        due_date = COALESCE($6, due_date),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, description, assigned_to, status, priority, due_date, taskId]
    );

    const fullTask = await pool.query(
      `SELECT t.*, u.name as assignee_name, p.name as project_name, cb.name as creator_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users cb ON t.created_by = cb.id
       WHERE t.id = $1`,
      [taskId]
    );

    res.json(fullTask.rows[0]);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// PATCH /api/tasks/:id/status - Quick status update
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['todo', 'in_progress', 'review', 'done'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    if (req.user.role !== 'admin') {
      const access = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
        [taskResult.rows[0].project_id, req.user.id]
      );
      if (access.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      'UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = taskResult.rows[0];

    if (req.user.role !== 'admin' && task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only admins or task creators can delete tasks' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
