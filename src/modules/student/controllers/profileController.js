const { runMentorMapping } = require("../services/mentorMappingJob.service");
const profileService = require("../services/profileService");
const profileDTO = require("../dtos/profile.dto");

const getProfile = async (req, res, next) => {
  try {
    const result = await profileService.getProfile(req.user._id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json({
      success: true,
      message: "Student profile fetched successfully.",
      data: profileDTO(req.user, result.data),
    });
  } catch (error) {
    next(error);
  }
};

const completeProfile = async (req, res, next) => {
  try {
    const result = await profileService.completeProfile(req.user._id, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: profileDTO(req.user, result.data),
    });
  } catch (error) {
    next(error);
  }
};

const unlockProfile = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const result = await profileService.unlockProfile(studentId, req.user._id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const holdAccount = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    const result = await profileService.holdAccount(studentId, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const activateAccount = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const result = await profileService.activateAccount(studentId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
const mapStudentMentor = async (req, res) => {
  try {
    const data = await runMentorMapping(req.user._id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack,
    });
  }
};
module.exports = Object.freeze({
  getProfile,
  completeProfile,
  unlockProfile,
  holdAccount,
  activateAccount,
  mapStudentMentor,
});
