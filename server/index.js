const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const path = require('path'); // (no usado, lo dejo por compat)
const bcrypt = require('bcryptjs'); // (no usado, lo dejo por compat)
const jwt = require('jsonwebtoken');
const session = require('express-session');

// Fix for debug package issue
process.env.DEBUG = '*';
global.debug = require('debug');

const ModbusRTU = require('modbus-serial');

const app = express();
app.use(cors({
  origin: ['http://tegus.arrayanhn.com:3000', 'http://tegus.arrayanhn.com:3007'],
  credentials: true
}));
app.use(express.json());

// Configuración de sesión
app.use(session({
  secret: 'chiller-control-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // true si usas HTTPS
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const JWT_SECRET = 'chiller-jwt-secret-2024';

// Importar el módulo de base de datos
const db = require('./database');

// --- Configuración Esencial ---
const TARGET_IP = "192.168.30.50";
const TARGET_PORT = 502;
const SLAVE_ID = 1;
const TIMEOUT = 5000;
const PULSE_WIDTH_MS = 1000;

// --- Button Addresses (Base 0) ---
const START_BUTTON_ADDRESS = 299;        // Proworx 000040 (Encender)
const CANCEL_ALARM_BUTTON_ADDRESS = 300; // Proworx 000042 (Cancelar Alarma)
const CHILLER_STATUS_COIL_ADDRESS = 15;
const NUM_COILS_TO_READ = 1;

// Helper function for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================
// ✅ TABLAS PERMITIDAS (GLOBAL)
// ============================
const ALLOWED_DATA_TABLES = [
  'chiller_agua_minutos',
  'chiller_agua_segundos',
  'chiller_aire_minutos',
  'chiller_aire_segundos',
  'ion_meter_minutos',

  // ✅ NUEVAS (enfriado)
  'chiller_enfriado_agua_segundos',
  'chiller_enfriado_aire_segundos',
];

const ALLOWED_EXPORT_TABLES = [
  'chiller_aire_minutos',
  'chiller_agua_minutos',
  'chiller_aire_segundos',
  'chiller_agua_segundos',
  'ion_meter_minutos',

  // ✅ NUEVAS (enfriado)
  'chiller_enfriado_agua_segundos',
  'chiller_enfriado_aire_segundos',
];

// ✅ Para “enfriado” hacemos SELECT explícito (más seguro y consistente)
const EXPLICIT_COLUMNS_BY_TABLE = {
  chiller_enfriado_agua_segundos: [
    "fecha_hora",
    "vdf_condensador_status",
    "high_temperature",
    "alarm_chiller_water",
    "timeout_chiller",
    "high_pressure",
    "low_pressure",
    "flow_switch_status",
    "freezestat_status",
    "vdf_pump_status",
    "low_level_tank2",
    "on_water_status"
  ],
  chiller_enfriado_aire_segundos: [
    "fecha_hora",
    "high_temperature",
    "low_temperature",
    "vdf_ventilador_status",
    "vdf_pump_status",
    "flow_switch_status",
    "status_evaporator",
    "freezestat_status",
    "on_air_status"
  ]
};

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, message: 'Token de acceso requerido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
    req.user = user;
    next();
  });
};

// --- ENDPOINTS DE AUTENTICACIÓN ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
    }

    const [users] = await db.pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }

    const user = users[0];

    // ⚠️ (Por ahora sin hash)
    if (contrasena !== user.contrasena) {
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign({ id: user.id, usuario: user.usuario }, JWT_SECRET, { expiresIn: '24h' });

    req.session.userId = user.id;
    req.session.usuario = user.usuario;

    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      usuario: { id: user.id, usuario: user.usuario }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
    res.json({ success: true, message: 'Sesión cerrada exitosamente' });
  });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ success: true, usuario: req.user });
});

// Función auxiliar para conectar al cliente Modbus
async function getModbusClient() {
  const client = new ModbusRTU();
  client.setTimeout(TIMEOUT);
  await client.connectTCP(TARGET_IP, { port: TARGET_PORT });
  client.setID(SLAVE_ID);
  return client;
}

