'use strict';

/**
 * Simple JSON-file transaction store.
 * In production, swap this for a database (Postgres/MySQL/MongoDB).
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, '../../data/transactions.json');

// Ensure data directory exists
function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readAll() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(transactions) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(transactions, null, 2), 'utf-8');
}

/**
 * Create a new transaction record.
 * @param {Object} params
 * @param {string} params.fullName
 * @param {string} params.email
 * @param {string} params.phone
 * @param {string} params.bookTitle
 * @returns {Object} The created transaction
 */
function createTransaction({ fullName, email, phone, bookTitle }) {
  const transactions = readAll();
  const transaction = {
    id: uuidv4(),
    fullName,
    email,
    phone: phone.replace(/\s/g, ''), // sanitize
    bookTitle,
    amount: 100,
    currency: 'KES',
    status: 'PENDING',       // PENDING → COMPLETED → DOWNLOADED | FAILED
    merchantRequestId: null,
    checkoutRequestId: null,
    mpesaReceiptNumber: null,
    transactionDate: null,
    downloadToken: null,
    downloadTokenUsed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  transactions.push(transaction);
  writeAll(transactions);
  console.log(`📝 Transaction created: ${transaction.id} for ${fullName}`);
  return transaction;
}

/**
 * Update a transaction by ID.
 * @param {string} id
 * @param {Object} updates
 * @returns {Object|null} Updated transaction or null
 */
function updateTransaction(id, updates) {
  const transactions = readAll();
  const index = transactions.findIndex((t) => t.id === id);
  if (index === -1) return null;

  transactions[index] = {
    ...transactions[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  writeAll(transactions);
  return transactions[index];
}

/**
 * Find a transaction by ID.
 */
function getTransaction(id) {
  const transactions = readAll();
  return transactions.find((t) => t.id === id) || null;
}

/**
 * Find a transaction by CheckoutRequestID (from M-Pesa callback).
 */
function getTransactionByCheckoutRequestId(checkoutRequestId) {
  const transactions = readAll();
  return transactions.find((t) => t.checkoutRequestId === checkoutRequestId) || null;
}

/**
 * Find a transaction by download token.
 */
function getTransactionByDownloadToken(token) {
  const transactions = readAll();
  return transactions.find((t) => t.downloadToken === token && !t.downloadTokenUsed) || null;
}

/**
 * List all completed transactions.
 */
function getCompletedTransactions() {
  const transactions = readAll();
  return transactions.filter((t) => t.status === 'COMPLETED');
}

module.exports = {
  createTransaction,
  updateTransaction,
  getTransaction,
  getTransactionByCheckoutRequestId,
  getTransactionByDownloadToken,
  getCompletedTransactions,
};
