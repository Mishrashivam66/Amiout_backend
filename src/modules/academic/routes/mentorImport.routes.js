const express = require("express");
const multer = require("multer");

const router = express.Router();

const mentorImportController = require("../controllers/mentorImport.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

// ==========================================
// MULTER CONFIGURATION
// ==========================================

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },

  fileFilter: (req, file, cb) => {
    const isXlsx = file.originalname.toLowerCase().endsWith(".xlsx");

    if (!isXlsx) {
      return cb(new Error("Only .xlsx Excel files are allowed."));
    }

    cb(null, true);
  },
});

// ==========================================
// ADMIN PROTECTED ROUTES
// ==========================================

router.use(protect);
router.use(authorize(ROLES.ADMIN));

// ==========================================
// IMPORT FACULTY EXCEL
// ==========================================

router.post(
  "/import",
  upload.single("file"),
  mentorImportController.importMentors,
);

// ==========================================
// GET ALL FACULTY / MENTORS
// ==========================================

router.get("/", mentorImportController.getAllMentors);

// ==========================================
// GET FACULTY BY EMPLOYEE ID
// ==========================================

router.get(
  "/employee/:employeeId",
  mentorImportController.getMentorByEmployeeId,
);

// ==========================================
// UPDATE FACULTY
// ==========================================

router.put("/:id", mentorImportController.updateMentor);

// ==========================================
// DELETE FACULTY
// ==========================================

router.delete("/:id", mentorImportController.deleteMentor);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