async function pulseCoil(modbusClient, address, pulseDurationMs = PULSE_WIDTH_MS) {
  if (!modbusClient || !modbusClient.isOpen) {
    console.error("ERROR: Pulse coil failed: Client not connected or not open.");
    return false;
  }

  console.log(`INFO: Pulsing coil ${address}: Setting to TRUE...`);
  try {
    await modbusClient.writeCoil(address, true);
    console.log(`INFO: Coil ${address} set to TRUE successfully.`);

    await sleep(pulseDurationMs);

    console.log(`INFO: Pulsing coil ${address}: Setting back to FALSE...`);
    await modbusClient.writeCoil(address, false);
    console.log(`INFO: Coil ${address} set back to FALSE successfully.`);

    console.log(`INFO: Pulse completed for coil ${address}.`);
    return true;
  } catch (error) {
    console.error(`ERROR: Exception during pulse_coil for address ${address}: ${error.message}`);
    if (error.err) console.error(`ERROR: Modbus Error Code: ${error.err}`);

    try {
      console.log(`INFO: Attempting recovery: Setting coil ${address} to FALSE after error...`);
      await modbusClient.writeCoil(address, false);
      console.log(`INFO: Recovery attempt: Coil ${address} set to FALSE.`);
    } catch (recoveryError) {
      console.error(`ERROR: Failed to set coil ${address} back to FALSE during error recovery: ${recoveryError.message}`);
    }
    return false;
  }
}

// Endpoint para encender el chiller (protegido)
app.post('/api/chiller/on', authenticateToken, async (req, res) => {
  console.log("Iniciando operación: Encender chiller");
  let client;
  try {
    client = await getModbusClient();
    console.log(`Pulsando botón START (Dirección: ${START_BUTTON_ADDRESS})`);

    const success = await pulseCoil(client, START_BUTTON_ADDRESS, PULSE_WIDTH_MS);

    if (success) return res.json({ success: true, message: 'Chiller encendido exitosamente' });
    return res.status(500).json({ success: false, message: 'Error al intentar encender el chiller' });

  } catch (error) {
    console.error("Error detallado al encender chiller:", error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor al encender el chiller',
      code: error.code,
      errno: error.errno
    });
  } finally {
    if (client && client.isOpen) client.close(() => console.log("Cliente Modbus cerrado (encender)"));
  }
});

// Endpoint para apagar el chiller (protegido)
app.post('/api/chiller/off', authenticateToken, async (req, res) => {
  console.log("Iniciando operación: Apagar chiller");
  let client;
  try {
    client = await getModbusClient();
    console.log(`Pulsando botón CANCEL ALARM (Dirección: ${CANCEL_ALARM_BUTTON_ADDRESS})`);

    const success = await pulseCoil(client, CANCEL_ALARM_BUTTON_ADDRESS, PULSE_WIDTH_MS);

    if (success) return res.json({ success: true, message: 'Chiller apagado exitosamente' });
    return res.status(500).json({ success: false, message: 'Error al intentar apagar el chiller' });

  } catch (error) {
    console.error("Error detallado al apagar chiller:", error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor al apagar el chiller',
      code: error.code,
      errno: error.errno
    });
  } finally {
    if (client && client.isOpen) client.close(() => console.log("Cliente Modbus cerrado (apagar)"));
  }
});

// Estado del chiller
app.get('/api/chiller/status', async (req, res) => {
  let client;
  try {
    client = await getModbusClient();
    console.log(`Intentando leer estado del Chiller (Coil ${CHILLER_STATUS_COIL_ADDRESS} - PLC ${CHILLER_STATUS_COIL_ADDRESS + 1})`);

    const result = await client.readCoils(CHILLER_STATUS_COIL_ADDRESS, NUM_COILS_TO_READ);

    if (result && result.data && result.data.length >= NUM_COILS_TO_READ) {
      const isOn = result.data[0];
      console.log(`Estado del chiller leído: ${isOn} (${isOn ? 'ENCENDIDO' : 'APAGADO'})`);
      return res.json({ success: true, isOn });
    }

    console.error("Respuesta Modbus inválida o vacía al leer Coil:", result);
    throw new Error("Respuesta inválida o vacía del dispositivo Modbus al leer el estado");

  } catch (error) {
    console.error("Error en /api/chiller/status:", error.message || error);
    res.status(500).json({
      success: false,
      message: `Error al obtener estado del chiller: ${error.message || 'Error interno del servidor'}`
    });
  } finally {
    if (client && client.isOpen) client.close(() => console.log("Cliente Modbus cerrado (Status Endpoint)"));
  }
});

