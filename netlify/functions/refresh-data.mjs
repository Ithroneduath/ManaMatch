export default async () => {
  const hook = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hook) {
    console.log('NETLIFY_BUILD_HOOK_URL is not configured; skipping scheduled card-data refresh.');
    return;
  }

  const response = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'scheduled-scryfall-refresh' })
  });

  if (!response.ok) {
    throw new Error(`Netlify build hook returned HTTP ${response.status}`);
  }
  console.log('Triggered a fresh build to update Scryfall card data.');
};
