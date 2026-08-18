const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const User = require('./models/User');
const Match = require('./models/Match');
const Transaction = require('./models/Transaction');

const app = express();
app.use(cors());
app.use(express.json());

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// MongoDB URI must be set in environment on Render. Fallback included for local dev only.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://sourabthebillionaire_db_user:sourab@ac-7bhc4dg-shard-00-00.k9rt1ty.mongodb.net:27017,ac-7bhc4dg-shard-00-01.k9rt1ty.mongodb.net:27017,ac-7bhc4dg-shard-00-02.k9rt1ty.mongodb.net:27017/ff-tournament?ssl=true&replicaSet=atlas-pl0qmb-shard-0&authSource=admin&retryWrites=true&w=majority';

// Admin secret — set ADMIN_SECRET env var on Render. Default only for local dev.
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'gurupod_admin_2024';

// Simple password hashing (SHA-256 + salt). No bcrypt dep needed on Render free tier.
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', s).update(password).digest('hex');
  return { hash, salt: s };
}

function verifyPassword(password, hash, salt) {
  const { hash: newHash } = hashPassword(password, salt);
  return newHash === hash;
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ─── ADMIN AUTH MIDDLEWARE ───────────────────────────────────────────────────
// FIX BUG-001..006: All admin routes now require X-Admin-Secret header
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, ign } = req.body;
    if (!email || !password || !ign) {
      return res.status(400).json({ error: 'Email, password and IGN are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    // FIX BUG-006: Hash password before storing
    const { hash, salt } = hashPassword(password);
    const user = new User({
      email: email.toLowerCase(),
      password: hash,
      passwordSalt: salt,
      ign: ign.trim(),
      walletBalance: 100
    });
    await user.save();
    // Never return password fields
    const safeUser = { _id: user._id, email: user.email, ign: user.ign, uid: user.uid, walletBalance: user.walletBalance, joinedMatches: user.joinedMatches, totalEarned: user.totalEarned };
    res.json(safeUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    // Support both old plain-text passwords (migration) and new hashed ones
    let valid = false;
    if (user.passwordSalt) {
      valid = verifyPassword(password, user.password, user.passwordSalt);
    } else {
      // Legacy plain-text fallback — migrate on successful login
      valid = (user.password === password);
      if (valid) {
        const { hash, salt } = hashPassword(password);
        user.password = hash;
        user.passwordSalt = salt;
        await user.save();
      }
    }

    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const safeUser = { _id: user._id, email: user.email, ign: user.ign, uid: user.uid, walletBalance: user.walletBalance, joinedMatches: user.joinedMatches, totalEarned: user.totalEarned };
    res.json(safeUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -passwordSalt');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── MATCHES (PUBLIC READ) ───────────────────────────────────────────────────

app.get('/api/matches', async (req, res) => {
  try {
    const active = await Match.find({ isCompleted: false }).sort({ createdAt: -1 });
    const completed = await Match.find({ isCompleted: true }).sort({ createdAt: -1 });
    res.json({ active, completed });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// FIX BUG-002: Admin secret required
app.post('/api/matches', requireAdmin, async (req, res) => {
  try {
    const { title, entryFee, perKill, booyah, map, mode, time, roomId, roomPassword, spotsTotal } = req.body;
    if (!title || entryFee === undefined || !time) {
      return res.status(400).json({ error: 'title, entryFee and time are required' });
    }
    if (Number(entryFee) < 0) {
      return res.status(400).json({ error: 'entryFee cannot be negative' });
    }
    const match = new Match({
      title: title.trim(),
      entryFee: Number(entryFee),
      perKill: Number(perKill || 0),
      booyah: Number(booyah || 0),
      map: map || 'Bermuda',
      mode: mode || 'Squad',
      time,
      roomId: roomId || '',
      roomPassword: roomPassword || '',
      spotsTotal: Number(spotsTotal) || 48
    });
    await match.save();
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// FIX BUG-003: Admin secret required
app.delete('/api/matches/:id', requireAdmin, async (req, res) => {
  try {
    const match = await Match.findByIdAndDelete(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ success: true, message: 'Match deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// FIX BUG-004: Admin secret required + idempotency guard (BUG-010)
app.post('/api/matches/:id/complete', requireAdmin, async (req, res) => {
  try {
    const { winnerIgn } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    // FIX BUG-010: Prevent double-rewarding
    if (match.isCompleted) {
      return res.status(400).json({ error: 'Match already completed' });
    }

    match.isCompleted = true;
    match.winnerIgn = winnerIgn || null;

    if (winnerIgn) {
      const winner = await User.findOne({ ign: winnerIgn.trim() });
      if (winner) {
        winner.walletBalance += (match.booyah || 0);
        winner.totalEarned += (match.booyah || 0);
        await winner.save();
      }
    }

    await match.save();
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch('/api/matches/:id/room', requireAdmin, async (req, res) => {
  try {
    const { roomId, roomPassword } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    match.roomId = roomId || '';
    match.roomPassword = roomPassword || '';
    await match.save();
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── JOIN MATCH ──────────────────────────────────────────────────────────────

// FIX BUG-008: Atomic join using findOneAndUpdate to prevent race conditions
app.post('/api/matches/:id/join', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Atomic match update — only succeeds if there's capacity and user hasn't joined
    const match = await Match.findOneAndUpdate(
      {
        _id: req.params.id,
        isCompleted: false,
        joinedUsers: { $ne: user._id },
        $expr: { $lt: ['$spotsFilled', '$spotsTotal'] }
      },
      {
        $addToSet: { joinedUsers: user._id },
        $inc: { spotsFilled: 1 }
      },
      { new: true }
    );

    if (!match) {
      // Determine the specific reason
      const original = await Match.findById(req.params.id);
      if (!original) return res.status(404).json({ error: 'Match not found' });
      if (original.isCompleted) return res.status(400).json({ error: 'Match has already ended' });
      if (original.joinedUsers.some(id => id.toString() === user._id.toString())) {
        return res.status(400).json({ error: 'You have already joined this match' });
      }
      if (original.spotsFilled >= original.spotsTotal) {
        return res.status(400).json({ error: 'Match is full' });
      }
      return res.status(400).json({ error: 'Could not join match' });
    }

    if (user.walletBalance < match.entryFee) {
      // Rollback the join since user can't pay
      await Match.findByIdAndUpdate(req.params.id, {
        $pull: { joinedUsers: user._id },
        $inc: { spotsFilled: -1 }
      });
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct fee from user
    user.walletBalance -= match.entryFee;
    if (!user.joinedMatches.includes(match._id)) {
      user.joinedMatches.push(match._id);
    }
    await user.save();

    res.json({ success: true, newBalance: user.walletBalance });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:id/joined-matches', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('joinedMatches');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.joinedMatches);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (req, res) => {
  try {
    const topUsers = await User.find({ totalEarned: { $gt: 0 } })
      .select('-password -passwordSalt -email')
      .sort({ totalEarned: -1 })
      .limit(10);
    res.json(topUsers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── ADMIN — USERS ───────────────────────────────────────────────────────────

// FIX BUG-024: Admin secret required + never return passwords
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password -passwordSalt');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// FIX BUG-001: Admin secret required + prevent unreasonable amounts
app.post('/api/users/:id/wallet', requireAdmin, async (req, res) => {
  try {
    const { amount } = req.body;
    const num = Number(amount);
    if (isNaN(num) || Math.abs(num) > 100000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.walletBalance = Math.max(0, user.walletBalance + num);
    await user.save();
    const safeUser = { _id: user._id, email: user.email, ign: user.ign, walletBalance: user.walletBalance };
    res.json(safeUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id/profile', async (req, res) => {
  try {
    const { ign, uid } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (ign !== undefined) user.ign = ign.trim();
    if (uid !== undefined) user.uid = uid.trim();
    await user.save();
    const safeUser = { _id: user._id, email: user.email, ign: user.ign, uid: user.uid, walletBalance: user.walletBalance };
    res.json(safeUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

app.post('/api/transactions', async (req, res) => {
  try {
    const { userId, type, amount, utr, upiId, screenshotUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const num = Number(amount);
    if (isNaN(num) || num <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    if (!['DEPOSIT', 'WITHDRAWAL'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    // FIX BUG-009: Server-side balance check for withdrawals
    if (type === 'WITHDRAWAL') {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (num < 50) return res.status(400).json({ error: 'Minimum withdrawal is ₹50' });
      if (user.walletBalance < num) {
        return res.status(400).json({ error: 'Insufficient wallet balance' });
      }
    }
    if (type === 'DEPOSIT' && num < 30) {
      return res.status(400).json({ error: 'Minimum deposit is ₹30' });
    }
    const transaction = new Transaction({
      userId,
      type,
      amount: num,
      utr: utr || '',
      upiId: upiId || '',
      screenshotUrl: screenshotUrl || '',
      status: 'PENDING'
    });
    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// User can view their own transactions
app.get('/api/transactions/user/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(transactions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// FIX BUG-005: Admin secret required
app.get('/api/transactions', requireAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find({}).populate('userId', 'email ign uid').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/transactions/:id/approve', requireAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ error: `Transaction is already ${transaction.status.toLowerCase()}` });
    }

    const user = await User.findById(transaction.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    transaction.status = 'APPROVED';
    if (transaction.type === 'DEPOSIT') {
      user.walletBalance += transaction.amount;
    } else if (transaction.type === 'WITHDRAWAL') {
      if (user.walletBalance < transaction.amount) {
        return res.status(400).json({ error: 'User has insufficient balance for this withdrawal' });
      }
      user.walletBalance -= transaction.amount;
    }

    await user.save();
    await transaction.save();

    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/transactions/:id/reject', requireAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ error: `Transaction is already ${transaction.status.toLowerCase()}` });
    }
    transaction.status = 'REJECTED';
    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
