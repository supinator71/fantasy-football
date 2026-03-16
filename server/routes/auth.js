const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db/database');

const YAHOO_AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';

// Step 1: Redirect user to Yahoo login
router.get('/yahoo', (req, res) => {
  console.log('Starting Yahoo auth. CLIENT_ID:', process.env.YAHOO_CLIENT_ID ? 'SET' : 'MISSING', 'REDIRECT_URI:', process.env.YAHOO_REDIRECT_URI);
  const params = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID,
    redirect_uri: process.env.YAHOO_REDIRECT_URI,
    response_type: 'code',
    scope: 'fspt-r'
  });
  const redirectUrl = `${YAHOO_AUTH_URL}?${params.toString()}`;
  console.log('Redirecting to:', redirectUrl);
  res.redirect(redirectUrl);
});

// Step 2: Yahoo redirects back with auth code
router.get('/callback', async (req, res) => {
  console.log('OAuth callback received:', JSON.stringify(req.query));
  const { code, error, error_description } = req.query;
  if (error) return res.status(400).json({ error, error_description, query: req.query });
  if (!code) return res.status(400).json({ error: 'No authorization code received', query: req.query });

  try {
    const credentials = Buffer.from(
      `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(YAHOO_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.YAHOO_REDIRECT_URI
      }),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = Date.now() + expires_in * 1000;

    // Store tokens in session
    req.session.tokens = { access_token, refresh_token, expires_at: expiresAt };

    // Store in DB for persistence
    db.prepare(`INSERT OR REPLACE INTO tokens (id, access_token, refresh_token, expires_at)
      VALUES (1, ?, ?, ?)`).run(access_token, refresh_token, expiresAt);

    res.redirect('/?auth=success');
  } catch (err) {
    console.error('Auth error:', err.response?.data || err.message);
    res.redirect('/?auth=error');
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM tokens WHERE id = 1').get();
    if (!row) return res.status(401).json({ error: 'Not authenticated' });

    const credentials = Buffer.from(
      `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(YAHOO_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token
      }),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = Date.now() + expires_in * 1000;

    req.session.tokens = { access_token, refresh_token, expires_at: expiresAt };
    db.prepare(`UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1`)
      .run(access_token, refresh_token, expiresAt);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Check auth status
router.get('/status', (req, res) => {
  const row = db.prepare('SELECT * FROM tokens WHERE id = 1').get();
  res.json({ authenticated: !!row, expires_at: row?.expires_at });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  db.prepare('DELETE FROM tokens WHERE id = 1').run();
  res.json({ success: true });
});

module.exports = router;
