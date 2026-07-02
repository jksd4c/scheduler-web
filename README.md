# 公平排班 Web 版

“公平排班 v0.1 免费测试服”是面向医院科室、病区和小组的 Web 排班系统，支持多账号、多权限、多科室/病区隔离、访客查看、人员身份策略、班次资格、人员池、预录名单、加入码、成员反馈和自动排班。

本目录是独立 Web 版工程，不依赖原 EXE 本地版目录。

## 技术栈

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Prisma ORM
- Supabase PostgreSQL
- Vercel
- ExcelJS 导出 Excel

## 本地运行

```bash
npm install
npm run build
npm run dev
```

开发服务默认访问：

```text
http://localhost:3000
```

## 环境变量

真实值只放在本地 `.env.local` 或 Vercel 环境变量里，不要提交到 Git。

参考 `.env.example`：

```env
DATABASE_URL=
DIRECT_URL=
AUTH_SECRET=
APP_URL=
INITIAL_SUPER_ADMIN_USERNAME=
INITIAL_SUPER_ADMIN_PASSWORD=
INITIAL_DEPARTMENT_NAME=
INITIAL_DEPARTMENT_ADMIN_USERNAME=
INITIAL_DEPARTMENT_ADMIN_PASSWORD=
```

## 常用命令

```bash
npm run dev        # 启动 Next.js 开发服务器
npm run build      # 生成 Prisma Client 并构建 Next.js
npm run start      # 启动生产构建
npm run smoke      # 轻量冒烟测试
npm run db:migrate # 本地开发 migration
npm run db:deploy  # 线上 migration deploy
npm run db:studio  # 打开 Prisma Studio
```

## 主要功能

- 登录与权限：`SUPER_ADMIN`、`SCHEDULER_ADMIN`、`DEPARTMENT_ADMIN`、`MEMBER`、访客只读会话。
- 科室/病区隔离：科室管理员只能管理自己的 Unit，服务端 API 做权限校验。
- 排班模式：病房白班/夜班、医技科室按单元/房间、自定义排班。
- 排班规则：按任务独立保存规则，自动排班从数据库规则读取需求。
- 身份策略：支持正常参与、减少排班、固定目标、最多班次、不参与自动排班。
- 班次资格：通过 ShiftType 的 required / forbidden / allowed 身份标签控制。
- 人员工作流：固定人员池、轮转人员池、预录名单、加入码、手机号绑定、管理员确认。
- 成员反馈：成员可提交硬性不可排和留言，只有身份确认且生效的反馈会进入排班算法。
- 排班前检查：任务详情可进入排班前检查页，查看名单、匹配、反馈和异常状态。
- 导出：Excel 导出排班表、统计和冲突报告。

## 部署

Vercel 环境变量需要配置到 Production / Preview / Development：

- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `APP_URL`
- `INITIAL_SUPER_ADMIN_USERNAME`
- `INITIAL_SUPER_ADMIN_PASSWORD`
- `INITIAL_DEPARTMENT_NAME`
- `INITIAL_DEPARTMENT_ADMIN_USERNAME`
- `INITIAL_DEPARTMENT_ADMIN_PASSWORD`

正式部署前请确认 `.env.local` 未被 Git 跟踪，且真实密钥没有写入源码。

页面底部会显示 `公平排班 v0.1 免费测试服 · by: jks`。
