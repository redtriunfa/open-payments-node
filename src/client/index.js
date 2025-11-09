// API Wallet Interledger - Node.js + Open Payments SDK

import express from 'express'
import mysql from 'mysql2/promise'
import bcrypt from 'bcrypt'
import axios from 'axios' // Para consumir APIs Open Payments vía HTTP
import { createAuthenticatedClient } from 'hackathon-1/open-payments-node/packages/open-payments/src/client/index.js'
import fs from 'fs'

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'hackaton',
  database: 'interledger_wallet',
  port: 3306
}

const app = express()
app.use(express.json())

console.log('[DEBUG] Inicializando API Wallet Interledger')



/**
 * Endpoint: POST /api/balance
 * Solicitud:
 * {
 *   "user_id": "u_123",
 *   "phone": "+521XXXXXXXXXX",
 *   "interledger_wallet_id": "w_456",
 *   "preferred_method": "wallet_token"
 * }
 * Respuesta:
 * {
 *   "user_id": "u_123",
 *   "phone": "+521XXXXXXXXXX",
 *   "interledger_wallet_id": "w_456",
 *   "preferred_method": "wallet_token",
 *   "Balance": 1000
 * }
 */
app.post('/api/balance', async (req, res) => {
  const { user_id, phone, wp_user_id, preferred_method } = req.body
  console.log('[DEBUG] /api/balance request:', req.body)
  if (!user_id || !phone || !wp_user_id || !preferred_method) {
    console.error('[ERROR] Faltan campos requeridos')
    return res.status(400).json({ error: 'Faltan campos requeridos', '@terminal': 'Solicitud incompleta' })
  }
  let conn
  try {
    conn = await mysql.createConnection(dbConfig)
    console.log('[DEBUG] Conexión a MySQL establecida')
    // Buscar el usuario por user_id y wp_user_id
    const [rows] = await conn.execute(
      'SELECT saldo_mxn, currency FROM productores_wallet WHERE usuario_id = ? AND wp_user_id = ?',
      [user_id, wp_user_id]
    )
    console.log('[DEBUG] Resultado de consulta:', rows)
    let balance = 0
    let currency = "MXN"
    if (rows.length) {
      balance = parseFloat(rows[0].saldo_mxn)
      currency = rows[0].currency || "MXN"
    }
    // Respuesta con el formato solicitado
    return res.json({
      user_id,
      phone,
      wp_user_id,
      preferred_method,
      balance,
      currency
    })
  } catch (err) {
    console.error('[ERROR] Excepción en /api/balance:', err)
    return res.status(500).json({ error: err.message, '@terminal': err.stack })
  } finally {
    if (conn) {
      await conn.end()
      console.log('[DEBUG] Conexión a MySQL cerrada')
    }
  }
})

/**
 * Endpoint: POST /api/transfer
 * Solicitud:
 * {
 *   "tx_id": "tx_20251108_0001",
 *   "user_id": "u_125",
 *   "wp_user_id": 456,
 *   "payee_user_id": 457,
 *   "payee_wp_user_id": 456,
 *   "amount": 20.00,
 *   "currency": "MXN",
 *   "status": "pending|confirmed|failed",
 *   "created_at": "2025-11-08T13:00:00Z",
 *   "idempotency_key": "uuid-v4",
 *   "concept": "Pago de tanda",
 *   "preferred_method": "wallet_token"
 * }
 * Respuesta (eco de la transacción, ejemplo):
 * {
 *   "tx_id": "tx_20251108_0001",
 *   "user_id": "u_125",
 *   "wp_user_id": 456,
 *   "payee_user_id": 456,
 *   "payee_wp_user_id": 457,
 *   "amount": 20.00,
 *   "currency": "MXN",
 *   "status": "confirmed",
 *   "created_at": "2025-11-08T13:00:00Z",
 *   "idempotency_key": "uuid-v4",
 *   "concept": "Pago de tanda",
 *   "preferred_method": "wallet_token"
 * }
 */
