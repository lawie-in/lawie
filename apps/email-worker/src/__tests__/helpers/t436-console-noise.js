/**
 * Test helper, loaded with `node -r` into a script child process (T-436 AC10). Simulates a
 * library printing through console from inside the process: every 5 ms it calls console.log,
 * console.error and console.warn with a marker (and an Error whose message holds a secret).
 * The script's CLI guard must swallow all of it. Each tick is also appended to T436_TICKS_FILE
 * (fs, not console) so the test can prove the noise actually ran while the script was running.
 */
const fs = require('fs');
let n = 0;
const t = setInterval(() => {
  n += 1;
  fs.appendFileSync(process.env.T436_TICKS_FILE, '.');
  console.log('NOISE-MARKER-LOG');
  console.warn('NOISE-MARKER-WARN');
  console.error('NOISE-MARKER-ERR', new Error('NOISE-SECRET-IN-MESSAGE'));
  if (n > 2000) clearInterval(t);
}, 5);
t.unref();
