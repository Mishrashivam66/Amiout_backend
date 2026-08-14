const activityService = require("../services/activityService");


const getActivities = async (req, res, next) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;

    const result = await activityService.getActivities(
      req.user._id,
      page,
      limit,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};


const getRecentActivities = async (req, res, next) => {
  try {
    const result = await activityService.getRecentActivities(req.user._id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const createActivity = async (req, res, next) => {
  try {
    const result = await activityService.createActivity({
      ...req.body,
      user: req.user._id,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = Object.freeze({
  getActivities,
  getRecentActivities,
  createActivity,
});
