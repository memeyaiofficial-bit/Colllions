'use strict';

/**
 * Payment routes:
 *   POST /api/payment/initiate  – Start STK Push
 *   POST /api/mpesa/callback     – M-Pesa callback (webhook)
 *   GET  /api/payment/status/:id – Check transaction status
 *   GET  /api/download/:token    – Download book (with valid token)
 */
const express = require('express');
const router = express.Router();
const { initiateStkPush, parseCallback } = require('../services/mpesaService');
const transactionStore = require('../services/transactionStore');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/payment/initiate
 * Initiates M-Pesa STK Push for a book purchase.
 * Body: { fullName, email, phone, bookTitle }
 */
router.post('/initiate', async (req, res) => {
  try {
    const { fullName, email, phone, bookTitle } = req.body;

    // Validate required fields
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    if (!bookTitle || !bookTitle.trim()) {
      return res.status(400).json({ success: false, message: 'Please select a book first.' });
    }

    // Create transaction record
    const transaction = transactionStore.createTransaction({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      bookTitle: bookTitle.trim(),
    });

    // Initiate STK Push
    const stkResult = await initiateStkPush({
      phone: transaction.phone,
      amount: transaction.amount,
      transactionId: transaction.id,
      fullName: transaction.fullName,
    });

    // Update transaction with Daraja references
    transactionStore.updateTransaction(transaction.id, {
      merchantRequestId: stkResult.merchantRequestId,
      checkoutRequestId: stkResult.checkoutRequestId,
    });

    if (!stkResult.success) {
      transactionStore.updateTransaction(transaction.id, { status: 'FAILED' });
      return res.status(400).json({
        success: false,
        message: stkResult.customerMessage || stkResult.responseDescription || 'STK Push failed.',
        transactionId: transaction.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'M-Pesa STK Push sent. Check your phone to enter PIN.',
      customerMessage: stkResult.customerMessage,
      transactionId: transaction.id,
    });
  } catch (err) {
    console.error('❌ Initiate payment error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'An unexpected error occurred.',
    });
  }
});

/**
 * POST /api/mpesa/callback
 * M-Pesa Daraja callback endpoint.
 * Safaricom sends the STK Push result here.
 */
router.post('/callback', async (req, res) => {
  try {
    console.log('📩 M-Pesa callback received:', JSON.stringify(req.body).slice(0, 500));

    const callbackResult = parseCallback(req.body);

    // Find transaction by CheckoutRequestID
    const transaction = transactionStore.getTransactionByCheckoutRequestId(
      callbackResult.checkoutRequestId
    );

    if (!transaction) {
      console.warn(`⚠️  No transaction found for CheckoutRequestID: ${callbackResult.checkoutRequestId}`);
      // Still respond 200 to Safaricom so they don't retry
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (callbackResult.success) {
      // Payment succeeded — generate download token
      const downloadToken = uuidv4().replace(/-/g, '');

      transactionStore.updateTransaction(transaction.id, {
        status: 'COMPLETED',
        mpesaReceiptNumber: callbackResult.mpesaReceiptNumber,
        transactionDate: callbackResult.transactionDate,
        downloadToken,
      });

      console.log(`✅ Payment COMPLETED for ${transaction.fullName} | M-Pesa Receipt: ${callbackResult.mpesaReceiptNumber}`);
      console.log(`🔗 Download token generated: ${downloadToken}`);
    } else {
      // Payment failed
      transactionStore.updateTransaction(transaction.id, {
        status: 'FAILED',
      });

      console.log(`❌ Payment FAILED for ${transaction.fullName}: ${callbackResult.resultDesc}`);
    }

    // Always respond 200 to Safaricom
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('❌ Callback processing error:', err.message);
    // Still respond 200 so Safaricom doesn't retry indefinitely
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

/**
 * GET /api/payment/status/:transactionId
 * Check the status of a transaction by its internal ID.
 */
router.get('/status/:transactionId', (req, res) => {
  const transaction = transactionStore.getTransaction(req.params.transactionId);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found.',
    });
  }

  return res.status(200).json({
    success: transaction.status === 'COMPLETED',
    status: transaction.status,
    transactionId: transaction.id,
    bookTitle: transaction.bookTitle,
    fullName: transaction.fullName,
    email: transaction.email,
    amount: transaction.amount,
    mpesaReceiptNumber: transaction.mpesaReceiptNumber,
    downloadToken: transaction.downloadToken,
    downloadTokenUsed: transaction.downloadTokenUsed,
    createdAt: transaction.createdAt,
  });
});

/**
 * GET /api/download/:token
 * Download the book PDF using a valid download token.
 * For now returns a placeholder — replace with real PDF serving.
 */
router.get('/download/:token', (req, res) => {
  const transaction = transactionStore.getTransactionByDownloadToken(req.params.token);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Invalid or expired download link. Please complete payment first.',
    });
  }

  // Mark token as used (one-time download)
  transactionStore.updateTransaction(transaction.id, { downloadTokenUsed: true });

  // === REPLACE THIS with real PDF serving ===
  // Example for a real PDF:
  // const filePath = path.join(__dirname, '../../books', `${transaction.bookTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  // if (!fs.existsSync(filePath)) {
  //   return res.status(404).json({ success: false, message: 'Book file not found.' });
  // }
  // res.download(filePath);

  const bookFileName = transaction.bookTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.pdf';

  res.status(200).json({
    success: true,
    message: `✅ Download authorized for "${transaction.bookTitle}".`,
    bookTitle: transaction.bookTitle,
    fullName: transaction.fullName,
    email: transaction.email,
    // In production, return a secure download URL or stream the file
    // For now, a placeholder telling them to replace with real file:
    note: 'Replace this response with actual PDF streaming. See server/routes/payment.js line ~160.',
    downloadUrl: `/api/download/${req.params.token}/file`, // future endpoint
  });
});

module.exports = router;