app.get('/api/chiller/test_modbus_direction', async (req, res) => {
  let client;
  try {
    client = await getModbusClient();
    const result = await client.readCoils(CHILLER_STATUS_COIL_ADDRESS, NUM_COILS_TO_READ);

    if (result && result.data && result.data.length >= NUM_COILS_TO_READ) {
      const isOn = result.data[0];
      return res.json({ success: true, isOn });
    }

    throw new Error("Respuesta inválida o vacía del dispositivo Modbus");

  } catch (error) {
    console.error("Error en /api/chiller/test_modbus_direction:", error.message || error);
    res.status(500).json({
      success: false,
      message: `Error al obtener estado del chiller: ${error.message || 'Error interno del servidor'}`
    });
  } finally {
    if (client && client.isOpen) client.close(() => console.log("Cliente Modbus cerrado (Test Endpoint)"));
  }
});

// =======================================================
// ✅ (Compat) DATA ENFRIADO: /api/chiller/data/enfriado
//  - para que tu cliente actual NO se rompa si aún usa este endpoint
// =======================================================
app.get('/api/chiller/data/enfriado', async (req, res) => {
  try {
    const { table, date } = req.query;

    if (!table || !date) {
      return res.status(400).json({ success: false, message: 'Se requiere table y date.' });
    }

    const allowedTables = new Set([
      'chiller_enfriado_agua_segundos',
      'chiller_enfriado_aire_segundos'
    ]);

    if (!allowedTables.has(table)) {
      return res.status(400).json({ success: false, message: 'Tabla no permitida.' });
    }

    const cols = EXPLICIT_COLUMNS_BY_TABLE[table];
    if (!cols) {
      return res.status(500).json({ success: false, message: 'No hay columnas explícitas configuradas para esta tabla.' });
    }

    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const query = `
      SELECT ${cols.join(', ')}
      FROM ${table}
      WHERE fecha_hora >= ? AND fecha_hora <= ?
      ORDER BY fecha_hora ASC
    `;

    const [results] = await db.pool.query(query, [startOfDay, endOfDay]);

    return res.json({
      success: true,
      table,
      date,
      columns_returned: cols,
      records: results.length,
      data: results
    });

  } catch (error) {
    console.error("Error en data enfriado:", error);
    return res.status(500).json({ success: false, message: "Error al obtener datos de enfriado." });
  }
});

// =======================================================
// ✅ (Compat) EXPORT ENFRIADO: /api/chiller/export/enfriado
//  - para que tu cliente actual NO se rompa si aún usa este endpoint
// =======================================================
app.get('/api/chiller/export/enfriado', async (req, res) => {
  try {
    const { table, date } = req.query;

    if (!table || !date) {
      return res.status(400).json({ success: false, message: 'Se requiere table y date para exportar.' });
    }

    const allowedTables = new Set([
      'chiller_enfriado_agua_segundos',
      'chiller_enfriado_aire_segundos'
    ]);

    if (!allowedTables.has(table)) {
      return res.status(400).json({ success: false, message: 'Tabla no válida para exportación enfriado.' });
    }

    const cols = EXPLICIT_COLUMNS_BY_TABLE[table];
    const selectCols = cols ? cols.join(', ') : '*';

    const query = `SELECT ${selectCols} FROM ${table} WHERE DATE(fecha_hora) = ? ORDER BY fecha_hora ASC`;
    const [rows] = await db.pool.query(query, [date]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay datos para exportar en la fecha seleccionada' });
    }

    const formattedData = rows.map(row => {
      const fecha = row.fecha_hora;
      const formattedRow = {};

      const formattedDate =
        `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ` +
        `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;

      formattedRow['Fecha y Hora'] = formattedDate;

      for (const [key, value] of Object.entries(row)) {
        if (key !== 'id' && key !== 'chiller_id' && key !== 'fecha_hora') {
          const formattedKey = key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          let processedValue = value;
          if (value !== null && value !== undefined && value !== '') {
            const numericValue = Number(value);
            if (!isNaN(numericValue) && isFinite(numericValue)) processedValue = numericValue;
          }

          formattedRow[formattedKey] = processedValue;
        }
      }

      return formattedRow;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formattedData);

    const headers = Object.keys(formattedData[0] || {});
    ws['!cols'] = headers.map(header => {
      const maxWidth = Math.max(header.length, ...formattedData.map(row => String(row[header]).length));
      return { wch: Math.min(maxWidth + 2, 30) };
    });

    const safeSheetName = `Datos ${date} (enfriado)`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=chiller_data_${table}_${date}.xlsx`);
    res.send(excelBuffer);

  } catch (error) {
    console.error('Error al exportar datos (enfriado):', error);
    res.status(500).json({ success: false, message: 'Error al exportar datos de enfriado a Excel' });
  }
});

// ========================
// ✅ DATA: /api/chiller/data/:table
// ========================
app.get('/api/chiller/data/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { date } = req.query;

    if (!ALLOWED_DATA_TABLES.includes(table)) {
      return res.status(400).json({ success: false, message: 'Tabla no válida' });
    }

    const cols = EXPLICIT_COLUMNS_BY_TABLE[table];
    let query = cols ? `SELECT ${cols.join(', ')} FROM ${table}` : `SELECT * FROM ${table}`;
    const params = [];

    if (date) {
      query += ' WHERE DATE(fecha_hora) = ?';
      params.push(date);
    }

    const isMinutesTable = table.includes('minutos');
    if (!isMinutesTable) {
      query += ' ORDER BY fecha_hora DESC LIMIT 1000';
    } else if (!date) {
      query += ' ORDER BY fecha_hora DESC LIMIT 100';
    } else {
      query += ' ORDER BY fecha_hora DESC';
    }

    const [rows] = await db.pool.query(query, params);
    const [totalRows] = await db.pool.query(`SELECT COUNT(*) as total FROM ${table}`);

    const formattedRows = rows.map(row => {
      if (row.fecha_hora) {
        const fecha = row.fecha_hora;
        const formattedDate =
          `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ` +
          `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
        return { ...row, fecha_hora: formattedDate };
      }
      return row;
    });

    res.json({ success: true, data: formattedRows, total: totalRows[0].total });

  } catch (error) {
    console.error('Error al obtener datos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos del chiller' });
  }
});

app.get('/api/chiller/data/:table/range', async (req, res) => {
  try {
    const { table } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Se requieren fechas de inicio y fin' });
    }

    if (!ALLOWED_DATA_TABLES.includes(table)) {
      return res.status(400).json({ success: false, message: 'Tabla no válida' });
    }

    const data = await db.getRecordsByDateRange(table, startDate, endDate);

    const formattedData = data.map(row => {
      if (row.fecha_hora) {
        const fecha = row.fecha_hora;
        const formattedDate =
          `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ` +
          `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
        return { ...row, fecha_hora: formattedDate };
      }
      return row;
    });

    res.json({ success: true, data: formattedData });

  } catch (error) {
    console.error('Error al obtener datos por rango:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos del chiller por rango de fechas' });
  }
});

