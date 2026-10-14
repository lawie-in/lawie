process.env.NODE_ENV = 'test';
process.env.PORT = '4003';
process.env.MONGO_URI = 'mongodb://placeholder:27017/test';
process.env.INTERNAL_SECRET = 'test-internal-secret-at-least-16';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_key_id';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_dummy_key_secret';
process.env.RAZORPAY_PLAN_ID = 'plan_test_dummy_plan_id';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_dummy_webhook_secret';
process.env.LOG_LEVEL = 'error';
// T-436: FAKE GST seller details for tests only (not the real registration).
process.env.GST_GSTIN = '20AAAAA0000A1Z5';
process.env.GST_LEGAL_NAME = 'Test Proprietor';
process.env.GST_TRADE_NAME = 'Lawie';
process.env.GST_ADDRESS = '1 Test Road, Test Town 000000';
process.env.GST_STATE_CODE = '20';
process.env.GST_EFFECTIVE_FROM = '2020-04-01';
process.env.GST_SIGNATURE_PATH = '';
