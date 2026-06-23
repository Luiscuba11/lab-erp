'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { run, get, all, hashPassword, auditLog } = require('../db/database');
const { requireRole } = require('../middleware/auth');

const FIRMAS_DIR = path.join(__dirname, '..', 'public', 'firmas');
if (!fs.existsSync(FIRMAS_DIR)) fs.mkdirSync(FIRMAS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FIRMAS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `firma_user_${req.params.userId}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes PNG, JPG, GIF o WebP'));
  }
});

// GET /api/users
router.get('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const users = await all(`
      SELECT id, username, full_name, role, active, created_at FROM users ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users
router.post('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;

    if (!username || !password || !full_name || !role) {
      return res.status(400).json({ error: 'username, password, full_name, role are required' });
    }

    const validRoles = ['RECEPTIONIST', 'TECHNICIAN', 'BIOCHEMIST', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let result;
    try {
      result = await run(`
        INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)
      `, [username.trim(), hashPassword(password), full_name.trim(), role]);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Username already exists' });
      }
      throw err;
    }

    await auditLog(req.session.user.id, 'CREATE_USER', 'user', result.lastID, { username, role });

    const user = await get('SELECT id, username, full_name, role, active, created_at FROM users WHERE id = ?', [result.lastID]);
    res.status(201).json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id
router.put('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent admin from deactivating themselves
    if (parseInt(req.params.id) === req.session.user.id && req.body.active === 0) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const { full_name, role, active, password } = req.body;
    const validRoles = ['RECEPTIONIST', 'TECHNICIAN', 'BIOCHEMIST', 'ADMIN'];

    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    let passwordHash = user.password_hash;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      passwordHash = hashPassword(password);
    }

    await run(`
      UPDATE users SET full_name=?, role=?, active=?, password_hash=? WHERE id=?
    `, [
      full_name || user.full_name,
      role      || user.role,
      active !== undefined ? active : user.active,
      passwordHash,
      req.params.id
    ]);

    await auditLog(req.session.user.id, 'UPDATE_USER', 'user', req.params.id, { role, active });

    const updated = await get('SELECT id, username, full_name, role, active, created_at FROM users WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users/:userId/firma — upload signature image (ADMIN only)
router.post('/:userId/firma', requireRole('ADMIN'), upload.single('firma'), async (req, res) => {
  try {
    const user = await get('SELECT id FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const firmaUrl = `/firmas/${req.file.filename}`;
    await run('UPDATE users SET firma_url = ? WHERE id = ?', [firmaUrl, req.params.userId]);
    await auditLog(req.session.user.id, 'UPLOAD_FIRMA', 'user', req.params.userId, { firma_url: firmaUrl });
    res.json({ ok: true, firma_url: firmaUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:userId/firma — remove signature image (ADMIN only)
router.delete('/:userId/firma', requireRole('ADMIN'), async (req, res) => {
  try {
    const user = await get('SELECT firma_url FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.firma_url) {
      const filePath = path.join(__dirname, '..', 'public', user.firma_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await run('UPDATE users SET firma_url = NULL WHERE id = ?', [req.params.userId]);
      await auditLog(req.session.user.id, 'DELETE_FIRMA', 'user', req.params.userId, {});
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:id  (soft-delete: deactivate)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (parseInt(req.params.id) === req.session.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    await run('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
    await auditLog(req.session.user.id, 'DEACTIVATE_USER', 'user', req.params.id, {});

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
