# 门诊复诊排班与补号协同系统

本地门诊复诊排班与补号协同系统，覆盖 **复诊申请 → 分诊确认 → 医生放号 → 患者确认 → 改期/换号** 的完整闭环，支持预约记录查询、状态历史追溯（含改期全链路）、数据导出（CSV/JSON，包含改期信息），数据持久化到本地 SQLite（重启后改期记录完整可查）。

## 技术栈

- 前端：React 18 + TypeScript + Vite 6 + TailwindCSS 3 + Zustand 5 + React Router 7 + lucide-react
- 后端：Express 4 + TypeScript + better-sqlite3
- 数据库：SQLite（本地文件 `./data/clinic.db`，重启数据不丢失）

## 快速启动

```bash
# 安装依赖（已安装可跳过）
npm install

# 同时启动前端 (Vite :5173) 和后端 (Express :3001)
npm run dev
```

浏览器打开 http://localhost:5173

## 预置样例数据

系统启动时自动创建以下样例数据（如数据库为空）：

### 医生（3 位）
| ID | 姓名 | 科室 | 职称 |
|----|------|------|------|
| 1 | 张伟明 | 心内科 | 主任医师 |
| 2 | 李雪华 | 内分泌科 | 副主任医师 |
| 3 | 王建国 | 骨科 | 主治医师 |

### 患者（3 位）
| ID | 姓名 | 身份证 | 手机号 | 病历号 |
|----|------|--------|--------|--------|
| 1 | 陈大海 | 110101198001011234 | 13800138001 | MR20240001 |
| 2 | 刘小美 | 110101199203054567 | 13800138002 | MR20240002 |
| 3 | 赵强 | 110101197508127890 | 13800138003 | MR20240003 |

### 号源（默认填充今日、明日、后日若干排班）
系统会自动为 3 位医生创建未来 3 天的号源样例，可在「号源管理」中查看或新增。

## 角色切换

系统通过左侧导航栏底部或仪表盘顶部的 **切换身份** 按钮模拟 3 种角色：

- **护士（王护士）**：默认角色，拥有最高操作权限（新建申请、分诊、取消预约）
- **医生**：选择具体医生（张伟明 / 李雪华 / 王建国），仅医生本人可发布号源
- **患者**：选择具体患者（陈大海 / 刘小美 / 赵强），查看本人预约、确认或取消

## 完整复现步骤：从新建申请到确认预约

### 步骤 1：切换到「护士」身份（默认即为护士）
点击左侧底部按钮切换为 **护士**。

### 步骤 2：提交复诊申请
1. 点击左侧导航栏「复诊申请」
2. 在「新建复诊申请」表单中：
   - 患者：选择「陈大海」
   - 目标医生：选择「张伟明 - 心内科（主任医师）」
   - 复诊原因：填写「血压复查，近期波动较大」
   - 期望日期：选择 3 天内的某一天
3. 点击「提交申请」
4. 提交成功后，下方申请列表中出现一条 **状态为「待分诊」** 的记录

> 表单校验测试：直接空字段提交，可见每个输入框下方的红色错误提示。

### 步骤 3：分诊确认（分配号源）
1. 点击左侧导航栏「分诊确认」（仅护士可见）
2. 在待分诊列表中找到刚才的申请，点击「分诊」
3. 弹出模态框：
   - 号源下拉中选择张伟明医生的某一上午/下午号源（剩余容量 > 0）
   - 点击「确认分诊」
4. 分诊成功后，申请状态变为 **「待患者确认」**，对应号源「已用容量 +1」

### 步骤 4：切换到「患者」身份确认预约
1. 在左侧底部点击「患者」下拉，选择「陈大海」
2. 点击左侧导航栏「预约确认」（仅患者可见）
3. 列表中展示待确认预约，点击「确认预约」
4. 状态变为 **「已确认」**

> 或测试取消流程：点击「取消预约」→ 填写取消原因（如「临时有事」）→ 确认取消 → 状态变为「已取消」，同时号源容量被释放（可到号源管理观察已用容量 -1）。

