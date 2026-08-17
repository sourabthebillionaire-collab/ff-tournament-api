const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  title: { type: String, required: true },
  entryFee: { type: Number, required: true },
  perKill: { type: Number, required: true },
  booyah: { type: Number, required: true },
  map: { type: String, default: 'Bermuda' },
  mode: { type: String, default: 'Squad' },
  time: { type: String, required: true },
  spotsFilled: { type: Number, default: 0 },
  spotsTotal: { type: Number, default: 48 },
  isCompleted: { type: Boolean, default: false },
  winnerIgn: { type: String, default: null },
  roomId: { type: String, default: '' },
  roomPassword: { type: String, default: '' },
  joinedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Match', MatchSchema);
