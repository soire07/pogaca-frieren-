export async function saveGuardianQualityReport(db, { report, reportSha256 }) {
  if (!/^[a-f0-9]{64}$/i.test(String(reportSha256 || ''))) throw new Error('INVALID_GUARDIAN_REPORT_FINGERPRINT');
  const result = await db.query(
    `INSERT INTO owner_guardian_quality_reports
       (report_sha256,artifact_sha256,model_backend,decision,report,blocking_reasons,submitted_at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW())
     ON CONFLICT(report_sha256) DO UPDATE SET
       report=EXCLUDED.report,blocking_reasons=EXCLUDED.blocking_reasons,submitted_at=NOW()
     RETURNING id,report_sha256,artifact_sha256,decision,submitted_at`,
    [reportSha256, String(report.artifact_sha256 || ''), report.model_backend, report.decision,
      JSON.stringify(report), JSON.stringify(Array.isArray(report.blocking_reasons) ? report.blocking_reasons : [])]
  );
  await db.query(`DELETE FROM owner_guardian_quality_reports
    WHERE id NOT IN (SELECT id FROM owner_guardian_quality_reports ORDER BY submitted_at DESC,id DESC LIMIT 50)`);
  return result.rows?.[0] || null;
}
