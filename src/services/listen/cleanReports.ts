import type { CleanReport } from './cleaner/cleanChapterHtml';

// What cleaning changed in chapters the reader opened, for the Clean tab.
const reports = new Map<number, CleanReport>();

export const saveCleanReport = (chapterId: number, report: CleanReport) => {
  reports.set(chapterId, report);
  if (reports.size > 20) reports.delete(reports.keys().next().value as number);
};

export const getCleanReport = (chapterId: number) => reports.get(chapterId);

export const describeCleanReport = (report?: CleanReport): string => {
  if (!report) return 'Open or reload a chapter to see what was cleaned.';
  if (!report.enabled) return 'Cleaning is off.';
  const parts = [
    report.removed ? `${report.removed} line(s) removed` : '',
    report.cut ? `${report.cut} watermark(s) cut from sentences` : '',
    report.ruleEdits ? `${report.ruleEdits} custom rule change(s)` : '',
    report.titleFixed ? 'title fixed' : '',
  ].filter(Boolean);
  return parts.length
    ? `This chapter: ${parts.join(', ')}.`
    : 'This chapter: nothing needed cleaning.';
};
