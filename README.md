# 🚀 China Palace - Backend API

中国宫殿外卖点餐系统后端 - 基于 Fastify 的高性能 RESTful API 服务

## 🌐 项目概览

**技术栈**: Node.js + Fastify + Supabase + JWT + Resend  
**GitHub仓库**: [https://github.com/marsnewbie/site1-backend](https://github.com/marsnewbie/site1-backend)  
**部署平台**: Railway (自动部署)  
**API地址**: https://site1-backend-production.up.railway.app  
**数据库**: Supabase PostgreSQL  

---

## ⚡ 核心特性

### 🍽️ **菜单系统**
- ✅ 分类和菜品管理
- ✅ 动态选项系统 (单选/多选)
- ✅ 条件选项逻辑 (依赖关系)
- ✅ 价格计算和可用性管理
- ✅ 图片上传和存储

### 🛒 **订单系统**
- ✅ 购物车管理 (内存存储)
- ✅ 三种结账方式 (Guest/Login/Register)
- ✅ 配送费计算和邮编验证
- ✅ 订单状态管理
- ✅ 邮件通知系统

### 👤 **用户认证**
- ✅ JWT Token 认证
- ✅ 用户注册和登录
- ✅ 密码加密 (bcrypt)
- ✅ 密码重置 (邮件验证)
- ✅ 密码修改功能
- ✅ 用户资料管理

### 🏪 **店铺管理**
- ✅ 营业时间管理
- ✅ 节假日设置
- ✅ 配送区域配置
- ✅ 折扣规则系统
- ✅ 实时营业状态

---

## 🛠️ 技术架构

### **后端技术栈**
```javascript
{
  "runtime": "Node.js (ES Modules)",
  "framework": "Fastify 4.x",
  "database": "Supabase PostgreSQL",
  "authentication": "JWT + bcryptjs",
  "email": "Resend API",
  "storage": "Supabase Storage",
  "deployment": "Railway"
}
```

### **数据库结构** (13 核心表)
```sql
📊 Supabase PostgreSQL Schema:

1.  store_config           # 店铺基础配置
2.  categories             # 菜品分类
3.  menu_items            # 菜品主表
4.  menu_options          # 菜品选项 (Size/Sauce等)
5.  menu_option_choices   # 具体选择项
6.  menu_conditional_options # 条件选项依赖
7.  store_opening_hours   # 营业时间表
8.  store_holidays        # 节假日管理
9.  users                 # 用户账户系统
10. orders                # 订单主表
11. order_items           # 订单明细
12. delivery_zones        # 配送区域 (已弃用)
13. discount_rules        # 折扣规则
```

---

## 📡 API 端点详情

### **🏪 店铺信息**
```http
GET  /health                     # 健康检查
GET  /api/store/config          # 店铺配置
GET  /api/store/hours           # 营业时间
GET  /api/store/is-open         # 当前营业状态
GET  /api/store/holidays        # 节假日列表
GET  /api/store/collection-times # 自取时间段
GET  /api/store/delivery-times  # 配送时间段
POST /api/store/update-time-settings # 更新时间设置
```

### **🍽️ 菜单系统**
```http
GET  /api/menu                  # 完整菜单 (含选项+条件逻辑)
GET  /api/discounts            # 折扣规则
POST /api/upload/image         # 菜品图片上传
```

### **🛒 购物车和订单**
```http
POST /api/cart/create          # 创建购物车
POST /api/cart/:id/add         # 添加商品到购物车
POST /api/delivery/quote       # 配送费查询
POST /api/checkout             # 订单结账 (支持3种方式)
GET  /api/orders/:orderId      # 订单详情
PATCH /api/orders/:orderId/status # 更新订单状态
```

### **👤 用户认证** (🔒 需要认证)
```http
POST /api/auth/register        # 用户注册
POST /api/auth/login          # 用户登录
POST /api/auth/forgot-password # 忘记密码
POST /api/auth/reset-password # 重置密码

🔒 需要 JWT Token:
GET  /api/auth/me             # 当前用户信息
GET  /api/auth/profile        # 用户资料
PUT  /api/auth/profile        # 更新用户资料
PUT  /api/auth/change-password # 修改密码
GET  /api/auth/order-history  # 订单历史
```

### **🚚 配送系统**
```http
POST /api/delivery/switch-rule-type # 切换配送规则类型
```

---

## 🚀 本地开发

### 1. 环境准备
```bash
# 克隆项目
git clone https://github.com/marsnewbie/site1-backend.git
cd site1-backend

# 安装依赖
npm install
```

### 2. 环境变量配置
创建 `.env` 文件 (参考 `ENVIRONMENT.md`):
```env
# Supabase 数据库
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT 认证
JWT_SECRET=your-jwt-secret-key

# 邮件服务
RESEND_API_KEY=re_your-resend-api-key

# Mapbox (可选)
MAPBOX_TOKEN=pk.your-mapbox-token
```

### 3. 数据库设置
```bash
# 在 Supabase 中运行 schema.sql
# 执行数据种子 (如果数据库为空)
node scripts/seed.js --if-empty

# 调试数据库连接
node scripts/test-db.js
```

### 4. 启动开发服务器
```bash
# 开发模式
npm start

# 服务器启动在 http://localhost:3001
# API 文档: http://localhost:3001/health
```

---

## 🌐 生产部署

### **Railway 自动部署**
1. **GitHub 连接**: 推送到 main 分支自动触发部署
2. **环境变量**: 在 Railway 中配置所有必需的环境变量
3. **自动化脚本**: `postdeploy` 脚本自动执行数据库种子
4. **健康检查**: `/health` 端点用于监控服务状态

### **部署流程**
```bash
# 1. 推送代码到 GitHub
git push origin main

# 2. Railway 自动部署
# 3. 执行 postdeploy 脚本
npm run postdeploy

# 4. 服务上线
curl https://site1-backend-production.up.railway.app/health
```

---

## 🔐 认证系统详情

### **JWT Token 流程**
```javascript
// 1. 用户登录
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

// 2. 返回 JWT Token
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { /* 用户信息 */ }
}

// 3. 后续请求携带 Token
Headers: {
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
}
```

### **密码安全**
- ✅ bcryptjs 加密存储
- ✅ 6位最小密码长度
- ✅ 密码重置邮件验证
- ✅ 修改密码需验证当前密码

---

## 📊 数据库架构亮点

### **条件选项系统** 🌟
```sql
-- 实现 Step1→Step2 选择逻辑
menu_conditional_options (
  parent_option_id,    -- 父选项
  parent_choice_id,    -- 父选择
  dependent_option_id  -- 依赖的子选项
)
```

### **时间管理系统** 🕐
```sql
-- 支持英国时区的营业时间
store_opening_hours (
  day_of_week,    -- 0=周日, 1=周一
  open_time,      -- 开门时间
  close_time,     -- 关门时间
  is_closed       -- 是否休息
)
```

### **配送规则系统** 🚚
```sql
-- 灵活的配送费计算
store_config (
  delivery_active_rule_type,  -- 'postcode' | 'distance'
  delivery_postcode_rules,    -- JSON 邮编规则
  delivery_distance_rules,    -- JSON 距离规则
  collection_lead_time_minutes,
  delivery_lead_time_minutes
)
```

---

## 🛠️ 开发工具

### **调试脚本**
```bash
# 测试数据库连接
node scripts/test-db.js

# 调试数据库状态
node scripts/debug-db.js

# 重新初始化数据 (谨慎使用)
node scripts/seed.js --force
```

### **项目结构**
```
src/
├── index.js              # 🚀 主服务器入口
├── lib/
│   ├── auth.js           # 🔐 JWT 认证工具
│   ├── email.js          # 📧 邮件服务
│   ├── supabase.js       # 📊 数据库连接
│   └── mapclient.js      # 🗺️  地图服务
├── middleware/
│   └── auth.js           # 🔒 认证中间件
├── services/
│   └── delivery.js       # 🚚 配送服务
└── db/
    └── schema.sql        # 📊 数据库结构
```

---

## 📈 性能特性

- ⚡ **Fastify**: 高性能 Node.js 框架
- 🔄 **连接池**: Supabase 自动连接管理
- 📧 **异步邮件**: 非阻塞邮件发送
- 🗂️ **内存缓存**: 购物车临时存储
- 🌍 **CORS 支持**: 跨域资源共享
- 📝 **请求日志**: 完整的 API 调用日志

---

## 🔗 相关链接

- **前端仓库**: [site1-front](https://github.com/marsnewbie/site1-front)
- **项目架构**: [PROJECT_ARCHITECTURE.md](../PROJECT_ARCHITECTURE.md)
- **环境配置**: [ENVIRONMENT.md](./ENVIRONMENT.md)
- **Supabase**: [数据库管理面板](https://supabase.com/dashboard)
- **Railway**: [部署状态](https://railway.app/dashboard)

---

## 📝 更新日志

### **最新更新** (2025-01-26)
- ✅ 新增密码修改 API 端点
- ✅ 完善用户认证中间件
- ✅ 优化密码安全验证
- ✅ 更新 API 文档

### **核心功能** (2025-01-25)
- ✅ 完整菜单和订单系统
- ✅ JWT 用户认证体系
- ✅ 邮件通知和密码重置
- ✅ 配送时间和费用计算
- ✅ 店铺营业时间管理

### **系统架构** (2025-01-20)
- ✅ Fastify + Supabase 架构
- ✅ 条件选项动态系统
- ✅ 英国时区时间处理
- ✅ Railway 自动部署
- ✅ 数据库架构设计

---

**🚀 China Palace Backend - 高性能外卖订餐 API 解决方案**