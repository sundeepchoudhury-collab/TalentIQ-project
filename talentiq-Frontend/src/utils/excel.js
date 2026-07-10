// src/utils/excel.js
import * as XLSX from "xlsx";

const MSD_HEADER_GROUPS = [
  ["Employee Id", "Employee_Id", "EmployeeId", "Emp Id", "Emp ID", "ID"],
  ["Name", "Employee Name", "Full Name", "Resource Name", "Emp Name"],
  ["Project Name", "Project_Name", "Project"],
  ["Grade as per HRIS", "Grade", "HRIS Grade", "Current Grade", "Band"],
  ["Designation as per HRIS", "Designation", "Job Title", "Title", "Role"],
  ["DOJ as per HRIS", "Date of Joining", "Joining Date", "DOJ", "Hire Date"],
  ["Onshore/Offshore", "Onshore Offshore", "Shore", "Location Type"],
  ["LOB as per HRIS", "LOB", "Line of Business"],
  ["Project Vertical", "Vertical", "Practice"],
  ["Bench Ageing(days)", "Bench_Ageing_days", "Bench Ageing", "Bench Aging (days)", "Bench Aging", "Bench Days"],
  ["Skillsets", "Skill Sets", "Skills"],
  ["L3 (Skill Family)", "L3", "Skill Family", "Primary Skill"],
  ["L4 (Sub Skill)", "L4", "Sub Skill", "Secondary Skill"],
  ["Allocation Start Date", "Start Date"],
];
const EMPLOYEE_ID_HEADERS = ["Employee Id", "Employee_ID", "EmployeeId", "Emp ID", "Emp Id", "ID", "id"];

function normHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function headerMatches(headers, candidates) {
  const normalizedHeaders = new Set(headers.map(normHeader).filter(Boolean));
  return candidates.some((candidate) => normalizedHeaders.has(normHeader(candidate)));
}

function scoreMSDHeaders(headers) {
  return MSD_HEADER_GROUPS.reduce(
    (count, group) => count + (headerMatches(headers, group) ? 1 : 0),
    0
  );
}

function findMSDAllocationSheet(wb) {
  let best = null;

  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });

    matrix.slice(0, 20).forEach((row, rowIndex) => {
      const headers = row.map((cell) => String(cell || "").trim()).filter(Boolean);
      if (!headers.length) return;

      const score = scoreMSDHeaders(headers);
      const hasEmployeeId = headerMatches(headers, MSD_HEADER_GROUPS[0]);
      const hasProject = headerMatches(headers, MSD_HEADER_GROUPS[2]);
      if (!hasEmployeeId || !hasProject) return;

      const dataRows = Math.max(matrix.length - rowIndex - 1, 0);
      const candidate = { sheetName, headerRowIndex: rowIndex, headers, score, dataRows };
      if (!best || candidate.score > best.score || (
        candidate.score === best.score && candidate.dataRows > best.dataRows
      )) {
        best = candidate;
      }
    });
  });

  return best;
}

function makeRejectedFileResult(fileName, reason, extra = {}) {
  return {
    accepted: false,
    fileName,
    uploadFile: null,
    sheetName: null,
    rowCount: 0,
    message: reason,
    ...extra,
  };
}
function looksLikeEmployeeId(value) {
  const text = String(value || "").trim();
  return /^\d{4,}$/.test(text) || /^[a-z0-9][a-z0-9._-]{2,}$/i.test(text);
}

function uniqueValues(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
}

/** Read an Excel/CSV file → { fileName, sheetNames, sheets, rowCounts } */
export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheets = {};
        wb.SheetNames.forEach((name) => {
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: false });
        });
        resolve({
          fileName: file.name,
          sheetNames: wb.SheetNames,
          sheets,
          rowCounts: wb.SheetNames.map((n) => sheets[n].length),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsArrayBuffer(file);
  });
}

