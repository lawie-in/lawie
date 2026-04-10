// MongoDB initialization script — runs on first container start
db = db.getSiblingDB('lawie');

db.createCollection('users');
db.createCollection('cases');
db.createCollection('documents');

// Seed indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.cases.createIndex({ lawyerId: 1 });
db.cases.createIndex({ clientId: 1 });
db.documents.createIndex({ caseId: 1 });

print('✅ Lawie database initialized with collections and indexes.');
