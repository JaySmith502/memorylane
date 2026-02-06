/* eslint-disable @typescript-eslint/no-var-requires */
require('dotenv').config()
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_PASSWORD) {
    console.log('Skipping notarization: APPLE_ID or APPLE_APP_PASSWORD not set.')
    return
  }

  const appName = context.packager.appInfo.productFilename

  console.log(`Notarizing ${appName}...`)

  await notarize({
    appBundleId: 'com.memorylane.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    teamId: 'ZN3J54N7AP',
  })

  console.log('Notarization complete.')
}
