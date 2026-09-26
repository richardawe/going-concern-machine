import test from 'node:test';import assert from 'node:assert/strict';
import { selectFact,normalizeCompany,type SecFacts } from '../scripts/sec-provider';
const annual={val:100,start:'2024-01-01',end:'2024-12-31',filed:'2025-02-01',form:'10-K',accn:'000-1'};
test('SEC normalization selects annual facts and latest amendments, never quarterly YTD values',()=>{
 const facts:SecFacts={Revenue:{units:{USD:[annual,{...annual,val:30,start:'2024-10-01',filed:'2025-02-02'},{...annual,val:101,filed:'2025-03-01',form:'10-K/A'}]}}};assert.equal(selectFact(facts,['Revenue'],'2024-12-31',false)?.fact.val,101);assert.equal(selectFact(facts,['Revenue'],'2024-12-31',true),null);
});
test('missing facts remain unavailable; incomplete company payloads fail',()=>{
 assert.equal(selectFact({},['Cash'],'2024-12-31',true),null);assert.throws(()=>normalizeCompany({entityName:'Test',facts:{'us-gaap':{Revenues:{units:{USD:[annual]}}}}},'TEST','1'),/Incomplete/);
});
