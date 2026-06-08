#!/usr/bin/env tsx
const API = 'http://localhost:3001/api';

async function main() {
  console.log('=== 复现分诊写 status_history 500 错误 ===\n');

  // 1. 获取号源
  console.log('1. 获取号源列表...');
  const slotsResp = await fetch(`${API}/slots`);
  const slotsJson = await slotsResp.json();
  console.log(`   slots 原始响应: ${JSON.stringify(slotsJson).slice(0, 300)}`);
  const slots: any[] = Array.isArray(slotsJson) ? slotsJson : slotsJson.data || slotsJson.slots || [];
  const availableSlot = slots.find((s: any) => (s.usedCapacity ?? s.used_capacity) < (s.totalCapacity ?? s.total_capacity));
  if (!availableSlot) { console.log('❌ 没有可用号源'); return; }
  console.log(`   可用号源 #${availableSlot.id} (${availableSlot.date} ${availableSlot.period}, 剩余 ${availableSlot.totalCapacity - availableSlot.usedCapacity})`);

  // 2. 创建复诊申请
  console.log('\n2. 创建复诊申请（护士身份）...');
  const createRes = await fetch(`${API}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Role': 'nurse', 'X-Name': '王护士' },
    body: JSON.stringify({ patientId: 1, doctorId: availableSlot.doctorId, reason: '血压复查', expectedDate: availableSlot.date }),
  }).then(r => r.json());
  console.log(`   创建结果: ${JSON.stringify(createRes)}`);
  if (!createRes.success) { console.log('❌ 创建申请失败'); return; }

  // 3. 分诊（这一步会写 status_history，触发 500）
  console.log('\n3. 调用分诊接口（会写入 status_history）...');
  const triageRes = await fetch(`${API}/applications/${createRes.data.id}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Role': 'nurse', 'X-Name': '王护士' },
    body: JSON.stringify({ slotId: availableSlot.id }),
  });
  console.log(`   HTTP 状态码: ${triageRes.status}`);
  const triageText = await triageRes.text();
  console.log(`   响应内容: ${triageText.slice(0, 1000)}`);

  if (triageRes.status >= 500) {
    console.log('\n✅ 成功复现 500 错误！');
  } else {
    console.log('\n⚠️ 未复现 500（可能已被修复或库已迁移）');
  }
}

main().catch(e => console.error('执行出错:', e));
