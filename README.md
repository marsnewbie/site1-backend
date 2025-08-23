# Site1 Backend

外卖点餐系统后端 API

## 本地开发

1. 安装依赖：
```bash
npm install
```

2. 启动服务器：
```bash
npm start
```

服务器将在 http://localhost:3001 运行

## Railway 部署

1. 在 Railway 中导入此 GitHub 仓库
2. Railway 会自动检测 Node.js 项目并部署
3. 部署完成后，Railway 会提供一个 URL，例如：https://your-app.railway.app

## API 端点

- `GET /health` - 健康检查
- `GET /api/menu` - 获取菜单数据
- `POST /api/cart/create` - 创建购物车
- `POST /api/cart/:id/add` - 添加商品到购物车
- `POST /api/delivery/quote` - 获取配送报价
- `POST /api/checkout` - 提交订单

## 数据

- 菜单数据存储在 `seed/menu.sample.json`
- 配送配置存储在 `seed/delivery.*.json`