### 步骤 5：查看预约记录与状态历史
1. 点击左侧导航栏「预约记录」
2. 使用顶部筛选器按患者/医生/状态/日期筛选
3. 点击某行的「查看历史」按钮，弹出时间线：
   - 分诊（护士操作）
   - 患者确认（患者操作）
   - 如取消则展示取消原因
4. 已取消的记录会在「取消原因」列高亮显示

### 步骤 6：数据导出
1. 点击左侧导航栏「数据导出」
2. 可选择筛选条件
3. 点击「导出 CSV」或「导出 JSON」按钮，浏览器会自动下载文件

## 边界约束验证

### 1. 护士不能代替医生发布号源
- 保持「护士」身份，直接访问 `/slots` 号源管理页
- 页面顶部「发布号源」表单不可见，并有红色提示「仅医生可发布号源」
- 接口层也做了权限拦截：POST /api/slots 返回 403

### 2. 同一患者同一天重叠预约被拦截
- 在「护士」身份下为「陈大海」分诊分配到 **6月8日上午** 张伟明医生号源
- 尝试再新建另一个申请，并分诊分配到 **6月8日上午/下午** 任一医生号源
- 系统返回错误：「同一患者同一天已存在有效预约，存在重叠，请取消后再操作」

### 3. 已取消记录再次取消不能重复释放容量
- 找到一条「已取消」的预约记录
- 通过接口或重复点击取消，系统返回：「该预约已取消，不可重复取消（容量不会重复释放）」
- 观察号源容量不会重复 -1

### 4. 改期：患者拒绝 → 原预约 / 原号源完全不变
- 护士发起改期后，切换到对应患者身份，在「预约确认」页点击「拒绝改期」，填写拒绝原因
- 回到「预约记录」，观察该预约的医生、日期、时段均与改期前一致
- 到「号源管理」观察旧号源已用容量未减少，新号源已用容量未增加

### 5. 改期：新号源满员被拦截
- 选择一个号源，通过「号源管理」或直接 SQL 将其 `used_capacity = total_capacity` 填满
- 护士尝试发起改期到该满号源，系统返回错误「新号源容量已满」
- 预约记录和号源容量均不变

### 6. 改期：同日重复预约被拦截
- 先为某患者在 **6月9日上午** 创建一个有效预约（分诊确认）
- 再为该患者在 **6月8日下午** 创建另一个有效预约
- 尝试将 6月8日 的预约改期到 **6月9日下午**（该患者 6月9日已有预约）
- 系统返回错误「同日重复预约，请选择其他日期」

### 7. 改期：权限不匹配被拦截
- **患者 B** 尝试接受 / 拒绝 **患者 A** 的改期请求 → 接口返回「仅预约所属患者可接受/拒绝」
- **医生**身份尝试发起改期 → 接口返回「仅护士可发起改期」
- 页面层也做了对应控制：医生看不到「改期」按钮，患者只能操作自己的改期请求

### 8. 改期：并发提交冲突，CAS 保证容量不超售、不负数
- 通过自动化测试脚本覆盖（见下方「自动化测试」）
- 两个患者同时接受改期到同一个容量=1 的号源时，先 accept 的成功，后 accept 的被拦截并返回「容量已满 / 并发冲突」
- 最终号源 used_capacity 严格 = 1，无负数、无超售

### 9. 改期：重启服务后数据完整可查
- 完成一轮改期（发起 → 接受 / 拒绝）后，停止服务再重启
- 回到「预约记录」→「查看历史」：
  - 改期记录区块仍显示所有关联改期请求
  - 状态时间线每条改期操作均保留（发起人、决定人、前后号源、原因、时间）
- 导出 CSV / JSON：改期信息完整导出

## 旧库兼容与自动迁移（根因修复说明）

### 问题背景
早期版本的 `data/clinic.db` 中 `status_history` 表缺少 `reschedule_id`、`old_slot_id`、`new_slot_id` 三个改期相关字段，同时 `reschedule_request` 和 `appointment` 表也可能缺少新版字段。导致护士分诊或发起改期时，SQL INSERT 因缺列直接抛出 `SQLITE_ERROR`，Express 返回 500。

