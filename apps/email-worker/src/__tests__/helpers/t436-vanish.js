/**
 * Test helper, loaded with `node -r` into the queue-purge child process (T-436 AC10). Simulates
 * a worker taking a job between the script's listing and its removal: the script re-reads each
 * job just before removing it (Queue.getJob); here that read first really removes the job, so it
 * finds nothing. A job locked by a live worker survives the removal (remove returns 0), as in
 * production, and is still found.
 */
const { Queue } = require('bullmq');
const removeJob = Queue.prototype.remove;
const getJob = Queue.prototype.getJob;
Queue.prototype.getJob = async function patched(jobId) {
  await removeJob.call(this, jobId);
  return getJob.call(this, jobId);
};
