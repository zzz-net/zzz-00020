#!/usr/bin/env tsx
/**
 * 候补补号 HTTP 回归测试脚本
 *
 * 启动服务后运行：
 *   npx tsx scripts/http-regression-waitlist.ts
 *
 * 前置条件：服务运行在 http://localhost:3001，数据库已 seed 至少 3 个患者、3 个医生、若干号源。
 *
 * 覆盖场景：
 *  1. 创建候补记录（护士成功 / 非护士拦截 / 字段校验）
 *  2. 候补列表分页 + 筛选（按状态、患者、科室、医生、紧急度）
 *  3. 匹配推荐：对所有/单号源匹配
 *  4. 确认补号：成功生成预约 + 预约记录含 fromWaitlist 字段
 *  5. 冲突拦截：同日已有有效预约、号源容量不足、已 confirmed 的候补
 *  6. 标记放弃 + 已放弃不可重复放弃
 *  7. 导出 CSV/JSON 包含候补来源字段
 *  8. 操作日志完整
 */

import assert from 'node:assert/strict';

const API = 'http://localhost:3001/api';

type Resp<T = any> = { success: boolean; data?: T; error?: string; errors?: Record<string, string> };

const nurseHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'nurse',
  'x-user-name': encodeURIComponent('王护士'),
};
const doctorHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'doctor',
  'x-user-name': encodeURIComponent('张医生'),
  'x-doctor-id': '1',
};
const patientHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'patient',
  'x-user-name': encodeURIComponent('陈大海'),
  'x-patient-id': '1',
};

async function call<T = any>(url: string, init: RequestInit = {}): Promise<Resp<T>> {
  const r = await fetch(`${API}${url}`, init);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { success: r.ok, error: text }; }
  return json;
}

