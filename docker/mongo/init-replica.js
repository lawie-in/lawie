// Initialize single-node replica set for staging (DocumentDB parity)
// Runs after init.js on first container start
rs.initiate({
  _id: 'rs0',
  members: [{ _id: 0, host: 'mongo:27017' }],
});

print('✅ Replica set rs0 initiated.');
