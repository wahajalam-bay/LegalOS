/* RETIRED — the Operational Dashboard.
 *
 * This page rendered the department's headline analytics out of `DASH` in
 * data.js: 1,284 active contracts, 37 pending reviews, an average turnaround of
 * 3.4 days, a compliance score of 84, a twelve-month volume trend and a
 * department heatmap. Every one of those figures was written by hand before
 * Drive was connected — demo content that survived long enough to be quoted
 * back at the General Counsel in a narrative paragraph.
 *
 * The Dashboard at /exec now computes its figures from the live records and
 * says so when it cannot (see src/pages/exec.js and src/dashmetrics.js), and
 * /dashboard resolves to it. Nothing imports this file; it is left as the
 * explanation rather than deleted silently, because "where did the operational
 * dashboard go" is a question somebody will ask.
 */
export default function RetiredOperationalDashboard() {
  return null;
}
