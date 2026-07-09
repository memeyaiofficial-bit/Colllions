'use strict';

/**
 * Daraja OAuth token management.
 * Fetches and caches the access token, refreshing when expired.
 */
const axios = require('axios');
const config = require('../config/daraja');

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a valid OAuth access token.
 * Uses cached token if still valid, otherwise fetches a new one.
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 30s buffer)
  if (cachedToken && tokenExpiresAt > now + 30000) {
    return cachedToken;
  }

  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(config.oauthUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const data = response.data;
    cachedToken = data.access_token;
    // Token expires in `expires_in` seconds; we store absolute expiry time
    tokenExpiresAt = now + (data.expires_in - 60) * 1000; // 60s buffer

    console.log(`🔑 Daraja OAuth token acquired (expires in ${data.expires_in}s)`);
    return cachedToken;
  } catch (err) {
    const message = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    console.error('❌ Failed to get Daraja OAuth token:', message);
    throw new Error(`Daraja auth failed: ${message}`);
  }
}

module.exports = { getAccessToken };
