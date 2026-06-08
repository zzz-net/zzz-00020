#!/usr/bin/env tsx
/**
 * 爽约和迟到随访 HTTP 全链路回归测试
 *
 * 必须先启动真实服务（npm run dev 或 npm run server:dev，监听 :3001）
 *
 * 覆盖场景：
 *  1. 护士登记到场状态（POST /api/appointments/:id/attendance）
 *  2. 修改登记（覆盖原状态，日志保留旧值）
 *  3. 撤销登记（POST /api/appointments/:id/attendance/revoke）
 *  4. 查询操作日志（GET /api/appointments/:id/attendance-logs）
 *  5. 权限拦截（非护士登记/撤销返回 403）
 *  6. 查询筛选（按 attendanceStatus 筛选）
 *  7. 导出 CSV 包含到场字段、按到场状态筛选导出
 *  8. 导出 JSON 包含到场字段
 *
 * 用法：
 *   npx tsx scripts/http-regression-attendance.ts
 */

import assert from 'node:assert/strict';

const BASE = 'http://localhost:3001';

const nurseHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'nurse',
  'x-user-name': encodeURIComponent('王护士'),
};

const doctorHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'doctor',
  'x-doctor-id': '1',
  'x-user-name': encodeURIComponent('张伟明'),
};

const patientHeaders = {
  'Content-Type': 'application/json',
  'x-user-role': 'patient',
  'x-patient-id': '1',
  'x-user-name': encodeURIComponent('陈大海'),
};

let testCount = 0;
function ok(msg: string) {
  testCount++;
  console.log(`  ✓ ${msg}`);
}
function section(title: string) {
  console.log(`\n===== ${title} =====`);
}

async function http<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

