'use strict';

/**
 * Daraja API configuration.
 * Reads from .env and exports everything needed for M-Pesa STK Push.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const config = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  passkey: process.env.MPESA_PASSKEY,
  shortcode: process.env.MPESA_SHORTCODE || '3705621',
  shortcodeType: process.env.MPESA_SHORTCODE_TYPE || '5628512',
  environment: process.env.MPESA_ENV || 'sandbox',
  callbackUrl: process.env.MPESA_CALLBACK_URL || 'http://localhost:5000/api/mpesa/callback',
  port: parseInt(process.env.PORT, 10) || 5000,
};

// Determine API base URL based on environment
config.apiUrl = config.environment === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

config.oauthUrl = `${config.apiUrl}/oauth/v1/generate?grant_type=client_credentials`;
config.stkPushUrl = `${config.apiUrl}/mpesa/stkpush/v1/processrequest`;
config.queryUrl = `${config.apiUrl}/mpesa/stkpushquery/v1/query`;

// Validate required config
const required = ['consumerKey', 'consumerSecret', 'passkey', 'shortcode'];
for (const key of required) {
  if (!config[key] || config[key].startsWith('your_')) {
    console.warn(`⚠️  WARNING: ${key} is not configured. Set it in .env before going live.`);
  }
}

module.exports = config;
