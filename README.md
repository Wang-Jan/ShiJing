# 视净（Shi Jing）

“视净”是一款面向桌面清洁场景的智能分析应用。项目采用 `React + TypeScript + Express + MySQL` 技术栈实现，支持用户注册登录、桌面图片上传分析、实时监控、结果报告展示、清洁任务闭环、个人资料维护和密码修改。

当前项目同时提供：

- Web 端运行方式
- Android APK 打包方式
- MySQL 数据持久化
- Garden 模型服务接入能力

---

## 1. 项目功能

当前版本已经实现以下功能：

- 用户注册与登录
- 登录态恢复与退出登录
- 桌面图片上传与分析
- 分析结果报告化展示
- 分析历史持久化与记录删除
- 电脑摄像头实时监控
- 监控历史报告与记录删除
- 清洁任务创建、状态流转、前后对比验证
- 通知中心与动态记录管理
- 首页最新动态展示
- 个人资料修改
- 密码修改
- Android APK 打包

当前版本暂未实现：

- 机器人真实控制
- 多设备云端协同
- 移动端 APK 专项体验打磨

---

## 2. 技术栈

### 2.1 前端

- React 19
- TypeScript
- Vite
- React Router DOM
- Tailwind CSS
- Framer Motion
- Lucide React

### 2.2 后端

- Node.js
- Express
- TypeScript
- bcryptjs
- dotenv

### 2.3 数据库

- MySQL
- mysql2/promise

### 2.4 Android 打包

- Capacitor
- Android Studio
- JDK 17
- Android SDK / Build Tools / Platform Tools

---

## 3. 目录结构

项目核心目录和文件如下：

- `App.tsx`
  前端主入口组件
- `views/`
  页面组件目录
- `src/`
  前端服务与后端辅助模块
- `server.ts`
  Express 服务端入口
- `scripts/`
  数据迁移和密码重置脚本
- `schema.sql`
  MySQL 初始化脚本
- `.env.example`
  环境变量模板
- `capacitor.config.ts`
  Capacitor Android 打包配置
- `android/`
  Android 原生工程目录

---

## 4. 本地开发环境要求

在本地运行本项目，建议准备以下环境：

### 4.1 必需环境

- Windows 10 / Windows 11
- Node.js 20 或更高版本
- npm 10 或更高版本
- MySQL 8.0 或兼容版本

### 4.2 推荐工具

- Visual Studio Code
- Navicat 或 MySQL Workbench
- Git

### 4.3 查看版本命令

```bash
node -v
npm -v
mysql --version
```

---

## 5. 本地运行步骤

### 5.1 安装依赖

在项目根目录执行：

```bash
npm install
```

### 5.2 配置环境变量

复制模板文件：

```bash
copy .env.example .env
```

然后编辑 `.env`，至少填写以下内容：

```env
GARDEN_API_KEY=your_garden_api_key
GARDEN_API_BASE_URL=http://127.0.0.1:8000
SESSION_SECRET=your_session_secret
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=shijing
```

### 5.3 启动 MySQL

确保本机 MySQL 服务已经启动，并且 `.env` 中的用户名和密码可以正常连接。

### 5.4 初始化数据库

项目启动时会自动尝试创建数据库和 `users` 表。  
如需手动初始化，也可直接执行项目根目录下的 `schema.sql`。

### 5.5 启动项目

```bash
npm run dev
```

浏览器访问：

```text
http://localhost:3000
```

---

## 6. 数据库说明

当前项目正式使用的是 MySQL。

### 6.1 当前已实现的数据表

当前版本仅持久化 `users` 表。

主要字段包括：

- `id`
  主键
- `account_id`
  登录账号，唯一
- `nickname`
  用户昵称
- `password`
  `bcrypt` 哈希后的密码
- `avatar`
  用户头像数据
- `created_at`
  创建时间

### 6.2 查看和管理数据

可通过 Navicat 连接 MySQL 后查看：

- 数据库：`shijing`
- 表：`users`

### 6.3 SQLite 迁移到 MySQL

如果项目目录中仍保留旧的 `database.sqlite`，可执行：

```bash
npm run migrate:mysql
```

如 SQLite 文件不在默认位置，可在 `.env` 中配置：

```env
SQLITE_MIGRATION_PATH=your_sqlite_path
```

### 6.4 重置用户密码

如需直接为某个账号重置密码，可执行：

```bash
npm run reset-password -- <accountId> <newPassword>
```

示例：

```bash
npm run reset-password -- 9445349 Pass123!
```

---

## 7. Garden 配置说明

项目当前支持两层 Garden 配置来源。

### 7.1 服务端配置

来源：

- `.env` 中的 `GARDEN_API_KEY`
- `.env` 中的 `GARDEN_API_BASE_URL`

