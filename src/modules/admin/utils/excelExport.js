"use strict";


const ExcelJS = require("exceljs");

const exportExcel = async (
  { sheetName = "Report", columns = [], data = [] },
  res,
) => {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AMIOUT";

  workbook.company = "AMIOUT";

  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = columns;

  worksheet.getRow(1).font = {
    bold: true,
  };

  worksheet.getRow(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "D9EAD3",
      },
    };

    cell.border = {
      top: {
        style: "thin",
      },
      left: {
        style: "thin",
      },
      bottom: {
        style: "thin",
      },
      right: {
        style: "thin",
      },
    };
  });

  data.forEach((row) => {
    worksheet.addRow(row);
  });

  worksheet.columns.forEach((column) => {
    column.width = Math.max(column.header.length + 5, 20);
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${sheetName}.xlsx`,
  );

  await workbook.xlsx.write(res);

  res.end();
};

module.exports = Object.freeze({
  exportExcel,
});
