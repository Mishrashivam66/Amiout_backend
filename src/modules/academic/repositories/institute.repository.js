"use strict";

const Institute = require("../models/Institute");

const normalizeCode = (code) =>
  String(code ?? "")
    .trim()
    .toUpperCase();

const createInstitute = (payload) => {
  return Institute.create({
    ...payload,
    code: normalizeCode(payload.code),
  });
};

const getAllInstitutes = () => {
  return Institute.find({ isDeleted: false }).sort({ name: 1 });
};

const getInstituteById = (id) => {
  return Institute.findOne({
    _id: id,
    isDeleted: false,
  });
};

const getInstituteByCode = (code) => {
  return Institute.findOne({
    code: normalizeCode(code),
    isDeleted: false,
  });
};

// Also find inactive or soft-deleted institutes.
const getInstituteByCodeIncludingDeleted = (code) => {
  return Institute.findOne({
    code: normalizeCode(code),
  });
};

const updateInstitute = (id, payload) => {
  const update = { ...payload };

  if (update.code !== undefined) {
    update.code = normalizeCode(update.code);
  }

  return Institute.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: update },
    { new: true, runValidators: true },
  );
};

const deleteInstitute = (id) => {
  return Institute.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, isActive: false } },
    { new: true },
  );
};

module.exports = Object.freeze({
  createInstitute,
  getAllInstitutes,
  getInstituteById,
  getInstituteByCode,
  getInstituteByCodeIncludingDeleted,
  updateInstitute,
  deleteInstitute,
});