作用：

- 作为后端调用 Garden 的唯一运行配置
- 前端不再保存或提交模型密钥
- 设置页只展示模型服务状态，不提供用户侧密钥覆盖入口

---

## 8. 分析接口说明

前端统一请求接口：

```http
POST /api/analyze
```

后端处理流程如下：

1. 校验登录 token
2. 读取图片数据
3. 从后端 `.env` 读取 Garden 服务配置
4. 调用 Garden 生成结构化分析结果
5. 将分析结果写入 MySQL
6. 根据评分阈值自动生成清洁任务
5. 调用 Garden 模型服务
6. 返回结构化分析结果

---

## 9. 前端构建

生成前端构建文件：

```bash
npm run build
```

构建完成后，静态资源输出到：

- `dist/`

---

## 10. APK 打包方式说明

当前项目的 Android 安装包通过 **Capacitor + Android Studio** 方式生成。

### 10.1 当前打包模式

项目当前采用 **本地资源模式**：

- `webDir: 'dist'`
- 不配置 `server.url`
- APK 内置前端构建产物
- 前端通过 `VITE_API_BASE_URL` 请求远程 Node 后端

这意味着：

- APK 断网时仍可打开应用壳、登录缓存页面和部分本地缓存内容
- 登录校验、Garden 分析、监控同步、MySQL 数据保存仍需要访问后端服务
- 修改前端页面后，需要重新执行 `npm run build`、`npx cap sync android` 并重新打包 APK

当前配置示例：

```ts
const config: CapacitorConfig = {
  appId: 'com.shijing.app',
  appName: '视净',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};
```

如后端使用 HTTPS，建议将 `VITE_API_BASE_URL` 改为 HTTPS 地址，并关闭不必要的明文 HTTP 访问。

---

## 11. 制作 APK 所需环境与软件

比赛方如需验证项目是否能够生成 Android 安装包，需先准备以下环境。

### 11.1 必需软件

- Node.js 20 及以上
- npm 10 及以上
- Java Development Kit 17
- Android Studio（建议安装正式版）
- Android SDK
- Android SDK Build-Tools
- Android SDK Platform-Tools
- Android SDK Command-line Tools

### 11.2 建议通过 Android Studio 安装的组件

在 Android Studio 的 SDK Manager 中，建议安装：

- Android SDK Platform
- Android SDK Build-Tools
- Android SDK Platform-Tools
- Android Emulator
- Android SDK Command-line Tools

### 11.3 需要的 npm 依赖

