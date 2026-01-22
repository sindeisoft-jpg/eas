export const config = {
  database: {
    url: process.env.DATABASE_URL || "mysql://root:root@127.0.0.1:3306/enterprise_ai_bi",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key-change-this-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  nodeEnv: process.env.NODE_ENV || "development",
}