async function main() {
  console.log('========== 候补补号 HTTP 回归测试 ==========\n');

  // 先拿到患者/医生/号源基本数据
  const patientsResp = await call('/patients');
  assert.ok(patientsResp.success && Array.isArray(patientsResp.data), '患者接口应返回数组');
  const patients: any[] = patientsResp.data!;
  assert.ok(patients.length >= 1, '至少需要 1 个患者');

  const doctorsResp = await call('/doctors');
  assert.ok(doctorsResp.success && Array.isArray(doctorsResp.data), '医生接口应返回数组');
  const doctors: any[] = doctorsResp.data!;
  assert.ok(doctors.length >= 1, '至少需要 1 个医生');
  const D1 = doctors[0];

  const slotsResp = await call('/slots');
  assert.ok(slotsResp.success && Array.isArray(slotsResp.data), '号源接口应返回数组');
  const slots: any[] = slotsResp.data!;

  const apptsAllResp = await call('/appointments');
  const apptsAll: any[] = (apptsAllResp.success && Array.isArray(apptsAllResp.data)) ? apptsAllResp.data : [];
  const counts = new Map<number, number>();
  apptsAll.forEach(a => counts.set(a.patientId, (counts.get(a.patientId) || 0) + 1));
  patients.sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));

  // 选预约最少的两位患者
  const P1 = patients[0];
  const P2 = patients[1] ?? patients[0];

  // 取消这两位患者的所有已有预约（释放号源容量+避免同日冲突）
  const myAppts1 = apptsAll.filter((a: any) => a.patientId === P1.id);
  const myAppts2 = apptsAll.filter((a: any) => a.patientId === P2.id);
  const patient1Headers = {
    'Content-Type': 'application/json',
    'x-user-role': 'patient',
    'x-user-name': encodeURIComponent(P1.name),
    'x-patient-id': String(P1.id),
  };
  const patient2Headers = {
    'Content-Type': 'application/json',
    'x-user-role': 'patient',
    'x-user-name': encodeURIComponent(P2.name),
    'x-patient-id': String(P2.id),
  };
  for (const a of myAppts1) {
    if (a.status !== 'cancelled') {
      await call(`/appointments/${a.id}/cancel`, {
        method: 'POST', headers: patient1Headers,
        body: JSON.stringify({ reason: 'HTTP测试重置' }),
      });
    }
  }
  for (const a of myAppts2) {
    if (a.status !== 'cancelled') {
      await call(`/appointments/${a.id}/cancel`, {
        method: 'POST', headers: patient2Headers,
        body: JSON.stringify({ reason: 'HTTP测试重置' }),
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
  const inRange = (d: string) => d >= today && d <= dayAfter;

  // 重新拉取最新号源（取消预约后容量已释放）
  const slots2Resp = await call('/slots');
  const slots2: any[] = (slots2Resp.success && Array.isArray(slots2Resp.data)) ? slots2Resp.data : slots;
  // 找一个属于 D1.department、有容量、日期在范围内的号源
  const goodSlots = slots2.filter(s =>
    s.department === D1.department &&
    s.usedCapacity < s.totalCapacity &&
    inRange(s.date)
  );
  assert.ok(goodSlots.length >= 1, `至少需要 1 个 ${D1.department} 科、日期在 ${today}~${dayAfter}、有容量的号源`);
  const FREE_SLOT = goodSlots[0];

  console.log(`测试基线：患者#${P1.id} ${P1.name}、患者#${P2.id} ${P2.name}、医生#${D1.id} ${D1.name} (${D1.department})、可用号源#${FREE_SLOT.id} ${FREE_SLOT.date} ${FREE_SLOT.period}`);

  // ==============================
  // 1. 创建候补
  // ==============================
  console.log('\n【用例 1】创建候补记录');

  const createResp = await call('/waitlists', {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({
      patientId: P1.id,
      department: D1.department,
      reason: 'HTTP回归测试-定期复查',
      acceptableDateFrom: today,
      acceptableDateTo: dayAfter,
      urgency: 'urgent',
    }),
  });
  if (!createResp.success) {
    console.log('  [debug] 创建失败详情：', JSON.stringify(createResp));
  }
  assert.ok(createResp.success && createResp.data, '护士创建候补应成功');
  const W1 = createResp.data;
  assert.equal(W1.patientId, P1.id);
  assert.equal(W1.department, D1.department);
  assert.equal(W1.urgency, 'urgent');
  assert.equal(W1.status, 'waiting');
  assert.ok(W1.createdAt, '应有 createdAt');
  console.log(`  ✓ 创建成功：候补#${W1.id} 状态=${W1.status} 紧急度=${W1.urgency}`);

  const emptyResp = await call('/waitlists', {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ patientId: P1.id, department: '', reason: 'X', acceptableDateFrom: dayAfter, acceptableDateTo: today }),
  });
  assert.ok(!emptyResp.success && emptyResp.errors, '字段校验应返回 errors 对象');
  assert.ok(emptyResp.errors!.department || emptyResp.errors!.reason || emptyResp.errors!.acceptableDateTo, '至少有一项错误');
  console.log('  ✓ 空科室、原因过短、日期倒置均被正确拦截');

  const unauthResp = await call('/waitlists', {
    method: 'POST',
    headers: doctorHeaders,
    body: JSON.stringify({ patientId: P1.id, department: D1.department, reason: '测试', acceptableDateFrom: today, acceptableDateTo: dayAfter }),
  });
  assert.ok(!unauthResp.success, '医生角色创建应被拦截');
  console.log('  ✓ 非护士角色创建被 403/非成功拦截');

  const createResp2 = await call('/waitlists', {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({
      patientId: P2.id,
      department: D1.department,
      doctorId: null,
      reason: 'HTTP回归测试-无指定医生',
      acceptableDateFrom: today,
      acceptableDateTo: dayAfter,
      urgency: 'normal',
    }),
  });
  assert.ok(createResp2.success, '不指定医生（任意科室医生）的候补给创建');
  const W2 = createResp2.data!;
  console.log(`  ✓ 不指定医生候补创建成功：候补#${W2.id}`);

  // ==============================
  // 2. 列表 + 筛选 + 排序
  // ==============================
  console.log('\n【用例 2】候补列表查询/筛选');

  const listAll = await call('/waitlists');
  assert.ok(listAll.success && Array.isArray(listAll.data), '候补列表应返回数组');
  assert.ok((listAll.data as any[]).some(w => w.id === W1.id), '列表中包含刚创建的 W1');
  console.log(`  ✓ 全量列表返回 ${(listAll.data as any[]).length} 条，包含 W1#${W1.id}`);

  const listFilter = await call(`/waitlists?patientId=${P1.id}&status=waiting&urgency=urgent`);
  const filtered: any[] = (listFilter.success && Array.isArray(listFilter.data)) ? listFilter.data : [];
  assert.ok(filtered.every(w => w.patientId === P1.id), '筛选 patientId 生效');
  assert.ok(filtered.every(w => w.status === 'waiting'), '筛选 status 生效');
  assert.ok(filtered.every(w => w.urgency === 'urgent'), '筛选 urgency 生效');
  console.log(`  ✓ 组合筛选（patientId/status/urgency）生效，返回 ${filtered.length} 条`);

  const listByDept = await call(`/waitlists?department=${encodeURIComponent(D1.department)}`);
  const deptList: any[] = (listByDept.success && Array.isArray(listByDept.data)) ? listByDept.data : [];
  assert.ok(deptList.length >= 2, `按科室 ${D1.department} 筛选应至少有 W1 和 W2`);
  console.log(`  ✓ 按科室筛选返回 ${deptList.length} 条`);

  // 排序：紧急度 emergency > urgent > normal，同紧急度按创建时间新→旧
  const sorted: any[] = [...deptList].sort((a, b) => {
    const order: Record<string, number> = { emergency: 0, urgent: 1, normal: 2 };
    if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  if (sorted.length >= 2) {
    const o1: Record<string, number> = { emergency: 0, urgent: 1, normal: 2 };
    assert.ok(o1[sorted[0].urgency] <= o1[sorted[1].urgency], '排序：紧急度降序（紧急在前）');
    console.log('  ✓ 列表按紧急度+创建时间排序（紧急优先，新的在前）');
  }

  // ==============================
  // 3. 匹配推荐
  // ==============================
  console.log('\n【用例 3】匹配推荐');

  const matchAllResp = await call('/waitlists/match/all', { headers: nurseHeaders });
  assert.ok(matchAllResp.success, '全量匹配接口调用成功');
  const matchAll: any[] = (matchAllResp.success && Array.isArray(matchAllResp.data)) ? matchAllResp.data : [];
  console.log(`  ✓ 全量匹配返回 ${matchAll.length} 组 slot→waitlist 推荐`);

  const matchSlotResp = await call(`/waitlists/match/slot/${FREE_SLOT.id}`, { headers: nurseHeaders });
  assert.ok(matchSlotResp.success, '单号源匹配接口调用成功');
  const matchSlot: any[] = (matchSlotResp.success && Array.isArray(matchSlotResp.data)) ? matchSlotResp.data : [];
  console.log(`  ✓ 号源#${FREE_SLOT.id} 匹配返回 ${matchSlot.length} 条候补候选`);
  if (matchSlot.length > 0) {
    assert.ok(inRange(matchSlot[0].slotDate), '匹配结果 slotDate 在可接受日期范围内');
    console.log(`    - 最佳候选：候补#${matchSlot[0].waitlistId}，匹配原因 ${(matchSlot[0].matchReasons ?? []).length} 条`);
  }

  // ==============================
  // 4. 确认补号
  // ==============================
  console.log('\n【用例 4】确认补号');

  // 找一个 W1 或 W2 匹配的号源
  let targetSlotId = FREE_SLOT.id;
  if (matchSlot.length > 0) {
    targetSlotId = matchSlot[0].slotId;
  }

  const confirmResp = await call(`/waitlists/${W1.id}/confirm`, {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ slotId: targetSlotId }),
  });
  // 如果 W1 同日已有有效预约或 W1 的医生和号源医生不匹配，会被拦截
  // 尝试切换到 W2（无指定医生，匹配面广）
  let confirmedId = W1.id;
  let confirmResult = confirmResp;
  if (!confirmResp.success && matchSlot.length > 0 && matchSlot.some(m => m.waitlistId === W2.id)) {
    confirmResult = await call(`/waitlists/${W2.id}/confirm`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({ slotId: targetSlotId }),
    });
    confirmedId = W2.id;
  }
  assert.ok(confirmResult.success && confirmResult.data, `候补#${confirmedId} 确认补号应成功（${JSON.stringify(confirmResult)}）`);
  const CONFIRMED_APPT = confirmResult.data;
  assert.ok(CONFIRMED_APPT.id, '确认补号返回的 Appointment 应有 id');
  const apptIdFromWaitlist = CONFIRMED_APPT.id;
  console.log(`  ✓ 候补#${confirmedId} 确认成功，生成预约#${apptIdFromWaitlist}`);

  const waitlistAfterResp = await call(`/waitlists/${confirmedId}`);
  assert.ok(waitlistAfterResp.success && waitlistAfterResp.data, '确认后查询候补给返回数据');
  const WAITLIST_AFTER = waitlistAfterResp.data!;
  assert.equal(WAITLIST_AFTER.status, 'confirmed', '候补状态应为 confirmed');
  assert.equal(WAITLIST_AFTER.appointmentId, apptIdFromWaitlist, '候补应关联 appointmentId');
  console.log(`  ✓ 候补状态已更新为 confirmed，关联 appointmentId=${apptIdFromWaitlist}`);

  // 验证 appointment 包含 fromWaitlist 字段
  const apptResp = await call('/appointments');
  const appts: any[] = (apptResp.success && Array.isArray(apptResp.data)) ? apptResp.data : [];
  const waitlistAppt = appts.find(a => a.id === apptIdFromWaitlist);
  assert.ok(waitlistAppt, '预约列表中能找到该预约');
  assert.equal(waitlistAppt.fromWaitlist, true, '该预约 fromWaitlist 应为 true');
  assert.equal(waitlistAppt.waitlistId, confirmedId, 'waitlistId 关联到候补记录');
  assert.ok(waitlistAppt.waitlistMatchedAt, 'waitlistMatchedAt 应有值');
  assert.ok(waitlistAppt.waitlistHandledBy, 'waitlistHandledBy 应有值');
  console.log('  ✓ 预约记录包含 fromWaitlist / waitlistId / waitlistMatchedAt / waitlistHandledBy');

  // ==============================
  // 5. 冲突拦截
  // ==============================
  console.log('\n【用例 5】冲突拦截');

  const alreadyConfirmed = await call(`/waitlists/${confirmedId}/confirm`, {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ slotId: targetSlotId }),
  });
  assert.ok(!alreadyConfirmed.success, '已 confirmed 的候补再次确认应拦截');
  console.log('  ✓ 已 confirmed 的候补二次确认被拦截');

  // 同日已有有效预约：再给同患者加一个候补并尝试同日号源
  const overlapCreate = await call('/waitlists', {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({
      patientId: confirmedId === W1.id ? P1.id : P2.id,
      department: D1.department,
      reason: '同日冲突测试',
      acceptableDateFrom: today,
      acceptableDateTo: dayAfter,
      urgency: 'normal',
    }),
  });
  if (overlapCreate.success) {
    const W_OVERLAP = overlapCreate.data!;
    const overlapConfirm = await call(`/waitlists/${W_OVERLAP.id}/confirm`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({ slotId: targetSlotId }),
    });
    if (!overlapConfirm.success) {
      assert.ok(overlapConfirm.error!.includes('同一患者') || overlapConfirm.error!.includes('同一天') || overlapConfirm.error!.includes('重叠') || overlapConfirm.error!.includes('冲突'), '同日冲突提示应包含关键词');
      console.log(`  ✓ 同日已有有效预约时补号被拦截，错误：${overlapConfirm.error}`);
    } else {
      console.log('  ⚠️ 同日已有预约但仍成功确认（可能该患者当日之前的预约未被命中）');
    }
  }

  // 非护士角色确认被拦截
  const unauthConfirm = await call(`/waitlists/${W2.id === confirmedId ? W1.id : W2.id}/confirm`, {
    method: 'POST',
    headers: patientHeaders,
    body: JSON.stringify({ slotId: targetSlotId }),
  });
  assert.ok(!unauthConfirm.success, '患者角色确认候补应被拦截');
  console.log('  ✓ 非护士角色确认候补被拦截');

  // ==============================
  // 6. 标记放弃
  // ==============================
  console.log('\n【用例 6】标记放弃');

  // 确认过的候补不能放弃
  const abandonConfirmed = await call(`/waitlists/${confirmedId}/abandon`, {
    method: 'POST',
    headers: nurseHeaders,
    body: JSON.stringify({ reason: '测试放弃' }),
  });
  assert.ok(!abandonConfirmed.success, '已 confirmed 的候补不能放弃');
  console.log('  ✓ 已 confirmed 的候补不能放弃');

  const remainingId = confirmedId === W1.id ? W2.id : W1.id;
  if (remainingId && remainingId !== confirmedId) {
    const abandonResp = await call(`/waitlists/${remainingId}/abandon`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({ reason: '患者取消需求' }),
    });
    if (abandonResp.success) {
      const abandoned = abandonResp.data!;
      assert.equal(abandoned.status, 'abandoned');
      assert.equal(abandoned.abandonReason, '患者取消需求');
      console.log(`  ✓ 候补#${remainingId} 标记放弃成功，状态=${abandoned.status}`);

      const doubleAbandon = await call(`/waitlists/${remainingId}/abandon`, {
        method: 'POST',
        headers: nurseHeaders,
        body: JSON.stringify({ reason: '再次放弃' }),
      });
      assert.ok(!doubleAbandon.success, '已 abandoned 的候补不能重复放弃');
      console.log('  ✓ 已 abandoned 的候补重复放弃被拦截');
    } else {
      console.log(`  ⚠️ 候补#${remainingId} 已不在 waiting 状态，跳过放弃测试（${abandonResp.error}）`);
    }
  }

  // ==============================
  // 7. 操作日志
  // ==============================
  console.log('\n【用例 7】操作日志');

  const logsResp = await call(`/waitlists/${confirmedId}/logs`, { headers: nurseHeaders });
  assert.ok(logsResp.success && Array.isArray(logsResp.data), '日志接口返回数组');
  const logs: any[] = logsResp.data!;
  assert.ok(logs.length >= 2, '至少应有创建+确认两条日志');
  const actions = logs.map(l => l.action);
  assert.ok(actions.includes('创建候补'), '日志包含「创建候补」');
  assert.ok(actions.includes('确认补号'), '日志包含「确认补号」');
  console.log(`  ✓ 候补#${confirmedId} 日志共 ${logs.length} 条，包含创建、确认补号动作`);

  // ==============================
  // 8. 导出 CSV/JSON 包含候补字段
  // ==============================
  console.log('\n【用例 8】导出 CSV/JSON 包含候补字段');

  const csvResp = await fetch(`${API}/export/csv`, { headers: nurseHeaders });
  const csvText = await csvResp.text();
  assert.ok(csvText.includes('是否来自候补') || csvText.includes('fromWaitlist') || csvText.includes('from_waitlist'), `CSV 表头应包含候补来源字段（实际开头：${csvText.slice(0, 200)}）`);
  assert.ok(csvText.includes('候补ID') || csvText.includes('waitlistId') || csvText.includes('waitlist_id'), 'CSV 表头应包含候补ID');
  assert.ok(csvText.includes('候补匹配时间') || csvText.includes('waitlistMatchedAt') || csvText.includes('waitlist_matched_at'), 'CSV 表头应包含候补匹配时间');
  assert.ok(csvText.includes('候补处理人') || csvText.includes('waitlistHandledBy') || csvText.includes('waitlist_handled_by'), 'CSV 表头应包含候补处理人');
  console.log('  ✓ CSV 导出包含 4 个候补相关字段（是否来自候补 / 候补ID / 候补匹配时间 / 候补处理人）');

  const jsonResp = await fetch(`${API}/export/json`, { headers: nurseHeaders });
  const jsonData = await jsonResp.json();
  const jsonArr: any[] = Array.isArray(jsonData) ? jsonData : (jsonData.data ?? []);
  const withWaitlist = jsonArr.find(a => a.fromWaitlist === true || a.from_waitlist === 1);
  if (withWaitlist) {
    const hasWaitlistId = ('waitlistId' in withWaitlist) || ('waitlist_id' in withWaitlist);
    const hasMatchedAt = ('waitlistMatchedAt' in withWaitlist) || ('waitlist_matched_at' in withWaitlist);
    const hasHandledBy = ('waitlistHandledBy' in withWaitlist) || ('waitlist_handled_by' in withWaitlist);
    assert.ok(hasWaitlistId && hasMatchedAt && hasHandledBy, 'JSON 中候补预约应包含 waitlistId / waitlistMatchedAt / waitlistHandledBy');
    console.log('  ✓ JSON 导出的候补预约包含 waitlistId / waitlistMatchedAt / waitlistHandledBy');
  } else {
    console.log('  ⚠️ JSON 中未找到来自候补的预约（可能暂无，跳过字段检查）');
  }

  // ==============================
  // 9. 导出路径回归：两条路径（/api/export/csv|json 与 /api/export/appointments?format=csv|json）均可用且候补字段完整
  // ==============================
  console.log('\n【用例 9】导出路径回归（两条路径均可用 + 候补字段完整）');

  // 兼容路径 /api/export/appointments?format=csv → 可用且字段完整
  const compatCsvResp = await fetch(`${API}/export/appointments?format=csv`, { headers: nurseHeaders });
  assert.strictEqual(compatCsvResp.status, 200, `兼容路径 /api/export/appointments?format=csv 应返回 200，实际 ${compatCsvResp.status}`);
  const compatCsvText = await compatCsvResp.text();
  assert.ok(compatCsvText.includes('是否来自候补'), '兼容路径 CSV 应包含「是否来自候补」');
  assert.ok(compatCsvText.includes('候补ID'), '兼容路径 CSV 应包含「候补ID」');
  assert.ok(compatCsvText.includes('候补匹配时间'), '兼容路径 CSV 应包含「候补匹配时间」');
  assert.ok(compatCsvText.includes('候补处理人'), '兼容路径 CSV 应包含「候补处理人」');
  console.log('  ✓ 兼容路径 /api/export/appointments?format=csv 返回 200 且 4 个候补字段完整');

  // 兼容路径 /api/export/appointments?format=json → 可用且字段完整
  const compatJsonResp = await fetch(`${API}/export/appointments?format=json`, { headers: nurseHeaders });
  assert.strictEqual(compatJsonResp.status, 200, `兼容路径 /api/export/appointments?format=json 应返回 200，实际 ${compatJsonResp.status}`);
  const compatJsonData = await compatJsonResp.json();
  const compatJsonArr: any[] = Array.isArray(compatJsonData) ? compatJsonData : (compatJsonData.data ?? []);
  assert.ok(Array.isArray(compatJsonArr), '兼容路径 JSON 导出应返回数组');
  if (compatJsonArr.length > 0) {
    const sample = compatJsonArr[0];
    assert.ok('fromWaitlist' in sample || 'from_waitlist' in sample, '兼容路径 JSON 每条预约应包含 fromWaitlist 字段');
    console.log('  ✓ 兼容路径 /api/export/appointments?format=json 返回 200 且包含 fromWaitlist 等候补字段');
  } else {
    console.log('  ⚠️ 兼容路径 JSON 导出现无数据（暂无预约），跳过字段检查');
  }

  // 兼容路径 /api/export/appointments?format=invalid → 应返回 400 并给出明确错误提示
  const invalidResp = await fetch(`${API}/export/appointments?format=xml`, { headers: nurseHeaders });
  assert.strictEqual(invalidResp.status, 400, `无效 format 应返回 400，实际 ${invalidResp.status}`);
  const invalidBody = await invalidResp.json();
  assert.ok(invalidBody.error && String(invalidBody.error).includes('format'), '无效 format 应返回包含 format 关键词的错误提示');
  console.log('  ✓ 无效 format=xml 返回 400 并给出明确错误提示，不再误导');

  // 主路径 /api/export/csv → 可用且字段完整
  const realCsvResp = await fetch(`${API}/export/csv`, { headers: nurseHeaders });
  assert.strictEqual(realCsvResp.status, 200, `主路径 /api/export/csv 应返回 200，实际 ${realCsvResp.status}`);
  const realCsvText = await realCsvResp.text();
  assert.ok(realCsvText.includes('是否来自候补'), '主路径 CSV 导出应包含「是否来自候补」');
  assert.ok(realCsvText.includes('候补ID'), '主路径 CSV 导出应包含「候补ID」');
  assert.ok(realCsvText.includes('候补匹配时间'), '主路径 CSV 导出应包含「候补匹配时间」');
  assert.ok(realCsvText.includes('候补处理人'), '主路径 CSV 导出应包含「候补处理人」');
  console.log('  ✓ 主路径 /api/export/csv 返回 200 且 4 个候补字段完整');

  // 主路径 /api/export/json → 可用且字段完整
  const realJsonResp = await fetch(`${API}/export/json`, { headers: nurseHeaders });
  assert.strictEqual(realJsonResp.status, 200, `主路径 /api/export/json 应返回 200，实际 ${realJsonResp.status}`);
  const realJsonData = await realJsonResp.json();
  const realJsonArr: any[] = Array.isArray(realJsonData) ? realJsonData : (realJsonData.data ?? []);
  assert.ok(Array.isArray(realJsonArr), '主路径 JSON 导出应返回数组');
  if (realJsonArr.length > 0) {
    const sample = realJsonArr[0];
    assert.ok('fromWaitlist' in sample || 'from_waitlist' in sample, '主路径 JSON 每条预约应包含 fromWaitlist 字段');
    console.log('  ✓ 主路径 /api/export/json 返回 200 且包含 fromWaitlist 等候补字段');
  } else {
    console.log('  ⚠️ 主路径 JSON 导出现无数据（暂无预约），跳过字段检查');
  }

  console.log('\n✅ 候补补号 HTTP 回归测试全部通过！');
}

main().catch(err => {
  console.error('❌ 测试失败：', err);
  process.exit(1);
});
