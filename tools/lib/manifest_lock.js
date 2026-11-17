const fs = require('fs');

// Same lock protocol as comic_cli_worker.js updateManifestLocked and the Go store
// (studio/internal/store/manifest_lock.go): "<manifest>.lock", exclusive create,
// stale after 30s. Re-reads the latest manifest, applies fn, writes atomically.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function updateManifestLocked(manifestPath, fn) {
  const lockPath = `${manifestPath}.lock`;
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 30000) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (_) {}
      if (Date.now() > deadline) throw new Error(`Timed out waiting for manifest lock ${lockPath}`);
      sleepSync(40);
    }
  }
  try {
    const latest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fn(latest);
    latest.updatedAt = new Date().toISOString();
    const tmp = `${manifestPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(latest, null, 2), 'utf8');
    fs.renameSync(tmp, manifestPath);
    return latest;
  } finally {
    try { fs.unlinkSync(lockPath); } catch (_) {}
  }
}

module.exports = { updateManifestLocked };