app.get('/api/chiller/data/:table/last', async (req, res) => {
  try {
    const { table } = req.params;

    if (!ALLOWED_DATA_TABLES.includes(table)) {
      return res.status(400).json({ success: false, message: 'Tabla no válida' });
    }

    const data = await db.getLastRecord(table);

    if (data && data.fecha_hora) {
      const fecha = data.fecha_hora;
      data.fecha_hora =
        `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ` +
        `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
    }

    res.json({ success: true, data });

  } catch (error) {
    console.error('Error al obtener último registro:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el último registro del chiller' });
  }
});

// ========================
// ✅ EXPORT: /api/chiller/export/:table
// ========================
app.get('/api/chiller/export/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Se requiere una fecha para exportar' });
    }

    if (!ALLOWED_EXPORT_TABLES.includes(table)) {
      return res.status(400).json({ success: false, message: 'Tabla no válida para exportación' });
    }

    const cols = EXPLICIT_COLUMNS_BY_TABLE[table];
    const selectCols = cols ? cols.join(', ') : '*';

    const query = `SELECT ${selectCols} FROM ${table} WHERE DATE(fecha_hora) = ? ORDER BY fecha_hora ASC`;
    const [rows] = await db.pool.query(query, [date]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay datos para exportar en la fecha seleccionada' });
    }

    const formattedData = rows.map(row => {
      const fecha = row.fecha_hora;
      const formattedRow = {};

      const formattedDate =
        `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ` +
        `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;

      formattedRow['Fecha y Hora'] = formattedDate;

      for (const [key, value] of Object.entries(row)) {
        if (key !== 'id' && key !== 'chiller_id' && key !== 'fecha_hora') {
          const formattedKey = key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          let processedValue = value;
          if (value !== null && value !== undefined && value !== '') {
            const numericValue = Number(value);
            if (!isNaN(numericValue) && isFinite(numericValue)) processedValue = numericValue;
          }

          formattedRow[formattedKey] = processedValue;
        }
      }

      return formattedRow;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formattedData);

    const headers = Object.keys(formattedData[0] || {});
    ws['!cols'] = headers.map(header => {
      const maxWidth = Math.max(header.length, ...formattedData.map(row => String(row[header]).length));
      return { wch: Math.min(maxWidth + 2, 30) };
    });

    const safeSheetName = `Datos ${date} ${table.includes('segundos') ? '(seg)' : '(min)'}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=chiller_data_${table}_${date}.xlsx`);
    res.send(excelBuffer);

  } catch (error) {
    console.error('Error al exportar datos:', error);
    res.status(500).json({ success: false, message: 'Error al exportar datos a Excel' });
  }
});

