const config = require('./config');
const { createApp } = require('./app');
const { migrate } = require('../scripts/migrate');
const { cleanupPhotos } = require('./services/retention');
const db = require('./db');

async function main() {
  await migrate();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`lineup API listening on :${config.port} (${config.env})`);
  });

  // ลบรูปหลักฐานที่เกินระยะเวลาเก็บ (PDPA) วันละครั้ง
  const runCleanup = () => cleanupPhotos().catch((e) => console.error('photo cleanup failed', e));
  setTimeout(runCleanup, 60_000);
  setInterval(runCleanup, 24 * 3600_000).unref();

  const shutdown = () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
