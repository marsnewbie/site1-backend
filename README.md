# Site1 Backend

A Fastify-based backend API for the restaurant ordering system.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

3. Run the development server:
```bash
npm start
```

## Railway Deployment

This project is configured for Railway deployment with automatic database seeding.

### Environment Variables Required:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `DATABASE_URL` - Your Supabase database connection string

### Postdeploy Script:
The `postdeploy` script automatically seeds the database if it's empty.

## API Endpoints

- `GET /health` - Health check
- `GET /api/menu` - Get menu items and categories
- `POST /api/cart/create` - Create a new cart
- `POST /api/cart/:id/add` - Add item to cart
- `POST /api/checkout` - Process checkout

## Database Schema

The database includes tables for:
- Categories
- Menu items
- Menu options and choices
- Store configuration
- Orders and order items
- Users
- Discount rules
- Opening hours and holidays

Updated: 2025-01-20
