
const { PAGINATION } = require("../constants/studentConstants");

const validateDashboardQuery = (query = {}) => {
  const errors = [];

  let page = Number(query.page || PAGINATION.DEFAULT_PAGE);
  let limit = Number(query.limit || PAGINATION.DEFAULT_LIMIT);


  if (Number.isNaN(page) || page < 1) {
    errors.push("Page must be greater than or equal to 1.");
    page = PAGINATION.DEFAULT_PAGE;
  }


  if (Number.isNaN(limit) || limit < 1) {
    errors.push("Limit must be greater than or equal to 1.");
    limit = PAGINATION.DEFAULT_LIMIT;
  }

  if (limit > PAGINATION.MAX_LIMIT) {
    limit = PAGINATION.MAX_LIMIT;
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: {
      page,
      limit,
    },
  };
};

module.exports = {
  validateDashboardQuery,
};