### 修复方式
服务启动时在 [api/db.ts](file:///d:/workSpace/AI__SPACE/zzz-00020/api/db.ts#L127-L167) 自动执行数据库迁移，**无需任何手动操作**：

1. **字段检测**：通过 `PRAGMA table_info(tablename)` 检测每列是否存在
2. **补齐缺失列**：不存在则 `ALTER TABLE ... ADD COLUMN`（SQLite 仅支持新增列）
3. **补齐索引**：`idx_reschedule_appt`、`idx_reschedule_status`、`idx_history_appt`
4. **状态归一化**：将旧版状态值 `'pending_patient'` 统一更新为 `'pending'`

### 迁移日志
启动服务（`npm run dev` 或 `npm run server:dev`）时，终端（nodemon 输出）会打印迁移日志，例如：

```
[db-migrate] 表 status_history 新增列 reschedule_id
[db-migrate] 表 status_history 新增列 old_slot_id
[db-migrate] 表 status_history 新增列 new_slot_id
[db-migrate] 表 reschedule_request 新增列 initiated_by_role
[db-migrate] 表 reschedule_request 新增列 initiated_by_name
[db-migrate] 表 appointment 新增列 pending_reschedule_id
[db-migrate] 表 appointment 新增列 reschedule_count
[db-migrate] 归一化 2 条 reschedule_request status: pending_patient → pending
```

若某列已存在，迁移逻辑会静默跳过，不会重复执行。服务重启多次也安全。

---

## 自动化测试（改期功能 8 场景 + HTTP 全链路回归）

### 1. 单元/集成测试：`scripts/test-reschedule.ts`

独立临时数据库（`data/test-reschedule-{timestamp}.db`），不影响主库 `data/clinic.db`。脚本结束后自动清理临时文件。

```bash
npx tsx scripts/test-reschedule.ts
```

覆盖的 8 个测试场景（含**旧库迁移根因修复**验证）：

| # | 场景 | 验证点 |
|---|------|--------|
| 0 | **旧库迁移（根因修复）** | 构造缺改期字段的旧数据库 → 运行迁移 → 字段补齐 → 分诊/改期写入 status_history 不再报错 |
| 1 | 患者拒绝改期 | 原预约 slot_id / 状态不变；旧号源 used_capacity 不变；新号源 used_capacity 不变 |
| 2 | 患者接受改期 | 预约 slot_id / doctor_id 切换；旧号源 -1，新号源 +1；status_history 至少 2 条改期相关记录且含前后号源 |
| 3 | 新号源满员拦截 | SQL 填满号源 → 发起改期返回含"容量已满"错误；号源 / 预约状态不变 |
| 4 | 同日重复预约拦截 | 为患者在目标日期建一个已有预约 → 跨日期改期返回含"同日重复"错误 |
| 5 | 权限不匹配拦截 | 非护士发起、非患者本人接受 / 拒绝均被拦截，返回对应错误信息 |
| 6 | 并发提交 CAS | 创建容量=1 的号源，两患者均发起改期并 accept；先成功后失败，最终 used=1，无负数无超售 |
| 7 | 重启后数据一致性 | db.close() → new Database(dbPath) 重新打开；预约数、改期请求数、状态历史数、容量范围均一致；改期详情 + 历史中 reschedule_id 关联正确 |

### 2. HTTP 全链路回归测试：`scripts/http-regression-reschedule.ts`

**必须先启动真实服务**（`npm run dev` 或 `npm run server:dev`，监听 :3001），然后使用既有 `data/clinic.db` 直接打真实 HTTP 接口，覆盖用户所有可见行为：

```bash
# 另开一个终端，确保后端服务已在 :3001 运行
npx tsx scripts/http-regression-reschedule.ts
```

覆盖 7 个端到端用例：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 分诊不再 500 | 旧库迁移后，分诊写 status_history 返回 200（修复前返回 500） |
| 2 | 护士发起改期 | POST /api/appointments/:id/reschedule 返回 200 |
| 3 | 患者拒绝改期 | 原预约 slot、号源容量均不变 |
| 4 | 患者接受改期 | 号源原子化切换（旧号源 -1，新号源 +1） |
| 5 | 状态历史含改期信息 | GET /api/appointments/:id/history 返回 reschedule_id、old_slot_id、new_slot_id |
| 6 | 权限/冲突拦截 | 医生发起被拦截、非本人接受被拦截、满员号源被拦截 |
| 7 | 用户可见改期信息 | 预约记录含改期字段、改期列表接口正常、CSV/JSON 导出含改期列和 reschedules 数组 |

### 测试输出示例（单元测试 + 迁移）

```
===== 场景 0：旧库迁移（根因修复验证）=====
  ✓ 构造旧版数据库成功（status_history 缺改期字段）
  ✓ 缺字段验证：旧库确实没有改期相关字段
  ✓ 迁移完成：补齐缺失字段 + 索引 + 归一化状态值
  ✓ 分诊写 status_history 成功（原 500 根因已修复，迁移有效）
  ✓ 改期流程验证：发起改期、接受改期、写改期历史均正常

===== 测试 7：重启后数据一致性 =====
  ✓ 改期请求详情持久化正确
  ✓ 状态历史含改期 ID、前后号源，持久化正确

✅ 所有 8 个改期功能测试场景通过！
```

---

## 自动化测试（候补补号功能 6 场景 + HTTP 全链路回归）

### 1. 单元/集成测试：`scripts/test-waitlist.ts`

独立临时数据库（`data/test-waitlist-{timestamp}.db`），不影响主库 `data/clinic.db`。脚本结束后自动清理临时文件。

```bash
npx tsx scripts/test-waitlist.ts
```

覆盖的 6 个测试场景：

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 创建候补记录 | 正常创建成功 + 写入操作日志；字段校验（空科室、原因过短、日期倒置）拦截；非护士角色拦截 |
| 2 | 重启后数据持久化 | db.close() → new Database() 重新打开，候补记录数、日志数完全一致；字段（patient_id/urgency/status/reason）完整；操作日志含角色、姓名、备注 |
| 3 | 释放号源后匹配 | 满员号源无匹配；释放容量后按紧急度（emergency > urgent > normal）+ 创建时间排序；指定医生的仅匹配该医生；不指定医生匹配科室所有医生 |
| 4 | 冲突拦截 | 同日已有有效预约拦截；号源容量已满拦截；已 confirmed 的候补二次确认拦截；非护士角色确认被拦截 |
| 5 | 确认补号 / 标记放弃 | 确认后生成预约，from_waitlist=1、waitlist_id/matched_at/handled_by 完整；号源容量 +1；候补状态变为 confirmed；已 confirmed 不能放弃；正常放弃后状态=abandoned，原因和时间写入；已 abandoned 不能重复放弃；操作日志含「确认补号」和「标记放弃」 |
| 6 | 导出字段完整 | 来自候补的预约 JSON 包含 waitlistId/waitlistMatchedAt/waitlistHandledBy；正常分诊预约 fromWaitlist=0；CSV 表头包含「是否来自候补」「候补ID」「候补匹配时间」「候补处理人」 |

### 2. HTTP 全链路回归测试：`scripts/http-regression-waitlist.ts`

**必须先启动真实服务**（`npm run dev` 或 `npm run server:dev`，监听 :3001），然后使用既有 `data/clinic.db` 直接打真实 HTTP 接口，覆盖用户所有可见行为：

```bash
# 另开一个终端，确保后端服务已在 :3001 运行
npx tsx scripts/http-regression-waitlist.ts
```

覆盖 8 个端到端用例：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 创建候补记录 | 护士创建成功返回数据；字段校验返回 errors 对象；非护士角色被拦截；不指定医生（任意科室医生）的候补给创建 |
| 2 | 候补列表查询/筛选/排序 | 全量列表包含刚创建的记录；按 patientId / status / urgency 组合筛选生效；按科室筛选生效；默认按紧急度 + 创建时间排序（紧急优先） |
| 3 | 匹配推荐 | 全量匹配 `GET /waitlists/match/all` 返回 slot→waitlist 分组；单号源匹配 `GET /waitlists/match/slot/:id` 返回候选候补充匹配原因 |
| 4 | 确认补号 | `POST /waitlists/:id/confirm` 返回 appointmentId；`GET /appointments` 中该预约 fromWaitlist=true、waitlistId/matchedAt/handledBy 完整 |
| 5 | 冲突拦截 | 已 confirmed 二次确认被拦截；同日已有有效预约拦截；非护士角色确认被拦截 |
| 6 | 标记放弃 | 已 confirmed 的候补不能放弃；正常放弃后 status=abandoned 且写入原因；已 abandoned 不能重复放弃 |
| 7 | 操作日志 | `GET /waitlists/:id/logs` 返回数组；包含「创建候补」「确认补号」等动作；含操作人角色与姓名 |
| 8 | 导出字段 | CSV 表头包含 4 个候补字段（是否来自候补/候补ID/候补匹配时间/候补处理人）；JSON 中候补预约包含完整的 waitlistId/waitlistMatchedAt/waitlistHandledBy |

---

## 用户可见的候补信息展示

候补信息在所有关键页面和导出接口中均完整展示：

### 1. 候补补号管理页（护士可见，路径 `/waitlist`）
- **列表筛选**：状态（候补中/已匹配/已补号/已放弃）、患者、科室、指定医生、紧急程度，5 个维度组合筛选
- **列表排序**：编号、患者、可接受日期、紧急度、创建时间（点击表头可升降序切换）
- **新增候补弹窗**：患者、科室、指定医生（可选）、补号原因、起止日期、紧急程度
- **推荐补号弹窗**：按号源分组展示匹配结果，显示匹配原因（科室/医生/日期/无同日冲突）、剩余容量、一键确认补号
- **操作日志弹窗**：时间线展示创建、紧急度调整、确认补号、标记放弃等所有历史动作，含操作人角色、姓名、备注、时间
- **标记放弃弹窗**：填写放弃原因

### 2. 预约记录页
- 列表新增「来源」列：候补补号显示紫色「候补补号」标签；正常分诊显示灰色「正常分诊」文字
- 详情弹窗中：如为候补来源，额外展示紫色信息条，包含候补编号、匹配时间、处理人

### 3. CSV 导出（`/api/export/csv`）
表头在改期字段后新增 4 列候补字段：
```
是否来自候补,候补ID,候补匹配时间,候补处理人
```

### 4. JSON 导出（`/api/export/json`）
每条预约对象新增 4 个字段：
- `fromWaitlist`（boolean）：是否来自候补补号
- `waitlistId`（number | null）：关联的候补记录 ID
- `waitlistMatchedAt`（string | null）：匹配时间（ISO 字符串）
- `waitlistHandledBy`（string | null）：处理人姓名（护士）

---

## 用户可见的改期信息展示

改期信息在所有关键页面和导出接口中均完整展示：

### 1. 预约记录页（护士可见）
- 每条预约在"改期记录"区块展示所有关联的改期请求（发起时间、原因、新号源、状态：待确认/已接受/已拒绝、决定人、决定原因）
- "查看历史"弹窗时间线中，改期操作会额外显示**前后号源**、**改期原因**

### 2. 患者确认页
- 若有待确认改期，预约行展示醒目的"改期待确认"标签
- 弹出两个按钮：**接受改期**、**拒绝改期**（拒绝需填写原因）

### 3. CSV 导出（/api/export/csv）
表头包含改期相关列：
```
预约ID,患者姓名,医生姓名,科室,就诊日期,时段,状态,是否有待改期,改期状态,取消原因,是否释放容量,创建时间,确认时间,取消时间
```

### 4. JSON 导出（/api/export/json）
每条预约对象包含：
- `pendingRescheduleId` / `pendingRescheduleStatus`：当前待确认改期（如有）
- `rescheduleCount`：累计改期次数
- `reschedules[]`：完整改期历史数组（含 oldSlot、newSlot、reason、status、decidedAt、rejectReason 等）

## 项目结构

```
.
├── api/                    # 后端 Express 代码
│   ├── middleware/         # 角色中间件
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑 + 数据访问
│   ├── db.ts               # SQLite 初始化
│   └── app.ts              # Express 应用
├── shared/                 # 前后端共享类型
│   └── types.ts
├── src/                    # 前端 React 代码
│   ├── components/         # Layout、StatusBadge、AppModal
│   ├── lib/                # apiClient、工具函数
│   ├── pages/              # 7 个业务页面
│   ├── store/              # Zustand 角色状态
│   └── App.tsx             # 路由配置
├── data/                   # SQLite 数据库文件（自动生成）
└── package.json
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前端 + 后端开发服务器 |
| `npm run client:dev` | 仅启动前端 Vite |
| `npm run server:dev` | 仅启动后端 Express (nodemon) |
| `npm run check` | TypeScript 类型检查 + 提交边界防回归校验 |
| `npm run check:gitignore` | 单独运行 .gitignore / 提交边界校验 |
| `npm run data:reset` | 清理本地 SQLite 数据文件（下次启动自动重建样例数据） |
| `npm run lint` | ESLint 检查 |
| `npm run build` | 生产构建 |

## 数据持久化说明

所有数据保存在 `./data/clinic.db`（SQLite 文件），重启服务、重启机器后状态完全一致：
- 医生/患者样例数据（仅首次启动时 seed）
- 号源容量与占用数
- 复诊申请单
- 预约记录及其状态
- 每条状态变更历史（操作人、时间、备注/原因）

### 本地数据重建

`data/` 目录完全由运行时自动管理：

1. **首次启动（或数据被清理后）**：[api/db.ts](file:///d:/workSpace/AI__SPACE/zzz-00020/api/db.ts#L9-L14) 会自动 `mkdir -p data/` 并创建 `clinic.db`，随后写入 3 医生、3 患者、6 号源的样例数据。
2. **正常运行时**：SQLite 以 WAL 模式工作（`db.pragma('journal_mode = WAL')`），会在 `data/` 下额外生成 `clinic.db-wal`（写入日志）和 `clinic.db-shm`（共享内存索引）两个临时文件，属于数据库运行痕迹。
3. **停止服务后**：WAL 内容会在下次启动或 `checkpoint` 时合并回主 db 文件，-wal / -shm 可随时删除而不影响已提交的数据（但建议仅在服务停止时操作）。

### 本地数据清理 / 重置

```bash
# 推荐：使用内置脚本（安全，仅删 SQLite 相关文件）
npm run data:reset

# 等价于手动：
#   rm -f data/clinic.db data/clinic.db-wal data/clinic.db-shm data/clinic.db-journal

# 清理后再次运行：
npm run dev   # 启动时自动重建空库并 seed 样例数据
```

### 为什么这些文件不会被提交到 Git

项目根目录 [.gitignore](file:///d:/workSpace/AI__SPACE/zzz-00020/.gitignore) 已明确排除：

| 忽略规则 | 说明 |
|----------|------|
| `data/` | 整个 SQLite 数据目录（真实预约数据，绝不能混入源码） |
| `*.db` `*.db-wal` `*.db-shm` `*.db-journal` | 兜底，防止任何位置的 SQLite 文件被误提交 |
| `.trae/` | IDE 工具私有目录（含设计过程文档、缓存等个人运行痕迹） |
| `node_modules/` `dist/` `.vite/` | 依赖、构建产物、Vite 缓存 |

提交前可运行 `npm run check`（会自动调用 `scripts/check-gitignore.js`）进行防回归校验，确保运行痕迹和私有数据不会被误提交。若需手动核查：

```bash
# 查看当前仓库状态（应只有代码、配置、README 的变更）
git status --short

# 验证某个具体文件是否被忽略
git check-ignore -v data/clinic.db .trae/documents/PRD.md
```
