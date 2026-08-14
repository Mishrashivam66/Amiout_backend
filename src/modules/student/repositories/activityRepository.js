const StudentActivity = require("../models/StudentActivity");

const createActivity = async (payload) => {
  return StudentActivity.create(payload);
};

const findById = async (activityId) => {
  return StudentActivity.findById(activityId);
};

const findByUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  return StudentActivity.find({
    user: userId,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

const countByUser = async (userId) => {
  return StudentActivity.countDocuments({
    user: userId,
  });
};

const findRecentActivities = async (userId, limit = 5) => {
  return StudentActivity.find({
    user: userId,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

const deleteActivity = async (activityId) => {
  return StudentActivity.findByIdAndDelete(activityId);
};

const deleteAllActivities = async (userId) => {
  return StudentActivity.deleteMany({
    user: userId,
  });
};

const deleteOlderThan = async (date) => {
  return StudentActivity.deleteMany({
    createdAt: {
      $lt: date,
    },
  });
};

module.exports = Object.freeze({
  createActivity,
  findById,
  findByUser,
  countByUser,
  findRecentActivities,
  deleteActivity,
  deleteAllActivities,
  deleteOlderThan,
});
