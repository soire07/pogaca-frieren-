const configuredClients = new WeakSet();

export async function configureIsolatedTestClient(client) {
  if (!client || (typeof client !== 'object' && typeof client !== 'function')) {
    throw new TypeError('A PostgreSQL client is required');
  }
  if (configuredClients.has(client)) return;
  await client.query('SET search_path TO frieren_test');
  configuredClients.add(client);
}