app.post('/api/transfer', async (req, res) => {
  const { tx_id, user_id, wp_user_id, payee_user_id, payee_wp_user_id, amount, currency, status, created_at, idempotency_key, concept, preferred_method } = req.body
  console.log('[DEBUG] /api/transfer request:', req.body)
  if (!tx_id || !user_id || !wp_user_id || !payee_user_id || !payee_wp_user_id || !amount || !currency || !status || !created_at || !idempotency_key) {
    console.error('[ERROR] Faltan campos requeridos en la transacción')
    return res.status(400).json({ error: 'Faltan campos requeridos', '@terminal': 'Solicitud incompleta' })
  }
  let conn
  try {
    conn = await mysql.createConnection(dbConfig)
    console.log('[DEBUG] Conexión a MySQL establecida')
    // Obtener datos de pagador y receptor
    const [payerRows] = await conn.execute(
      'SELECT id, saldo_mxn FROM productores_wallet WHERE usuario_id = ? AND wp_user_id = ?',
      [user_id, wp_user_id]
    )
    const [payeeRows] = await conn.execute(
      'SELECT id, saldo_mxn FROM productores_wallet WHERE wp_user_id = ?',
      [payee_user_id]
    )
    if (!payerRows.length || !payeeRows.length) {
      return res.status(404).json({ error: 'Payer o Payee no encontrado', '@terminal': 'No existe usuario/cuenta' })
    }
    const id_wallet_payer = payerRows[0].id
    const id_wallet_payee = payeeRows[0].id
    const saldo_payer = parseFloat(payerRows[0].saldo_mxn)
    const saldo_payee = parseFloat(payeeRows[0].saldo_mxn)

    // Verificar saldo suficiente
    if (saldo_payer < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente', '@terminal': 'El pagador no tiene fondos suficientes' })
    }

    // Simulación de Open Payments API para demo
    let openPaymentsStatus = "confirmed"
    let openPaymentsResponse = {
      status: "confirmed",
      message: "Simulación exitosa de Open Payments para demo"
    }

    // Actualizar saldos solo si Open Payments confirma
    await conn.execute(
      'UPDATE productores_wallet SET saldo_mxn = saldo_mxn - ? WHERE id = ?',
      [amount, id_wallet_payer]
    )
    await conn.execute(
      'UPDATE productores_wallet SET saldo_mxn = saldo_mxn + ? WHERE id = ?',
      [amount, id_wallet_payee]
    )

    // Registrar la transacción en la base de datos
    await conn.execute(
      `INSERT INTO transacciones
        (id_wallet_payer, id_wallet_payee, amount, currency, concept, timestamp, status, prefer_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_wallet_payer,
        id_wallet_payee,
        amount,
        currency,
        concept || "Transferencia entre usuarios",
        created_at.replace("T", " ").replace("Z", ""), // Formato DATETIME
        "confirmed",
        preferred_method || "open_payments"
      ]
    )
    // Responder con eco de la transacción y datos de Open Payments
    return res.json({
      tx_id,
      user_id,
      wp_user_id,
      payee_user_id,
      payee_wp_user_id,
      amount,
      currency,
      status: "confirmed",
      created_at,
      idempotency_key,
      concept: concept || "Transferencia entre usuarios",
      preferred_method: preferred_method || "open_payments",
      openPayments: openPaymentsResponse
    })
  } catch (err) {
    console.error('[ERROR] Excepción en /api/transfer:', err)
    return res.status(500).json({ error: err.message, '@terminal': err.stack })
  } finally {
    if (conn) {
      await conn.end()
      console.log('[DEBUG] Conexión a MySQL cerrada')
    }
  }
})

/**
 * Endpoint: POST /api/confirm-payment
 * Solicitud:
 * {
 *   "session_id": "sess_789",
 *   "user_id": "u_123",
 *   "flow": "confirm_payment",
 *   "step": "awaiting_confirmation",
 *   "expires_at": 1700000000
 * }
 * Respuesta (eco de la confirmación, ejemplo):
 * {
 *   "session_id": "sess_789",
 *   "user_id": "u_123",
 *   "flow": "confirm_payment",
 *   "step": "awaiting_confirmation",
 *   "expires_at": 1700000000
 * }
 */
app.post('/api/confirm-payment', (req, res) => {
  const { session_id, user_id, flow, step, expires_at } = req.body
  console.log('[DEBUG] /api/confirm-payment request:', req.body)
  if (!session_id || !user_id || !flow || !step || !expires_at) {
    console.error('[ERROR] Faltan campos requeridos en la confirmación')
    return res.status(400).json({ error: 'Faltan campos requeridos', '@terminal': 'Solicitud incompleta' })
  }
  // Simulación: eco de la confirmación
  return res.json({
    session_id,
    user_id,
    flow,
    step,
    expires_at
  })
})

/**
 * Endpoint: POST /api/register
 * Solicitud:
 * {
 *   "user_id": "u_123",
 *   "phone": "+521XXXXXXXXXX",
 *   "wp_user_id": "w_456"
 *   "interledger_wallet_id": "",
 *   "preferred_method": "wallet_token",
 *   "pin": "1234",
 *   "wallet_token": "token_simulado"
 * }
 * Respuesta:
 * {
 *   "user_id": "u_123",
 *   "phone": "+521XXXXXXXXXX",
 *   "interledger_wallet_id": "w_456",
 *   "preferred_method": "wallet_token",
 *   "account_address": "openpayments.example.com/accounts/u_123",
 *   "wallet_token": "token_simulado"
 * }
 */
app.post('/api/register', async (req, res) => {
  const { user_id, phone, preferred_method, pin, wallet_token, wp_user_id } = req.body
  console.log('[DEBUG] /api/register request:', req.body)
  if (!user_id || !phone || !preferred_method || !pin || !wallet_token || !wp_user_id) {
    console.error('[ERROR] Faltan campos requeridos para registro')
    return res.status(400).json({ error: 'Faltan campos requeridos', '@terminal': 'Solicitud incompleta' })
  }
  let conn
  try {
    conn = await mysql.createConnection(dbConfig)
    console.log('[DEBUG] Conexión a MySQL establecida')
    // Verificar si el usuario ya existe
    const [exists] = await conn.execute(
      'SELECT id FROM productores_wallet WHERE usuario_id = ?',
      [user_id]
    )
    if (exists.length) {
      return res.status(409).json({ error: 'Usuario ya existe', '@terminal': 'Registro duplicado' })
    }
    // Hashear el PIN
    const pin_hash = await bcrypt.hash(pin, 10)
    // Crear cuenta en Open Payments (integración real)
    const keyId = 'b0bc3d0f-96d3-4ec9-9f8b-b0295cc140c6' // Reemplaza por tu keyId real
    const privateKeyPath = 'Hackathon-1\private.key'
    const walletAddressUrl = 'https://ilp.interledger-test.dev' // Reemplaza por tu URL de wallet address

    // Leer clave privada
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
n
    // Crear cliente autenticado
    const client = await createAuthenticatedClient({
      walletAddressUrl,
      keyId,
      privateKey
    })

    // Crear cuenta en Open Payments (llamada real)
    const openPaymentsResponse = await client.walletAddress.create({
      url: walletAddressUrl + '/accounts',
      body: {
        subject: user_id
        // Puedes agregar otros campos requeridos aquí si la API lo exige
      }
    })

    const interledger_wallet_id = openPaymentsResponse.accountId
    const account_address = openPaymentsResponse.address

    // Insertar usuario con los datos requeridos
    await conn.execute(
      'INSERT INTO productores_wallet (usuario_id, telefono_wa, saldo_mxn, pin_hash, clabe_registrada, interledger_wallet_id, wp_user_id, state_context, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user_id, phone, 0, pin_hash, "", interledger_wallet_id, wp_user_id, JSON.stringify({ wallet_token }), "MXN"]
    )
    // Consultar el registro recién creado para obtener el timestamp y el id
    const [createdRows] = await conn.execute(
      'SELECT id, created_at FROM productores_wallet WHERE usuario_id = ?',
      [user_id]
    )
    const created_at = createdRows.length ? createdRows[0].created_at : null
    const id_wallet = createdRows.length ? createdRows[0].id : null

    // Depósito inicial: 100 MXN
    const initialAmount = 100
    await conn.execute(
      'UPDATE productores_wallet SET saldo_mxn = ? WHERE id = ?',
      [initialAmount, id_wallet]
    )
    await conn.execute(
      `INSERT INTO transacciones
        (id_wallet_payer, id_wallet_payee, amount, currency, concept, status, prefer_method)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id_wallet, id_wallet, initialAmount, "MXN",
        "Depósito inicial de bienvenida",
        "confirmed",
        "demo"
      ]
    )

    return res.status(201).json({
      user_id,
      phone,
      interledger_wallet_id,
      preferred_method,
      account_address,
      wallet_token,
      currency: "MXN",
      created_at,
      wp_user_id,
      initial_deposit: initialAmount
    })
  } catch (err) {
    console.error('[ERROR] Excepción en /api/register:', err)
    return res.status(500).json({ error: err.message, '@terminal': err.stack })
  } finally {
    if (conn) {
      await conn.end()
      console.log('[DEBUG] Conexión a MySQL cerrada')
    }
  }
})

/**
 * Middleware global para manejo de errores
 */
app.use((err, req, res, next) => {
  console.error('[ERROR] Middleware global:', err)
  res.status(500).json({ error: err.message, '@terminal': err.stack })
})

// Puerto de escucha
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`[DEBUG] API Wallet escuchando en puerto ${PORT}`)
})

// NOTA: Cuando el equipo 1 defina el JSON, ajustar la estructura de request/response y la lรณgica de los endpoints.
