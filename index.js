'use strict';
require('dotenv').config();
const { createApp } = require('./app');
const app = createApp({ enablePhoneVerification: process.env.ENABLE_LEGACY_PHONE_VERIFICATION === 'true' });
module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Soft Web Services listening on ${port}`));
}
