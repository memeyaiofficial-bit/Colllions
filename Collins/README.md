# M-Pesa Daraja Book Payment System

A production-ready M-Pesa Daraja integration for selling digital books. Customers select a book, pay Ksh 100 via M-Pesa STK Push, and receive a secure one-time download link.

## Architecture

```
index.html          ← Frontend (book selection + payment form)
server/
├── server.js       ← Express entry point
├── config/
│   └── daraja.js   ← M-Pesa API config (reads from .env)
├── routes/
│   └── payment.js  ← REST API endpoints
└── services/
    ├── darajaAuth.js       ← OAuth token management
    ├── mpesaService.js     ← STK Push + callback parsing
    └── transactionStore.js ← JSON file transaction storage

data/
└── transactions.json ← Created automatically on first use
```

## Setup

### 1. Get your Daraja credentials

1. Go to [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
2. Create an app → note your **Consumer Key** and **Consumer Secret**
3. Go to your app → **Liabilities** → **M-Pesa Express** → copy the **Passkey**
4. Get your **Paybill/Till shortcode** from Safaricom

### 2. Configure environment

```bash
cp .env .env.local   # Or edit .env directly
```

Edit `.env` with your real credentials:

```env
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey_here
MPESA_SHORTCODE=174379        # Your Paybill number
MPESA_ENV=sandbox             # Change to 'production' when live
MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa/callback
PORT=5000
```

**Important:** In production, the callback URL **must be HTTPS**. Use your actual domain URL.

### 3. Install & run

```bash
cd server
npm install
npm start
```

The server starts at `http://localhost:5000`.

### 4. Testing with Sandbox

For sandbox testing, you need to expose your local server to the internet so Safaricom can reach the callback:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 5000
```

Then update `.env`:
```env
MPESA_CALLBACK_URL=https://your-ngrok-id.ngrok.io/api/mpesa/callback
```

Restart the server. Now Safaricom sandbox can send callbacks to your local machine.

### 5. Add your book PDFs

Edit `server/routes/payment.js` — look for the `GET /download/:token` route. Replace the placeholder with real PDF serving:

```js
const filePath = path.join(__dirname, '../../books', 'your-book.pdf');
res.download(filePath);
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment/initiate` | Start STK Push payment |
| POST | `/api/mpesa/callback` | M-Pesa webhook (Safaricom calls this) |
| GET | `/api/payment/status/:id` | Check transaction status |
| GET | `/api/download/:token` | Download book (one-time token) |
| GET | `/api/health` | Health check |

### `POST /api/payment/initiate`

```json
{
  "fullName": "Jane Wanjiru",
  "email": "jane@gmail.com",
  "phone": "0712345678",
  "bookTitle": "From Idea to First Paying Customer"
}
```

Response (success):
```json
{
  "success": true,
  "message": "M-Pesa STK Push sent. Check your phone to enter PIN.",
  "customerMessage": "Please enter your M-Pesa PIN on your phone",
  "transactionId": "uuid-here"
}
```

## Going to Production Checklist

- [ ] Replace all `your_*` values in `.env` with real credentials
- [ ] Set `MPESA_ENV=production`
- [ ] Ensure callback URL is HTTPS and accessible from the internet
- [ ] Replace the download placeholder with real PDF file serving
- [ ] Restrict CORS to your domain in `server/server.js`
- [ ] Replace JSON file store with a proper database (PostgreSQL/MySQL recommended)
- [ ] Add rate limiting (`npm install express-rate-limit`)
- [ ] Add request validation (e.g. `express-validator`)
- [ ] Run behind a reverse proxy (nginx/Caddy) for production

## Transaction Flow

```
User clicks "Pay" → Backend creates transaction (status: PENDING)
                  → Backend calls Safaricom STK Push API
                  → User receives M-Pesa PIN prompt on phone
                  → User enters PIN
                  → Safaricom calls /api/mpesa/callback
                  → Backend updates transaction (status: COMPLETED)
                  → Backend generates one-time download token
                  → Frontend polls status, detects completion
                  → User clicks download link (one-time use)
