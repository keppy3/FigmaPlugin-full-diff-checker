// Figma REST API Tier-1 endpoints (files, images) are limited to 15 req/min
// on a Pro-plan Full/Dev seat. A large scan makes many such calls (file tree
// x2, image batches x many), so every one of them is paced through this
// single throttle to avoid tripping a 429 partway through a scan.
// Adjust MIN_INTERVAL_MS here if the plan/seat's actual limit changes.
const MIN_INTERVAL_MS = 4500; // ~13 req/min ceiling, safely under the 15/min Tier-1 limit

let lastCallAt = 0;

export async function throttleTier1(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastCallAt = Date.now();
}