// Endpoint para obtener promedios de temperatura diarios de evaporadores
app.get('/api/chiller/temperature-averages/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Se requiere una fecha para calcular promedios' });
    }

    const allowedTables = ['chiller_aire_minutos', 'chiller_agua_minutos'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({
        success: false,
        message: 'Tabla no válida para promedios de temperatura. Solo se permiten tablas de minutos.'
      });
    }

    const temperatureData = await db.getDailyTemperatureAverages(table, date);
    res.json({ success: true, data: temperatureData });

  } catch (error) {
    console.error('Error al obtener promedios de temperatura:', error);
    res.status(500).json({ success: false, message: 'Error al calcular los promedios de temperatura del día' });
  }
});

// Endpoint para obtener promedios de energía del medidor ION
app.get('/api/chiller/energy-averages/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Se requiere una fecha para calcular promedios de energía' });
    }

    const allowedTables = ['ion_meter_minutos'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({
        success: false,
        message: 'Tabla no válida para promedios de energía. Solo se permiten tablas del medidor ION.'
      });
    }

    const query = `
      SELECT 
        AVG(kwh_imp) as avg_kwh_imp,
        AVG(kwh_exp) as avg_kwh_exp,
        AVG(kwh_tot) as avg_kwh_tot,
        AVG(kwh_net) as avg_kwh_net,
        AVG(kvarh_imp) as avg_kvarh_imp,
        AVG(kvarh_exp) as avg_kvarh_exp,
        AVG(kvarh_tot) as avg_kvarh_tot,
        AVG(kvarh_net) as avg_kvarh_net,
        AVG(kvah_tot) as avg_kvah_tot,
        AVG(freq) as avg_freq,
        AVG(vln_a) as avg_vln_a,
        AVG(vln_b) as avg_vln_b,
        AVG(vln_avg) as avg_vln_avg,
        AVG(ia) as avg_ia,
        AVG(ib) as avg_ib,
        AVG(pf) as avg_pf,
        COUNT(*) as total_records
      FROM ${table}
      WHERE DATE(fecha_hora) = ?
    `;

    const [results] = await db.pool.query(query, [date]);

    if (results.length === 0 || results[0].total_records === 0) {
      return res.status(404).json({ success: false, message: 'No hay datos de energía para la fecha seleccionada' });
    }

    res.json({ success: true, data: { ...results[0], date, table } });

  } catch (error) {
    console.error('Error al obtener promedios de energía:', error);
    res.status(500).json({ success: false, message: 'Error al calcular los promedios de energía del día' });
  }
});

app.get('/api/chiller/ion/midnight-kwh-net', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Se requiere una fecha para obtener el KWH NET de medianoche' });
    }

    const midnightTimestamp = `${date} 00:00:00`;
    const query = `
      SELECT kwh_net
      FROM ion_meter_minutos
      WHERE fecha_hora = ?
      LIMIT 1
    `;

    const [results] = await db.pool.query(query, [midnightTimestamp]);

    if (results.length > 0) return res.json({ success: true, kwh_net_midnight: results[0].kwh_net });
    return res.status(404).json({ success: false, message: 'No se encontró KWH NET para la medianoche de la fecha seleccionada' });

  } catch (error) {
    console.error('Error al obtener KWH NET de medianoche:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el KWH NET de medianoche' });
  }
});

app.get('/api/chiller/ion/midnight-kwh-imp', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Se requiere una fecha para obtener el KWH IMP de medianoche' });
    }

    const midnightTimestamp = `${date} 00:00:00`;
    const query = `
      SELECT kwh_imp
      FROM ion_meter_minutos
      WHERE fecha_hora = ?
      LIMIT 1
    `;

    const [results] = await db.pool.query(query, [midnightTimestamp]);

    if (results.length > 0) return res.json({ success: true, kwh_imp_midnight: results[0].kwh_imp });
    return res.status(404).json({ success: false, message: 'No se encontró KWH IMP para la medianoche de la fecha seleccionada' });

  } catch (error) {
    console.error('Error al obtener KWH IMP de medianoche:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el KWH IMP de medianoche' });
  }
});

