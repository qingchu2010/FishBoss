import express from 'express'

export function errorHandler(
  err: Error & { type?: string; status?: number; statusCode?: number },
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) {
  console.error('Error:', err)

  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({ error: 'Request entity too large' })
  }

  res.status(500).json({ error: err.message })
}

export function setupErrorHandling(app: express.Application) {
  app.use(errorHandler)
}
