"use strict";

/**
 * M-Pesa Daraja Payment Server for Book Downloads.
 *
 * Production-ready backend that:
 *   - Initiates M-Pesa STK Push payments
 *   - Receives and processes callbacks from Safaricom
 *   - Issues one-time download tokens on confirmed payment
 *   - Serves the static book-purchase website
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const config = require("./config/daraja");
const paymentRoutes = require("./routes/payment");

const app = express();

// ========================
// MIDDLEWARE
// ========================

// CORS — allow the frontend origin (handles preflight OPTIONS too)
app.use(
  cors({
    origin: true, // reflect the request origin
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  }),
);

// Parse JSON bodies — IMPORTANT: M-Pesa callback sends JSON
app.use(express.json());

// Parse URL-encoded bodies for other form submissions
app.use(express.urlencoded({ extended: true }));

// ========================
// ROUTES
// ========================

// API routes
app.use("/api/payment", paymentRoutes);
app.use("/api/mpesa", paymentRoutes);

// Serve static files from the parent directory (the HTML page)
app.use(express.static(path.resolve(__dirname, "..")));

// Serve the main HTML page at root
app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../index (6).html"));
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: config.environment,
    timestamp: new Date().toISOString(),
  });
});

// ========================
// ERROR HANDLING
// ========================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// ========================
// START SERVER
// ========================

app.listen(config.port, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   📚 M-Pesa Daraja Book Payment Server      ║");
  console.log(`║   Environment: ${config.environment.padEnd(29)}║`);
  console.log(`║   Port:        ${String(config.port).padEnd(29)}║`);
  console.log(`║   API URL:     ${config.apiUrl.padEnd(29)}║`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`🌐  Website:          http://localhost:${config.port}`);
  console.log(
    `💳  Initiate Payment: POST http://localhost:${config.port}/api/payment/initiate`,
  );
  console.log(
    `📞  M-Pesa Callback:  POST http://localhost:${config.port}/api/mpesa/callback`,
  );
  console.log(
    `🔍  Check Status:    GET  http://localhost:${config.port}/api/payment/status/:id`,
  );
  console.log(
    `📥  Download:        GET  http://localhost:${config.port}/api/download/:token`,
  );
  console.log(
    `❤️  Health Check:    GET  http://localhost:${config.port}/api/health`,
  );
  console.log("");

  if (config.environment === "sandbox") {
    console.log("⚠️   SANDBOX MODE — no real money will be transferred.");
    console.log("");
  }
});
