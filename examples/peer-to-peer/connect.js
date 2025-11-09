import { createAuthenticatedClient } from '../../packages/open-payments/dist/index.js'

const keyId = 'b0bc3d0f-96d3-4ec9-9f8b-b0295cc140c6' // Tu keyId real
const privateKeyPath = '../private.key' // Ruta a tu clave privada
const walletAddressUrl = 'https://ilp.interledger-test.dev/9640001' // URL de tu wallet

async function main() {
  const client = await createAuthenticatedClient({
    walletAddressUrl,
    keyId,
    privateKey: privateKeyPath
  })

  // Ejemplo: obtener información de la wallet
  const walletInfo = await client.walletAddress.get({ url: walletAddressUrl })
  console.log('Información de la wallet:', walletInfo)
}

main()