async function main() {
  console.log('爽约和迟到随访 · HTTP 全链路回归测试');
  console.log(`目标: ${BASE}`);

  // 预检：确保有一个已确认的预约（日期在今天或之前）
  let confirmedApptId: number | null = null;
  const today = new Date().toISOString().slice(0, 10);
  {
    const apptsRes = await http<any[]>(`${BASE}/api/appointments?status=confirmed`, {
      headers: nurseHeaders,
    });
    if (apptsRes.success && apptsRes.data && apptsRes.data.length > 0) {
      const ok = apptsRes.data.find((a: any) => a.slotDate && a.slotDate <= today);
      if (ok) confirmedApptId = ok.id;
    }
  }
  if (!confirmedApptId) {
    // 尝试找一个 pending_confirm 的预约（日期今天或之前）并确认
    const pendingRes = await http<any[]>(`${BASE}/api/appointments?status=pending_confirm`, {
      headers: nurseHeaders,
    });
    if (pendingRes.success && pendingRes.data && pendingRes.data.length > 0) {
      const ok = pendingRes.data.find((a: any) => a.slotDate && a.slotDate <= today);
      if (ok) {
        const confirmRes = await http(`${BASE}/api/appointments/${ok.id}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'patient',
            'x-patient-id': String(ok.patientId),
            'x-user-name': encodeURIComponent('测试患者'),
          },
        });
        if (confirmRes.success) confirmedApptId = ok.id;
      }
    }
  }
  if (!confirmedApptId) {
    // 找一个今天或之前日期的任意状态预约（非 cancelled），将其取消后重新分诊确认，避免同日冲突
    const allApptsRes = await http<any[]>(`${BASE}/api/appointments`, { headers: nurseHeaders });
    if (!allApptsRes.success || !allApptsRes.data) throw new Error('获取预约列表失败');

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // 优先找今天或之前日期的 pending_confirm 预约，直接确认
    let targetAppt = allApptsRes.data.find(
      (a: any) => a.slotDate && a.slotDate <= today && a.status === 'pending_confirm',
    );
    if (targetAppt) {
      const confirmRes = await http(`${BASE}/api/appointments/${targetAppt.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'patient',
          'x-patient-id': String(targetAppt.patientId),
          'x-user-name': encodeURIComponent('测试患者'),
        },
      });
      if (confirmRes.success) confirmedApptId = targetAppt.id;
    }

    if (!confirmedApptId) {
      // 找一个今天或之前日期的已确认预约直接用
      targetAppt = allApptsRes.data.find(
        (a: any) => a.slotDate && a.slotDate <= today && a.status === 'confirmed',
      );
      if (targetAppt) confirmedApptId = targetAppt.id;
    }

    if (!confirmedApptId) {
      // 找一个今天或之前日期的非 cancelled 预约，取消后再用该患者重新创建
      targetAppt = allApptsRes.data.find(
        (a: any) => a.slotDate && a.slotDate <= today && a.status !== 'cancelled',
      );
      if (targetAppt) {
        // 取消该预约
        const cancelRes = await http(`${BASE}/api/appointments/${targetAppt.id}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'patient',
            'x-patient-id': String(targetAppt.patientId),
            'x-user-name': encodeURIComponent('测试患者'),
          },
          body: JSON.stringify({ reason: 'HTTP测试清理' }),
        });
        // 取消后继续用该患者创建
      }

      // 现在创建新预约，优先用昨天的日期（肯定可以登记）
      const patientIdToUse = targetAppt ? targetAppt.patientId : 1;
      const targetDate = yesterday;

      const appRes = await http(`${BASE}/api/applications`, {
        method: 'POST',
        headers: nurseHeaders,
        body: JSON.stringify({
          patientId: patientIdToUse,
          doctorId: 1,
          reason: 'HTTP回归测试-到场随访',
          expectedDate: targetDate,
        }),
      });
      if (!appRes.success || !appRes.data) throw new Error('创建复诊申请失败: ' + appRes.error);
      const appId = (appRes.data as any).id;

      const slotsRes = await http<any[]>(`${BASE}/api/slots?doctorId=1`, { headers: nurseHeaders });
      if (!slotsRes.success || !slotsRes.data || slotsRes.data.length === 0)
        throw new Error('没有可用号源');
      // 优先选昨天的号源，没有就选今天或之前的
      let slot = slotsRes.data.find((s: any) => s.date === targetDate && s.usedCapacity < s.totalCapacity);
      if (!slot) slot = slotsRes.data.find((s: any) => s.date <= today && s.usedCapacity < s.totalCapacity);
      if (!slot) slot = slotsRes.data.find((s: any) => s.usedCapacity < s.totalCapacity);
      if (!slot) throw new Error('没有剩余容量的号源');

      const triageRes = await http(`${BASE}/api/applications/${appId}/triage`, {
        method: 'POST',
        headers: nurseHeaders,
        body: JSON.stringify({ slotId: slot.id }),
      });
      if (!triageRes.success) throw new Error('分诊失败: ' + triageRes.error);

      const apptsAfter = await http<any[]>(`${BASE}/api/appointments?patientId=${patientIdToUse}`, {
        headers: nurseHeaders,
      });
      const newAppt = (apptsAfter.data || []).find((a: any) => a.applicationId === appId);
      if (!newAppt) throw new Error('找不到新预约');

      const confirmRes = await http(`${BASE}/api/appointments/${newAppt.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'patient',
          'x-patient-id': String(patientIdToUse),
          'x-user-name': encodeURIComponent('测试患者'),
        },
      });
      if (!confirmRes.success) throw new Error('确认预约失败: ' + confirmRes.error);
      confirmedApptId = newAppt.id;
    }
  }
  console.log(`使用测试预约: #${confirmedApptId}`);

  section('用例 1：护士登记到场状态');
  {
    const res = await http(`${BASE}/api/appointments/${confirmedApptId}/attendance`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({
        status: 'late',
        remark: 'HTTP测试：迟到20分钟',
      }),
    });
    assert.equal(res.success, true, res.error || '登记应成功');
    const data = res.data as any;
    assert.equal(data.attendanceStatus, 'late');
    assert.equal(data.attendanceRemark, 'HTTP测试：迟到20分钟');
    assert.equal(data.attendanceHandledBy, '王护士');
    ok('登记迟到状态 + 备注成功，返回数据包含全部到场字段');
  }

  section('用例 2：修改登记（覆盖原状态，保留旧日志）');
  {
    const res = await http(`${BASE}/api/appointments/${confirmedApptId}/attendance`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({
        status: 'no_show',
        remark: 'HTTP测试：联系不上，爽约',
      }),
    });
    assert.equal(res.success, true);
    const data = res.data as any;
    assert.equal(data.attendanceStatus, 'no_show');
    assert.equal(data.attendanceRemark, 'HTTP测试：联系不上，爽约');
    ok('修改登记为爽约状态成功');

    const logsRes = await http<any[]>(
      `${BASE}/api/appointments/${confirmedApptId}/attendance-logs`,
      { headers: nurseHeaders },
    );
    assert.equal(logsRes.success, true);
    assert.ok(logsRes.data && logsRes.data.length >= 2);
    const first = logsRes.data[0];
    const second = logsRes.data[logsRes.data.length - 1];
    assert.equal(first.action, 'register');
    assert.equal(first.newStatus, 'late');
    assert.equal(second.action, 'register');
    assert.equal(second.oldStatus, 'late');
    assert.equal(second.newStatus, 'no_show');
    assert.equal(second.oldRemark, 'HTTP测试：迟到20分钟');
    ok('修改登记后日志保留旧状态、旧备注，未静默覆盖');
  }

  section('用例 3：撤销到场登记');
  {
    const res = await http(`${BASE}/api/appointments/${confirmedApptId}/attendance/revoke`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({ remark: 'HTTP测试：患者补来，撤销爽约标记' }),
    });
    assert.equal(res.success, true, res.error || '撤销应成功');
    const data = res.data as any;
    assert.equal(data.attendanceStatus, null);
    assert.equal(data.attendanceRemark, null);
    assert.equal(data.attendanceHandledBy, null);
    assert.equal(data.attendanceHandledAt, null);
    ok('撤销后到场字段全部清空');

    const logsRes = await http<any[]>(
      `${BASE}/api/appointments/${confirmedApptId}/attendance-logs`,
      { headers: nurseHeaders },
    );
    assert.ok(logsRes.data && logsRes.data.length >= 3);
    const last = logsRes.data[logsRes.data.length - 1];
    assert.equal(last.action, 'revoke');
    assert.equal(last.oldStatus, 'no_show');
    assert.equal(last.newStatus, null);
    assert.equal(last.oldRemark, 'HTTP测试：联系不上，爽约');
    assert.equal(last.newRemark, 'HTTP测试：患者补来，撤销爽约标记');
    ok('撤销日志记录旧状态、旧备注、撤销原因，不可静默恢复');
  }

  section('用例 4：查询操作日志');
  {
    const logsRes = await http<any[]>(
      `${BASE}/api/appointments/${confirmedApptId}/attendance-logs`,
      { headers: nurseHeaders },
    );
    assert.equal(logsRes.success, true);
    assert.ok(logsRes.data && logsRes.data.length >= 3);
    for (const log of logsRes.data) {
      assert.ok(log.id);
      assert.ok(log.action);
      assert.ok(log.createdAt);
      assert.ok(log.operatorRole);
      assert.ok(log.operatorName);
    }
    ok('日志接口返回每条记录均包含 id、action、时间、操作人角色与姓名');
  }

  section('用例 5：权限拦截（非护士不能登记/撤销）');
  {
    const doctorRes = await http(`${BASE}/api/appointments/${confirmedApptId}/attendance`, {
      method: 'POST',
      headers: doctorHeaders,
      body: JSON.stringify({ status: 'arrived' }),
    });
    assert.equal(doctorRes.success, false);
    ok('医生身份登记被拦截（返回 success=false）');

    const patientRes = await http(`${BASE}/api/appointments/${confirmedApptId}/attendance`, {
      method: 'POST',
      headers: patientHeaders,
      body: JSON.stringify({ status: 'arrived' }),
    });
    assert.equal(patientRes.success, false);
    ok('患者身份登记被拦截（返回 success=false）');

    const revokeDoctorRes = await http(
      `${BASE}/api/appointments/${confirmedApptId}/attendance/revoke`,
      {
        method: 'POST',
        headers: doctorHeaders,
        body: JSON.stringify({}),
      },
    );
    assert.equal(revokeDoctorRes.success, false);
    ok('医生身份撤销被拦截（返回 success=false）');
  }

  section('用例 6：按到场状态筛选查询');
  {
    // 先登记一个已到诊的
    await http(`${BASE}/api/appointments/${confirmedApptId}/attendance`, {
      method: 'POST',
      headers: nurseHeaders,
      body: JSON.stringify({ status: 'arrived' }),
    });

    const arrivedRes = await http<any[]>(
      `${BASE}/api/appointments?attendanceStatus=arrived`,
      { headers: nurseHeaders },
    );
    assert.equal(arrivedRes.success, true);
    assert.ok(arrivedRes.data && arrivedRes.data.length >= 1);
    for (const a of arrivedRes.data) {
      assert.equal(a.attendanceStatus, 'arrived');
    }
    ok('按 attendanceStatus=arrived 筛选，返回结果状态全部为已到诊');

    const noShowRes = await http<any[]>(
      `${BASE}/api/appointments?attendanceStatus=no_show`,
      { headers: nurseHeaders },
    );
    assert.equal(noShowRes.success, true);
    if (noShowRes.data && noShowRes.data.length > 0) {
      for (const a of noShowRes.data) {
        assert.equal(a.attendanceStatus, 'no_show');
      }
    }
    ok('按 attendanceStatus=no_show 筛选结果正确（可能为空，若为空则已验证接口不报错）');
  }

  section('用例 7：导出 CSV 包含到场字段');
  {
    const csvUrl = `${BASE}/api/export/csv?attendanceStatus=arrived`;
    const csvRes = await fetch(csvUrl, { headers: nurseHeaders });
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('到场状态'), 'CSV 表头应包含"到场状态"');
    assert.ok(csvText.includes('处理备注'), 'CSV 表头应包含"处理备注"');
    assert.ok(csvText.includes('处理人'), 'CSV 表头应包含"处理人"');
    assert.ok(csvText.includes('处理时间'), 'CSV 表头应包含"处理时间"');
    ok('CSV 导出包含到场状态、处理备注、处理人、处理时间4列');
    assert.ok(csvRes.headers.get('content-type')?.includes('text/csv'));
    ok('CSV Content-Type 正确');
  }

  section('用例 8：导出 JSON 包含到场字段');
  {
    const jsonRes = await fetch(`${BASE}/api/export/json?attendanceStatus=arrived`, {
      headers: nurseHeaders,
    });
    const json = await jsonRes.json() as any[];
    assert.ok(Array.isArray(json));
    if (json.length > 0) {
      const first = json[0];
      assert.ok('attendanceStatus' in first);
      assert.ok('attendanceRemark' in first);
      assert.ok('attendanceHandledBy' in first);
      assert.ok('attendanceHandledAt' in first);
      ok('JSON 每条预约包含 4 个到场相关字段');
    } else {
      ok('JSON 导出接口正常（当前筛选条件为空集）');
    }
  }

  console.log(`\n✅ 所有 ${testCount} 个到场随访 HTTP 回归用例通过！`);
}

main().catch((e) => {
  console.error('❌ 测试失败:', e.message || String(e));
  process.exit(1);
});