// ===================================================
// ✅ Component Status (AHORA INCLUYE ENFRIADO)
// ===================================================
app.get('/api/chiller/component-status/:table', async (req, res) => {
  try {
    const { table } = req.params;

    const allowedTables = [
      'chiller_aire_segundos',
      'chiller_agua_segundos',
      'chiller_enfriado_aire_segundos',
      'chiller_enfriado_agua_segundos'
    ];

    if (!allowedTables.includes(table)) {
      return res.status(400).json({
        success: false,
        message: 'Tabla no válida para estados de componentes. Solo se permiten tablas de segundos.'
      });
    }

    const lastRecord = await db.getLastRecord(table);

    if (!lastRecord) {
      return res.status(404).json({ success: false, message: 'No se encontraron registros para esta tabla' });
    }

    let componentStatus = {};

    // Legacy (aire)
    if (table === 'chiller_aire_segundos') {
      componentStatus = {
        compresor: lastRecord.status_compresor || 0,
        ventilador: lastRecord.status_air || 0,
        bomba_proceso: lastRecord.status_vdf_pump_process || 0,
        bomba_condensador: 0,
        timestamp: lastRecord.fecha_hora
      };
    }

    // Legacy (agua)
    else if (table === 'chiller_agua_segundos') {
      componentStatus = {
        compresor: lastRecord.status_compresor || 0,
        bomba_condensador: lastRecord.status_bomba_agua || 0,
        bomba_proceso: lastRecord.vdf_condensador_status || 0,
        ventilador: 0,
        timestamp: lastRecord.fecha_hora
      };
    }

    // Enfriado aire
    else if (table === 'chiller_enfriado_aire_segundos') {
      componentStatus = {
        // Nota: si tu tabla tiene un status_compresor real, cámbialo aquí.
        // Con lo que tenemos, usamos on_air_status como “equipo encendido”.
        compresor: lastRecord.on_air_status || 0,
        ventilador: lastRecord.vdf_ventilador_status || 0,
        bomba_proceso: lastRecord.vdf_pump_status || 0,
        bomba_condensador: 0,
        timestamp: lastRecord.fecha_hora
      };
    }

    // Enfriado agua
    else if (table === 'chiller_enfriado_agua_segundos') {
      componentStatus = {
        // Nota: si tu tabla tiene un status_compresor real, cámbialo aquí.
        compresor: lastRecord.on_water_status || 0,
        bomba_condensador: lastRecord.vdf_condensador_status || 0,
        bomba_proceso: lastRecord.vdf_pump_status || 0,
        ventilador: 0,
        timestamp: lastRecord.fecha_hora
      };
    }

    res.json({ success: true, data: componentStatus });

  } catch (error) {
    console.error('Error al obtener estados de componentes:', error);
    res.status(500).json({ success: false, message: 'Error al obtener los estados de los componentes del chiller' });
  }
});

