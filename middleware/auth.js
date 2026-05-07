const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'planify_secret_key_change_in_production';

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireProjectAccess = async (req, res, next) => {
  const projectId = req.params.projectId || req.params.id || req.body.project_id;
  if (!projectId) return next();

  try {
    // Admins have access to all projects
    if (req.user.role === 'admin') return next();

    const result = await pool.query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    req.projectRole = result.rows[0].role;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

module.exports = { authenticate, requireAdmin, requireProjectAccess, generateToken };
