# 医院心电图室排班系统 Web 版

这是从本地 EXE 版独立复制出来的 Web 版工作目录，目标是升级为多科室、多账号、多权限系统，并部署到 Vercel + Supabase PostgreSQL。

当前状态：第一阶段基础分离完成。现有排班页面和核心排班逻辑已保留，Electron / EXE 打包相关文件、脚本和依赖已移除。数据库仍会在第二阶段从 SQLite Prisma schema 改为 PostgreSQL schema。

## 技术方向

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Prisma ORM
- Supabase PostgreSQL
- Vercel
- ExcelJS 导出 Excel

## 本地运行

第一阶段仍保留原排班功能和现有 Prisma schema。第二阶段会正式切换到 PostgreSQL、增加多科室和账号权限表。

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
npm run db:migrate # 本地开发 migration
npm run db:deploy  # 线上 migration deploy
npm run db:studio  # 打开 Prisma Studio
```

## 第一阶段清理结果

- 已删除 `electron/` 目录。
- 已移除 Electron preload 类型声明。
- 已移除 `electron`、`electron-builder`、`concurrently`、`wait-on` 等桌面打包依赖。
- 已移除 `electron:dev`、`build:electron`、`dist` 等 EXE 打包脚本。
- 已移除 package.json 中的 electron-builder 配置。
- 已移除任务详情页里的本机 SQLite 备份/导入按钮。
- 已删除复制过来的 `prisma/dev.db`。
- 已保留页面底部 `医院心电图室周排班 · by-jks`。

## 后续阶段

第二阶段将执行：

- Prisma datasource 从 SQLite 改为 PostgreSQL。
- 新增 `Department`、`User`、`Session`、`DepartmentAccessCode`、`GuestSession`。
- 给排班相关表增加 `departmentId`。
- 创建 PostgreSQL migration。
- 增加安全 seed 脚本，从环境变量读取初始账号和密码，不在代码中硬编码真实密码。

第三阶段及以后将加入登录、权限校验、管理员后台、科室后台、访客入口和 Vercel 部署说明。