// ===================================================
// ✅ UPTIME (soporta legacy + enfriado)
// ===================================================
app.get('/api/chiller/uptime', async (req, res) => {
  const { date, table } = req.query;

  if (!date) return res.status(400).json({ success: false, message: 'date requerido' });

  const startDate = `${date} 00:00:00`;
  const endDate = `${date} 23:59:59`;

  try {
    const allowed = new Set([
      'chiller_aire_segundos',
      'chiller_agua_segundos',
      'chiller_enfriado_aire_segundos',
      'chiller_enfriado_agua_segundos',
    ]);

    if (table && !allowed.has(table)) {
      return res.status(400).json({ success: false, message: 'table no válida' });
    }

    // Si no mandan table, devolvemos ambos legacy (compat).
    if (!table) {
      const query = `
        SELECT
          COALESCE(SUM(status_air), 0) AS total_segundos_encendido_air,
          COALESCE(SUM(status_vdf_pump_process), 0) AS total_segundos_encendido_pump,
          (SELECT COALESCE(SUM(status_water), 0)
           FROM chiller_agua_segundos
           WHERE fecha_hora >= ? AND fecha_hora <= ?) AS total_segundos_encendido_water
        FROM chiller_aire_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      `;
      const [results] = await db.pool.query(query, [startDate, endDate, startDate, endDate]);
      return res.json({ success: true, table: 'legacy', ...results[0] });
    }

    // NUEVA lógica (enfriado aire)
    if (table === 'chiller_enfriado_aire_segundos') {
      const query = `
        SELECT
          COALESCE(SUM(on_air_status), 0) AS total_segundos_encendido_air,
          COALESCE(SUM(vdf_pump_status), 0) AS total_segundos_encendido_pump
        FROM chiller_enfriado_aire_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      `;
      const [rows] = await db.pool.query(query, [startDate, endDate]);
      return res.json({ success: true, table, ...rows[0] });
    }

    // NUEVA lógica (enfriado agua)
    if (table === 'chiller_enfriado_agua_segundos') {
      const query = `
        SELECT
          COALESCE(SUM(on_water_status), 0) AS total_segundos_encendido_water,
          COALESCE(SUM(vdf_pump_status), 0) AS total_segundos_encendido_pump
        FROM chiller_enfriado_agua_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      `;
      const [rows] = await db.pool.query(query, [startDate, endDate]);
      return res.json({ success: true, table, ...rows[0] });
    }

    // Legacy (aire) por tabla específica
    if (table === 'chiller_aire_segundos') {
      const query = `
        SELECT
          COALESCE(SUM(status_air), 0) AS total_segundos_encendido_air,
          COALESCE(SUM(status_vdf_pump_process), 0) AS total_segundos_encendido_pump
        FROM chiller_aire_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      `;
      const [rows] = await db.pool.query(query, [startDate, endDate]);
      return res.json({ success: true, table, ...rows[0] });
    }

    // Legacy (agua) por tabla específica
    if (table === 'chiller_agua_segundos') {
      const query = `
        SELECT
          COALESCE(SUM(status_water), 0) AS total_segundos_encendido_water
        FROM chiller_agua_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      `;
      const [rows] = await db.pool.query(query, [startDate, endDate]);
      return res.json({ success: true, table, ...rows[0] });
    }

    // fallback
    return res.status(400).json({ success: false, message: 'table no válida' });

  } catch (error) {
    console.error('Error uptime:', error);
    res.status(500).json({ success: false, message: 'Error al obtener uptime' });
  }
});

// Endpoint debug tablas
app.get('/api/chiller/debug-tables', async (req, res) => {
  try {
    const tables = [
      'chiller_agua_minutos',
      'chiller_agua_segundos',
      'chiller_aire_segundos',
      'ion_meter_minutos',
      'chiller_enfriado_agua_segundos',
      'chiller_enfriado_aire_segundos'
    ];

    const results = {};

    for (const table of tables) {
      const [columns] = await db.pool.query(`DESCRIBE ${table}`);
      const [sampleData] = await db.pool.query(`SELECT * FROM ${table} ORDER BY fecha_hora DESC LIMIT 3`);
      const [count] = await db.pool.query(`SELECT COUNT(*) as total FROM ${table}`);

      results[table] = {
        columns: columns.map(col => col.Field),
        sampleData,
        totalRecords: count[0].total
      };
    }

    res.json({ success: true, data: results });

  } catch (error) {
    console.error('Error al obtener información de debug:', error);
    res.status(500).json({ success: false, message: 'Error al obtener información de debug' });
  }
});

