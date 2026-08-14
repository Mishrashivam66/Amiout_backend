const { mapMentor } = require("./profileMapping.service");

const runMentorMapping = async (userId) => {
  return await mapMentor(userId);
};

module.exports = {
  runMentorMapping,
};