项目当前已经包含以下 Capacitor 依赖：

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`

如果依赖缺失，可执行：

```bash
npm install
```

---

## 12. 从项目代码生成 APK 的完整流程

以下流程用于从当前项目代码生成 Android APK 安装包。

### 12.1 安装项目依赖

```bash
npm install
```

### 12.2 确认 Capacitor 配置

检查项目根目录中的：

- `capacitor.config.ts`

重点确认：

- `appId`
- `appName`
- `webDir`
- `cleartext`

当前版本不应配置 `server.url`。如果配置了 `server.url`，APK 会重新变成远程网页加载模式，断网时将无法正常打开应用页面。

### 12.3 配置 APK 后端地址

APK 本地资源模式下，前端页面已经内置在安装包中，但接口仍需访问远程后端。打包前需要在 `.env` 中配置：

```bash
VITE_API_BASE_URL=http://你的服务器IP或域名:3000
```

本地 Web 开发时可以不填该变量，前端会默认请求同源 `/api`。

### 12.4 构建前端资源

```bash
npm run build
```

### 12.5 同步到 Android 原生工程

```bash
npx cap sync android
```

此命令会将最新的前端构建结果和 Capacitor 配置同步到 `android/` 工程中。

### 12.6 打开 Android Studio 工程

```bash
npx cap open android
```

### 12.7 在 Android Studio 中生成 APK

打开 Android Studio 后，可按以下路径操作：

#### 调试测试包

```text
Build > Build Bundle(s) / APK(s) > Build APK(s)
```

输出位置通常为：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

#### 正式提交包

```text
Build > Generate Signed Bundle / APK
```

然后：

1. 选择 `APK`
2. 选择已有 keystore，或新建 keystore
3. 选择 `release`
4. 生成签名后的正式 APK

输出位置通常为：

```text
android/app/build/outputs/apk/release/app-release.apk
```

---

## 13. 首次生成正式 APK 的签名步骤

如果第一次生成正式 APK，需要先创建签名文件。

在 Android Studio 中：

```text
Build > Generate Signed Bundle / APK
```

然后：

1. 选择 `APK`
2. 点击 `Create new`
3. 设置：
   - Keystore 路径
   - Keystore 密码
   - Key alias
   - Key 密码
   - Validity
4. 保存 `.jks` 文件

注意：

- 后续更新同一个应用必须继续使用同一套 keystore
- keystore 文件需要妥善保存

---

## 14. 更新 APK 内容的流程

当前项目后续修改前端页面或样式后，如需更新 APK，按以下流程执行：

### 14.1 如果修改的是前端页面、样式、文案

```bash
npm run build
npx cap sync android
npx cap open android
```

然后重新在 Android Studio 中生成 APK。

### 14.2 如果修改的是 Capacitor 配置

例如修改：

- `appName`
- `appId`
- `cleartext`
- `webDir`

同样需要执行：

```bash
npx cap sync android
```

然后重新生成 APK。

### 14.3 如果修改的是后端地址

如果修改 `.env` 中的 `VITE_API_BASE_URL`，需要重新构建前端并同步 Android 工程：

```bash
npm run build
npx cap sync android
```

然后重新生成 APK。该变量会被打进前端构建产物中。

---

## 15. 更换 APK 图标的方法

如果需要将自定义 PNG 图标设置为应用图标，可在 Android Studio 中操作。

步骤如下：

1. 执行：

```bash
npx cap open android
```

2. 在 Android Studio 左侧打开：

```text
app > src > main > res
```

3. 右键 `res`
4. 选择：

```text
New > Image Asset
```

5. 在 `Launcher Icons (Adaptive and Legacy)` 中导入自定义 PNG 文件
6. 完成图标资源生成
7. 重新生成 APK

建议图标文件满足以下条件：

- PNG 格式
- 正方形
- 建议分辨率不低于 `1024 x 1024`

---

## 16. 比赛方复现检查顺序

如需快速验证项目代码是否有效，可按以下顺序检查：

1. 检查是否存在：
   - `package.json`
   - `server.ts`
   - `capacitor.config.ts`
   - `android/`
2. 执行：

```bash
npm install
```

3. 配置 `.env`
4. 确保 MySQL 可连接
5. 执行：

```bash
npm run dev
```

6. 浏览器访问：

```text
http://localhost:3000
```

7. 执行：

```bash
npm run build
npx cap sync android
npx cap open android
```

8. 在 Android Studio 中尝试生成 APK

如以上流程可以完成，则说明：

- Web 项目可正常运行
- Android 工程可正常同步
- APK 打包链路有效

---

## 17. 常见问题排查

### 17.1 `npm install` 失败

检查：

- Node 版本是否过低
- npm 缓存目录是否存在权限问题
- 网络是否能访问 npm 仓库

### 17.2 MySQL 无法连接

检查：

- MySQL 服务是否启动
- `.env` 中账户密码是否正确
- 端口是否正确

### 17.3 分析接口无法使用

检查：

- 后端服务是否运行
- Garden API Key 是否填写
- Garden Base URL 是否可访问
- 登录 token 是否有效

### 17.4 APK 中显示旧内容

检查：

- 是否执行了 `npm run build`
- 是否执行了 `npx cap sync android`
- 是否重新在 Android Studio 中生成并安装了新 APK
- `.env` 中的 `VITE_API_BASE_URL` 是否在构建前已经填写正确

### 17.5 APK 断网时无法使用分析功能

当前 APK 已内置前端资源，断网时可以打开应用页面和部分缓存内容。但以下能力仍然需要联网：

- 登录与会话校验
- Garden 图片分析
- 监控结果同步
- MySQL 数据保存和读取

如果需要完全离线分析，需要在 Android 端额外集成本地数据库和端侧模型，这已经不属于当前 Web + Express + Garden 服务化架构范围。

### 17.6 Android Studio 无法生成 APK

检查：

- JDK 17 是否安装
- Android SDK 是否完整安装
- Gradle 是否同步完成
- 是否存在 keystore 配置问题

---

## 18. 当前架构说明

当前项目架构如下：

- 前端使用 `HashRouter`
- 登录后从后端获取签名 token，并通过 `/api/session` 恢复会话
- 图片分析通过后端 `/api/analyze` 调用 Garden 模型服务
- Garden API Key 与 Base URL 只由后端 `.env` 管理
- 用户、分析历史、监控会话、通知、动态和清洁任务数据保存于 MySQL
- Android 安装包通过 Capacitor + Android Studio 生成，并以内置前端资源方式运行
- APK 中的前端通过 `VITE_API_BASE_URL` 访问远程 Node 后端

---

## 19. 当前版本说明

当前仓库中的代码可用于：

- Web 端本地运行
- MySQL 用户数据管理
- Garden 模型接入
- Android APK 打包

如果用于比赛提交，建议同时提供：

- 源代码压缩包
- `README.md`
- `.env.example`
- APK 安装包
- 测试账号
- 运行截图或演示视频
