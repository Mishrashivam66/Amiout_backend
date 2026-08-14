"use strict";


const studentReportRepository = require("../repositories/reports/studentReport.repository");
const mentorReportRepository = require("../repositories/reports/mentorReport.repository");
const outpassReportRepository = require("../repositories/reports/outpassReport.repository");
const securityReportRepository = require("../repositories/reports/securityReport.repository");

class ReportService {
  // ===========================================================================
  // Student Reports
  // ===========================================================================

  async getStudentSummary() {
    return studentReportRepository.getSummary();
  }

  async getStudentInstituteReport() {
    return studentReportRepository.getInstituteWiseReport();
  }

  async getStudentProgramReport() {
    return studentReportRepository.getProgramWiseReport();
  }

  async getStudentSemesterReport() {
    return studentReportRepository.getSemesterWiseReport();
  }

  async getStudentDetailedReport(filters = {}) {
    return studentReportRepository.getDetailedReport(filters);
  }

  // ===========================================================================
  // Mentor Reports
  // ===========================================================================

  async getMentorSummary() {
    return mentorReportRepository.getSummary();
  }

  async getMentorInstituteReport() {
    return mentorReportRepository.getInstituteWiseReport();
  }

  async getMentorProgramReport() {
    return mentorReportRepository.getProgramWiseReport();
  }

  async getMentorSemesterReport() {
    return mentorReportRepository.getSemesterWiseReport();
  }

  async getMentorDetailedReport(filters = {}) {
    return mentorReportRepository.getDetailedReport(filters);
  }

  // ===========================================================================
  // Outpass Reports
  // ===========================================================================

  async getOutpassSummary() {
    return outpassReportRepository.getSummary();
  }

  async getOutpassStatusReport() {
    return outpassReportRepository.getStatusReport();
  }

  async getOutpassDateRangeReport(startDate, endDate) {
    return outpassReportRepository.getDateRangeReport(startDate, endDate);
  }

  async getOutpassStudentReport() {
    return outpassReportRepository.getStudentWiseReport();
  }

  async getOutpassMentorReport() {
    return outpassReportRepository.getMentorWiseReport();
  }

  async getOutpassMonthlyReport(year) {
    return outpassReportRepository.getMonthlyReport(year);
  }

  async getOutpassDetailedReport(filters = {}) {
    return outpassReportRepository.getDetailedReport(filters);
  }

  // ===========================================================================
  // Security Reports
  // ===========================================================================

  async getSecuritySummary() {
    return securityReportRepository.getSummary();
  }

  async getExitVerificationReport() {
    return securityReportRepository.getExitVerificationReport();
  }

  async getEntryVerificationReport() {
    return securityReportRepository.getEntryVerificationReport();
  }

  async getPendingVerificationReport() {
    return securityReportRepository.getPendingVerificationReport();
  }

  async getSecurityMonthlyReport(year) {
    return securityReportRepository.getMonthlyReport(year);
  }

  async getSecurityDetailedReport(filters = {}) {
    return securityReportRepository.getDetailedReport(filters);
  }
}

module.exports = Object.freeze(new ReportService());
