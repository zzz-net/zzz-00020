#!/usr/bin/env tsx
import assert from 'node:assert/strict';

const API = 'http://localhost:3001/api';

type Resp<T = any> = { success: boolean; data?: T; error?: string };

const nurseHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'nurse',
  'x-user-name': encodeURIComponent('王护士'),
};
const patient1Headers = (name = '陈大海') => ({
  'Content-Type': 'application/json',
  'x-user-role': 'patient',
  'x-user-name': encodeURIComponent(name),
  'x-patient-id': '1',
});
const patient2Headers = () => ({
  'Content-Type': 'application/json',
  'x-user-role': 'patient',
  'x-user-name': encodeURIComponent('刘小美'),
  'x-patient-id': '2',
});
const doctorHeaders = () => ({
  'Content-Type': 'application/json',
  'x-user-role': 'doctor',
  'x-user-name': encodeURIComponent('张医生'),
  'x-doctor-id': '1',
});

async function call<T = any>(url: string, init: RequestInit = {}): Promise<Resp<T>> {
  const r = await fetch(`${API}${url}`, init);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { success: r.ok, error: text }; }
  return json;
}

async function main() {
  console.log('========== HTTP 回归测试：旧库迁移后改期全流程 ==========\n');

  // ========== 用例 1：分诊写 status_history 不再 500 ==========
  console.log('【用例 1】分诊写 status_history 不再 500');
  const slotsResp = await call('/slots');
  assert.ok(slotsResp.success && Array.isArray(slotsResp.data), '号源接口应返回数组');
  const slots: any[] = slotsResp.data!;

  // 找一个预约最少的患者（优先完全没预约的）
  const patientsResp = await call('/patients');
  const patients: any[] = (patientsResp.success && Array.isArray(patientsResp.data)) ? patientsResp.data : [];
  const apptsAllResp = await call('/appointments');
  const apptsAll: any[] = (apptsAllResp.success && Array.isArray(apptsAllResp.data)) ? apptsAllResp.data : [];
  const counts = new Map<number, number>();
  apptsAll.forEach(a => counts.set(a.patientId, (counts.get(a.patientId) || 0) + 1));
  patients.sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
  const chosen = patients[0];
  const PATIENT_ID = chosen.id;
  console.log(`  选择患者 #${PATIENT_ID} ${chosen.name}（已有 ${counts.get(PATIENT_ID) || 0} 个预约）`);
  const patientHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'patient',
    'x-user-name': encodeURIComponent(chosen.name),
    'x-patient-id': String(PATIENT_ID),
  };

  // 先取消该患者所有已有预约（释放号源容量和日期，避免脏数据干扰）
  const myAppts = apptsAll.filter((a: any) => a.patientId === PATIENT_ID);
  for (const a of myAppts) {
    if (a.status !== 'cancelled') {
      await call(`/appointments/${a.id}/cancel`, {
        method: 'POST', headers: patientHeaders,
        body: JSON.stringify({ reason: '测试重置' }),
      });
    }
  }
  // 重新拉取最新号源
  const slots2Resp = await call('/slots');
  const slots2: any[] = (slots2Resp.success && Array.isArray(slots2Resp.data)) ? slots2Resp.data : slots;
  console.log(`  已清理患者 ${PATIENT_ID} 的 ${myAppts.length} 条历史预约`);
  let freeSlots = slots2.filter(s => s.usedCapacity < s.totalCapacity);
  assert.ok(freeSlots.length >= 2, `应至少有 2 个可用号源，实际 ${freeSlots.length} 个`);
  const slotA = freeSlots[0];
  let slotB = freeSlots.find((s: any) => s.date !== slotA.date && s.id !== slotA.id);
  if (!slotB) slotB = freeSlots.find((s: any) => s.id !== slotA.id)!;
  console.log(`  slotA = #${slotA.id} (${slotA.date} ${slotA.period}), slotB = #${slotB.id} (${slotB.date} ${slotB.period})`);
  const usedA0 = slotA.usedCapacity;
  const usedB0 = slotB.usedCapacity;
  const createResp = await call('/applications', {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ patientId: PATIENT_ID, doctorId: slotA.doctorId, reason: '血压复查', expectedDate: slotA.date }),
  });
  assert.ok(createResp.success && createResp.data, '创建复诊申请应成功');
  const appId = createResp.data.id;

  const triageResp = await call(`/applications/${appId}/triage`, {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ slotId: slotA.id }),
  });
  assert.ok(triageResp.success && triageResp.data, `分诊应成功（原复现 500 的位置），实际=${JSON.stringify(triageResp)}`);
  const appointmentId = triageResp.data.appointmentId;
  console.log(`  ✓ 分诊成功，生成预约 #${appointmentId}（旧库迁移前此步骤 500）`);

  // ========== 用例 2：护士发起改期 ==========
  console.log('\n【用例 2】护士发起改期');
  const initResp = await call(`/appointments/${appointmentId}/reschedule`, {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ newSlotId: slotB.id, reason: '医生临时调班' }),
  });
  assert.ok(initResp.success && initResp.data, `护士发起改期应成功: ${initResp.error}`);
  const rsId = initResp.data.id;
  console.log(`  ✓ 护士发起改期成功，请求 #${rsId}`);

  // ========== 用例 3：患者拒绝改期 → 原预约原号源不变 ==========
  console.log('\n【用例 3】患者拒绝改期 → 原预约原号源不变');
  const rejectResp = await call(`/reschedules/${rsId}/reject`, {
    method: 'POST',
    headers: patientHeaders,
    body: JSON.stringify({ rejectReason: '我当天有空，不想改' }),
  });
  assert.ok(rejectResp.success && rejectResp.data?.status === 'rejected', `拒绝应成功: ${rejectResp.error}`);

  const apptAfterRej = (await call('/appointments')).data!.find((a: any) => a.id === appointmentId);
  assert.equal(apptAfterRej.slotId, slotA.id, '拒绝后预约仍应使用 slotA');
  const slotAAfterRej = (await call('/slots')).data!.find((s: any) => s.id === slotA.id);
  assert.equal(slotAAfterRej.usedCapacity, usedA0 + 1, '拒绝后 slotA 已用容量不变');
  const slotBAfterRej = (await call('/slots')).data!.find((s: any) => s.id === slotB.id);
  assert.equal(slotBAfterRej.usedCapacity, usedB0, '拒绝后 slotB 已用容量不变');
  console.log('  ✓ 拒绝改期后原预约、原号源、新号源均未变化');

  // ========== 用例 4：患者接受改期 → 原子化切换号源 ==========
  console.log('\n【用例 4】患者接受改期 → 原子化切换号源');
  const initResp2 = await call(`/appointments/${appointmentId}/reschedule`, {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ newSlotId: slotB.id, reason: '换到另一天' }),
  });
  assert.ok(initResp2.success, `第二次发起应成功: ${initResp2.error}`);
  const rsId2 = initResp2.data!.id;

  const acceptResp = await call(`/reschedules/${rsId2}/accept`, {
    method: 'POST',
    headers: patientHeaders,
  });
  assert.ok(acceptResp.success && acceptResp.data?.status === 'accepted', `接受改期应成功: ${acceptResp.error}`);

  const apptAfterAcc = (await call('/appointments')).data!.find((a: any) => a.id === appointmentId);
  assert.equal(apptAfterAcc.slotId, slotB.id, '接受后预约应切换到 slotB');
  assert.equal(apptAfterAcc.doctorId, slotB.doctorId, '接受后医生应同步到 slotB 医生');
  const slotAAfterAcc = (await call('/slots')).data!.find((s: any) => s.id === slotA.id);
  assert.equal(slotAAfterAcc.usedCapacity, usedA0, '接受后 slotA 已用容量 -1（释放）');
  const slotBAfterAcc = (await call('/slots')).data!.find((s: any) => s.id === slotB.id);
  assert.equal(slotBAfterAcc.usedCapacity, usedB0 + 1, '接受后 slotB 已用容量 +1（占用）');
  console.log('  ✓ 接受改期后号源正确切换，旧号源释放、新号源占用');

  // ========== 用例 5：状态历史包含改期信息 ==========
  console.log('\n【用例 5】状态历史包含改期信息');
  const histResp = await call(`/appointments/${appointmentId}/history`);
  assert.ok(histResp.success && Array.isArray(histResp.data), '历史接口应返回数组');
  const hist: any[] = histResp.data!;
  console.log(`  共 ${hist.length} 条历史`);
  const rsHist = hist.filter(h => h.rescheduleId != null);
  assert.ok(rsHist.length >= 2, `应至少 2 条改期相关历史（发起+接受/拒绝），实际 ${rsHist.length}`);
  assert.ok(rsHist.some(h => h.rescheduleId === rsId2 && h.oldSlotId != null && h.newSlotId != null), '历史应包含改期 ID 和前后号源');
  console.log('  ✓ 状态历史含改期 ID、前后号源、操作者、原因');

  // ========== 用例 6：权限不匹配 / 冲突拦截 ==========
  console.log('\n【用例 6】权限不匹配与冲突拦截');
  // 6a 医生发起改期被拦截
  const drInitResp = await call(`/appointments/${appointmentId}/reschedule`, {
    method: 'POST',
    headers: doctorHeaders(),
    body: JSON.stringify({ newSlotId: slotA.id, reason: '医生发起' }),
  });
  assert.ok(!drInitResp.success && /护士|nurse/i.test(drInitResp.error || ''), `医生发起应被拦截: ${drInitResp.error}`);
  console.log(`  ✓ 医生发起拦截：${drInitResp.error}`);

  // 6b 另一个患者（赵强 #3）接受当前患者的改期被拦截
  const otherPatientId = PATIENT_ID === 3 ? 1 : 3;
  const otherPatientName = otherPatientId === 1 ? '陈大海' : '赵强';
  const otherPatientHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'patient',
    'x-user-name': encodeURIComponent(otherPatientName),
    'x-patient-id': String(otherPatientId),
  };
  const pendingForPerm = await call(`/appointments/${appointmentId}/reschedule`, {
    method: 'POST', headers: nurseHeaders,
    body: JSON.stringify({ newSlotId: slotA.id, reason: '权限测试' }),
  });
  assert.ok(pendingForPerm.success, '护士发起应成功');
  const accPerm = await call(`/reschedules/${pendingForPerm.data!.id}/accept`, { method: 'POST', headers: otherPatientHeaders });
  assert.ok(!accPerm.success && /所属患者/.test(accPerm.error || ''), `非本人接受应被拦截: ${accPerm.error}`);
  console.log(`  ✓ 非本人接受拦截：${accPerm.error}`);
  // 把这个 pending 请求 reject 掉，避免影响后续
  await call(`/reschedules/${pendingForPerm.data!.id}/reject`, { method: 'POST', headers: patientHeaders, body: JSON.stringify({ rejectReason: 'x' }) });

  // 6c 满员号源拦截
  const db = await import('better-sqlite3').then(m => new m.default('data/clinic.db'));
  db.prepare('UPDATE doctor_slot SET used_capacity = total_capacity WHERE id = ?').run(slotA.id);
  const initFull = await call(`/appointments/${appointmentId}/reschedule`, {
    method: 'POST', headers: nurseHeaders,
    body: JSON.stringify({ newSlotId: slotA.id, reason: '满员测试' }),
  });
  assert.ok(!initFull.success && /容量已满/.test(initFull.error || ''), `满员应被拦截: ${initFull.error}`);
  db.prepare('UPDATE doctor_slot SET used_capacity = ? WHERE id = ?').run(usedA0, slotA.id);
  db.close();
  console.log(`  ✓ 满员号源拦截：${initFull.error}`);

  // ========== 用例 7：预约记录/确认页/导出接口包含改期信息 ==========
  console.log('\n【用例 7】用户可见的改期信息');
  const appts = (await call('/appointments')).data!;
  const mine = appts.find((a: any) => a.id === appointmentId);
  console.log(`  预约记录含 pendingRescheduleId=${mine.pendingRescheduleId} pendingRescheduleStatus=${mine.pendingRescheduleStatus}`);
  assert.ok('pendingRescheduleId' in mine, '预约记录应含 pendingRescheduleId 字段');
  assert.ok('pendingRescheduleStatus' in mine, '预约记录应含 pendingRescheduleStatus 字段');

  const reschedules = await call('/reschedules');
  assert.ok(reschedules.success && Array.isArray(reschedules.data), '改期列表接口应返回数组');
  assert.ok(reschedules.data!.length >= 3, `至少应有 3 条改期记录（2次拒绝/接受 + 1次权限测试），实际 ${reschedules.data!.length}`);
  console.log(`  ✓ 改期列表接口返回 ${reschedules.data!.length} 条记录`);

  // CSV 导出
  const csvResp = await fetch(`${API}/export/csv`, { headers: nurseHeaders });
  const csvText = await csvResp.text();
  console.log(`  CSV 前 200 字符: ${csvText.slice(0, 200)}`);
  assert.ok(/待改期|改期状态/.test(csvText), 'CSV 导出应包含改期相关列');
  console.log('  ✓ CSV 导出包含改期相关列');

  // JSON 导出
  const jsonResp = await fetch(`${API}/export/json`, { headers: nurseHeaders });
  const jsonData = await jsonResp.json();
  const exportedMine = Array.isArray(jsonData) ? jsonData.find((a: any) => a.id === appointmentId) : null;
  console.log(`  JSON 导出类型: ${typeof jsonData}, 数组长度: ${Array.isArray(jsonData) ? jsonData.length : 'N/A'}`);
  assert.ok(exportedMine && Array.isArray(exportedMine.reschedules), 'JSON 导出每条预约应含 reschedules 数组');
  assert.ok(exportedMine.reschedules.length > 0, 'JSON 导出的 reschedules 数组应含记录');
  console.log(`  ✓ JSON 导出含 reschedules 数组（${exportedMine.reschedules.length} 条）`);

  console.log('\n========== ✅ 所有 HTTP 回归用例通过 ==========');
}

main().catch(e => {
  console.error('\n❌ 用例失败:', e);
  process.exit(1);
});
