const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/dashboard - Dashboard stats
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const projectFilter = isAdmin
      ? ''
      : `AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ${userId})`;

    const projectCountFilter = isAdmin
      ? ''
      : `WHERE id IN (SELECT project_id FROM project_members WHERE user_id = ${userId})`;

    // Task stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'done' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'review' THEN 1 END) as in_review,
        COUNT(CASE WHEN status = 'todo' THEN 1 END) as todo,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'done' THEN 1 END) as overdue
      FROM tasks t WHERE 1=1 ${projectFilter}
    `);

    // Project count
    const projectsResult = await pool.query(`
      SELECT COUNT(*) as total FROM projects ${projectCountFilter}
    `);

    // Recent tasks (last 5)
    const recentTasksResult = await pool.query(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date,
        u.name as assignee_name, p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE 1=1 ${projectFilter}
      ORDER BY t.created_at DESC LIMIT 5
    `);

    // Overdue tasks
    const overdueResult = await pool.query(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date,
        u.name as assignee_name, p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.due_date < CURRENT_DATE AND t.status != 'done' ${projectFilter}
      ORDER BY t.due_date ASC LIMIT 5
    `);

    // Task status distribution
    const statusDistResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM tasks t WHERE 1=1 ${projectFilter}
      GROUP BY status
    `);

    // My tasks (assigned to me)
    const myTasksResult = await pool.query(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date, p.name as project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.assigned_to = $1
      ORDER BY t.due_date ASC NULLS LAST LIMIT 8
    `, [userId]);

    res.json({
      stats: {
        ...statsResult.rows[0],
        total_projects: parseInt(projectsResult.rows[0].total),
      },
      recent_tasks: recentTasksResult.rows,
      overdue_tasks: overdueResult.rows,
      status_distribution: statusDistResult.rows,
      my_tasks: myTasksResult.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
