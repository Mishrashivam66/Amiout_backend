
const Counter = require("../../../shared/models/Counter");

// ============================================================================
// Generate Outpass ID
// ============================================================================
const generateOutpassId = async () => {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(now.getMonth() + 1).padStart(2, "0");

  const day = String(now.getDate()).padStart(2, "0");

  const dateKey = `${year}${month}${day}`;

  const counter = await Counter.findOneAndUpdate(
    {
      name: `OUTPASS_${dateKey}`,
    },
    {
      $inc: {
        sequence: 1,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  const sequence = String(counter.sequence).padStart(4, "0");

  return `AMI-${dateKey}-${sequence}`;
};

module.exports = generateOutpassId;
