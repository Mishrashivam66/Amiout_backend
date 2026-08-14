const activityRepository = require("../repositories/activityRepository");
const activityDTO = require("../dtos/activity.dto");

const { PAGINATION, DASHBOARD } = require("../constants/studentConstants");



const createActivity = async (payload) => {
  const activity = await activityRepository.createActivity(payload);

  return {
    success: true,
    message: "Activity created successfully.",
    data: activityDTO(activity),
  };
};

// ============================================================================
// Get Student Activities
// ============================================================================
const getActivities = async (
  userId,
  page = PAGINATION.DEFAULT_PAGE,
  limit = PAGINATION.DEFAULT_LIMIT,
) => {
  page = Number(page);
  limit = Number(limit);

  if (page < 1) page = PAGINATION.DEFAULT_PAGE;

  if (limit < 1 || limit > PAGINATION.MAX_LIMIT) {
    limit = PAGINATION.DEFAULT_LIMIT;
  }

  const [activities, total] = await Promise.all([
    activityRepository.findByUser(userId, page, limit),
    activityRepository.countByUser(userId),
  ]);

  return {
    success: true,
    data: activities.map(activityDTO),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================================
// Get Recent Activities (Dashboard)
// ============================================================================
const getRecentActivities = async (userId) => {
  const activities = await activityRepository.findRecentActivities(
    userId,
    DASHBOARD.RECENT_ACTIVITY_LIMIT,
  );

  return {
    success: true,
    data: activities.map(activityDTO),
  };
};

module.exports = Object.freeze({
  createActivity,
  getActivities,
  getRecentActivities,
});
