/**
 * Run async tasks with limited concurrency (reduces ERPNext burst load).
 */
export async function batchRequests(tasks, concurrency = 4) {
  if (!tasks?.length) return [];
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index;
      index += 1;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