/** Validate and normalize an MSD allocation workbook to the detected allocation sheet. */
export async function prepareMSDAllocationFile(file) {
  if (!file) return makeRejectedFileResult("", "No file selected.");

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const match = findMSDAllocationSheet(wb);

    if (!match || match.score < 5) {
      return makeRejectedFileResult(
        file.name,
        "Not accepted. Could not find an MSD allocation table with Employee Id and Project Name columns.",
        { sheetNames: wb.SheetNames }
      );
    }

    const ws = wb.Sheets[match.sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {
      defval: "",
      raw: false,
      range: match.headerRowIndex,
      blankrows: false,
    });
    const usableRows = rows.filter((row) => {
      const keys = Object.keys(row || {});
      const empKey = keys.find((key) => MSD_HEADER_GROUPS[0].some(
        (candidate) => normHeader(candidate) === normHeader(key)
      ));
      return empKey && String(row[empKey] || "").trim() !== "";
    });

    if (usableRows.length === 0) {
      return makeRejectedFileResult(
        file.name,
        `Not accepted. "${match.sheetName}" has allocation headers but no Employee Id rows.`,
        { sheetName: match.sheetName, sheetNames: wb.SheetNames }
      );
    }

    const out = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(usableRows), "Sheet1");
    const outBuf = XLSX.write(out, { bookType: "xlsx", type: "array" });
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const uploadFile = new File(
      [outBuf],
      `${baseName}_TalentIQ_MSD.xlsx`,
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );

    return {
      accepted: true,
      fileName: file.name,
      uploadFile,
      sheetName: match.sheetName,
      rowCount: usableRows.length,
      message: `Accepted MSD allocation sheet "${match.sheetName}" (${usableRows.length} rows).`,
      matchedColumnCount: match.score,
      sheetNames: wb.SheetNames,
    };
  } catch (err) {
    return makeRejectedFileResult(
      file.name,
      `Not accepted. Could not read this workbook: ${err.message || err}`
    );
  }
}

/** Validate and normalize a bench Employee ID workbook to a single Employee Id column. */
export async function prepareBenchEmployeeIdFile(file) {
  if (!file) return makeRejectedFileResult("", "No file selected.");

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });

    if (!rows.length) {
      return makeRejectedFileResult(file.name, "Not accepted. The first sheet is empty.", { sheetName, sheetNames: wb.SheetNames });
    }

    const firstCell = String(rows[0]?.[0] || "").trim();
    const firstCellIsHeader = EMPLOYEE_ID_HEADERS.some((candidate) => normHeader(candidate) === normHeader(firstCell));
    const values = uniqueValues(
      rows
        .slice(firstCellIsHeader ? 1 : 0)
        .map((row) => row?.[0])
        .filter((value) => looksLikeEmployeeId(value))
    );

    if (!values.length) {
      return makeRejectedFileResult(
        file.name,
        "Not accepted. The first sheet must have Employee IDs in the first column.",
        { sheetName, sheetNames: wb.SheetNames }
      );
    }

    const out = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      out,
      XLSX.utils.json_to_sheet(values.map((id) => ({ "Employee Id": id }))),
      "Sheet1"
    );
    const outBuf = XLSX.write(out, { bookType: "xlsx", type: "array" });
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const uploadFile = new File(
      [outBuf],
      `${baseName}_TalentIQ_Bench_IDs.xlsx`,
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );

    return {
      accepted: true,
      fileName: file.name,
      uploadFile,
      sheetName,
      rowCount: values.length,
      message: `Accepted bench ID list from "${sheetName}" (${values.length} IDs).`,
      sheetNames: wb.SheetNames,
    };
  } catch (err) {
    return makeRejectedFileResult(
      file.name,
      `Not accepted. Could not read this workbook: ${err.message || err}`
    );
  }
}

/** Download a single-sheet workbook from a JSON array. */
export function downloadExcel(data, fileName, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/**
 * Download a multi-sheet workbook.
 * sheets: Array<{ name: string, data: Array<object> }>
 */
export function downloadMultiSheetExcel(sheets, fileName) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => {
    const ws = XLSX.utils.json_to_sheet(data || []);
    // Excel sheet names are limited to 31 chars and can't contain certain symbols
    const safeName = String(name).replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Sheet";
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });
  XLSX.writeFile(wb, fileName);
}
