# 环境变量设置

## Railway 部署需要的环境变量

### Supabase 配置
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Resend 邮件服务
```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

### Mapbox 地图服务
```
MAPBOX_TOKEN=pk.xxxxxxxxxxxx
MAPS_PROVIDER=mapbox
```

## 设置步骤

1. **创建 Supabase 项目**
   - 访问 https://supabase.com
   - 创建新项目
   - 在 Settings > API 中获取 URL 和 Service Role Key

2. **创建 Storage Bucket**
   - 在 Supabase Dashboard 中进入 Storage
   - 创建名为 `media` 的 bucket
   - 设置权限为 public

3. **运行数据库迁移**
   - 在 Supabase SQL Editor 中运行 `src/db/schema.sql` 的内容

4. **设置 Resend**
   - 访问 https://resend.com
   - 创建账户并获取 API Key

5. **在 Railway 中设置环境变量**
   - 进入项目设置
   - 添加上述环境变量

## 数据库种子数据

系统会在首次部署时自动运行种子脚本，将示例数据导入到数据库中。

- 菜单数据来自 `seed/menu.sample.json`
- 配送配置来自 `seed/delivery.postcode_zone.sample.json`

之后可以通过 Supabase Dashboard 管理数据。
