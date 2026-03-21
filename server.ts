import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import * as path from "path";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import bodyParser from "body-parser";
import cors from "cors";

async function startServer() {
  console.log("正在启动服务器...");
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json({ limit: '10mb' }));

  // 初始化数据库
  const dbPath = path.join(process.cwd(), "database.sqlite");
  console.log("数据库路径:", dbPath);
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("数据库连接失败:", err.message);
    else console.log("已连接到 SQLite 数据库");
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT UNIQUE,
        nickname TEXT NOT NULL,
        password TEXT NOT NULL,
        avatar TEXT
      )
    `, (err) => {
      if (err) console.error("创建表失败:", err.message);
      else console.log("数据库表已准备就绪");
    });
  });

  // API 路由
  // 注册接口
  app.post("/api/register", async (req: Request, res: Response) => {
    console.log("收到注册请求:", req.body.nickname);
    const { nickname, password, avatar } = req.body;

    if (!nickname || !password) {
      return res.status(400).json({ message: "昵称和密码是必填项" });
    }

    // 生成 7 位随机数字账号
    let accountId = "";
    let isUnique = false;
    while (!isUnique) {
      accountId = Math.floor(1000000 + Math.random() * 9000000).toString();
      const row = await new Promise((resolve) => {
        db.get("SELECT account_id FROM users WHERE account_id = ?", [accountId], (err, row) => resolve(row));
      });
      if (!row) isUnique = true;
    }

    // BCrypt 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (account_id, nickname, password, avatar) VALUES (?, ?, ?, ?)",
      [accountId, nickname, hashedPassword, avatar],
      function (err) {
        if (err) {
          console.error("插入用户失败:", err.message);
          return res.status(500).json({ message: "注册失败: " + err.message });
        }
        console.log("用户注册成功:", accountId);
        res.json({ success: true, accountId, nickname });
      }
    );
  });

  // 登录接口
  app.post("/api/login", (req: Request, res: Response) => {
    console.log("收到登录请求:", req.body.accountId);
    const { accountId, password } = req.body;

    db.get("SELECT * FROM users WHERE account_id = ?", [accountId], async (err, user: any) => {
      if (err) {
        console.error("查询用户失败:", err.message);
        return res.status(500).json({ message: "登录失败" });
      }
      if (!user) return res.status(401).json({ message: "账号不存在" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ message: "密码错误" });

      console.log("用户登录成功:", accountId);
      res.json({
        success: true,
        user: {
          accountId: user.account_id,
          nickname: user.nickname,
          avatar: user.avatar
        }
      });
    });
  });

  // Vite 中间件
  if (process.env.NODE_ENV !== "production") {
    console.log("正在开发模式下启动 Vite...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("正在生产模式下启动...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("服务器启动失败:", err);
});
