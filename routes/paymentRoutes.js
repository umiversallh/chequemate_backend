import express from 'express';
import paymentController from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Initiate deposit (requires authentication)
router.post('/deposit', protect, paymentController.initiateDeposit);

// Initiate withdrawal/payout (requires authentication)
router.post('/withdraw', protect, paymentController.initiateWithdrawal);

// Payment callback (webhook from payment provider - no auth required)
router.post('/callback', paymentController.handleCallback);

// Get payment status (requires authentication)
router.get('/status', protect, paymentController.getPaymentStatus);

// Get user balance (requires authentication)
router.get('/balance', protect, paymentController.getUserBalance);

// Get user transaction history (requires authentication)
router.get('/history', protect, paymentController.getTransactionHistory);

export default router;