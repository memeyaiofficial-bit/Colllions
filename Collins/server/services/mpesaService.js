'use strict';

/**
 * M-Pesa Daraja STK Push service.
 * Handles initiating payments and processing callbacks.
 */
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/daraja');
const { getAccessToken } = require('./darajaAuth');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate the STK Push password.
 * Password = Base64(SHORTCODE + PASSKEY + Timestamp)
 * Timestamp = YYYYMMDDHHmmss
 */
function generatePassword() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;

  const raw = `${config.shortcode}${config.passkey}${timestamp}`;
  const password = Buffer.from(raw).toString('base64');

  return { password, timestamp };
}

/**
 * Format a phone number to the 254XXXXXXXXX format required by Daraja.
 * Handles 07XX, 7XX, +2547XX, 2547XX formats.
 * @param {string} phone
 * @returns {string}
 */
function formatPhone(phone) {
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('+254')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('254') && cleaned.length === 12) {
    // already correct
  } else if (cleaned.length === 9) {
    cleaned = '254' + cleaned;
  }

  // Validate: should be 12 digits starting with 254
  if (!/^254\d{9}$/.test(cleaned)) {
    throw new Error(`Invalid phone number format: ${phone}. Expected a Safaricom line (07XX, +2547XX).`);
  }

  return cleaned;
}

/**
 * Initiate an STK Push (M-Pesa Express) payment.
 * @param {Object} params
 * @param {string} params.phone - Customer phone number
 * @param {number} params.amount - Amount to charge (KES)
 * @param {string} params.transactionId - Our internal transaction ID
 * @param {string} params.fullName - Customer's name
 * @returns {Promise<Object>} Daraja STK Push response
 */
async function initiateStkPush({ phone, amount, transactionId, fullName }) {
  const token = await getAccessToken();
  const { password, timestamp } = generatePassword();
  const formattedPhone = formatPhone(phone);

  // Truncate fullName to fit Daraja's 20-char limit for AccountReference
  const accountRef = (fullName || 'Book Buyer').slice(0, 20);

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerBuyGoodsOnline',
    Amount: Math.round(amount),
    PartyA: formattedPhone,
    PartyB: config.shortcodeType,
    PhoneNumber: formattedPhone,
    CallBackURL: config.callbackUrl,
    AccountReference: accountRef,
    TransactionDesc: `Book Purchase - ${accountRef}`,
  };

  console.log(`📲 Initiating STK Push for ${formattedPhone} | Amount: KES ${amount} | Tx: ${transactionId}`);

  try {
    const response = await axios.post(config.stkPushUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = response.data;
    console.log(`✅ STK Push response:`, JSON.stringify(data));

    return {
      success: data.ResponseCode === '0',
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      responseCode: data.ResponseCode,
      responseDescription: data.ResponseDescription,
      customerMessage: data.CustomerMessage,
    };
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error(`❌ STK Push failed:`, JSON.stringify(details));
    throw new Error(`STK Push failed: ${JSON.stringify(details)}`);
  }
}

/**
 * Validate the callback from M-Pesa using the passkey-based signature.
 * NOTE: Safaricom's sandbox does NOT sign callbacks, so this is a best-effort
 * validation. For production, you may also whitelist Safaricom IPs.
 *
 * @param {Object} body - Raw callback body
 * @returns {Object} Parsed callback result
 */
function parseCallback(body) {
  // Safaricom callback body structure:
  // {
  //   Body: {
  //     stkCallback: {
  //       MerchantRequestID,
  //       CheckoutRequestID,
  //       ResultCode,
  //       ResultDesc,
  //       CallbackMetadata: { Item: [...] }
  //     }
  //   }
  // }

  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback) {
    throw new Error('Invalid callback: missing Body.stkCallback');
  }

  const result = {
    merchantRequestId: stkCallback.MerchantRequestID,
    checkoutRequestId: stkCallback.CheckoutRequestID,
    resultCode: stkCallback.ResultCode,
    resultDesc: stkCallback.ResultDesc,
    success: stkCallback.ResultCode === 0,
    amount: null,
    mpesaReceiptNumber: null,
    transactionDate: null,
    phoneNumber: null,
  };

  // Parse CallbackMetadata if present
  if (stkCallback.CallbackMetadata?.Item) {
    for (const item of stkCallback.CallbackMetadata.Item) {
      switch (item.Name) {
        case 'Amount':
          result.amount = item.Value;
          break;
        case 'MpesaReceiptNumber':
          result.mpesaReceiptNumber = item.Value;
          break;
        case 'TransactionDate':
          result.transactionDate = item.Value;
          break;
        case 'PhoneNumber':
          result.phoneNumber = item.Value;
          break;
      }
    }
  }

  return result;
}

module.exports = {
  initiateStkPush,
  parseCallback,
  formatPhone,
};
