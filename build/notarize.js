/* eslint-disable @typescript-eslint/no-var-requires */
<<<<<<< HEAD
require('dotenv').config()
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename

  console.log(`Notarizing ${appName}...`)
=======
require('dotenv').config();
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  console.log(`Notarizing ${appName}...`);
>>>>>>> a678e79 (Revert "Use built in electron builder notarization")

  await notarize({
    appBundleId: 'com.memorylane.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    teamId: 'ZN3J54N7AP',
<<<<<<< HEAD
  })

  console.log('Notarization complete.')
}
=======
  });

  console.log('Notarization complete.');
};
>>>>>>> a678e79 (Revert "Use built in electron builder notarization")
