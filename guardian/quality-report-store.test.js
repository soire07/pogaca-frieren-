import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGuardianQualityReport } from './quality-report-store.js';

test('quality reports are fingerprinted and history is bounded', async () => {
  const calls=[];
  const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:1,report_sha256:params?.[0],artifact_sha256:'b'.repeat(64),decision:'NOT READY'}]};}};
  const report={artifact_sha256:'b'.repeat(64),model_backend:'ufakzeka',decision:'NOT READY',blocking_reasons:[]};
  const saved=await saveGuardianQualityReport(db,{report,reportSha256:'c'.repeat(64)});
  assert.equal(saved.id,1);
  assert.match(calls[0].sql,/ON CONFLICT\(report_sha256\) DO UPDATE/);
  assert.match(calls[1].sql,/LIMIT 50/);
});

test('quality report store rejects malformed fingerprints', async () => {
  await assert.rejects(()=>saveGuardianQualityReport({query:async()=>({rows:[]})},{report:{},reportSha256:'bad'}),{message:'INVALID_GUARDIAN_REPORT_FINGERPRINT'});
});