// Resumen bitácora (tu lógica actual)
app.get('/api/chiller/summary-bitacora', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Se requiere una fecha para obtener el resumen bitácora' });
    }

    const r2 = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? parseFloat(n.toFixed(2)) : null;
    };

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];
    const midnightNextDay = `${nextDayStr} 00:00:00`;

    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const kwhQuery = `
      SELECT kwh_imp
      FROM ion_meter_minutos
      WHERE fecha_hora = ?
      LIMIT 1
    `;

    const waterUptimeQuery = `
      SELECT COALESCE(SUM(status_water),0) AS total_segundos
      FROM chiller_agua_segundos
      WHERE fecha_hora >= ? AND fecha_hora <= ?
    `;

    const airUptimeQuery = `
      SELECT COALESCE(SUM(status_air),0) AS total_segundos
      FROM chiller_aire_segundos
      WHERE fecha_hora >= ? AND fecha_hora <= ?
    `;

    const waterLevelTank1Query = `
      SELECT level_sensor_tank1
      FROM chiller_agua_minutos
      WHERE fecha_hora <= ?
      ORDER BY fecha_hora DESC
      LIMIT 1
    `;

    const waterLevelTank2Query = `
      SELECT level_sensor_tank2
      FROM chiller_agua_minutos
      WHERE fecha_hora <= ?
      ORDER BY fecha_hora DESC
      LIMIT 1
    `;

    const waterLevelTank3Query = `
      SELECT level_sensor_tank3
      FROM chiller_agua_minutos
      WHERE fecha_hora <= ?
      ORDER BY fecha_hora DESC
      LIMIT 1
    `;

    const centralTempsQuery = `
      SELECT 
        AVG(temp_top_glycol_c)    AS avg_temp_top,
        AVG(temp_bottom_glycol_c) AS avg_temp_bottom
      FROM chiller_agua_minutos
      WHERE DATE(fecha_hora) = ?
    `;

    const tankTempsQuery = `
      SELECT 
        AVG(temp_tank1_c) AS avg_temp_tank1,
        AVG(temp_tank2_c) AS avg_temp_tank2,
        AVG(temp_tank3_c) AS avg_temp_tank3
      FROM chiller_agua_minutos
      WHERE DATE(fecha_hora) = ?
    `;

    const waterCyclesQuery = `
      SELECT COUNT(*) AS ciclos
      FROM (
        SELECT 
          status_water,
          LAG(status_water) OVER (ORDER BY fecha_hora) AS prev_state
        FROM chiller_agua_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      ) t
      WHERE status_water = 1 AND (prev_state = 0 OR prev_state IS NULL);
    `;

    const airCyclesQuery = `
      SELECT COUNT(*) AS ciclos
      FROM (
        SELECT 
          status_air,
          LAG(status_air) OVER (ORDER BY fecha_hora) AS prev_state
        FROM chiller_aire_segundos
        WHERE fecha_hora >= ? AND fecha_hora <= ?
      ) t
      WHERE status_air = 1 AND (prev_state = 0 OR prev_state IS NULL);
    `;

    const [
      [kwhResults],
      [waterUptimeResults],
      [airUptimeResults],
      [waterLevelTank1Results],
      [waterLevelTank2Results],
      [waterLevelTank3Results],
      [centralTempsResults],
      [tankTempsResults],
      [waterCyclesResults],
      [airCyclesResults]
    ] = await Promise.all([
      db.pool.query(kwhQuery, [midnightNextDay]),
      db.pool.query(waterUptimeQuery, [startOfDay, endOfDay]),
      db.pool.query(airUptimeQuery, [startOfDay, endOfDay]),
      db.pool.query(waterLevelTank1Query, [endOfDay]),
      db.pool.query(waterLevelTank2Query, [endOfDay]),
      db.pool.query(waterLevelTank3Query, [endOfDay]),
      db.pool.query(centralTempsQuery, [date]),
      db.pool.query(tankTempsQuery, [date]),
      db.pool.query(waterCyclesQuery, [startOfDay, endOfDay]),
      db.pool.query(airCyclesQuery, [startOfDay, endOfDay]),
    ]);

    const summaryData = {
      main_meter_kwh: (kwhResults.length > 0 && kwhResults[0].kwh_imp != null) ? r2(kwhResults[0].kwh_imp) : null,

      hourmeter_water_chiller: r2(Number(waterUptimeResults[0]?.total_segundos || 0) / 3600),
      hourmeter_air_chiller: r2(Number(airUptimeResults[0]?.total_segundos || 0) / 3600),

      temp_central_chilled_water_tank_top: r2(centralTempsResults?.[0]?.avg_temp_top),
      temp_central_chilled_water_tank_bottom: r2(centralTempsResults?.[0]?.avg_temp_bottom),

      water_level_city_water_tank: "INSTALLATION IN PROCESS",
      temp_city_water_tank: "INSTALLATION IN PROCESS",

      water_level_tank1: Number(waterLevelTank1Results[0]?.level_sensor_tank1 || 0).toFixed(2),
      water_level_tank2: Number(waterLevelTank2Results[0]?.level_sensor_tank2 || 0).toFixed(2),
      water_level_tank3: Number(waterLevelTank3Results[0]?.level_sensor_tank3 || 0).toFixed(2),

      temp_tank1: r2(tankTempsResults?.[0]?.avg_temp_tank1),
      temp_tank2: r2(tankTempsResults?.[0]?.avg_temp_tank2),
      temp_tank3: r2(tankTempsResults?.[0]?.avg_temp_tank3),

      cycles_water_chiller: Number(waterCyclesResults[0]?.ciclos || 0),
      cycles_air_chiller: Number(airCyclesResults[0]?.ciclos || 0),

      date,
      next_day: nextDayStr
    };

    return res.json({ success: true, data: summaryData });

  } catch (error) {
    console.error('Error al obtener resumen bitácora:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener el resumen bitácora' });
  }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor HTTP corriendo en puerto ${PORT} y accesible desde la red`);
});

// Exportar app para tests si es necesario
module.exports = app;
