/** @param {unknown} report */
export function assertEffectCoverage(report) {
  if (
    typeof report !== "object" ||
    report === null ||
    !("summary" in report) ||
    typeof report.summary !== "object" ||
    report.summary === null ||
    !("filesChecked" in report.summary) ||
    !("totalFiles" in report.summary) ||
    typeof report.summary.totalFiles !== "number" ||
    !Number.isSafeInteger(report.summary.totalFiles) ||
    report.summary.totalFiles < 1 ||
    report.summary.filesChecked !== report.summary.totalFiles
  ) {
    throw new Error("Effect lint did not check every selected file.");
  }
  return report;
}
