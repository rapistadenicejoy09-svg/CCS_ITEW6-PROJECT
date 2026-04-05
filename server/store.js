export async function openStore() {
  const providerRaw = String(process.env.DB_PROVIDER || 'sqlite')
  const provider = providerRaw.trim().toLowerCase()

  if (provider === 'mongodb' || provider === 'mongo' || provider === 'atlas') {
    const { openMongoStore } = await import('./store-mongo.js')
    return await openMongoStore()
  }

  const { openSqliteStore } = await import('./store-sqlite.js')
  return openSqliteStore()
}

