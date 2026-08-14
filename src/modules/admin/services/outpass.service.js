const outpassRepository = require("../../outpass/repositories/outpassRepository");

class OutpassService {
  // ============================================================================
  // Get All Outpasses
  // ============================================================================
  async getAllOutpasses({ page = 1, limit = 10, search = "", status = "" }) {
    const [outpasses, total] = await Promise.all([
      outpassRepository.getAllOutpasses(page, limit, search, status),

      outpassRepository.countAllOutpassesHistory(search, status),
    ]);

    return {
      success: true,
      message: "Outpass history fetched successfully.",
      data: outpasses,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = Object.freeze(new OutpassService());
