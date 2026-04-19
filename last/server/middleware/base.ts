import express from 'express'
import cors from 'cors'

export function setupBaseMiddleware(app: express.Application) {
  app.use(cors({
    origin: /^http:\/\/localhost:\d+$/,
    credentials: true
  }))
  app.use(express.json({ limit: '200mb' }))
  app.use(express.urlencoded({ limit: '200mb', extended: true }))
}
